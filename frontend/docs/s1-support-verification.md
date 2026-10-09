# S1 support verification — 2026-10-06

Clean S1 now loads through the existing Admin selector and Optimize returns its
own certified Member 2 initial road pack. The table below records the actual
solver witnesses; no assignment or geometry was adjusted for presentation.

| Profile | M2 status | Served | Unserved | EDGE actions | Coordinate pairs | EDGE arrays with >2 points |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| FASTEST | FEASIBLE | 8 | 0 | 1,270 | 3,394 | 378 |
| BALANCED | FEASIBLE | 8 | 0 | 1,289 | 3,405 | 384 |
| SAFER | FEASIBLE | 8 | 0 | 1,289 | 3,405 | 384 |

1. **Files changed.** Existing files: `src/shared/types/scenario.ts`,
   `src/mocks/fixtureCatalog.ts`, `src/mocks/fixtureCatalog.test.ts`,
   `src/mocks/data/member2-road-packs.json`, `src/admin/AdminPage.tsx`,
   `src/admin/admin.labels.ts`, `README.md`, `docs/offline-member2-route-plan.md`
   and `docs/tasks.md` (paths relative to `frontend/`). New files:
   `src/services/api/S1Scenario.test.ts`, this report,
   `docs/evidence/s1-road-check.mjs`, `s1-road-results.json`,
   `s1-initial-regression-results.json`, `s1-event-regression-results.json`,
   `s1-baseline-integrity.json`, `s1-source-audit.json`, three
   `s1-admin-{profile}.png` screenshots and
   `s1-driver-accepted.png` in `docs/evidence/`. Generated runtime evidence lives
   separately under `m2_runtime/outputs/s1-initial-20261006/`: authority store,
   boot/initial views, submitted/compute SDK replies, environment, summary,
   route pack and `s1-source-audit.json`. Released M2 code/tools are unchanged.
2. **Member 1 fixture.** Catalog imports
   `../../../scenarios/fixtures/thu-duc-binh-thanh-v1/S1.json` directly.
   Fixture bytes remain unchanged, SHA256
   `9d90a0f0d408449ed03ead415a2d55499db460d1380b3cc726899138c68b6196`.
   `getFixtureScenario("S1")` equals the original parsed fixture, including
   `Normal synthetic delivery day`, `events: []` and initial epoch
   `2026-09-27T21:00:00+07:00`. Locations, graph nodes, demands and windows were
   preserved. Catalog/selector order is S0, S1, S2, S3, S4.
3. **Orders.** Eight exact source orders, O001–O008. Browser KPI shows
   `TOTAL ORDERS = 8`. Served and unserved identifiers cover each order once.
4. **Vehicles/capacity.** V1 and V2, 15 kg each. Browser KPI shows
   `ACTIVE VEHICLES = 2 / 2`. Raw witness peak loads are V1 12.709 kg and
   V2 12.725 kg for all three profiles, within the unchanged capacities.
5. **Generation.** Existing `m2_runtime/tools/export_routes.py` Python `run()`
   entry point was invoked for `scenarios=["S1"]`, `events=False`, budget 120
   seconds/profile and a fresh output/authority directory. It verifies the
   production inventory and environment, bootstraps the pinned S1 world through
   public RuntimeClient, submits FASTEST/BALANCED/SAFER and retains the certified
   completed raw job responses. This uses the released initial-world workflow,
   without the local manual-event candidate extension. The resulting single
   pack was appended to the existing asset; all original pack bytes before the
   array's closing delimiter remain intact. Bundle contract is
   `m4-offline-road-packs/1`, `SIMULATED_REPLAY`, `S1`, `INITIAL`, certified true,
   exact fixture initialState and exactly those three profiles in that order.
6. **Runtime/build identity.** Released `m2_runtime/step7/`, approved build
   SHA256 `80694f511dc735d0b6a1a0a830edd7f6267df395e87dad0ccf180914b49d5a41`,
   Runtime ZIP SHA256
   `d5345e75db2b41914cf4d0ed96a83e50e9c251637065ae1264eb1f33f41cbe4e`.
   Local Python 3.12.10 uses the pinned dependency lock; attestation reports
   ENVIRONMENT_READY and CP-SAT smoke OPTIMAL. Same M1 root
   `scenarios/cached_context/hcmc/member1-tdbt-v1/`; routing SQLite SHA256
   `d4f2412884d7809cba79f86b65f6677c025ebf3e0ead357d3fc3f9cea553a204`,
   features SQLite SHA256
   `8870d537c4f3eb3dca07a177951c66abfe204fe61039852109b92f4751981469`.
   All profiles carry the same build and shared M1 context pins as the approved
   initial packs; the scenario fixture pin is the exact S1 hash above.
