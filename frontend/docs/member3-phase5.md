# Member 3 Phase 5 — Events and re-optimization

Scope: P5-01 → P5-02 of the [integration plan](../../docs/superpowers/plans/2026-10-06-member3-integration/plan.md). Complete: 294 tests in 38 files, typecheck/build and native S2/S3/S4 r2 gates pass. Verification results are recorded in the [Phase 5 receipt](evidence/member3-integration/phase5-verification.json); native cases and review are linked there.

Admin renders actual pending events from the owned M3 session. Backend buttons are Not due, Apply, or Applied; they cannot toggle an applied event OFF. Readiness comes from the server `apply_allowed`, bound to the same full nine-field basis, exact simulation time and pending IDs as coherent state/orders/vehicles/locations. A matching timestamp without an observed prefix never enables Apply. S1 has no fabricated events. Mock urgent/unavailable/rain toggles remain available in explicit mock mode.

Apply persists original session, event ID/type, full input basis, expected revision and request ID before submitting. Concurrent calls share one intent. A lost response, auth error or integrity failure retains that intent; Refresh/reload retries the same request ID/body even if another tab changed the shared session pointer. Confirmed terminal event conflicts clear the rejected intent, refresh the world and preserve the diagnostic. The response receipt is audit metadata; fresh server projections remain physical authority.

GET replay/history contributes Applied only for confirmed APPLIED receipts. Disappearance from pending events or the capped 100-entry history never implies an applied transition. A recovered response can supplement the current audit metadata with its confirmed historical receipt. The reviewed rare cap limitation is documented in the [review](evidence/member3-integration/phase5-review.md).

Event transitions preserve simulation time, delivered prefix, positions, load and onboard custody. S2 adds the urgent order from server projection; S3 immobilizes the unavailable vehicle while keeping ownership; S4 retains the server overlay hash as provenance. Frontend does not invent a rain polygon, infer weather expiry from wall-clock time, or clear server context locally. Applied events suspend the accepted suffix. Old forecasts cease to be eligible through full-basis comparison; explicit Optimize submits the latest revision and binds new forecasts to the new full basis.

Run functional checks from `frontend/`:

```powershell
npm.cmd run test:run
npm.cmd run typecheck
npm.cmd run build
```

Start the verified native r2 API/worker using the [operations runbook](../../docs/M3_OPERATIONS_RUNBOOK.md); verify `/ready`, build and installation pins. For Vite use `VITE_DISPATCH_MODE=backend` and `VITE_M3_BASE_URL`. Keep private credentials/configuration outside publication. Then run each case from `frontend/`:

```powershell
$env:M3_ACCESS_FILE = '<private-installation>/backend/dev_access.json'
$env:M3_BASE_URL = 'http://127.0.0.1:8004'
$env:M3_FRONTEND_URL = 'http://127.0.0.1:5174'
$env:M3_S4_FIXTURE = '<team-root>/scenarios/fixtures/thu-duc-binh-thanh-v1/S4.json'
node docs/evidence/member3-integration/browser.mjs --phase 5 --scenario S2
node docs/evidence/member3-integration/browser.mjs --phase 5 --scenario S3
node docs/evidence/member3-integration/browser.mjs --phase 5 --scenario S4
```

Each gate starts an owned native session, prepares one BALANCED plan and Accept through real public HTTP, then uses typed replay/step to reach the exact pending barrier. These are test prerequisites; Driver replay UI remains Phase 6. Apply and the subsequent three-profile Optimize use actual Admin controls. S2 loses a response after real commit and retries its original identity. S4 re-accepts BALANCED in the UI and steps to the pinned fixture's expiry; the fixture raw-byte hash must match the owned session before its time is used. It is a harness oracle, never frontend data. This proves server time/context projection at expiry, not independent weather calibration or new public geometry.

Optional `M3_PHASE5_SESSION` resumes an owned session whose event is still pending and whose initial plan is already accepted. The receipt labels that prerequisite as resumed. A gate with an already-applied event must start a new session. Reports checkpoint failures as FAIL/IN_PROGRESS and write PASS only after all assertions. Repeated response envelopes are summarized with SHA-256; full public world samples are retained. Bearer values are excluded.

The S2 receipt also records a read-only continuation after an assertion compared equal bases using JSON key order. Apply, retry and UI Optimize had already executed in that owned session. `M3_PHASE5_CONTINUE_REPORT` consumes the preserved failed report and continues only from its confirmed samples, without resubmitting Apply/Optimize. S2 rechecks the comparison, fresh frontend basis/proposals and confirmed audit. S4 retained its completed comparison after a runtime-busy GET left the UI stale; continuation performed explicit UI Refresh, UI Accept and typed native replay to 22:15, then verified the displayed server time, disabled stale proposals and retained overlay hash. Structural equality checks all nine fields, independently of key order. These continuations are explicit in the receipts; a single uninterrupted run is not claimed.

Default mock mode, offline packs and layout remain in place. Phase 6–7, full migration E2E, production artifact isolation/cutover, manual device checks and Phase 3 reviewer sign-off remain separate.
