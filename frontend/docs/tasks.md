# Member 4 frontend task tracker

**Cập nhật:** 2026-10-06. Tài liệu này là nguồn theo dõi tiến độ Phase 1, Phase 1.5 và Phase 2.

## Cách đánh dấu

- `[x] DONE`: file/artifact đã có và kiểm tra được theo acceptance của task.
- `[ ] TODO`: chưa triển khai hoặc chưa xác minh; không tick chỉ vì đã có kế hoạch.
- `[ ] BLOCKED`: chưa thể bắt đầu vì phụ thuộc được ghi ngay sau task.
- Khi hoàn thành task: chạy check ghi trong [implementation plan](phase-1-implementation-plan.md), cập nhật ô tick và ghi chứng cứ ngắn tại phần Evidence. Phase chỉ DONE khi mọi task Phase đó được tick và Definition of Done trong [spec](phase-1-design-spec.md) được kiểm tra.

## Trạng thái theo phase

| Phase | Mục tiêu | Trạng thái hiện tại | Điều kiện chuyển bước |
| --- | --- | --- | --- |
| 0 — Discovery/design | Hiểu source, fixture, visual references; khóa spec/plan/tasks | DONE | Các tài liệu bên dưới hiện diện và nhất quán |
| 1 — Mock frontend | React Admin + Driver, mock API/state, tests, responsive | IMPLEMENTED / VISUAL ACCEPTANCE PARTIAL | Headless Chrome đã kiểm tra 1280/1440 và 360/390/430 px; WebView/touch/focus trên thiết bị thật vẫn mở |
| 1.5 — Member 2 alignment | Public adapters + offline initial/manual-event road packs | BOUND EVENT ROADS IMPLEMENTED / GENERIC PHYSICAL API PENDING | Initial + năm manual event worlds dùng M2; S0 rain/arbitrary execution chưa có road pack; WebView review còn mở |
| 2 — Member 3 integration | BackendDispatchApi, server lifecycle, production cutover | BLOCKED ON MEMBER 3 | Chờ API, auth, realtime/error contract và payload hoàn chỉnh từ Member 3 |

## Phase 0 — đã làm

- [x] D0-01: Inspect repository, `frontend/` placeholders, S0/S2/S3/S4 và manifest Member 1.
- [x] D0-02: Inspect `UIAdmin.png` và `UIDriver.jpg`; khóa hierarchy Admin/Driver với user.
- [x] D0-03: Khóa architecture, state boundaries, mock API contract và test plan (gồm 6 bổ sung cuối).
- [x] D0-04: Viết [design spec](phase-1-design-spec.md) và [implementation plan](phase-1-implementation-plan.md).
- [x] D0-05: Tạo task tracker có checkbox, phase và dependency chờ bàn giao.

**Phase 0 evidence (2026-09-29):** Đã đọc S0/S2/S3/S4, xác nhận S0 3 orders/2 vehicles và S4 có GeoJSON Polygon; ba tài liệu và link nội bộ tồn tại. Đây là kiểm tra tài liệu/fixture, chưa phải kết quả test ứng dụng.

## Phase 1 — code hoàn tất, chờ visual acceptance

