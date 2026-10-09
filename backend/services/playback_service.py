"""Server-owned discrete playback. This module never calculates physical state.

The cadence is best effort: 1x requests one configured simulated step per wall
second, 2x/4x/8x request that step more often. There is no catch-up burst or SLA.
The public accepted trajectory supplies the final return time; SDK advance
alone observes and validates motion, cargo and events.
"""
from datetime import datetime, timedelta
import sqlite3

from backend.api.errors import ApiError


class PlaybackService:
    def __init__(self, settings, repository, sessions, replay, gateway):
        self.settings, self.repository = settings, repository
        self.sessions, self.replay, self.gateway = sessions, replay, gateway

    def stop(self, session_id, reason):
        self.repository.stop(session_id, reason)

    def fence_restart(self):
        self.repository.fence_restart()

    def end_time(self, session, view):
        trajectory = view.get("accepted_trajectory")
        if (not isinstance(trajectory, dict) or trajectory.get("job_id") != view["active_job_id"]
                or not isinstance(trajectory.get("vehicle_routes"), list)):
            raise ApiError(409, "ACCEPTED_TRAJECTORY_REQUIRED", "accepted_trajectory", "Playback requires the certified public accepted trajectory")
        try:
            origin = datetime.fromisoformat(self.sessions.catalog.fixture(session["scenario_id"])["initialState"]["currentTime"])
            ends = []
            for route in trajectory["vehicle_routes"]:
                value = route["return_us"]
                if type(value) not in (str, int) or isinstance(value, str) and (not value.isascii() or not value.isdecimal() or str(int(value)) != value):
                    raise ValueError("Canonical trajectory clock required")
                end = int(value)
                if not 0 <= end < 1 << 63:
                    raise ValueError("Nonnegative int64 return clock required")
                ends.append(origin + timedelta(microseconds=end))
            return max(ends, default=datetime.fromisoformat(view["current_time"]))
        except (ValueError, TypeError, KeyError, OverflowError) as error:
            raise ApiError(503, "PLAYBACK_TRAJECTORY_INVALID", "accepted_trajectory", "Playback endpoint is not a valid public trajectory clock") from error

    async def control(self, session_id, operation, body, actor):
        try:
            session = self.sessions.session(session_id)
            if session["owner_actor_id"] != actor.actor_id or getattr(actor, "role", None) != "dispatcher":
                raise ApiError(403, "FORBIDDEN", "session", "Session owner with dispatcher role required")
            self.sessions.mutation_allowed(session_id)
            installation = self.sessions.installation_identity()
            digest = self.replay.digest("playback_" + operation, body.model_dump())
            previous = self.repository.find_control(actor.actor_id, session_id, operation, body.request_id, digest, installation)
            if previous is None:
                fields = {}
                if operation == "start":
                    view = await self.gateway.resolve(session_id)
                    self.replay.check_revision(view, body)
                    if view["active_job_id"] is None:
                        raise ApiError(409, "ACCEPTED_PLAN_REQUIRED", "active_job_id", "Accept a certified plan before starting playback")
                    # Checks a due pending event without advancing or applying it.
                    self.replay.target(session, view, None)
                    end = self.end_time(session, view)
                    if end <= datetime.fromisoformat(view["current_time"]):
                        raise ApiError(409, "PLAN_COMPLETE", "accepted_trajectory", "Accepted vehicle routes have completed; no automatic advance remains")
                    fields.update(basis=view["basis"], end_time=end.isoformat(), speed=body.speed)
                elif operation == "speed":
                    fields["speed"] = body.speed
                elif operation != "pause":
                    raise ValueError("Unknown playback control")
                previous = self.repository.control(actor.actor_id, session_id, operation, body.request_id, digest, installation, **fields)
            return {"schema_version": "saferoute-m3-playback-control/1", "receipt": previous,
                "controller": self.description(self.repository.get(session_id, installation))}
        except (sqlite3.Error, OSError) as error:
            raise ApiError(503, "METADATA_UNAVAILABLE", "playback", "Playback metadata is unavailable; retry the same request ID") from error

    def description(self, row):
        return {**self.repository.public(row), "step_seconds": self.settings.replay_step_seconds,
            "cadence": "DISCRETE_BEST_EFFORT", "base_tick_interval_seconds": 1,
            "catch_up": False, "auto_apply_event": False, "auto_accept_plan": False,
            "execution_mode": "SIMULATED_REPLAY", "real_world_observation": False}

    async def controller(self, session_id):
        self.sessions.session(session_id)
        try:
            row = self.repository.get(session_id, self.sessions.installation_identity())
            view = await self.gateway.resolve(session_id)
            self.sessions.observe(view, "HTTP_PLAYBACK_READ")
            return {"schema_version": "saferoute-m3-playback-controller/1",
                **self.description(row), "execution_view": view}
        except (sqlite3.Error, OSError) as error:
            raise ApiError(503, "METADATA_UNAVAILABLE", "playback", "Playback controller is unavailable") from error

    def history(self, session_id):
        self.sessions.session(session_id)
        try:
            return {"schema_version": "saferoute-m3-playback-history/1", "session_id": session_id,
                "history": self.repository.history(session_id)}
        except (sqlite3.Error, OSError) as error:
            raise ApiError(503, "METADATA_UNAVAILABLE", "playback", "Playback history is unavailable") from error

    async def run_once(self):
        """Under the worker singleton only; execute at most one persisted tick."""
        state = self.repository.candidate()
        if state is None:
            return False
        sid = state["session_id"]
        try:
            self.sessions.session(sid)
            self.sessions.mutation_allowed(sid)
            if state["installation_sha256"] != self.sessions.installation_identity():
                raise ApiError(409, "INSTALLATION_BINDING_CHANGED", "playback", "Controller installation changed")
            row = self.repository.pending(state)
            if row is not None and self.repository.settle(state, row):
                return True  # Existing generic reconciliation completed this tick.
            if row is None:
                view = await self.gateway.resolve(sid)
                if view["basis"] != state["basis"]:
                    self.stop(sid, "STALE_HEAD")
                    return True
                if view["active_job_id"] is None:
                    self.stop(sid, "ACCEPTED_PLAN_REQUIRED")
                    return True
                end = self.end_time(self.sessions.session(sid), view)
                if end.isoformat() != state["end_time"]:
                    raise ApiError(503, "PLAYBACK_TRAJECTORY_INVALID", "playback", "Accepted trajectory endpoint changed without a matching basis")
                if end <= datetime.fromisoformat(view["current_time"]):
                    self.stop(sid, "PLAN_COMPLETE")
                    return True
                step = self.replay.target(self.sessions.session(sid), view, None)
                target = min(datetime.fromisoformat(step), end)
                wire = step if datetime.fromisoformat(step) == target else end.isoformat()
                pending = self.replay.pending(self.sessions.session(sid), view)
                reason = "EVENT_BARRIER" if any(datetime.fromisoformat(event["timestamp"]) == target for event in pending) else "PLAN_COMPLETE" if target == end else None
                row = self.repository.reserve_tick(state, view["basis"], wire, view["current_time"], stop_reason=reason)
                if row is None:
                    return False
            # All retries use the ORIGINAL saved SDK basis/target/command.
            claimed = self.replay.repository.reserve_request(*self.replay.repository.request_keys(row),
                row["request_sha256"], state["installation_sha256"])
            await self.replay.execute_request(claimed)
            self.repository.settle(state, row)
            return True
        except ApiError as error:
            if error.code in ("RUNTIME_BUSY", "REQUEST_IN_PROGRESS"):
                self.repository.backoff(sid)
                return False
            # An uncertain SDK failure retains its exact reserved command. The
            # generic replay reconciler settles it; no new tick is scheduled.
            self.stop(sid, "EVENT_BARRIER" if error.code == "EVENT_TRANSITION_REQUIRED" else error.code)
            if error.status_code < 500:
                row = self.repository.pending(self.repository.get(sid))
                if row is not None:
                    self.repository.settle(state, row)
                return True
            raise
        except (sqlite3.Error, OSError) as error:
            raise ApiError(503, "METADATA_UNAVAILABLE", "playback", "Playback metadata is unavailable; reserved SDK commands must be reconciled") from error
