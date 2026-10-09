# Member 3 frontend foundation — Phase 1

`BackendDispatchApi` implements the existing dispatch read/load interface using native M3 HTTP. It has no dependency on `fixtureCatalog`, mock engines, decision packs or offline road plans. `MockDispatchApi` remains the offline/test implementation.

## Configuration and authentication

`frontend/.env.example` contains only non-secret defaults:

```dotenv
VITE_DISPATCH_MODE=mock
VITE_M3_BASE_URL=http://127.0.0.1:8000
```

For local backend development, set these values in the ignored `frontend/.env.development.local` (already set to backend for this acceptance run):

```dotenv
VITE_DISPATCH_MODE=backend
VITE_M3_BASE_URL=http://127.0.0.1:8000
```

Change that file back to `mock` for offline development. For production, use the same two variables in the build environment. An invalid mode is a configuration error; a failed backend read never switches to mock.

M3 requires an owned dispatcher bearer token. Supply it through the client's injected token provider, or configure the local browser session in its DevTools console:

```js
sessionStorage.setItem("saferoute.member3.bearer", "<your M3 dispatcher bearer>");
location.reload();
```

The placeholder above is not a real credential. Obtain the token from the private M3 installation through the operator. Do not put it in source, a `VITE_*` variable, a committed env file, a report, or a build asset. The token stays in sessionStorage for that browser tab. It is never copied to localStorage, response evidence or session pointers. Browser requests reject redirects and target only the configured M3 server.

Use M3's [operations runbook](../../docs/M3_OPERATIONS_RUNBOOK.md) to install/run its API and worker. This acceptance used a new private installation at `%TEMP%\saferoute-m3-phase1-20261006\native`, with native SDK build `80694f511dc735d0b6a1a0a830edd7f6267df395e87dad0ccf180914b49d5a41`; API and worker run at `http://127.0.0.1:8000`.

```powershell
cd C:\Users\Windows\Downloads\SafeRoute\frontend
npm.cmd run dev -- --host 127.0.0.1 --port 5173
```

Open `/admin`, expand the existing scenario selector, and choose S1. The current native session ID/execution mode is available in the clock tooltip and the Admin main element's data attributes. Initial startup without a backend session pointer loads S0 through M3; selecting S1 creates a native S1 session.

## HTTP/state behavior

- Calls GET `/ready`, `/api/runtime/capabilities`, `/api/scenarios` before session work.
- POST `/api/scenarios/{scenarioId}/load` sends a durable `request_id`. Interrupted loads retain it for retry, including after refresh.
- The load receipt is historical; render data is always obtained from GET `/api/sessions/{sessionId}/state`, `/orders`, `/vehicles` and `/locations`.
- Session/build/catalog/fixture bindings are checked. All projections must agree on full basis, time, execution mode and units; changing worlds are re-read up to three times before an error.
- A server-scoped localStorage key stores only a session reference, provenance hashes and any pending load request. Refresh re-reads M3. Legacy `saferoute.phase1.dispatch.v1` mock data is ignored and preserved.
- Orders/custody, current vehicle positions/loads, all depot/delivery locations, current time and execution mode come from M3. Decimal-string graph node IDs stay strings. Raw basis and execution view are retained without inventing physical observations.
- Backend revision is the complete `snapshot.backend.basis`, including canonical decimal-string `head_version` and `generation`. Both remain strings through the full signed-int64 range; neither is converted to a JS number. `DecisionState.version` stays a legacy numeric mock counter and is always `0` in backend snapshots as a compatibility placeholder, never a server revision. Future backend proposal/job currency must compare the full input basis, not this legacy field. A generation-only server change is a different revision even when `head_version` is unchanged.
- Native vehicles before an accepted plan omit per-vehicle position source/timestamp/activity/suffix fields. The M3 validator supports this public initial shape; missing position timestamp remains `null`. The Member 2 post-plan parser is untouched.
- Frontend plan/execution structures stay empty for this phase. Supplied raw trajectory remains in backend metadata for later integration. No plan, assignment, route, weather overlay or event action is reconstructed locally.
- Optimize, Select alternative, Accept, Event, Pickup/Delivered, clock advance and Replay return `PHASE_NOT_SUPPORTED` without sending a write. Their existing mock implementations and UI controls are unchanged. Reset is also deferred; selecting a scenario is the supported session creation flow.
- Backend operations execute in call order; the existing scenario selector is disabled while a load is pending. This prevents an older response replacing a newer selection.

