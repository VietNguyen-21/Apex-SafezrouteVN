# Demo feedback implementation — 2026-10-06

Implemented in this checkout:

- Removed the disabled Satellite control; the road basemap remains.
- Added Vehicle simulation in Admin: Play/Pause and 1×, 10×, 30×, 60× speed.
- Playback starts only after Accept. Driver confirms depot pickups, vehicles follow the accepted road geometry, and delivery is disabled until arrival in playback mode.
- Road edges use their supplied duration; movement within each edge follows its polyline. Vehicles wait at delivery stops until Driver confirms delivery.
- Progress, playback settings and vehicle positions persist with the demo snapshot. Browser Web Locks serialize writes across tabs; ticks use a shared timestamp so multiple tabs do not multiply speed. Sleep catch-up is bounded to one second per tick.
- An unavailable vehicle stops in place and retains onboard custody, including S3. Offline re-optimization after movement is explicitly rejected because no matching moving-state runtime export exists.
- Import accepts unchanged catalog fixtures S0–S4, including property-order-independent JSON. Download scenario template supplies a compatible file. Import creates a new demo session. Changed coordinates or other fixture data are rejected before replacing current state.

## Run

```powershell
cd D:\MLAI\SafeRouteVN_Project_Structure_PLAN\frontend
npm.cmd run dev -- --host 127.0.0.1 --port 5173
```

1. Open `/admin` and `/driver` in the same browser profile.
2. Load S1, Optimize, select a profile, Accept, and enable V1/V2 route visibility.
3. Click Play vehicles in Admin. The simulation controls are in the sidebar.
4. Confirm each assigned depot pickup in Driver, selecting V1/V2 as needed.
5. Observe motion; Delivered becomes available after arrival. Confirm delivery to start the next leg.
6. Pause in Admin to stop movement. Reloading preserves progress; importing or loading a scenario starts a new session.

For S3, load it, Optimize and Accept before starting playback. Trigger Vehicle Unavailable to freeze the affected vehicle. For the prepared S3 re-optimization demo, trigger the event before playback movement; re-optimization from a moving world still requires runtime integration.

## Scope still outstanding

- Selecting new geographic points on a map and producing a compact six-order scenario requires regenerating graph-node mapping, routing results and metrics together. Import does not claim to support arbitrary coordinates.
- Live runtime re-optimization after simulated movement is not connected. Interpolated vehicle positions are display/simulation positions; the old graphNodeId must not be consumed as current routing authority.
- Live GPS and live ETA remain a later phase. This is local simulation.
- Legacy manual execution remains available before playback is enabled.
- Tile network access remains necessary for the basemap; playback does not repair DNS blocking.

## Validation

Regression tests cover interpolation, arrival gating, pause/restore, immutable plans, duplicate timestamps, S3 custody, unavailable vehicles, and atomic import rejection. Run `npm.cmd run test:run` and `npm.cmd run build`.