- [x] **P1-01 — Foundation:** Vite + React + TypeScript, `/admin` và `/driver`, design tokens, app route tests.
- [x] **P1-02 — Member 1 fixture adapter:** pinned S0/S2/S3/S4, temporary types, event catalog, presentation demo data, fixture contract tests.
- [x] **P1-03 — World engine:** DecisionState/session/version, direct load semantics, one-event rule, deterministic clock, S4 expiry.
- [x] **P1-04 — Decision packs:** Prepared FASTEST/BALANCED/SAFER, geometry và KPI demo, deterministic optimize, proposal validity.
- [x] **P1-05 — Plan/execution lifecycle:** Select/Accept, immutable plan content/history, assessment, grouped depot pickup, Delivered, physical truth.
- [x] **P1-06 — API/persistence:** `DispatchApi`, MockDispatchApi, localStorage hydrate/recovery, same-tab/cross-tab subscriptions, no write loop.
- [x] **P1-07 — Shared Map:** OSM tile + fallback, depot/order/vehicle markers, exact input LineString layers, rain polygon và legend.
- [x] **P1-08 — Admin UI:** Ba cột theo reference, KPI, controls, alternatives, Before/After, Accept, vehicle status, provenance, loading/error.
- [x] **P1-09 — Driver UI:** Mobile reference hierarchy, accepted route only, Current Stop Card, multi-pickup, order list, warnings, update banner, bottom nav.
- [ ] **P1-10 — Verification/handoff:** Unit/UI tests, typecheck, lint, build, responsive 360/390/430 px, demo script và README. Headless browser đã xác nhận viewport; WebView/touch/focus trên thiết bị thật còn mở.
- [x] **P1-11 — Logic review fixes:** Capacity lấy từ S0 (V1/V2 15 kg, vẫn hỗ trợ capacity khác nhau theo vehicle), event status theo snapshot, English error mapping, fuel/risk theo PlanMetrics, completed Driver segments, keyboard order action, accessible priority control, no fake notification/live label, Driver demo clock, persisted metric validation.
- [ ] **P1-12 — Visual acceptance:** Headless Chrome đã kiểm tra Admin 1280/1440 px, Driver 360/390/430 px, overflow và OSM tile fallback; WebView/touch/focus trên thiết bị thật chưa xác nhận.

**Phase 1 evidence:**

- 2026-09-29 P1-01: `npm.cmd run test:run -- src/app/App.test.tsx` → 3/3 pass; `npm.cmd run typecheck` → exit 0; `npm.cmd run build` → exit 0.
- 2026-09-29 P1-02..P1-10: `npm.cmd run test:run` → 39/39 pass; `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build` → exit 0. README có hướng dẫn local và demo flow. Responsive CSS có breakpoints desktop, 760 px và driver mobile-first; cần visual acceptance trên thiết bị/WebView thật khi chuẩn bị demo hackathon.
- 2026-10-01 P1-11: Các behavior tests mới được chạy đỏ trước khi sửa, sau đó xanh. `npm.cmd run test:run` → 51/51 pass; `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build` → exit 0. Phase 1 UI tiếng Anh, presentation names/addresses giữ tiếng Việt và gắn nhãn demo.
- 2026-10-01 P1-12 (một phần): Headless Chrome chụp Admin 1440×900 và Driver 390×844; cả hai không có horizontal overflow. OSM tiles không tải trong môi trường kiểm tra, fallback vẫn hiện marker/cảnh báo. Chưa kiểm tra 1280/360/430 px hoặc WebView thật.
- 2026-10-05 P1-12 (bổ sung): [visual-check.mjs](evidence/visual-check.mjs) chụp Admin 1280/1440 px và Driver 360/390/430 px; tất cả `overflowPx=0`, có Leaflet route/markers. Admin 1280 breakpoint chồng panel đã sửa. Ép tile OSM lỗi vẫn hiện cảnh báo, 3 route paths và 6 markers. Ảnh ở `evidence/`; chưa thay thế kiểm tra WebView/touch/focus thật.

## Phase 1.5 — Member 2 contract alignment