## Native S1 acceptance

[Browser result](evidence/m3-phase1-browser-results.json), [HTTP responses](evidence/m3-phase1-http-responses.json), [frontend snapshot](evidence/m3-phase1-snapshot.json), [Admin screenshot](evidence/m3-phase1-s1-admin.png), and [refreshed screenshot](evidence/m3-phase1-s1-refreshed.png) are from real M3 plus its pinned native SDK, not the separate backend mock app.

Observed session: `session-b798833e5b5a4683a3db88dcc40f50ce`, scenario S1, eight orders O001–O008, two vehicles V1/V2, nine locations (one depot/eight delivery points), eleven map markers. Time is `2026-09-27T21:00:00+07:00`; execution mode is `SIMULATED_REPLAY` and real-world observation is false. Accepted trajectory is null; there are zero accepted/proposed plans and routes.

The test wrote a valid old MockDispatchApi S0 snapshot with three orders, a different session ID and `22:22` clock into the mock localStorage key. Refresh retained the same S1 M3 session, re-read its HTTP world, rendered eight orders/two vehicles and the M3 clock, issued no new load POST, and preserved the old mock bytes. Captured M3 order/vehicle IDs and every location ID/coordinate were compared with the frontend snapshot and rendered DOM. No browser errors occurred.

To repeat the browser check, set `M3_ACCESS_FILE` to the private native installation's `backend/dev_access.json` and run `node docs/evidence/m3-phase1-browser.mjs` from frontend. The script reads credentials in memory and records only public response data.

## Changed files and preserved boundaries

Final checks: `npm.cmd run test:run` passed 157 tests in 25 files; `npm.cmd run typecheck` and `npm.cmd run build` both exited 0. Independent review reproduced the fixed load-order behavior and mapped the captured native HTTP world successfully with no remaining required Phase 1 issue.

New production files: `src/integrations/member3/{client,types,errors,worldState}.ts`, `src/services/api/{BackendDispatchApi,createDispatchApi}.ts`, `src/env.d.ts`, `.env.example`. The ignored `.env.development.local` selects backend locally.

Changed existing production files: `src/app/DispatchContext.tsx` (environment factory, startup error/cleanup), `src/shared/types/{dispatch,scenario}.ts` (optional backend metadata/location kinds and nullable native timestamp), `src/shared/components/mapScene.ts` (delivery points are not duplicated as depot markers), `src/admin/AdminPage.tsx` (existing loading error, session/mode attributes/tooltip, pending scenario guard), `src/driver/DriverPage.tsx` (existing loading error text). UI layout/CSS is unchanged.

New/changed tests: `src/integrations/member3/client.test.ts`, `src/services/api/{BackendDispatchApi,createDispatchApi}.test.ts`, `src/app/DispatchContext.test.tsx`. Documentation: README, this guide, the implementation plan and evidence files. The local preparation helpers under `.drive-imports/m3-phase1` are operational artifacts; installation/auth/authority remain outside the project. The M3 source preflight report was restored byte-for-byte after its official verifier ran.

Protected mock/plan modules are checked by SHA-256 against the pre-change baseline. See the [integrity/verification receipt](evidence/m3-phase1-verification.json) for the final file inventory and checks. The build's large-chunk warning is the existing bundled offline road-pack footprint; code splitting is outside this phase.

## Revision review correction

The original Phase 1 evidence above predates the review correction. `worldState.ts` no longer converts `basis.head_version` to `Number` or rejects valid int64 counters above JavaScript's safe-integer limit. The raw basis remains the backend revision authority; the mock-only numeric field is independent of both server counters.

Regression tests cover counters above `2^53`, signed-int64 maximum, a generation-only refresh, generation mismatch across projections and malformed/out-of-range counters. Mock runtime behavior and the deferred Optimize/Select/Accept/Event/Replay actions are unchanged.

Post-correction verification: 164 tests in 25 files passed, typecheck/build exited 0, and independent review found no required fix. The updated adapter also replayed the recorded native S1 HTTP payloads with full string basis unchanged, eight orders/two vehicles/nine locations and legacy version `0`. See the [revision verification receipt](evidence/m3-revision-fix-verification.json). This replay is not a new browser/native-runtime run; the original browser evidence remains historical.
