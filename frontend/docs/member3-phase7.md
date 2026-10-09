# Member 3 integration — Phase 7

P7-01, P7-02 and P7-03 are DONE for the frontend technical integration scope.
The [fresh whole-change review](evidence/member3-integration/phase7-review.md)
passed with Critical 0, Important 0 and Minor 0. The implementation/review
candidate is `176884e3400d86827c73bb9afec86f3774cb69c0` from base
`a8b20afb67a90bb346901d548cb9ff35dfbad116`; final evidence/status recording is
a subsequent documentation commit.

## Pre-cleanup gate

[Native receipt](evidence/member3-integration/phase7-pre-cleanup-native.json)
contains real S0–S4 sessions, comparisons, all three public forecasts per
comparison, nine-field bases, Select/Accept, event/replay transitions and
Admin/Driver convergence. All five cases, 25 responsive layouts and ten native
failure branches passed. OSM requests were actually aborted. The full pre-cleanup
suite passed 347 tests in 44 files; typecheck and build exited 0.
[Verification](evidence/member3-integration/phase7-pre-cleanup-verification.json)
records the exact native receipt hash and pre-cleanup build inventory.

The gate reused the verified r2 SDK/environment/source-bound G0 receipt with an
isolated test authority and metadata, API 8005 and dev frontend 5175. The original
installation, authority, credentials and metadata were preserved. The
[historical interrupted run](evidence/member3-integration/phase7-historical-installation-interrupted.json)
is diagnostic evidence and does not authorize cleanup. No reinstallation,
re-seal, store repair or SDK deadline change is claimed.

Native PARTIAL outcomes are allowed. S3 supplies no V1 EDGE after the event;
Driver stays route-free. S4's post-event witness supplies only return EDGE;
the existing Admin return filter hides it while Driver retains V1 geometry.
Assertions derive route expectations from the actual public trajectory and
SERVICE ordering, rather than demanding invented routes. Interrupted layout/
preview assertions continued only after exact world equality; committed commands
and comparisons were not resubmitted. Receipt continuation hashes and scopes
record this recovery. The failure runner's CORS-response filter and reporting
status bugs were fixed with RED/GREEN guards; all ten fault witnesses were
validated before cleanup authorization.

## Cutover

The default factory now initializes backend mode asynchronously. Explicit mock
mode and injected APIs remain available. The cached initialization promise and
effect epoch prevent subscriptions/reads after unmount and duplicate StrictMode
initialization. Common error/presentation modules remove production imports of
mock producers and demo identity catalogs. Missing server contact/driver metadata
uses IDs or `Unavailable`; unavailable telephone links have no `tel:` target.

The backend build substitutes an actionable unavailable mock entry. Development
and `build:mock` use the separate dynamic mock entry. The production audit checks
the actual static/dynamic module graph, chunk membership, complete emitted file
inventory and file hashes. Bundler-generated runtime modules are explicitly
recorded from actual chunk membership. [Build audit](evidence/member3-integration/phase7-backend-build-audit.json)
passed: 1,932 modules, two chunks and four assets totaling 650,818 bytes; the
main JS chunk is about 574 KB versus the pre-cleanup 7,730 KB. The existing
500 KB Vite warning remains a size warning, not a claim of an optimized bundle.

Four heavy pack/adapter files were removed only after the strict native gate.
Lightweight fixtures, decision packs, MockStateEngine and MockDispatchApi remain.
Asset-specific tests were retired; tiny test-only supplied geometry preserves
incoming EDGE aggregation, return separation, colors and immutable plan coverage.
Capacity/custody, event, cancellation and progress assertions remain covered.
Tiny fixtures and fake HTTP are unit/component evidence and do not establish
native certification.

[Cutover verification](evidence/member3-integration/phase7-cutover-verification.json)
records 342 tests/46 files, nine audit tests, typecheck and both builds passing.
[Built mock smoke](evidence/member3-integration/phase7-mock-smoke.json) passed
Optimize/Select/Accept/reload/pickup/delivery with zero API requests. Its
`native:false` scope is explicitly offline demo behavior.

## Final gate and limits

[Fresh post-cleanup native receipt](evidence/member3-integration/phase7-post-cleanup-native.json)
passed all five S0–S4 cases, 25 layouts and ten native failure branches on API
8006 and the built frontend preview 5176. This run started with a separate
test authority and used normal foreground Admin polling during compute. It
loaded the exact audited build entry chunk; the served build-graph hash matches
`6f76d82561cc80b43bc73bf715cf421205246d68090fcd1ce6280b59d3504a90`.
Actual browser asset requests contain no mock entry, fixture, engine or road pack.

[Final verification](evidence/member3-integration/phase7-final-verification.json)
binds both native receipt hashes to the build audit and records 342 tests in 46
files, typecheck/build exit 0 and nine audit tests. The
[final secret scan](evidence/member3-integration/phase7-final-secret-scan.json)
checks both known runtime bearers against all tracked and non-ignored candidate
files, evidence and actual backend/mock build outputs. No credential was found.
The fresh whole-change review passed standards and spec checks. It independently
reran all 342 tests, all nine audit tests, the actual build audit and strict native
receipt/SHA checks. No code fixes or new minors were found. All review exclusions
and executor rulings are recorded in the review receipt.

Startup, private auth/session configuration and explicit mock commands are in
the [frontend README](../README.md). The frontend checkout is not the complete
native installation. Tokens belong in an injected provider or per-tab
`saferoute.member3.bearer` sessionStorage; never Vite variables or committed files.
The environment example contains only the mode and API base URL.

Verification is local/native; no GitHub CI run is claimed. Manual touch/WebView
checks remain pending. Separate Phase 3 publication/deployment sign-off remains
pending and is not inferred from technical Phase 7 tests. All execution remains
SIMULATED_REPLAY, with no GPS, real delivery, calibrated exposure, native SLA
or optimality claim. The previously deferred Phase 5 history-cap minor remains
outside this change.
