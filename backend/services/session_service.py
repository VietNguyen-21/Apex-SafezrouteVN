import hashlib
import json
import sqlite3

from backend.api.errors import ApiError


class SessionService:
    def __init__(self, settings, repository, catalog, gateway):
        self.settings, self.repository, self.catalog, self.gateway = settings, repository, catalog, gateway

    def installation_identity(self):
        try:
            return self.settings.installation_identity()
        except (OSError, ValueError, KeyError, TypeError) as error:
            raise ApiError(503, "INSTALLATION_UNAVAILABLE", "server", "Server installation configuration is unavailable") from error

    async def load(self, scenario_id, request_id, actor):
        self.catalog.fixture(scenario_id)
        digest = hashlib.sha256(json.dumps({"operation": "load", "scenario_id": scenario_id}, sort_keys=True).encode()).hexdigest()
        try:
            reservation = self.repository.reserve_load(actor.actor_id, request_id, digest, scenario_id,
                self.installation_identity(), self.catalog.fixture_sha256[scenario_id], self.catalog.catalog_sha256)
            if reservation["cached"] is not None:
                return reservation["cached"]
            try:
                boot = await self.gateway.bootstrap(reservation["session_id"], scenario_id, reservation["command_id"])
                view = await self.gateway.resolve(reservation["session_id"])
                if view["basis"] != boot["basis"]:
                    raise ApiError(503, "BOOTSTRAP_BINDING_CHANGED", "runtime", "Bootstrap and initial execution view differ")
                data = {"schema_version": "saferoute-m3-loaded-session/1", "session": self.public_session(reservation["session"]),
                        "execution_view": view}
                self.repository.complete_load(reservation, data)
                self.observe(view, "LOAD", reservation["command_id"])
                return data
            finally:
                self.repository.release_load(reservation)
        except (sqlite3.Error, OSError) as error:
            raise ApiError(503, "METADATA_UNAVAILABLE", "session", "Session metadata is unavailable; retry the same request ID") from error

    def session(self, session_id):
        self.catalog.ensure_current()
        try:
            row = self.repository.record(session_id)
        except (sqlite3.Error, OSError) as error:
            raise ApiError(503, "METADATA_UNAVAILABLE", "session", "Session metadata is unavailable") from error
        if row["status"] != "READY":
            raise ApiError(409, "SESSION_NOT_READY", "session_id", "Load has not completed; retry its original request ID")
        if (row["installation_sha256"] != self.installation_identity() or row["catalog_sha256"] != self.catalog.catalog_sha256
                or row["fixture_sha256"] != self.catalog.fixture_sha256.get(row["scenario_id"])):
            raise ApiError(409, "INSTALLATION_BINDING_CHANGED", "session", "Session belongs to another server installation")
        self.catalog.ensure_current(row["scenario_id"])
        return row

    def public_session(self, row):
        prefix = "/api/sessions/" + row["session_id"]
        return {"session_id": row["session_id"], "scenario_id": row["scenario_id"], "created_at": row["created_at"],
            "build_sha256": self.settings.installation()["expected_build_sha256"], "catalog_sha256": row["catalog_sha256"],
            "fixture_sha256": row["fixture_sha256"], "links": {key: prefix + "/" + key for key in ("state", "orders", "vehicles", "locations")}}

    def mutation_allowed(self, session_id):
        from .recovery_repository import RecoveryRepository
        try:
            RecoveryRepository(self.settings.metadata_path).assert_mutation_allowed(session_id,
                allow_validated_recovery=getattr(self, "allow_validated_recovery", False))
        except sqlite3.Error as error:
            raise ApiError(503, "RECOVERY_METADATA_UNAVAILABLE", "recovery", "Recovery gate is unavailable") from error

    def observe(self, view, source, reference_id=None):
        from .artifact_repository import ArtifactRepository
        try:
            repository = ArtifactRepository(self.settings.metadata_path)
            repository.initialize()
            repository.observe_execution(view["basis"]["session_id"], view, source=source, reference_id=reference_id)
        except (sqlite3.Error, OSError) as error:
            raise ApiError(503, "EVIDENCE_METADATA_UNAVAILABLE", "evidence", "Public observation could not be durably preserved") from error

    async def state(self, session_id):
        self.session(session_id)
        view = await self.gateway.resolve(session_id)
        self.observe(view, "HTTP_STATE_READ")
        return view

    async def projection(self, session_id, kind):
        row = self.session(session_id)
        view = await self.gateway.resolve(session_id)
        fixture = self.catalog.fixture(row["scenario_id"])
        data = {"schema_version": f"saferoute-m3-{kind}-view/1", "basis": view["basis"], "current_time": view["current_time"],
                "execution_mode": view["execution_mode"], "real_world_observation": view["real_world_observation"],
                "units": {"distance": "m", "duration": "s", "mass": "kg", "money": "VND"}}
        if kind == "vehicles":
            data["vehicles"] = view["vehicles"]
            data["vehicle_metadata"] = [{"vehicle_id": item["id"], "vehicle_type": item["type"],
                "cost_per_km_vnd": item["costPerKmVnd"], "range_m": item["rangeKm"] * 1000,
                "working_start": item["workingStart"], "working_end": item["workingEnd"]} for item in fixture["initialState"]["vehicles"]]
        else:
            static_orders = {item["id"]: item for item in fixture["initialState"]["orders"]}
            for event in fixture["events"]:
                if event["type"] == "URGENT_ORDER":
                    item = event["orderPayload"]
                    static_orders[item["id"]] = item
            if not set(view["order_ids"]) <= set(static_orders):
                raise ApiError(503, "ORDER_METADATA_UNAVAILABLE", "orders", "Runtime order has no verified source metadata")
            orders = [static_orders[key] for key in view["order_ids"]]
            if kind == "locations":
                data["locations"] = [{"location_id": item["id"], "kind": "DEPOT", "graph_node_id": str(item["graphNodeId"]),
                    "coordinates": [item["longitude"], item["latitude"]], "opening_time": item["openingTime"],
                    "closing_time": item["closingTime"]} for item in fixture["initialState"]["locations"]]
                data["locations"].extend({"location_id": "delivery:" + item["id"], "kind": "DELIVERY", "order_id": item["id"],
                    "graph_node_id": str(item["graphNodeId"]), "coordinates": [item["longitude"], item["latitude"]]} for item in orders)
            elif kind == "orders":
                onboard = {key: vehicle["vehicle_id"] for vehicle in view["vehicles"] for key in vehicle["onboard_order_ids"]}
                delivered, planned = set(view["delivered_prefix"]), set(view["planned_served_suffix"])
                unserved = {item["order_id"]: item["reason"] for item in view["unserved"]}
                data["orders"] = [{"order_id": item["id"], "status": "DELIVERED" if item["id"] in delivered else "ONBOARD" if item["id"] in onboard else "WAITING",
                    "owner_vehicle_id": onboard.get(item["id"]), "planned_in_accepted_suffix": item["id"] in planned,
                    "unserved_reason": unserved.get(item["id"]), "demand_kg": item["demandKg"], "priority": item["priority"],
                    "pickup_location_id": item["pickupLocationId"], "delivery_region_id": item["deliveryRegionId"],
                    "graph_node_id": str(item["graphNodeId"]), "coordinates": [item["longitude"], item["latitude"]],
                    "service_time_s": item["serviceTimeHours"] * 3600, "earliest": item["earliest"],
                    "preferred_due": item["preferredDue"], "hard_deadline": item["hardDeadline"]} for item in orders]
        return data
