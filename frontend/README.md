# SafeRoute VN frontend — Member 4

React, TypeScript, Vite and Leaflet provide `/admin` and `/driver`. Backend mode
is the default. Admin submits native Optimize comparisons, previews a selected
certified current forecast locally, accepts it through M3 and applies due events.
Driver reads accepted execution and controls server replay. Both tabs refresh
the same owned server session; local storage holds references, command identities
and UI preferences.

For a fresh clone, follow [clone and UI startup](docs/clone-and-run.md).
The current slow startup / Optimize refresh issue is documented in
[the 2026-10-08 diagnostic handoff](docs/runtime-busy-handoff-20261008.md).

The frontend checkout alone is not a native installation. M1 scenarios, the
locked M2 runtime, M3 source, Python environments and private installation/auth
configuration must already be available. Use the existing installation; do not
download or reinstall handoff packages for ordinary frontend startup.

## Start backend and frontend

Run from the source root matching `installation.json.snapshot_root`. For a full
M3 installation with its own `backend-venv`, the launcher starts one API and one
worker and waits for readiness:

```powershell
$M3Local = 'C:\path\to\private-native-installation'
$env:SAFEROUTE_CORS_ORIGINS = 'http://127.0.0.1:5173'
& "$M3Local\backend-venv\Scripts\python.exe" -B backend/scripts/run_backend.py --local-root $M3Local --port 8000
```

An installation reusing an existing Python environment can run
`backend/scripts/start_backend.py --port 8000` and `start_worker.py` in separate
terminals with its configured Python. Both processes need the same private
`SAFEROUTE_INSTALLATION_CONFIG`, `SAFEROUTE_AUTH_FILE`, `SAFEROUTE_METADATA_DB`
and `SAFEROUTE_WORKER_HEARTBEAT` paths. Match the frontend origin in CORS and
confirm `/ready` reports `data.ready=true`; an open port alone is insufficient.
Keep one worker per authority and preserve existing stores during recovery.

In another terminal:

```powershell
cd frontend
npm.cmd ci
npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

The non-secret environment example contains only `VITE_DISPATCH_MODE=backend`
and `VITE_M3_BASE_URL=http://127.0.0.1:8000`. Override the base URL when using
another API port, including for a build. Check private development overrides
before starting. Unknown modes show a configuration error.

Configure a private dispatcher credential through the injected M3 token provider
or the `saferoute.member3.bearer` sessionStorage key **in each tab**. Keep bearer
values out of Vite variables, source, build output and evidence. There is no
frontend login or real driver identity assignment in this release; missing
server contact/identity metadata displays IDs or `Unavailable`.

Open `/admin`, load S0–S4, Optimize, Select and enable the desired route visibility
switches to preview. Select does not dispatch. Accept activates the current
certified plan. Open `/driver` in the same browser profile and origin; it uses
the server session reference and defaults to V1. Step/Play/Speed/Pause use native
replay; Reset creates a new session while retaining the prior server history.
Apply becomes available at the server event barrier. Re-Optimize/re-Accept after
an event. Refresh reads/reconciles the server and retries an unresolved command
with its original request ID and body.

401/403 require correcting credentials or ownership. Stale proposals require
refresh and a fresh comparison. BUSY retries are bounded; an ambiguous reply
does not authorize a new command ID. Schema/binding/authority failures disable
actions. A browser timeout does not imply server cancellation. Partial/unserved
native outcomes remain visible, including an immobilized vehicle with no route.
OSM tile failure preserves supplied EDGE routes. Public rain polygons and
completed-action mapping remain unavailable.

## Explicit offline demo

```powershell
npm.cmd run dev:mock
npm.cmd run build:mock
npm.cmd run preview:mock -- --host 127.0.0.1 --port 5177 --strictPort
```

Mock mode is explicitly selected and restores the earlier offline road packs for
matching S0-S4 states, plus manual pickup/delivery and local vehicle playback.
Admin provides Play/Pause, speed selection and import/export of unchanged
scenario templates. Importing arbitrary coordinates and re-optimizing a moving
mock world require newly computed route exports and are rejected.

Backend remains the default and retains the new M3 integration. Mock producers,
fixtures and road packs are excluded from its production build by the build
alias and verified graph audit. Backend replay and local mock playback are
separate. See [restoration and merged modes](docs/restored-modes-20261008.md).

## Verify

```powershell
npm.cmd run test:run
npm.cmd run test:audit
npm.cmd run typecheck
npm.cmd run build
node scripts/audit-backend-build.mjs
```

The audit checks the actual static/dynamic module and chunk graph, asset inventory
and emitted file hashes. Native browser gates use the real M3 API/worker/M2 SDK:
`node docs/evidence/member3-integration/browser.mjs --all`. Set private
`M3_ACCESS_FILE`, `M3_BASE_URL`, `M3_FRONTEND_URL`, `M3_S4_FIXTURE`,
`M3_SOURCE_ROOT`, `M3_INSTALLATION_CONFIG` and `M3_OPERATOR_PYTHON`; set
`M3_PHASE7_STAGE=pre-cleanup` or `post-cleanup`. Use isolated test authority and
metadata with the verified SDK/environment; the bounded SDK-lock fault operator
releases its own lock and never repairs or opens the authority store. Post-cleanup
verification must target the built frontend, using `npm.cmd run preview`.

Run explicit mock smoke against the built mock preview with
`M3_MOCK_FRONTEND_URL` set, then
`node docs/evidence/member3-integration/phase7-mock-smoke.mjs`.

The current tracker is [integration tasks](../docs/superpowers/plans/2026-10-06-member3-integration/tasks.md),
with Phase 7 receipts and limits in [Phase 7 handoff](docs/member3-phase7.md).
Unit/component synthetic HTTP tests are separate from native evidence. Verification
is local/native; this repository does not claim a GitHub CI run.

This remains `SIMULATED_REPLAY`, with `real_world_observation=false`, proxy exposure
and certified witnesses that do not establish optimality. There is no GPS/live
delivery, production calibration or native SLA claim. Manual touch/WebView checks
and separate deployment/publication approval remain outside the browser gate.