- [x] **P1.5-01 — M2 contract intake:** Đã đọc Step 7 docs, DecisionResult, schema, reference consumer, S2/S3/S4 views; ghi rõ `common.py` chưa có trong handoff local.
- [x] **P1.5-02 — Public types/adapters:** `integrations/member2` validate DecisionResult, exact profile order, WGS84 geometry; opaque metrics và unit metadata được giữ nguyên.
- [x] **P1.5-03 — execution-view/2 tests:** S2/S3/S4 parse, simulated replay, metric scopes riêng và nullable, custody, vehicles, EDGE-only geometry, unsafe integer.
- [x] **P1.5-04 — Profile alignment:** DecisionResult dùng cho đề xuất; execution view cho operational state; mock cards vẫn độc lập, không import samples vào app.
- [x] **P1.5-05 — Leaflet geometry migration:** OSM tile, fitBounds, marker, accepted/proposed lines, completed dimming, S4 polygon, fallback; Admin/Driver card shell giữ nguyên.
- [x] **P1.5-06 — S3 custody:** Mọi profile giữ ONBOARD O001 ở V1; xe unavailable có unserved diagnostic, không tạo route mới từ stop coordinates.
- [x] **P1.5-07 — +07 DemoClock:** Optimize/Accept/Pickup/Delivered/event giữ giờ demo Việt Nam deterministic.
- [x] **P1.5-08 — Driver demo selector:** Settings dev-only chọn V1/V2, đổi view context, không mutate DecisionState.
- [x] **P1.5-09 — Simulation/proxy wording:** Demo/simulated labels, relative exposure proxy; không claim GPS/live observation.
- [x] **P1.5-10 — Regression/docs:** 71/71 tests, typecheck/lint/build, M2 portable/golden/reference checks, headless browser viewports và tile failure; docs cập nhật. WebView/touch/focus thật vẫn thuộc P1-12.
- [x] **P1.5-11 — Geometry integrity/schematic labels:** Adapter giữ mọi điểm và thứ tự EDGE S2/S3/S4; proposal lấy `route_geometry` nguyên vẹn; accepted/proposed render độc lập; thiếu geometry thì reject. Admin/Driver mock hiện nhãn “Schematic demo routes — do not follow roads”; giữ card/design hiện tại.
- [x] **P1.5-12 — Initial-world road packs:** Tải cached context M1 + Runtime/Integration ZIP M2, isolated Python/locked dependencies; source/build audit; compute 12 profiles S0/S2/S3/S4 INITIAL. Wire certified matching pack qua mock engine, giữ full EDGE/actions, source-aware KPI và thiết kế UI. Xem [offline plan](offline-member2-route-plan.md).
- [ ] **BLOCKED P1.5-13 — Generic native event/current-world roads:** Cần replay khớp hoặc physical/event contract Member 3. P1.5-18 đã có năm manual event worlds bind riêng; arbitrary Pickup/Delivered/motion worlds chưa có pack, fallback schematic có nhãn. Không claim native SDK session hoặc live solve.
- [x] **P1.5-14 — Coincident vehicle markers:** S0 có DEPOT/V1/V2 cùng tọa độ; badge V2 trước đây che V1. Leaflet renderer tách nhãn cùng điểm theo pixel, giữ nguyên lat/lng và geometry. TDD test đỏ trước sửa, xanh sau sửa; 8/8 map tests và build pass. Browser xác nhận V1/V2 không overlap, giữ style badge ([evidence](evidence/vehicle-marker-results.json), [screenshot](evidence/admin-vehicle-markers.png)).
- [x] **P1.5-15 — Zoom rendering performance:** Mỗi EDGE từng tạo một SVG path; S2 accepted + proposal có 2.561 paths. Renderer gom theo xe/lifecycle/completion style, giữ EDGE dưới dạng independent nested polylines và mọi điểm gốc. TDD đỏ → xanh; CPU 4×, tile bị chặn: S2 p95 frame gap 50 ms → 16.8 ms, paths 2.561 → 4, long tasks 8 → 0. [Before](evidence/map-zoom-before.json), [after](evidence/map-zoom-after.json), [measurement script](evidence/map-zoom-check.mjs). Evidence SVG counts trước task này là mốc lịch sử; EDGE count trong state không đổi.
- [x] **P1.5-16 — Admin route visibility/per-leg colors:** Mặc định OFF kể cả hydrated accepted plan; marker/depot/order/rain giữ nguyên. Công tắc V1/V2 độc lập, chỉ React view state, không ghi snapshot/localStorage; Optimize/Select/Accept không tự bật, refresh/new session về OFF. Chỉ preview proposal hợp lệ hoặc active accepted; màu theo chặng stop-to-stop (V1 blue/cyan, V2 green/teal), giữ geometry gốc, ẩn completed Admin travel, chú giải số chặng/order và return forecast. Driver không đổi. [Spec](admin-map-ux-spec.md), [plan](admin-map-ux-plan.md).

