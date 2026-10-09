# Member 4 Phase 1 Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking. Update [tasks.md](tasks.md) after each verified task.

**Goal:** Xây Admin Decision Workspace và Driver Operational Web theo visual references, chạy bằng mock data Member 1 và đúng lifecycle Optimize → Select → Accept → Execute.

**Architecture:** Một React/Vite SPA với `/admin` và `/driver`. Cả hai dùng `DispatchApi`; Phase 1 adapter gọi Mock State Engine giữ DecisionState, plan records và execution progress tách biệt, đồng bộ qua `localStorage` + subscriptions. Route và KPI là prepared mock decision data.

**Tech Stack:** React, TypeScript, Vite, Leaflet/React-Leaflet, Vitest, React Testing Library, CSS.

**Spec:** [phase-1-design-spec.md](phase-1-design-spec.md)

## Global Constraints

- Chỉ sửa `frontend/`; Member 1 fixture và các ownership area khác là read-only.
- Suite pinned là `thu-duc-binh-thanh-v1`; S0/S2/S3/S4 là fixture inputs, không là schema Member 2/3 chính thức.
- UI tiếng Anh; tên riêng/địa chỉ trong presentation demo catalog có thể giữ tiếng Việt. Admin desktop-first, Driver mobile-first tại 360/390/430 px.
- `DecisionState` là nguồn physical truth; accepted plan content bất biến; execution progress tách riêng.
- Proposal hợp lệ khi cả `generatedForSessionId` và `generatedForStateVersion` khớp current DecisionState.
- Component không tính route, risk, assignment, không gọi `localStorage` hoặc `fetch` trực tiếp.
- `Mock State Engine` là nơi duy nhất advance clock, expire event và ghi storage; một event mỗi demo round.
- Phase 2 cần contract Member 2/3; không dựng API backend giả hoặc auth giả.
- Checkout hiện tại không có `.git`, nên bước commit chỉ thực hiện khi repo được đưa vào Git; trạng thái task vẫn được cập nhật trong `tasks.md`.

## Review Focus

1. S0 + S2 event có 4 orders, direct S2 + event có 9: T04 test pack selection theo đúng order IDs thay vì chỉ event type.
2. Direct S3 có O001 ONBOARD trên V1 trước event: T03/T05 test owner/load và S3 event không chuyển hàng.
3. Clock có thể vượt S4 `endTime` trong bất kỳ mutation: T03 test expiry chạy sau mọi advance, không chỉ explicit clock action.
4. Tab khác có thể Accept sau khi tab hiện tại tạo proposal: T06 test đọc persisted snapshot mới nhất và reject `STALE_PROPOSAL`.
5. localStorage corrupt/old schema hoặc storage event lặp: T06 test clean fallback và hydrate không write-back.

## File map dự kiến

| Nhóm | File chính | Trách nhiệm |
| --- | --- | --- |
| App | `src/main.tsx`, `src/app/App.tsx`, `src/app/useDispatchSnapshot.ts` | Entry, route `/admin`/`/driver`, subscription |
| Contracts | `src/shared/types/{scenario,dispatch,geometry}.ts` | Temporary frontend-local types, TODO align Member 2/3 |
| Fixture | `src/mocks/scenarios/{S0,S2,S3,S4}.json`, `src/mocks/fixtureCatalog.ts`, `src/mocks/presentation.ts` | Bản sao pinned fixture + checksum/source, event catalog, presentation labels |
| Engine | `src/mocks/engine/{MockStateEngine,transitions,clock,errors}.ts` | Single writer, versioning, event/plan/execution invariants |
| Decisions | `src/mocks/decisions/{packs,selectPack}.ts` | Prepared geometry/assignment/metrics; không solver |
| API | `src/services/api/{DispatchApi,MockDispatchApi,storage}.ts` | Promise interface, persistence, subscriptions |
| Map | `src/shared/components/DispatchMap.tsx` và CSS | Render geometry/markers/overlay, tile fallback |
| Admin | `src/admin/{AdminPage,components/*}.tsx` | Dashboard, comparison, cards, history, event controls |
| Driver | `src/driver/{DriverPage,components/*}.tsx` | Route, current stop, orders, bottom nav, notifications |
| Styles/test | `src/styles/*`, `src/**/*.test.ts(x)`, `vite.config.ts` | Visual system, unit/UI tests |

## Phase 1 tasks

### Task P1-01: App foundation và hai experience routes

**Files:** Tạo `frontend/package.json`, `index.html`, `vite.config.ts`, `tsconfig.json`, `src/main.tsx`, `src/app/App.tsx`, `src/styles/tokens.css`, `src/app/App.test.tsx`; cập nhật `frontend/README.md`.

**Interfaces:** `App(): ReactElement`; `/admin` và `/driver` là routes riêng. Route khác điều hướng về `/admin`.