7. **FASTEST status.** FEASIBLE, certified, raw validation valid, diagnostics [].
8. **BALANCED status.** FEASIBLE, certified, raw validation valid, diagnostics [].
9. **SAFER status.** FEASIBLE, certified, raw validation valid, diagnostics [].
10. **Served/unserved.** 8 served / 0 unserved for every profile. The pack retains
    the original status and unserved arrays; projection does not relabel partial
    results or synthesize coverage. Validation scope is
    `RAW_ALL_COLUMN_ANCHOR_FLEET_PHASE_AND_SUFFIX; NOT_GLOBAL_OPTIMALITY` with
    validator `task02-m2-runtime-raw-witness-validator/3`.
11. **EDGE counts.** FASTEST 1,270; BALANCED 1,289; SAFER 1,289. Total 3,848.
    Full source actions include the return forecast; the existing map filters
    return display without changing stored geometry/actions.
12. **Exact M2 coordinates.** `tools/verify_generated.py` compares exported
    witnesses to retained `offline-S1-INITIAL-{profile}-compute.json` jobs,
    checking EDGE arrays, action fields/order, orders, metrics and source pins.
    Result: `{"certifiedProfiles":3,"exactEdges":3848,"packs":1}`.
    API tests compare every projected segment coordinate array and supplied
    action against this pack. Browser repeats the per-vehicle array comparison
    for all profiles and confirms multi-point EDGE arrays. See
    [raw source audit](evidence/s1-source-audit.json)
    and [browser evidence](evidence/s1-road-results.json).
13. **geometrySource.** Every projected S1 segment is `MEMBER2_SUPPLIED`, checked
    in the API regression and all three browser selections. The existing
    projection/Leaflet grouping is unchanged; no coordinates are simplified,
    reordered, snapped, interpolated or joined across gaps.
14. **Provenance.** Every proposal uses `provenance.source = "Member 2 offline
    runtime"`, `scenarioId = "S1"` and the approved build digest; API/browser
    assertions verify this. Source forecast epoch stays separate from Demo Clock.
15. **No schematic warning.** Clean Load S1 → Optimize binds the real INITIAL
    pack, with `buildOfflineRoadAlternatives()` non-null. All three browser
    selections and accepted Driver show no schematic warning. The test fails if
    the S1 pack is missing, preventing a schematic result from passing.
16. **Admin browser.** Fresh isolated Chrome session clears
    `saferoute.phase1.dispatch.v1`, reloads and chooses S1 in existing Demo tools.
    Load has eight orders, two vehicles, no events/proposals/accepted plans,
    clean execution and initial clock; both route switches are OFF. Urgent,
    Driver Unavailable and Rain switches are OFF/disabled because S1 has no
    events. After Optimize, each of the three profiles displays V1/V2 when
    enabled: eight delivery leg groups, eleven markers, original palette,
    routes/markers within map bounds, zero horizontal overflow and no page
    errors. [FASTEST](evidence/s1-admin-fastest.png),
    [BALANCED](evidence/s1-admin-balanced.png), [SAFER](evidence/s1-admin-safer.png).
17. **Driver accepted-only.** An open Driver tab shows no route/assigned plan
    during Optimize and all three proposal selections. After FASTEST Accept it
    receives the active accepted S1 plan through existing cross-tab storage,
    with supplied road segments, no schematic warning or horizontal overflow.
    API regression also checks exact accepted content and persistence hydration.
    [Driver screenshot](evidence/s1-driver-accepted.png). Loading S1 over an
    executed session is covered separately: new session ID, fixture world,
    empty proposals/history/selection/assessment/progress, no available events,
    initial Demo Clock and no automatic Optimize.
18. **Verification.** From `frontend/`: `npm.cmd run test:run` → 138/138 tests
    (22 files), `npm.cmd run typecheck` → exit 0, `npm.cmd run lint` → exit 0,
    `npm.cmd run build` → exit 0. Four new fixture/API regressions were observed
    failing before implementation and passing afterwards; the missing-pack
    regression remained red until real M2 output was appended. Existing
    `offline-route-check.mjs` and `local-event-road-check.mjs` both exit 0;
    results are retained under S1-specific evidence names to preserve prior
    evidence. Build emits the existing >500 kB chunk warning; generated JS is
    7,643.17 kB / 1,837.48 kB gzip. No bundle redesign was included.