**P1.5-16 evidence (2026-10-05, trước refinement P1.5-17):** TDD adapter/renderer/UI đỏ → xanh; browser layout đỏ vì switch/legend bị che, sau sửa xanh. Full suite **114/114 pass**; typecheck/lint/build exit 0. Review độc lập không có material finding. Browser UX checks kiểm tra mọi tổ hợp OFF/V1/V2/both ở 1280/1440, công tắc luôn hiện, chú giải cuộn riêng, `overflowPx=0`, localStorage không đổi. Default S0 có 0 route paths/6 markers; bật cả hai có 5 leg groups/6 markers. S0/S2/S3/S4 initial Admin/Driver pass; tile fallback vẫn giữ routes/markers; Driver 360/390/430 không overflow. CPU 4× S0/S2: p95 16.8 ms, 0 long tasks ([zoom](evidence/map-zoom-results.json)); S2 chỉ hiện selected source với 10 leg groups. Các count ở evidence cũ là mốc lịch sử; không đổi EDGE geometry/actions trong plan. Bundle warning và manual WebView gate vẫn mở.

- [x] **P1.5-17 — Admin bỏ return forecast/đổi màu V2:** Ẩn return-to-depot trên accepted/proposed map và legend; V2 leg 2 xanh lá đậm `#14532d`, leg 1 giữ `#16a34a`. Chỉ lọc display, không sửa plan/geometry/KPI hoặc Driver. TDD return-filter và màu chạy đỏ → xanh; full suite **114/114 pass**, build exit 0. [Browser UX](evidence/admin-map-ux-results.json) xác nhận màu, không có return label, không ghi storage; [viewport/fallback](evidence/visual-results.json) pass. S0 bật cả hai có **3 leg groups/6 markers**; S2/S3/S4 có 8 Admin groups, Driver giữ nguyên. Evidence P1.5-16 phía trên là lịch sử trước refinement.

- [x] **P1.5-18 — Local event road compute + capacity partition:** Bỏ block Plan Accepted/dispatched/provenance bên phải, giữ hành động Accept/design. Local wrapper tạo bounded subsets WAITING (có nhóm không trùng đơn), M2 realizer/CP-SAT và raw validator quyết định assignment/actions/geometry. Capacity giữ 15 kg; DELIVERED frozen, ONBOARD owner giữ nguyên, pickup-first dùng residual; delivery rồi reload được dùng capacity đã giải phóng. Năm exact worlds ×3 profiles, static forecast time ở map subtitle; không tự dispatch, không transplant native replay. [Plan](local-event-road-plan.md).
- [ ] **BLOCKED P1.5-19 — S0 rain road compute:** M2 rain model pin root S4; cần extension hỗ trợ root S0 ba đơn. Hiện S0 rain fallback schematic có nhãn; không dùng geometry/world tám đơn S4 thay thế.
- [x] **P1.5-20 — Urgent ON/OFF + Driver route colors:** Fresh/Reset S0 có ba đơn, Urgent OFF; refresh giữ phiên đã lưu. ON thêm đúng fixture urgent, OFF chỉ hủy đơn WAITING; khóa sau pickup/delivery. Giữ accepted history/execution/custody, advance clock/version, invalidate proposals và stale assessment; giữ round event ID khi OFF để không trộn event. Driver dùng chung palette/leg description với Admin, accepted-only, dim completed 0.35, giữ màu remaining, ẩn return forecast và thêm legend gọn; geometry/actions/KPI không đổi.

**P1.5-20 evidence (2026-10-06):** TDD Driver palette/full polyline đỏ → xanh; engine cancellation/physical truth/round lock và API/UI toggle đỏ → xanh. Full frontend **134/134 tests pass**, typecheck/lint/build exit 0. [Browser ON/OFF + Driver](evidence/urgent-driver-results.json) xác nhận 3→4→3→4→3 orders, history/active plan không tự thay, cross-tab stale không tạo route-update banner, hydrate OFF; V2 green/dark green giữ màu sau delivery, completed opacity 0.35. Driver 360/390/430 có `overflowPx=0`; [ảnh 390 px](evidence/driver-v2-legs-390.png). [Initial road regression](evidence/offline-route-results.json) pass S0/S2/S3/S4, không schematic; S0 rain fallback còn đúng nhãn. Không sửa released M2 runtime hoặc regenerate geometry. Bundle warning và WebView thật vẫn mở.