- [ ] **Step 1:** Tạo tối thiểu `package.json`, test harness và `vite.config.ts` để chạy Vitest; viết `App.test.tsx`: `/admin` hiển thị heading Admin, `/driver` hiển thị heading Driver, route khác về Admin.
- [ ] **Step 2:** Chạy `npm run test -- --run src/app/App.test.tsx`; xác nhận test fail vì app/routes chưa được implement.
- [ ] **Step 3:** Tạo React/TypeScript foundation, router, hai page shell và CSS tokens theo reference (xanh/xám nhạt, card trắng, primary xanh dương, success xanh lá).
- [ ] **Step 4:** Chạy test trên, `npm run typecheck`, `npm run build`; chỉ tick task khi đều pass.
- [ ] **Step 5:** Cập nhật P1-01 trong `tasks.md`; commit nếu workspace có Git.

### Task P1-02: Pinned fixture loader, temporary types và demo presentation catalog

**Files:** Tạo `src/shared/types/scenario.ts`, `src/mocks/scenarios/{S0,S2,S3,S4}.json`, `src/mocks/fixtureCatalog.ts`, `src/mocks/presentation.ts`, `src/mocks/fixtureCatalog.test.ts`.

**Interfaces:** `loadPinnedScenario(id: ScenarioId): ScenarioFixture`; `listPinnedScenarios(): ScenarioSummary[]`; `listFixtureEvents(): DemoEventSummary[]`; `getPresentationLabel(kind, id): string | null`.

- [ ] **Step 1:** Viết fixture contract tests: S0 có 3 orders/2 vehicles; S2 `URGENT_ORDER` priority 3; S3 O001 ONBOARD V1; S4 có polygon thật, time window và `requiresFeatureRecompute`; checksum các bản sao khớp manifest.
- [ ] **Step 2:** Chạy test riêng, xác nhận fail.
- [ ] **Step 3:** Copy bốn JSON từ suite Member 1, thêm comment nguồn ở catalog, tạo parser/types chỉ dùng field artifact thật; event catalog tách payload khỏi UI. Ghi rõ TODO align official contracts.
- [ ] **Step 4:** Chạy test riêng, typecheck; kiểm tra các component sau này không import JSON trực tiếp.
- [ ] **Step 5:** Tick P1-02 sau khi pass; commit nếu có Git.

### Task P1-03: DecisionState, session/version, event và deterministic clock

**Files:** Tạo `src/shared/types/dispatch.ts`, `src/mocks/engine/{MockStateEngine,transitions,clock,errors}.ts`, `src/mocks/engine/world.test.ts`.

**Interfaces:** `createCleanSession(scenarioId: ScenarioId, sessionId: string): DispatchSnapshot`; `applyFixtureEvent(snapshot, eventId): DispatchSnapshot`; `advanceClock(snapshot, minutes): DispatchSnapshot`. `MockStateEngine` public operations sau cùng phải khớp `DispatchApi` ở Task P1-06.

- [ ] **Step 1:** Viết tests: direct load S2/S3/S4 chỉ initial state và event của chính fixture ở READY_TO_TRIGGER; S0 cho chọn S2/S3/S4; event trước Accept hợp lệ; S0 + S2 thêm O009; S3 V1 unavailable nhưng O001 owner không đổi; S4 polygon bật; event thứ hai reject.
- [ ] **Step 2:** Viết clock tests: một phút/action theo spec; S4 expiry tại `endTime`; version/proposal invalidation chỉ khi world đổi; expiry được kiểm tra sau mọi mutation làm clock tiến; Accept chạm expiry reject stale proposal và không commit draft; Optimize qua expiry bind proposals với version mới; event quá hạn reject.
- [ ] **Step 3:** Chạy tests, xác nhận fail; implement pure transitions và engine với một mutation boundary, typed errors.
- [ ] **Step 4:** Chạy tests, typecheck; kiểm tra no component timer và no wall-clock timestamp trong mock lifecycle.
- [ ] **Step 5:** Tick P1-03 sau khi pass; commit nếu có Git.

### Task P1-04: Prepared DecisionResult packs và proposal lifecycle

**Files:** Tạo `src/shared/types/geometry.ts`, `src/mocks/decisions/{packs,selectPack}.ts`, `src/mocks/decisions/decisions.test.ts`; mở rộng `MockStateEngine.ts`.

**Interfaces:** `selectPreparedPack(snapshot: DispatchSnapshot): PreparedDecisionPack`; `optimize(): DispatchSnapshot`; `selectAlternative(planId: string): DispatchSnapshot`. Proposal có `generatedForSessionId` và `generatedForStateVersion`.