19. **S0/S2/S3/S4 unchanged.** Original four initial packs and bundle metadata
    compare equal to the saved baseline; their serialized byte prefix is
    preserved. Initial browser regressions pass: S0 564 EDGE / 3 Admin groups,
    S2 1,270 / 8, S3 1,262 / 8, S4 1,270 / 8; all supplied, no schematic warning.
    Unsupported S0 rain retains its labeled fallback and old accepted roads.
    Five existing manual-event browser flows also pass with prior served/unserved
    behavior and Driver updated only after Accept. Engine, road projection,
    event packs, Driver, renderer/CSS, controls and persistence remain byte-equal
    to the baseline. [Initial regressions](evidence/s1-initial-regression-results.json),
    [event regressions](evidence/s1-event-regression-results.json),
    [baseline integrity](evidence/s1-baseline-integrity.json).
20. **No fabricated/copied geometry.** S1 has independent boot, jobs and raw
    validation for its own pinned initial world. No other scenario's routes or
    prepared geometry were transplanted. No routing service, hand-written
    LineString or vehicle-to-edge connector was introduced. M2 assignment/order
    sequences were retained: FASTEST V1 O008→O004→O001→O005, V2
    O002→O007→O003→O006; BALANCED/SAFER V1 same, V2 O006→O003→O007→O002.
    Identical BALANCED/SAFER output was preserved.

## Repeat the S1 export

Use a fresh output path. The CLI's historical scenario choices exclude S1, so
invoke the existing `run()` with its scenario list rather than editing released
code or changing the old default export. This generates only S1; do not replace
the five-pack frontend bundle with this one-pack file.

```powershell
cd C:\Users\Windows\Downloads\SafeRoute\m2_runtime
@'
import argparse, sys
from pathlib import Path
sys.path.insert(0, 'tools')
from export_routes import run
raise SystemExit(run(argparse.Namespace(
    snapshot=Path('..'), output=Path('outputs/s1-initial-new'),
    scenarios=['S1'], budget=120.0, events=False)))
'@ | & .\python312\python.exe -
& .\python312\python.exe tools/verify_generated.py outputs/s1-initial-new
```

Verify build/schema/execution metadata, exact S1 initial state, certified
profiles and raw validation before appending an INITIAL S1 pack. For the current
addition the old serialized array prefix was kept and only the new S1 object
inserted before the closing delimiter. Keep the old four packs unchanged.

For browser re-verification, start Vite then run from `frontend/`:

```powershell
node docs/evidence/s1-road-check.mjs
```

This check uses headless Chrome and an isolated profile. It does not clear the
user's normal browser storage. Screenshots were visually inspected. Real-device
WebView performance remains the existing manual verification gate.

During initial implementation verification the active workspace had no `.git`
metadata, so changes were checked against a pre-edit file/hash backup. No commit
or push had been performed at that point.

## Independent review

A separate read-only reviewer found no Critical, Important or Minor issues
requiring changes. The review independently checked all 150 baseline hashes,
preservation of the original packs/metadata, the appended pack against its
separate export, every retained action/EDGE array against raw certified SDK
replies, released production inventory against the approved build and common
M1 pins against the original twelve profiles. It also reviewed the lifecycle
tests, browser script/results and screenshots. No long solver/test/browser
rerun was requested from the reviewer; those executed checks are recorded above.

Review exclusions match this task's boundaries: clean INITIAL S1 only,
unchanged arbitrary-world fallback, no auto events/M3/redesign, no global
optimality claim and the existing real-device/bundle follow-up. The review did
not assess Git commit equivalence because the active workspace had no Git metadata.

## Git publication preparation

The retained clean checkout `.publish/MLAI-SafeRouteVN` was subsequently found
at `f1a20faa561ecd7126cbab210460cb97356ee4c1`, matching the current `main` of
`HiimRaccoon/APEX-SafeRouteVN`. All 126 baseline frontend/Member 1 fixture files
present in that checkout match the pre-S1 workspace after normalizing CRLF/LF;
there are no content differences. The missing 24 baseline runtime/helper files
belong to the local offline environment and were not part of the published repo.

Publication includes only the S1 source changes, tests, documentation and compact
evidence/screenshots. The source audit is copied unchanged into frontend evidence
so it is available on GitHub. Raw SDK jobs, authority store, Python/runtime and
SQLite snapshots remain in the local output/runtime directories. Fresh pre-push
verification again passed all 138 tests, typecheck, lint and build; the existing
large-chunk warning remains.
