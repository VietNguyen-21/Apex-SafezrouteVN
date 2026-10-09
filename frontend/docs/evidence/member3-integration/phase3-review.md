# Independent Phase 3 review

Reviewed range: `42ab9c3..4ce2c17`; fresh read-only reviewer `gpt-6-astra`, high effort. Initial verdict: merge with fixes; 0 Critical, 6 Important, 0 Minor.

1. Route actions are relative microsecond offsets, not Unix time. Comparing them with ISO observation timestamps falsely completed future edges.
2. Reoptimized routes may omit orders delivered before activation; requiring all delivered-prefix orders in current route sequences rejected valid worlds.
3. Partial EDGE geometry is the full directed source line; drawing it without honoring fractions fabricated the full remaining edge.
4. Optional temporal metadata, WAIT fields and route values lacked portable fail-closed validation.
5. Native Driver showed accepted geometry with an empty-state message denying assignment; legacy stop-based filtering hid native delivery markers.
6. Native KPI rows overflowed the evidenced 1440px cards; textContent assertions missed clipping.

Regrade: all six retained as Important by user-visible effect. Fix pass uses regression tests run RED then GREEN and fresh full publication checks; no second reviewer.

Declined to judge: public pre-Accept forecast/rain contracts are explicitly pending; later Select/Accept/event/replay/complete Driver operations and Phase 7 default/import/pack/cross-tab gates are not claimed by this release. The truthful native Driver status finding is included despite the later operational gate.

Fixes: native completion is unavailable without public epoch/progress; reoptimized trajectories require planned suffix coverage while allowing earlier deliveries absent; Leaflet consumes a separately clipped directed fraction with full source coordinates retained; optional portable fields and identifier/profile types fail closed; native Driver status and validated route/onboard order markers are supplied; native card rows wrap under a scoped CSS override preserving mock behavior. Regression unit/UI cases and native viewport bounds were observed RED before fixes. Final counts and publication/native results are in `phase3-verification.json`.

User-supplied follow-up review of `42ab9c3..2fdebc0` found one further Important issue (Admin legacy accepted-status/coverage mismatch) and one Minor issue (visibility-dependent native leg ordinals). Both were verified against source and reproduced RED before fixes. They are addressed with native acceptedExecution/public coverage and source ordinals before filtering. The follow-up receipt records fresh local checks; no new native accepted/replay acceptance or independent CI run is claimed. P3-01 remains blocked, P3-02 overall and P3-03 full native scope gate remain partial, and Phase 3 remains NOT DONE.

User-supplied follow-up review including `7ce9839` found one Important presentation issue: native Admin did not hide returns and native route legs did not use the existing per-leg V1/V2 palette. Verified against P3-02 spec/tasks and reproduced RED. Shared presentation now applies source ordinal colours before visibility filters; Admin excludes return segments/legends, Driver retains them. Geometry/source/KPI stay intact, with unit/component regression coverage and fresh local results in `phase3-presentation-verification.json`. A Minor documentation issue was also addressed by updating the Phase 3 summary table to PARTIAL. No new native or CI gate is claimed.