- [ ] **Step 1:** Viết tests: FASTEST/BALANCED/SAFER khác meaningful ở assignment/sequence/geometry/KPI, cùng state cho kết quả deterministic; Optimize lần hai replace proposals, clear selection, version không đổi.
- [ ] **Step 2:** Viết tests cho S0 initial; S0 + từng event; direct S2/S3/S4 trước/sau event; ít nhất một scripted path sau execution progress; pack thiếu trả `MOCK_RESULT_UNAVAILABLE` mà không sửa state.
- [ ] **Step 3:** Chạy tests, xác nhận fail; biên soạn static plan/GeoJSON/metrics assets và pure selector theo scenario/event/milestone. Không gọi routing service hoặc nối stop coordinates.
- [ ] **Step 4:** Chạy tests, typecheck; manual inspect mỗi LineString và order reference thuộc world state tương ứng.
- [ ] **Step 5:** Tick P1-04 sau khi pass; commit nếu có Git.

### Task P1-05: Accept, assessment, current-stop execution và history

**Files:** Mở rộng `src/mocks/engine/MockStateEngine.ts`/`transitions.ts`; tạo `src/mocks/engine/planLifecycle.test.ts`, `execution.test.ts`.

**Interfaces:** `acceptSelectedPlan(): DispatchSnapshot`; `pickupOrder({vehicleId,orderId}): DispatchSnapshot`; `deliverOrder({vehicleId,orderId}): DispatchSnapshot`; `assessActivePlan(snapshot, reasons): OperationalPlanAssessment | null`.

- [ ] **Step 1:** Viết tests: Accept cần selection đúng session/version; sau Accept clear proposal/selection; active ID đổi; immutable old plan content giữ nguyên, wrapper `supersededAt` được cập nhật; re-accept cùng nội dung tạo accepted record ID mới, không trùng history.
- [ ] **Step 2:** Viết tests: grouped depot pickup từng order, advance stop đúng thứ tự, Delivered đúng owner/current stop; unavailable vehicle bị chặn, vehicle khác tiếp tục; world version tăng và proposal cũ invalid.
- [ ] **Step 3:** Viết tests: assessment refresh version sau Pickup/Delivered mà giữ stale reasons; re-accept sau progress giữ DELIVERED/ONBOARD/owner/load/timestamps và progress của plan cũ, tạo progress mới từ physical facts mà không copy completed segment ID cũ; S3 onboard recovery diagnostic không chuyển owner.
- [ ] **Step 4:** Chạy tests để xác nhận fail; implement minimal transitions; chạy lại tests và typecheck.
- [ ] **Step 5:** Tick P1-05 sau khi pass; commit nếu có Git.

### Task P1-06: MockDispatchApi, persistence và cross-tab subscriptions

**Files:** Tạo `src/services/api/{DispatchApi,MockDispatchApi,storage}.ts`, `src/app/useDispatchSnapshot.ts`, `src/services/api/MockDispatchApi.test.ts`.

**Interfaces:** `DispatchApi` giữ signatures của spec; `new MockDispatchApi(storage: StorageLike, notify?: StorageEventTarget)`; `subscribe(listener): unsubscribe`.

- [ ] **Step 1:** Viết tests: serialize → new engine hydrate giữ world, active/history, execution và clock; storage corrupt/old schema về clean S0; no write-back từ external storage event.
- [ ] **Step 2:** Viết tests: same-tab subscriber, cross-tab hydration, stale proposal bị reject khi persisted world đã đổi; route update chỉ khi active plan ID đổi; mock operations trả Promise snapshot và typed errors.
- [ ] **Step 3:** Chạy tests, xác nhận fail; implement adapter/persistence versioning, load latest before mutation và subscription hook.
- [ ] **Step 4:** Chạy tests, typecheck; không có `localStorage` usage ngoài API/storage layer.
- [ ] **Step 5:** Tick P1-06 sau khi pass; commit nếu có Git.

### Task P1-07: Shared map và geometry visibility

**Files:** Tạo `src/shared/components/DispatchMap.tsx`, `DispatchMap.css`, `DispatchMap.test.tsx`.

**Interfaces:** `DispatchMap({depot,orders,vehicles,acceptedSegments,proposedSegments,rainPolygon,selectedOrderId,selectedVehicleId,onSelectOrder,onSelectVehicle})` nhận geometry đã chuẩn bị.

- [ ] **Step 1:** Viết component tests với Leaflet mock: accepted/proposed layers nhận đúng LineString, proposal không thay accepted layer, urgent/unavailable labels hiện; rain polygon từ S4 hiện; empty state không có active route.
- [ ] **Step 2:** Chạy test để fail; implement marker/popup/legend/fit bounds/tile error fallback; map không dựng route từ stop positions.
- [ ] **Step 3:** Chạy test, typecheck và build; kiểm tra bằng mắt khi OSM tile lỗi vẫn thấy overlay trên nền fallback.
- [ ] **Step 4:** Tick P1-07 sau khi pass; commit nếu có Git.