**P1.5-18 evidence (2026-10-06):** Local compute: S0 urgent **4/4 FEASIBLE**, S0 unavailable **3/3 FEASIBLE**, direct S2 urgent **8/9 PARTIAL** (O007 unserved), S3 unavailable **5/8 PARTIAL** (O001 CUSTODY_BLOCKED ở V1; O002/O005 unserved), S4 rain **8/8 FEASIBLE**; cả ba profiles đều có raw validation. Export audit đối chiếu **13.504 EDGE** với retained worker output; [coverage/source directories](evidence/local-event-export-audit.json). Local candidate policy là extension ngoài released closure; manual packs **không phải** SDK-session-certified replay. Partial không là proof infeasible hoặc global optimum; giới hạn một future pickup batch/xe trong candidate policy này.

Capacity regressions gồm bốn case user yêu cầu và thêm pool-complement case. Released builder fail ba capacity regressions; local domain + M2 realizer/CP-SAT xanh. Full frontend **122/122**, Python tools **14/14**, typecheck/lint/build exit 0. [Event browser checks](evidence/local-event-road-results.json) xác nhận năm flows, Optimize không dispatch, Driver đổi route chỉ sau Accept, không schematic/overflow; [viewports/fallback](evidence/visual-results.json) pass. Independent review đã sửa source forecast label và unsupported-only summary với test RED → GREEN. JS bundle **6,77 MB / 1,63 MB gzip** còn warning; WebView/touch/focus thật vẫn mở. Generic execution/M3 vẫn thuộc P1.5-13/Phase 2.

**P1.5-15 regression evidence:** Full suite 99/99 pass; build/typecheck exit 0. Browser S0/S2/S3/S4 Admin/Driver và năm viewport pass; tile fallback giữ đủ geometry trong 2 SVG route groups / 6 markers. Style completion và accepted/proposed vẫn riêng; test kiểm tra cả polylines rời nhau để tránh tạo đường nối giả. CPU slowdown là phép đo headless có kiểm soát, không thay thế kiểm tra độ mượt trên thiết bị/WebView thật.

**Phase 1.5 evidence (2026-10-05):** `npm.cmd run test:run` → 71/71 pass; `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build` → exit 0. M2 `consumer_test.mjs` → 13 pass, `consumer_golden.mjs shared/examples` → 60 pass, `runtime_m4_flow.mjs` → S2/S3/S4 pass. [Design spec](phase-1.5-design-spec.md), [implementation plan](phase-1.5-implementation-plan.md), [viewport screenshots](evidence/) và browser script có sẵn.

**P1.5-11 evidence (2026-10-05):** TDD: schematic-note tests và missing proposal projection chạy đỏ trước implementation, sau đó xanh. Full suite → **77/77 pass**; typecheck/lint/build → exit 0 (build còn cảnh báo bundle >500 kB). Headless Admin 1280/1440 và Driver 360/390/430 đều có schematic notice, `overflowPx=0`; tile failure vẫn giữ 3 route paths/6 markers. Đã xem ảnh Admin 1440 và Driver 360 để kiểm tra vị trí nhãn. Chưa đổi mock UI sang road geometry M2; P1.5-12 không tick.

**P1.5-12 evidence (2026-10-05, sau intake offline):** Evidence P1.5-11 ở trên là mốc lịch sử trước khi có road packs. Đã tải hai DB M1 đúng hash, Runtime/Integration ZIP và metadata cần thiết; isolated Python 3.12/dependency lock, production inventory/build SHA pass, CP-SAT smoke OPTIMAL; source audit chín scenarios pass. Public SDK compute **12/12 certified FEASIBLE** profiles INITIAL; output/raw validation ở `m2_runtime/outputs/routes-20261005`. Đối chiếu **13.232 EDGE** giữ nguyên geometry và action order. S0 ×3 có kết quả giống nhau, không thêm khác biệt giả.

TDD lifecycle/geometry/metric/fallback tests chạy đỏ trước sửa và xanh sau sửa; full suite **97/97 pass**, typecheck/lint/build exit 0. Browser check cả bốn initial scenarios, persisted hydrate và event fallback pass ([results](evidence/offline-route-results.json)); Admin 1280/1440, Driver 360/390/430 có map và `overflowPx=0` ([visual results](evidence/visual-results.json)). Forced tile failure giữ 564 routes/6 markers; bug React ghi đè class Leaflet đã được sửa/test. UI giữ phong cách cũ; KPI dùng Fleet travel/Route cost/exposure proxy, missing on-time/ETA là dash, không trừ metrics khác scope. Build còn cảnh báo JS bundle khoảng 3.55 MB (875 kB gzip); WebView thật và P1.5-13 vẫn mở. [Runtime commands/provenance](../../m2_runtime/README.md).

