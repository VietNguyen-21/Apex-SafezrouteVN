# Member 3 Phase 6 — Driver execution and server replay

Scope: P6-01 → P6-03 of the [integration plan](../../docs/superpowers/plans/2026-10-06-member3-integration/plan.md). Implementation and scoped gates PASS on 2026-10-08: 327 tests in 43 files, typecheck and build.

Backend Driver keeps the existing shell and renders only accepted execution geometry. Its physical card reads server time, position/timestamp, load, onboard custody, delivered prefix, planned suffix and unserved reasons from execution-view/2. Planned deliveries do not become Delivered. When an event suspends the suffix, observed custody remains visible and replay requires a new accepted plan. Backend has no manual Pickup/Delivered or local demo clock; explicit mock mode retains its controls.

Replay controls use owner-authorized M3 writes. Confirmed controller receipts settle durable commands separately from physical read convergence. The UI shows the last confirmed execution as stale until a coherent read arrives; Pause/Speed remain available for observational revision churn, while auth/integrity/session failures stay blocked. Step/Start preserve decimal-string expected revision; Speed sends request ID/speed only, with 1/2/4/8 supported. Pause uses `/replay/playback/pause`, then observes the controller until `fully_paused=true` and `in_flight=false`. A reserved tick may settle after Pause. Speed never resumes a paused controller. The server owns event barriers and final-return stopping; frontend neither advances time nor auto-applies events.

Replay intents persist before POST and retain original session, request ID/body and full input basis. Unknown outcomes retry the same identity. Historical receipts cannot rewind current physical state. Reset creates a new session from the verified fixture and clears comparison/preview/accepted pointers while retaining source history. Late responses from the old session are fenced.

The origin-scoped session reference contains session and command/UI metadata, with no bearer, world, orders, progress or trajectory. Cross-tab reference notifications only trigger fresh GET reads, never pending-command resubmission or writeback loops. Each tab owns one coordinator; hidden/unmounted reads are aborted and resume through server reads. Foreign-owner responses fail closed and do not load a substitute scenario. Credentials remain separate in each tab's sessionStorage or injected provider.

Run functional checks from `frontend/`:

```powershell
npm.cmd run test:run
npm.cmd run typecheck
npm.cmd run build
```

Native prerequisites are the [operations runbook](../../docs/M3_OPERATIONS_RUNBOOK.md), verified r2 installation and API/worker readiness. Configure private `M3_ACCESS_FILE`, `M3_BASE_URL`, `M3_FRONTEND_URL`; Vite uses `VITE_DISPATCH_MODE=backend` and `VITE_M3_BASE_URL`. Run separate cases:

```powershell
node docs/evidence/member3-integration/browser.mjs --phase 6 --scenario S2
node docs/evidence/member3-integration/browser.mjs --phase 6 --scenario S0
```

The harness prepares a native comparison via HTTP, then opens Admin and Driver in the same browser context. S2 exercises actual UI Select/Accept, Step/Play/Speed/Pause, event-barrier Apply and Reset. S0 exercises Select/Accept, final-return autoplay and Reset; it does not repeat S2's initial Step/Pause sequence. Tabs are activated in turn to prove hidden-tab resume and coherent server convergence. Explicit HTTP advance near the event/final-return boundary is a labeled test prerequisite, not frontend physics. Driver viewport checks cover 360/390/430. Reports checkpoint IN_PROGRESS/FAIL and become PASS only after every scoped assertion; raw bearer values are excluded.

The S2 run reached and verified the exact server barrier before a pointer-click harness timeout. A diagnostic Puppeteer connection had changed the viewport through its default emulation; Apply issued no POST. Its full FAIL receipt is retained privately, with a public [interrupted-run summary](evidence/member3-integration/phase6-interrupted-S2.json). The continuation opens a fresh browser, verifies the unchanged world against the confirmed barrier and preserves the original successful UI command evidence. It performs only remaining Apply/layout/Reset/reload checks, never resubmits confirmed physical commands. The interrupted browser recorded a maximum of two Admin state requests in flight; that polling measurement is not certified by the fresh-browser gate, and its cause remains unproven. The final report carries this provenance and scopes polling maxima to the fresh browser. Diagnostics now use `defaultViewport: null`. Apply uses the real React button's DOM click; an enabled check and click must be atomic because foreground refresh can disable the node between separate calls. This does not certify manual touch input.

A confirmed native Reset was followed by a destination GET timeout. The frontend now reconciles that validated Reset immediately after persisting its new session pointer; observation failures recover through GET and do not restore a completed intent. The native continuation retains that receipt, revalidates both source worlds, then exercises an additional intentional Reset on the already-created session using final source, with cross-tab convergence and GET-only reload. The retained earlier playback/Apply branches are unchanged by this Reset-specific fix; they are not presented as a new uninterrupted run on the later source.

The private installation subsequently reported `RECOVERY_UNAVAILABLE` for a session quarantined with `STORE_INVALID`. Its public SDK validation returned `valid=true`. A controlled API/worker restart used official startup recovery on all 14 retained sessions, then `/ready` passed every check. No direct SQL write, authority deletion, backend/runtime patch or SDK deadline change was used; the original cause remains unproven. See the [recovery receipt](evidence/member3-integration/phase6-native-recovery.json). Native cases run sequentially after this recovery.

Polling evidence distinguishes Chrome transport requests from uncancelled GETs through their real JSON body read. The probe observes AbortSignal and preserves real fetch responses/errors. Two test regressions first failed, then passed: an unread first body must expose a duplicate GET, while an aborted request is counted separately from its replacement. Public receipts retain transport maxima and state the fresh probe's coverage; they do not certify the interrupted browser's maximum of two requests.


S0 reached PLAN_COMPLETE and its Reset returned 200. The immediate assertion GET returned RUNTIME_BUSY, so a GET-only continuation verifies the acknowledged destination, source-world retention, cross-tab convergence and reload without resending Reset. A final GET-only completed-source view checks the later UI availability fix: Step/Play are disabled using exact server end time even when Reset changed the old controller reason to MANUAL_RESET. The original width screenshots predate this availability-only fix; the completed-controls screenshot records the final UI. S2 uses the separately labeled additional intentional Reset continuation.

Evidence: [verification receipt](evidence/member3-integration/phase6-verification.json), [independent review and author fixes](evidence/member3-integration/phase6-review.md), native [S0 final-return](evidence/member3-integration/phase6-native-S0.json) and [S2 event-barrier](evidence/member3-integration/phase6-native-S2.json). Both cases exercise actual Admin/Driver writes, Reset, fresh reload, all-nine-field convergence and Driver 360/390/430 layouts.

Initial comparison reuse was read-only and preceded physical writes. Later continuations retain acknowledged playback/Apply/Reset receipts and revalidate their physical worlds before checking the remaining gates; the reports record each scope and prior failure. Admin forecasts hydrate before opening Driver to respect serialized SDK bridge access. The retained Select/Accept and playback branches are unchanged by the later Reset-specific fix; the separately documented continuations verify remaining gates and final-source Reset. HTTP boundary positioning remains explicitly labeled. No backend deadline or runtime implementation was changed.

Phase 7 cutover, import/artifact isolation, heavy-pack cleanup, full S0–S4 E2E, manual touch/WebView and Phase 3 reviewer sign-off remain separate. Default mock and offline packs are preserved. Simulated replay remains non-GPS and carries no production SLA/calibration claim.