### Task P1-08: Admin dashboard theo UIAdmin.png

**Files:** Tạo `src/admin/AdminPage.tsx`, `src/admin/components/{ControlPanel,KpiStrip,AlternativeCards,Comparison,VehicleStatus,Provenance}.tsx`, `src/admin/admin.css`, `src/admin/AdminPage.test.tsx`.

**Interfaces:** Admin dùng `DispatchApi`/`useDispatchSnapshot`; không import engine/fixture JSON. `AlternativeCards` emit `selectAlternative(planId)`; Accept gọi `acceptSelectedPlan()`.

- [ ] **Step 1:** Viết UI tests: loaded → Optimize cho ba cards/no selection; BALANCED recommendation không enable Accept; select mới enable; selected preview hiển thị; Accept clear cards và đổi active plan; event đổi world ngay nhưng route cũ giữ với warning.
- [ ] **Step 2:** Viết UI tests: Before = accepted, After = selected proposed; provenance demo label; Reset clean S0; form Add Order hiển thị trạng thái chờ API; loading/error feedback và duplicate submit disabled.
- [ ] **Step 3:** Chạy tests để fail; implement ba cột, KPI strip, map, comparison, right cards/status và compact provenance đúng hierarchy reference.
- [ ] **Step 4:** Chạy tests, typecheck, build; manual check desktop 1440/1280 px và narrow fallback.
- [ ] **Step 5:** Tick P1-08 sau khi pass; commit nếu có Git.

### Task P1-09: Driver web theo UIDriver.jpg

**Files:** Tạo `src/driver/DriverPage.tsx`, `src/driver/components/{DriverHeader,CurrentStopCard,OrderList,BottomNav,Notifications}.tsx`, `src/driver/driver.css`, `src/driver/DriverPage.test.tsx`.

**Interfaces:** Driver đọc `activeAcceptedPlanId` + `ExecutionState`/`DecisionState` qua `DispatchApi`; action gọi `pickupOrder`/`deliverOrder`. Phase 1 Driver cố định V1; không có V1/V2 selector.

- [ ] **Step 1:** Viết UI tests: trước Accept hiển thị exact empty message; sau Accept chỉ active route; cross-tab active ID đổi hiện banner; dismiss không đổi plan; stale rain/urgent warning nhưng action vẫn chạy; V1 unavailable khóa action, V2 không bị khóa.
- [ ] **Step 2:** Viết tests cho current stop/depot multi-pickup/delivered progress, assigned/onboard/delivered list, urgent indicator, loading/error và action trong Current Stop Card.
- [ ] **Step 3:** Chạy tests để fail; implement mobile layout: header + bell, segmented tabs, map lớn, current stop, order list và fixed four-item bottom nav.
- [ ] **Step 4:** Chạy tests, typecheck/build; manual check 360/390/430 px, touch targets, overflow, WebView-friendly layout.
- [ ] **Step 5:** Tick P1-09 sau khi pass; commit nếu có Git.

### Task P1-10: Integration verification và handoff notes

**Files:** Cập nhật `frontend/README.md`, `frontend/docs/tasks.md`; sửa các frontend files liên quan khi verification nêu lỗi.

**Interfaces:** Demo script S0 → Optimize → Select → Accept → Driver → một event → Re-optimize → Select → Accept → Driver.

- [ ] **Step 1:** Chạy `npm run test -- --run`, `npm run typecheck`, `npm run lint`, `npm run build`; ghi actual output vào task tracker trước khi tick.
- [ ] **Step 2:** Manual demo S2/S3/S4 một event mỗi round, direct load S2/S3/S4 chưa apply event, refresh/cross-tab persistence, reset, OSM tile failure.
- [ ] **Step 3:** Sửa lỗi tìm thấy, chạy lại check liên quan; xác nhận không sửa ownership area khác.
- [ ] **Step 4:** Hoàn thiện README: setup, start, test, demo script, mock limitations và Phase 2 adapter handoff.
- [ ] **Step 5:** Tick P1-10 và đánh dấu Phase 1 DONE chỉ khi Definition of Done trong spec đạt; commit nếu có Git.

## Phase 1.5 và Phase 2

Member 2 Step 7 đã có trong local. [Phase 1.5 plan](phase-1.5-implementation-plan.md) và [task tracker](tasks.md) ghi adapter, Leaflet, custody, clock, selector và kiểm chứng đã làm. Phase 2 bị chặn bởi Member 3 API/transport/auth contract; các P2-01..P2-11 trong tracker là backlog theo thứ tự phụ thuộc. Khi M3 bàn giao, viết `BackendDispatchApi` và mapping tests, giữ `MockDispatchApi` cho development/offline demo. Không invent endpoint hoặc coi `shared/examples` là server production.
