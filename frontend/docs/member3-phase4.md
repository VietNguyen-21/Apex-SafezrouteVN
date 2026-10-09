# Member 3 Phase 4 — Select and Accept

Scope: P4-01 → P4-02 of the [integration plan](../../docs/superpowers/plans/2026-10-06-member3-integration/plan.md). Complete: 260 tests in 36 files, typecheck/build and native S1 r2 gate pass. Independent review found three recovery issues; the author fixed all three with RED→GREEN regressions and full verification. No second independent sign-off is claimed.

Select stores a preview job preference and publishes UI state only. Accepted geometry, vehicle position/load/custody, delivered prefix and simulation time continue to come from coherent M3 state/projection reads. Admin and the command boundary share a guard checking the certified job, proposal registry, full nine-field basis, freshness and pending mutation. PARTIAL and certified RETURN_ONLY are eligible; lifecycle COMPLETED alone is insufficient. The server repeats witness validation and CAS.

Accept submits the selected job ID with a durable request ID and exact decimal-string expected revision. The pending intent contains original input basis, job, ID and body only. Lost reply, metadata failure or unknown outcome retains that intent; Refresh/reload retries it without changing its revision or job. Double-click shares the in-flight promise. Definite 409 STALE_HEAD, JOB_STALE, WITNESS_REQUIRED and WITNESS_INVALID clear the rejected intent, read fresh state/history and preserve the diagnostic for explicit re-optimization. No different Accept is submitted automatically.

Commands use a localStorage namespace scoped to the backend origin, with the recovery identity stored in sessionStorage. Each new intent allocates a fresh namespace, so opener-created tabs with copied sessionStorage cannot overwrite each other's commands. Reload preserves an existing intent's namespace and request identity. An existing Phase 2 origin-scoped pending intent is reconciled using its original ID before switching. If another tab changes the shared session pointer, reload fetches the pending Accept's original owned session through authenticated GET before reading/retrying it. If durable storage or recovery identity is unavailable, authenticated world reads remain possible and writes fail closed. Bearer remains injected/sessionStorage-only and is never persisted with command metadata.

After an acceptance response, frontend reads coherent current state/orders/vehicles/locations and confirmed GET acceptances history before clearing the command. Receipt basis may be historical and active job may have changed since that receipt; neither response receipt nor local preview becomes physical authority. `backend.acceptances` stores public confirmed receipt metadata only. Historical geometry is unavailable, so legacy `acceptedPlans` stays empty; current accepted geometry is in `planState.acceptedExecution`. No current route is cloned into history. Driver displays the accepted execution source, while replay/stop operations remain Phase 6 work.

Default mock mode, offline packs and UI layout are preserved. Phase 5–7 and Phase 3 reviewer sign-off are separate. This phase does not claim real GPS, optimality, a new runtime release or production cutover.

Run tests from `frontend/`:

```powershell
npm.cmd run test:run
npm.cmd run typecheck
npm.cmd run build
```

For the native browser gate, start the API/worker using the [operations runbook](../../docs/M3_OPERATIONS_RUNBOOK.md) with the existing r2 installation and check `/ready`. Set non-secret `VITE_DISPATCH_MODE=backend` and `VITE_M3_BASE_URL` for Vite. Inject the bearer through the existing runtime provider/sessionStorage; the harness reads the private access file in memory:

```powershell
$env:M3_ACCESS_FILE = '<private-installation>/backend/dev_access.json'
$env:M3_BASE_URL = 'http://127.0.0.1:8004'
$env:M3_FRONTEND_URL = 'http://127.0.0.1:5174'
node docs/evidence/member3-integration/browser.mjs --phase 4 --scenario S1
```

The gate uses actual Admin controls, loses one HTTP reply after real server commit, holds the second tab's stale request at the HTTP boundary, and retries the original request after reload. A separate explicit test-only replay step advances the world to prove historical receipt reconciliation; it does not implement frontend replay controls. Optional `M3_PHASE4_SESSION` and `M3_PHASE4_COMPARISON` resume an owned, still-unaccepted S1 comparison through public reads rather than rerunning compute. The receipt distinguishes resumed comparison from a fresh Optimize in that run.

Evidence: [native gate](evidence/member3-integration/phase4-native.json), [verification](evidence/member3-integration/phase4-verification.json), [independent review](evidence/member3-integration/phase4-review.md), [Driver screenshot](evidence/member3-integration/phase4-driver-native.png). The completed native run used fresh UI Optimize, then Select, lost reply after real Accept, stale two-tab race, historical retry and Driver. Three POST attempts shared one original body/request ID and produced one acceptance. Repeated response envelopes are summarized with hashes; full world/geometry samples are retained. Historical Phase 3 r1 browser receipts are not this Phase 4 r2 evidence.