- [x] **P1.5-21 — S1 initial road support (2026-10-06):** Import nguyên bản Member 1 S1, thêm vào type/catalog/selector có sẵn; Load tạo phiên sạch, 8 đơn, V1/V2 15 kg, không event/auto Optimize. Public SDK với released build và pinned snapshot tính độc lập ba certified FEASIBLE profiles: FASTEST 1.270 EDGE, BALANCED/SAFER 1.289 EDGE; phục vụ 8/8. Append pack, giữ nguyên bốn pack cũ và mọi EDGE coordinate. 138 tests pass; typecheck/lint/build exit 0. Browser cả ba profiles, V1/V2, Driver accepted-only, S0/S2/S3/S4 initial và năm event flows pass. [Báo cáo 20 mục](s1-support-verification.md), [browser](evidence/s1-road-results.json), [baseline integrity](evidence/s1-baseline-integrity.json). Bundle warning còn; không sửa engine/Driver/layout/event/M2 runtime.

## Phase 2 — chờ Member 3 backend

- [ ] **BLOCKED P2-01 — Freeze Member 3 API contract:** Chờ endpoint/request/response thật, auth/role, job lifecycle, events, accept, execution, diagnostics, realtime và presentation fields.
- [ ] **BLOCKED P2-02 — BackendDispatchApi:** Implement HTTP adapter sau P2-01, không đổi component contract.
- [ ] **BLOCKED P2-03 — Admin alternatives:** Map DecisionResult ×3/job result vào proposals và KPI khi payload M3 đầy đủ; không suy diễn opaque `AlternativeMetrics`.
- [ ] **BLOCKED P2-04 — Operational state:** Compose `task02-m2-execution-view/2` với state/history/presentation M3 cho Admin/Driver.
- [ ] **BLOCKED P2-05 — Async compute:** QUEUED → RUNNING → COMPLETED/FAILED, loading/retry/error.
- [ ] **BLOCKED P2-06 — Accept flow:** Chỉ Accept đổi active accepted trajectory và cập nhật Driver.
- [ ] **BLOCKED P2-07 — Event/advance/replan:** API event và clock lifecycle, one-world consistency.
- [ ] **BLOCKED P2-08 — Backend errors:** Map diagnostics thành UX thông báo hữu ích.
- [ ] **BLOCKED P2-09 — Server updates:** Xác nhận transport subscription/cross-tab; không suy diễn polling.
- [ ] **BLOCKED P2-10 — Integration tests:** Admin/Driver lifecycle với server contract thật.
- [ ] **BLOCKED P2-11 — Production cutover:** Dùng BackendDispatchApi ở production; giữ MockDispatchApi cho offline demo/tests.

**Phase 2 evidence:** Member 2 Step 7 handoff đã có trong `optimization/`, `shared/examples/` và `docs/`. Chưa có Member 3 backend/API contract trong checkout; không invent endpoints.

## Ranh giới và ghi chú kiểm chứng

- Member 1 suite `thu-duc-binh-thanh-v1` có S0/S1/S2/S3/S4 và `S4.events[0].polygon` thực. S0 có 3 orders/2 vehicles; S1 có 8 orders/2 vehicles và events rỗng; đó là pinned fixture contract, không là giả định số lượng toàn hệ thống.
- Manifest scenario ghi `integrated=false`; cached context cần thiết đã tải cho offline runtime (routing/network.sqlite, features/features.sqlite và metadata). Frontend vẫn chỉ consume JSON, không mở SQLite.
- Phase 1 prepared geometry/KPI là baseline lịch sử. Phase 1.5 dùng certified SDK initial packs hoặc raw-validated local manual-event packs khi toàn bộ world match; không match thì schematic có nhãn. Phase 2 vẫn chờ transport/physical lifecycle M3; không suy diễn official endpoints.
