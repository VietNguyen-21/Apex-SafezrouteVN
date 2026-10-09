# Local event road integration

**Goal:** Remove the requested right-panel acceptance/provenance block and replace matching post-event schematic proposals with road geometry computed by the installed M2 code.

**Architecture:** Keep UI → DispatchApi → MockStateEngine. Export exact manual demo worlds, compute offline outside the browser with the unmodified M2 worker and independent raw-source validator, then bind a separate generated pack to the entire physical world. This is development integration, not Member 3 HTTP or a native SDK session.

**Constraints:** No source/runtime/SQLite edits, no geometry fabrication, no silent physical replay, no automatic Accept. Freeze delivered orders and preserve onboard custody, positions and availability. Keep view toggles/defaults/colors and Driver lifecycle. Static packs are forecasts at the recorded demo time; changed physical worlds require a new export.

## Runtime findings / rulings

- Public RuntimeClient only bootstraps pinned fixtures and accepts its own authenticated replay heads. It cannot ingest a manual frontend snapshot. The local tool uses the released worker's existing physical-anchor input; raw route validation is recorded separately from SDK session certification.
- S0 can apply the M1 urgent/unavailable presentation event to its three-order manual world, with exact fixture payload validation. Direct S2/S3/S4 use their own pinned events. Keep root M1 state unchanged and supply manual physical progress as an explicit anchor.
- M2 rain computation requires the pinned S4 root. S0 + S4 rain is therefore unavailable through this unmodified release; never swap in the eight-order S4 state or transplant its geometry. Record this remaining capability explicitly.
- Released post-domain proposals aggregate all waiting cargo. The local wrapper enumerates bounded vehicle-specific subsets and retains disjoint options; unmodified M2 action realization and CP-SAT choose the final assignment. Capacities stay 15 kg. DELIVERED is frozen, ONBOARD stays owned, pickup-first candidates use residual capacity, and delivery-before-reload candidates may reuse legitimately freed capacity. This is a local candidate-policy extension, not a new official M2 release.
- A partial witness is a valid forecast with explicit unserved diagnostics, not a proof that the remaining orders are infeasible. Bounded search does not claim global optimality.
- Clock is excluded from world matching to preserve deterministic repeated Optimize on the same physical state. The recorded sourceTime is a static forecast; timed expiry changes events/context and invalidates matching. No claim of freshly computed later-time feasibility is made.
- No Git metadata exists in this downloaded workspace; retain this plan and evidence as the ledger, without creating or deleting worktrees.

## Tasks

- [x] E01 — TDD remove right-panel Plan Accepted / dispatched / provenance, retain actual Accept action and status elsewhere. Admin observable tests RED → GREEN, 21/21 before catalog integration.
- [x] E02 — Export six standard post-event manual worlds; tested input/anchor adapter, source/build checks, worker compute and independent raw validation retained. No SDK-session claim.
- [x] E03 — Full-world matching and event engine tests RED → GREEN; five manual packs wired beside initial packs. Exact geometry/actions, custody/coverage, repeat Optimize and immutable history verified.
- [x] E04 — Fifteen validated profiles for five supported worlds integrated; S2/S4 recomputed with diverse subset pool. Unsupported S0 rain diagnostic retained. Export audit compares actions/geometry against retained raw workers.
- [x] E05 — 122/122 frontend tests, 14/14 Python tests, typecheck/lint/build exit 0; five event browser flows, cross-tab Accept, viewports and tile fallback checked. Independent final review completed and source-clock finding fixed with RED → GREEN.

**Verification seams:** Admin observable UI; pure world-to-anchor adapter; offline pack matching/projection; MockStateEngine/API lifecycle. Use existing renderer integrity tests for geometry.

**Capacity regression evidence:** Released post-domain at the same synthetic co-located test seam fails total-load partition, two-vehicle partition and oversized-order partial service (3 failures). Local domain + real M2 action realization/CP-SAT passes those and onboard/delivered invariants. Residual pickup-first test and six-order complementary-pool test each ran RED → GREEN. These tests isolate capacity from road/time feasibility; raw SQLite validation remains mandatory for exported road witnesses.

**Final review (2026-10-06):** Source forecast time restored in the existing map subtitle, tied to its selected/accepted source; requested right block remains removed. Observable clock test RED → GREEN. Unsupported-only export bookkeeping was regraded Important because the documented verification pipeline requires summary/bundle artifacts: added CLI-seam regression RED → GREEN, always persist final diagnostics. No deferred review findings.

**Remaining bounds:** S0 rain requires an M2 capability extension; arbitrary pickup/delivery/motion worlds require a matching new export or M3 transport. The exported domains are bounded (at most one future pickup batch per vehicle in this local policy), not exhaustive rolling-horizon optimization. Static asset growth increases the JS bundle to about 6.77 MB / 1.63 MB gzip. Manual WebView acceptance remains open.
