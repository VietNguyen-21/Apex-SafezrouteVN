# Offline Member 2 road routes

**Goal:** Download the pinned M1 snapshot and released M2 runtime, compute matching S0/S1/S2/S3/S4 profile routes offline, then consume supplied geometry in the existing mock frontend without changing its visual design.

**Architecture:** Keep the released solver and isolated Python environment in `m2_runtime`. Run the public RuntimeClient with the external approved build digest and read-only M1 snapshot. Export verified JSON profile packs outside the immutable runtime root. Frontend chooses an offline pack only when its scenario, order/custody/vehicle state and event phase match; all other worlds retain explicitly schematic prepared plans. No browser routing or live backend is introduced.

**Constraints:** Keep English UI, deterministic mock lifecycle, Accept-only dispatch, immutable accepted plan content and subscriptions. Preserve every supplied EDGE coordinate and order. Do not combine replay sample geometry with unrelated assignments or claim backend/GPS integration. Physical event replay output may differ from the UI mock world; bind explicitly before use.

## Tasks

- [x] R01: Find release/snapshot files on Drive; download only required databases and context metadata; verify Runtime/Integration ZIP hashes.
- [x] R02: Install workspace-local Windows Python 3.12; source catalog/fixture/manifest audit passes for all nine pinned scenarios.
- [x] R03: Install exact M2 dependency lock, attest CP-SAT and production inventory.
- [x] R04: Compute three profiles per supported initial scenario via public SDK; retain raw jobs, source pins, validation and execution views. All twelve profiles FEASIBLE/certified, no failures. Native post-event generation is outside this verified scope.
- [x] R05: TDD offline pack binding, action-to-stop/EDGE projection, missing/incompatible pack fallback, supplied geometry source and accepted/proposed independence.
- [x] R06: Wire matching offline packs into MockStateEngine proposals; preserve UI shell and label schematic fallback. Verify persistence compatibility and custody after Pickup/Delivered/events.
- [x] R07: Full frontend checks, browser route screenshots, document exact run/recompute commands and task status with evidence.

## Evidence — 2026-10-05

- Exact pinned M1 SQLite source hashes, runtime production inventory/build digest and locked Python environment verified. CP-SAT smoke OPTIMAL; nine-scenario source audit passes.
- Twelve certified completed FEASIBLE witnesses exported in four INITIAL packs; 13,232 EDGE geometries/actions match the raw jobs exactly (`tools/verify_generated.py`). Two exporter unit tests pass.
- TDD RED/GREEN observed for offline binding/wiring, completion, metric absence/scopes, fleet ETA labels, Driver incoming-leg aggregation and Leaflet class preservation on tile failure.
- Full frontend suite **97/97** passes; typecheck/lint/build exit 0. Bundle warning remains: approximately 3.55 MB JS / 875 kB gzip, including all four road packs.
- Browser initial S0/S2/S3/S4 Admin/Driver exact route counts, persistent hydrate and unmatched-event fallback pass in [offline-route-results.json](evidence/offline-route-results.json).
- Admin 1280/1440 and Driver 360/390/430 px all have `overflowPx=0`, nonzero map dimensions and supplied routes. Forced tile failure keeps 564 road paths / 6 markers and Leaflet classes. [Visual results](evidence/visual-results.json) and screenshots are retained.
- Review corrected mixed route/fuel comparisons, fleet-time-as-ETA labels, fabricated offline vehicle ETAs and first-edge-only Driver leg metrics. Tile failure previously overwrote Leaflet classes; a regression test now covers this.
- Real device/WebView/touch/focus remains open. Native post-event/current-world road integration requires separately bound snapshots or Member 3, not reuse of INITIAL geometry.

## Verification focus

1. Source SQLite bytes, no sidecars and external build digest match the release.
2. Scenario S0 has three orders; S1/S2/S3/S4 initial worlds have eight, with S3 initial onboard custody. S1 has no events. Packs cannot cross these worlds.
3. Only certified completed witnesses with all three profiles can replace prepared data; partial results preserve unserved diagnostics.
4. Geometry comes from ordered EDGE actions, including return legs. Do not fabricate depot-return execution actions or claim manual UI progress is native runtime replay.
5. Changed custody, unavailable vehicles, delivered orders and rain expiry invalidate an initial pack match; retained accepted geometry remains immutable.

## S1 addition — 2026-10-06

S1 imports the existing Member 1 `S1.json` unchanged. The retained
`export_routes.run()` workflow computed only S1's INITIAL world through the
released public RuntimeClient, using the same approved build, snapshot and
locked Python environment as the original four packs. No manual-event candidate
extension was used. All three profiles are certified FEASIBLE, serving 8/8 with
V1/V2 capacities unchanged at 15 kg. FASTEST has 1,270 EDGE actions; BALANCED
and SAFER each have 1,289. All 3,848 exported EDGE arrays match the raw SDK jobs.

The S1 pack is appended to `member2-road-packs.json`; the original metadata and
S0/S2/S3/S4 pack contents are preserved. The existing engine, projection,
renderer, Driver and persistence code are unchanged. Matching clean S1 resolves
to offline road proposals with `MEMBER2_SUPPLIED` and source
`Member 2 offline runtime`; no event is injected or automatically optimized.

Raw jobs, environment attestation and validation are retained in
`m2_runtime/outputs/s1-initial-20261006/`. See the
[S1 report and exact generation command](s1-support-verification.md),
[Admin/Driver browser results](evidence/s1-road-results.json),
[initial scenario regressions](evidence/s1-initial-regression-results.json) and
[manual-event regressions](evidence/s1-event-regression-results.json).
Frontend checks pass: 138 tests, typecheck, lint and build. The build still emits
the large-chunk warning (7.64 MB JS / 1.84 MB gzip); bundle refactoring remains
outside this S1-only change.
