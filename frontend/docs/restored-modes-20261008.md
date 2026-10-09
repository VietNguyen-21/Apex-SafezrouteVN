# Restored frontend modes — 2026-10-08

Base: upstream `a7378ed`. Restored offline road sources from the surviving local frontend and road-pack behavior/tests from Git history `52d712b`. Shared UI and all M3 integration code use the newer upstream version.

## Backend mode (default)

```powershell
cd D:\MLAI\SafeRouteVN_Project_Structure_PLAN\frontend
npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Requires the configured M3 API/worker, runtime installation and per-tab credentials described in `clone-and-run.md`. The frontend normally connects to `http://127.0.0.1:8000`; override `VITE_M3_BASE_URL` if needed. This merge does not install or rewrite a private runtime or its authority databases. Backend source in the isolated upstream checkout is available at `D:\MLAI_1\APEX-SafeRouteVN-review\backend`; use the source root matching your configured installation, not an arbitrary replacement.

## Restored offline demo

```powershell
cd D:\MLAI\SafeRouteVN_Project_Structure_PLAN\frontend
npm.cmd run dev:mock -- --host 127.0.0.1 --port 5174 --strictPort
```

Open `/admin` and `/driver` on port 5174, in the same browser profile. Use a separate port from backend mode so local browser state is kept separate.

1. Load S1, Optimize, select a profile and Accept.
2. Enable V1/V2 route visibility and click Play vehicles.
3. In Driver, confirm depot pickup for the assigned orders. The vehicle follows supplied road geometry.
4. Confirm Delivered after arrival; the vehicle waits at the stop until confirmation.
5. Pause/speed controls change local simulation only. S3 unavailable vehicles retain their onboard orders and stop in place.
6. Download scenario template and Import scenario JSON support unchanged S0-S4 catalog fixtures. Import starts a fresh session; unknown/edited fixtures are rejected before state changes.

Playback requires a browser supporting Web Locks (Chrome/Edge on localhost). The legacy manual flow remains available before playback is enabled. A moving offline world has no matching precomputed route export, so reset/load a scenario to use prepared optimization, or use backend mode for native replay/replanning. No arbitrary geographic point editor or live GPS was added.

## Shared fixes

- Removed Satellite placeholder.
- Kept successful map tiles after individual tile errors, with Retry map tiles and online recovery.
- Added Retry connection on initial Admin/Driver data-load failure.

## Verification and limits

359 Vitest tests passed, including native integration unit tests and restored offline geometry/custody/playback/import tests. Both backend and mock builds pass. Nine build-audit tests and the backend production graph audit pass; the backend bundle excludes mock road assets. The mock bundle is intentionally larger because it contains the restored road geometry.

This does not resolve the separately documented M3 `RUNTIME_BUSY` issue. A real authenticated API/worker/browser acceptance run is still required for native runtime performance. Network/DNS access to the basemap provider is still needed for map tiles.

Pre-merge frontend backup (excluding reproducible node_modules): `D:\MLAI_1\frontend-backup-before-merge-20261008-222746`.
