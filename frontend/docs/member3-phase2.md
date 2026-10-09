# Member 3 frontend — Phase 2 Optimize

Phase 2 adds native three-profile comparison submission, typed lifecycle/coverage/verdict validation, a job registry, and one polling coordinator per API instance. The Admin card shell and mock/offline implementation remain in place. Backend Select/Accept/Event/Replay remain deferred to their migration phases.

## Run

Use the same non-secret mode/base URL and runtime token setup documented in [Phase 1](member3-phase1.md). Default factory and `.env.example` still select mock intentionally. Start the native API and worker using the [M3 operations runbook](../../docs/M3_OPERATIONS_RUNBOOK.md); check `/ready` before browser acceptance.

From `frontend/`:

```powershell
npm.cmd run dev -- --host 127.0.0.1 --port 5173
$env:M3_ACCESS_FILE = Join-Path $env:TEMP 'saferoute-m3-phase1-20261006/native/backend/dev_access.json'
node docs/evidence/member3-integration/browser.mjs --phase 2 --scenario S1
```

The harness reads the private credential in memory, drives the actual Admin Optimize button, records public HTTP data and checks world immutability, three profile/job bindings, terminal polling stop and read-only refresh. `--scenario S0` through `S4` are supported. `--all` explicitly refuses to certify the unimplemented future phases.

## Behavior

- Backend scenario labels use catalog counts/time/fixture bindings; only the current S0–S4 UI scope is offered.
- Optimize sends `POST /api/sessions/{sessionId}/profiles/compare` with a durable body `request_id` and string `expected_revision`. It omits `job_ids`, allowing M3 to create the batch. It returns a queued snapshot; subscription polling publishes intermediate lifecycle.
- The entire original input basis is retained with the pending intent. A lost network reply is unknown: Refresh reconciles by retrying the exact ID/body. Transient typed BUSY/timeouts/metadata errors get at most three retries after 1/2/4 seconds. Authentication, validation and binding errors are never automatically retried. An idempotency conflict never creates another batch ID.
- Session references and pending intent metadata are origin scoped. They contain no token, physical world, route, progress or clock. A confirmed comparison reference survives refresh; its world and lifecycle are read again from M3. Pending unknown commands block session changes.
- Commands require writable durable browser storage. Intent writes are transactional: a failed write cannot be bypassed by Refresh. The comparison pointer must be saved before clearing the original request ID. A definite `409 STALE_HEAD` rejected before batch creation clears only that intent, reads current world, and requires a new explicit Optimize. Other ambiguous/conflicting intents remain retained.
- Full nine-field `M3Basis` equality governs backend currency. Int64 revisions remain canonical decimal strings. The numeric mock version remains a compatibility placeholder in backend mode.
- Group and child lifecycle are separate. `COMPLETED` is not proof of a witness. Coverage remains unavailable without a certified witness; cancelled children can be `FAILED` with `JOB_CANCELLED`. `PARTIAL` and `RETURN_ONLY` retain their wire semantics. Only the server `COMPARABLE` verdict permits comparative interpretation; identical profile results remain valid. Cards do not assign a backend recommendation.
- Forecast geometry and unit/scoped KPI adaptation remain Phase 3. This phase keeps metrics placeholders and the plan arrays empty; it does not invent geometry, copy offline plans or accept a forecast to obtain a route.
- Comparison reads wait 1 second after the previous read settles; world reads wait 2.5 seconds. No overlapping request of a kind, no child/panel polling loops. Terminal groups stop comparison polling. Hidden tabs, last unsubscribe and session changes abort old reads; abort does not cancel a server job. The ten-minute watch deadline reports unknown and aborts the GET, retaining the server lifecycle.
- User mutations pause periodic reads and wait for the outstanding world read to settle. Poll errors retain the last snapshot with stale/error metadata and disable Optimize. Refresh performs fresh reads; Cancel comparison uses the actual server cancellation endpoint and its own durable request ID.

## Evidence

The migration [task tracker](../../docs/superpowers/plans/2026-10-06-member3-integration/tasks.md) and Phase 2 ledger record checks and the native receipt. Final native S1: [browser/public HTTP receipt](evidence/member3-integration/phase2-latest.json), [verification](evidence/member3-integration/verification.json), [independent review and regression fixes](evidence/member3-integration/review.md). The publication checkout passed 196 tests in 31 files, typecheck and build. Native group `comparison-15b5c0c29cf3405f9671cfb343221937` reached COMPLETED/COMPARABLE with three bound jobs, unchanged world/basis, read-only refresh and terminal polling stopped.

Phase 1 receipts remain historical. No full-migration, production cutover, forecast-map, real GPS or optimality claim is made by Phase 2. The existing large offline bundle warning remains; cleanup is Phase 7.
