# SafeRoute VN — Member 4 frontend design spec

**Trạng thái:** Thiết kế đã được duyệt trong hội thoại ngày 2026-09-29. Tài liệu này ghi lại baseline cho triển khai.

**Phase hiện tại:** Phase 1 mock frontend đã có code và automated tests; visual acceptance trên thiết bị/WebView thật vẫn cần thực hiện. Phase 2 — tích hợp kết quả Member 2 và API Member 3 — chờ bàn giao.

## 1. Mục tiêu và phạm vi

Member 4 xây một React + TypeScript + Vite SPA có hai experience: `/admin` dành cho dispatcher trên desktop và `/driver` dành cho shipper trên màn hình điện thoại, sẵn sàng đưa vào WebView sau này. Cả hai đọc cùng một frontend-local `DispatchApi`. Trong Phase 1, implementation là `MockDispatchApi` và một Mock State Engine lưu trạng thái demo trong `localStorage`. Phase 2 thay adapter theo contract thật của Member 2/3.

Luồng demo chính: Load S0 → Optimize → dispatcher chọn FASTEST/BALANCED/SAFER → Accept → Driver thấy lộ trình → trigger **một** event S2/S3/S4 → DecisionState đổi ngay → Re-optimize → compare → chọn → Accept → Driver thấy plan mới. Có thể load trực tiếp S0/S2/S3/S4 để xem fixture; event của S2/S3/S4 vẫn `READY_TO_TRIGGER` cho đến khi dispatcher bấm trigger.

Phase 1 không thực hiện routing, optimization, risk calculation, nearest-driver assignment, recovery hoặc auth. Component không đọc SQLite, không ghi `localStorage`, không nối tọa độ stop thành route. Tên endpoint và schema của Member 2/3 chưa phải contract chính thức.

## 2. Nguồn sự thật hiện có

| Nguồn | Dữ liệu được dùng | Giới hạn |
| --- | --- | --- |
| `../../scenarios/fixtures/thu-duc-binh-thanh-v1/S0.json` | Initial state, depot, 3 orders, 2 vehicles | Con số 3/2 là fixture contract, không phải giới hạn nghiệp vụ |
| `S2.json` | `URGENT_ORDER`, payload `O009`, priority 3 | S0 + S2 event có 4 orders; direct S2 + event có 9 orders |
| `S3.json` | O001 đã ONBOARD trên V1; event `VEHICLE_UNAVAILABLE` | Initial V1 vẫn AVAILABLE; event mới đổi availability; không chuyển O001 sang V2 |
| `S4.json` | `LOCAL_RAIN_WHAT_IF`, GeoJSON Polygon, 2.253 `affectedEdgeIds`, `contextDelta`, start/end | Đây là weather what-if, không phải observed rain hoặc frontend risk calculation |
| `../../scenarios/manifests/thu-duc-binh-thanh-v1.json` | Suite ID, version, context version, provenance | `integrated=false`; `cached_context` được manifest tham chiếu không có trong checkout |
| `../../UIAdmin.png`, `../../UIDriver.jpg` | Visual hierarchy và style | Text, địa chỉ, KPI trong ảnh chỉ là tham khảo |

Loader đọc/copy fixture được pin. Nếu build không import ngoài `frontend/`, tạo bản sao dữ liệu trong `src/mocks/scenarios/` với ghi chú nguồn và kiểm tra checksum cùng manifest. Không sửa artifact Member 1. Mock presentation catalog chứa tên khách, tên tài xế, địa chỉ, số điện thoại; mọi nơi dùng dữ liệu này phải hiển thị nhãn “Demo data”.

## 3. State và ownership

```ts
interface DispatchSnapshot {
  decisionState: DecisionState;
  planState: PlanState;
  executionState: ExecutionState;
  demoClock: { now: string; label: "Thời gian demo" };
  demo: { availableEvents: DemoEventSummary[] };
}

interface DecisionState {
  sessionId: string;
  version: number;
  scenarioId: "S0" | "S2" | "S3" | "S4";
  orders: Order[];
  vehicles: Vehicle[];
  locations: Location[];
  context: ContextState;
  events: EventState[];
}

interface PlanState {
  acceptedPlans: AcceptedPlanRecord[];
  activeAcceptedPlanId: string | null;
  proposedAlternatives: ProposedAlternative[];
  selectedAlternativeId: string | null;
  operationalPlanAssessment: OperationalPlanAssessment | null;
}

interface ExecutionState {
  activePlanId: string | null;
  progressByPlanId: Record<string, Record<string, {
    currentStopId: string | null;
    completedStopIds: string[];
    completedSegmentIds: string[];
  }>>;
}
```

`DecisionState` là canonical physical truth: order status/owner/timestamps và vehicle availability/load/onboard IDs/current position chỉ sống ở đó. `ExecutionState` chỉ giữ tiến độ stop/segment theo từng plan; không lưu bản sao order status hoặc load. Tiến độ plan cũ vẫn còn để audit sau re-Accept. Plan mới khởi tạo current stop từ các physical facts đã xảy ra, không sao chép `completedSegmentIds` của geometry cũ. `acceptedPlans[].plan` chứa assignment, ordered stops, route segments, metrics, profile và provenance bất biến. `acceptedAt`/`supersededAt` là lifecycle metadata có thể cập nhật ở wrapper record; ACTIVE/SUPERSEDED suy ra từ `activeAcceptedPlanId`.

```ts
type Profile = "FASTEST" | "BALANCED" | "SAFER";
type Stop = {
  id: string;
  kind: "DEPOT_PICKUP" | "DELIVERY";
  orderIds: string[]; // depot có thể chứa nhiều pickup item
  location: { latitude: number; longitude: number };
};
type RouteSegment = {
  id: string;
  fromStopId: string;
  toStopId: string;
  geometry: { type: "LineString"; coordinates: [number, number][] }; // [longitude, latitude]
  distanceKm: number;
  durationMinutes: number;
  relativeExposure?: number;
};
type VehiclePlan = { vehicleId: string; orderedStops: Stop[]; routeSegments: RouteSegment[] };
type ImmutablePlanContent = {
  profile: Profile;
  vehiclePlans: VehiclePlan[];
  metrics: PlanMetrics;
  unserved: UnservedDiagnostic[];
  provenance: PlanProvenance;
};
type ProposedAlternative = {
  id: string;
  content: ImmutablePlanContent;
  generatedForSessionId: string;
  generatedForStateVersion: number;
};
type AcceptedPlanRecord = {
  id: string;
  plan: ImmutablePlanContent;
  acceptedAt: string;
  supersededAt?: string;
};
type OperationalPlanAssessment = {
  planId: string;
  status: "ACTIVE" | "NEEDS_REOPTIMIZATION";
  reasons: AssessmentReason[];
  assessedAgainstSessionId: string;
  assessedAgainstStateVersion: number;
};
```

`PlanMetrics`, `UnservedDiagnostic`, `PlanProvenance` và `AssessmentReason` được định nghĩa trong temporary frontend contract bằng đúng field mà prepared pack và UI cần; chúng không được coi là schema Member 2/3. Segment completion được suy ra từ `ExecutionState`, không mutate `RouteSegment`. Plan assignment chỉ là dự định điều phối; `DecisionState.assignedVehicleId` là owner vật lý và chỉ đổi khi Pickup hợp lệ (hoặc có sẵn từ fixture ONBOARD), không đổi chỉ vì Accept. Proposal ID/content lặp lại khi Optimize cùng snapshot; mỗi lần Accept tạo `AcceptedPlanRecord.id` riêng bằng session ID + acceptance sequence của engine, không dùng wall clock. Nhờ đó history và `activeAcceptedPlanId` không trùng khi cùng proposal content được Accept lần nữa.

`OperationalPlanAssessment` gồm `planId`, `status: ACTIVE | NEEDS_REOPTIMIZATION`, `reasons[]`, `assessedAgainstSessionId` và `assessedAgainstStateVersion`. Assessment luôn gắn active plan; sau Pickup/Delivered tăng version và refresh assessment nhưng giữ stale reasons đang tồn tại. Status plan advisory tách khỏi quyền thực thi của từng vehicle.

Mỗi proposal chứa `generatedForSessionId` và `generatedForStateVersion`. `acceptSelectedPlan()` chỉ hợp lệ khi cả hai bằng session/version hiện tại. Recommended ≠ Selected ≠ Accepted. Optimize không tự chọn BALANCED, không thay accepted plan và không tăng world version. Gọi Optimize lại cùng session/version thay bộ proposal, xóa selection và cho cùng nội dung deterministic.

## 4. Mock API contract

```ts
interface DispatchApi {
  getSnapshot(): Promise<DispatchSnapshot>;
  subscribe(listener: (snapshot: DispatchSnapshot) => void): () => void;
  listScenarios(): Promise<ScenarioSummary[]>;
  loadScenario(id: ScenarioId): Promise<DispatchSnapshot>;
  optimize(): Promise<DispatchSnapshot>;
  selectAlternative(planId: string): Promise<DispatchSnapshot>;
  acceptSelectedPlan(): Promise<DispatchSnapshot>;
  triggerFixtureEvent(eventId: string): Promise<DispatchSnapshot>;
  pickupOrder(input: { vehicleId: string; orderId: string }): Promise<DispatchSnapshot>;
  deliverOrder(input: { vehicleId: string; orderId: string }): Promise<DispatchSnapshot>;
  advanceDemoClock(minutes: number): Promise<DispatchSnapshot>;
  resetDemoSession(): Promise<DispatchSnapshot>;
}
```

Mutation trả snapshot thống nhất. `getSnapshot()`/`subscribe()` là nguồn đọc duy nhất cho React. Với S0, `snapshot.demo.availableEvents` liệt kê `S2-E1`, `S3-E1`, `S4-E1`; khi load trực tiếp S2/S3/S4, danh sách chỉ chứa event của fixture đã load. Mỗi event có source scenario, type, label và trạng thái `READY_TO_TRIGGER`/`TRIGGERED`; sau một trigger, mọi trigger khác bị khóa cho đến Reset/Load. Payload lấy từ fixture, không nằm trong component. `advanceDemoClock` là development/test operation, không được gọi từ timer trong component.

Các lỗi validation là typed errors: `NO_SELECTED_ALTERNATIVE`, `STALE_PROPOSAL`, `NO_ACTIVE_PLAN`, `VEHICLE_UNAVAILABLE`, `INVALID_CURRENT_STOP`, `INVALID_ORDER_STATE`, `EVENT_ALREADY_TRIGGERED`, `MOCK_RESULT_UNAVAILABLE`, `EVENT_WINDOW_EXPIRED`. UI map error code thành thông báo tiếng Anh ngắn, có trạng thái idle/loading/success/error và chặn submit lặp.

### Quy tắc operation

| Operation | World version | Proposals | Accepted plan | Execution |
| --- | --- | --- | --- | --- |
| Load/Reset | Session mới, version khởi tạo | Clear | Clear | Reset |
| Optimize | Không đổi trực tiếp; có thể +1 nếu S4 hết hạn khi clock tiến | Replace ba profile, selection null | Giữ | Giữ |
| Select | Không đổi | Chỉ đổi selection | Giữ | Giữ |
| Accept | Không đổi trực tiếp; có thể +1 nếu S4 hết hạn khi clock tiến | Clear sau Accept | Ghi record mới, active ID mới | Bind remaining work; giữ physical facts |
| Trigger event | +1 | Clear | Giữ; reassess | Preserve |
| Pickup/Delivered | +1 | Clear | Nội dung không đổi; reassess | Update current/completed stop |
| Clock advance thường | Không đổi | Giữ | Giữ | Giữ |
| S4 expiry | +1 | Clear | Giữ; reassess | Preserve |

Load/Reset tạo `sessionId` mới, clean S0 khi Reset, demo clock bằng `initialState.currentTime`. Mock clock tiến một phút cho Optimize, Accept, Pickup, Delivered; Select không tăng thời gian. Trigger event tiến tới `max(now + 1 phút, event.timestamp)`; nếu S4 đã quá `endTime`, trả `EVENT_WINDOW_EXPIRED`. Mỗi mutation chạy trên draft: advance clock → expire timed events → kiểm tra preconditions theo world version mới → commit/notify một lần. Nếu validation thất bại, draft bị bỏ và clock/state không đổi; explicit `advanceDemoClock` luôn commit. Khi đến `endTime`, S4 hết hiệu lực, rain overlay biến mất, world version tăng và proposals bị xóa. Accept tại đúng thời điểm expiry phải reject `STALE_PROPOSAL`, không commit plan cũ. Optimize sau expiry tạo proposals cho state version mới. Không auto Optimize.

Event trước lần Accept đầu tiên hợp lệ. Một session/round chỉ trigger một event. S2 thêm urgent order ngay, S3 đổi availability ngay, S4 đổi weather context và bật polygon ngay. Accepted plan cũ được giữ để audit, assessment thành `NEEDS_REOPTIMIZATION` với reason tương ứng. Driver vẫn được thực hiện plan cũ dưới cảnh báo khi là urgent/rain; xe unavailable bị khóa Pickup/Delivered, các xe còn lại vẫn hoạt động.

Pickup chỉ hợp lệ với order thuộc current depot stop của active plan. Một depot stop chứa nhiều pickup item; từng order được pickup riêng. Khi tất cả hoàn thành mới chuyển tới delivery stop kế tiếp. Delivered chỉ hợp lệ với order ONBOARD trên đúng vehicle và thuộc current stop. Mọi physical fact và timestamp đã thực hiện được giữ sau re-optimization/Accept mới; không có implicit ONBOARD transfer hay route reorder.

## 5. Prepared mock decisions và geometry

Phase 1 dùng decision packs được biên soạn trước cho S0/S2/S3/S4 ở initial state, và cho S0 sau một event S2/S3/S4. Mỗi pack có FASTEST, BALANCED, SAFER với khác biệt có chủ ý ở assignment, stop sequence, GeoJSON LineString, KPI và unserved diagnostics. Ít nhất một scripted execution-progress path được chuẩn bị để kiểm tra re-optimization sau Pickup/Delivered mà vẫn giữ physical facts. Pack chỉ được chọn bằng scenario ID, event ID và milestone đã định nghĩa; engine không tự giải assignment hoặc dựng route. Nếu không có pack hợp lệ, `MOCK_RESULT_UNAVAILABLE` và state giữ nguyên.

`VehiclePlan` có ordered stops và `routeSegments` với ID, `fromStopId`, `toStopId`, GeoJSON LineString, distance/duration và optional relative exposure. `PlanMetrics` gồm distance, duration, on-time rate, exposure và `fuelCostVnd` (prepared demo data). Geometry và metrics là demo decision data, không khẳng định là đường tối ưu hay đường lái thực tế. Map chỉ vẽ geometry đầu vào; segment hoàn thành được làm mờ. Driver chỉ nhìn active accepted plan. Admin có thể xem accepted route và selected proposed preview đồng thời, với nhãn rõ “Proposed — not dispatched”.

## 6. UI theo visual references

### Admin `/admin`

Desktop dashboard ba cột khoảng 26% / 44% / 30%. Header gọn gồm thương hiệu, trạng thái demo trước/sau Optimize, demo time, notification và Admin identity. Trái gồm ba card Order Entry + Current Queue; Fleet/Preferences; Context/Events, rồi Optimize/Re-optimize. Scenario selector và Reset Demo là development controls nhỏ. Order Entry giữ bố cục từ ảnh; `+ Add Order` là placeholder có nhãn “Pending Member 3 API” trong Phase 1, vì contract hiện tại chỉ hỗ trợ urgent order qua fixture event. Preference controls chỉ là input trình bày, không tác động mock decision packs.

Fleet chỉ render vehicles hiện có trong `DecisionState`; capacity mặc định lấy từ `vehicle.capacityKg` của fixture (S0 có V1/V2, mỗi xe 15 kg). Capacity có thể khác nhau theo xe. Event switches lấy trạng thái từ snapshot và chỉ gọi `triggerFixtureEvent`, không duy trì local event truth. Proposal cards/KPI/comparison đọc metrics từ plan; khi chưa có accepted plan, cột Before/Change hiển thị `—`, không dùng số baseline tự đặt.

KPI strip nằm trên map/right region, phân biệt Current và Proposed. Center có bản đồ lớn (depot, orders, vehicles, accepted/proposed route, rain polygon, legend, popups, fit bounds) và Before/After dưới map. Right upper có ba cards FASTEST/BALANCED/SAFER đặt ngang, badge Recommended chỉ là gợi ý, `Accept Selected Plan` full width dưới cards. Right lower là Vehicle Status table. Provenance và plan history nằm ở card compact/collapsible cuối dashboard. Cần bốn trạng thái nhìn rõ: loaded, proposed, selected, accepted.

Nếu OSM tile lỗi, map giữ marker, route và polygon trên nền fallback, kèm thông báo tile unavailable. Không giả satellite mode khi không có nguồn tile thật. Admin trên viewport hẹp chuyển panel trái thành vùng thu gọn và đưa decision/fleet xuống dưới map.

### Driver `/driver`

Mobile-first một cột. Header giống ảnh: logo, SafeRoute VN / Driver App, notification bell. Sau header là segmented tabs “On Route” và “My Orders”. Map lớn ở nửa trên hiển thị current position, depot, numbered/urgent stops và active accepted route. Current Stop Card nằm ngay dưới map, có progress, thông tin khách/địa chỉ/ETA và action Pickup hoặc Delivered **trong card**. Danh sách đơn hàng là section lớn dưới card. Bottom navigation bốn mục cố định: Route, Orders, Notifications, Settings. Phase 1 Driver demo cố định V1, không có V1/V2 selector.

Trước Accept, Driver hiển thị “No dispatch plan has been assigned yet.” Sau Accept mới đọc active plan. Khi active plan ID đổi qua subscription, Driver hiện banner “Route has been updated”; dismiss chỉ ẩn banner. Nếu assessment stale, hiển thị cảnh báo cần re-optimization. S3 khóa action của xe unavailable, vẫn giữ route để audit. Tương tác touch-friendly ở 360/390/430 px, không phụ thuộc hover hoặc right-click.

## 7. Persistence, đồng bộ và provenance

State Engine là nơi duy nhất serialize vào `localStorage` theo storage schema version. Constructor hydrate và validate; corrupt/không tương thích thì khởi tạo clean S0 và không crash. Mutation đọc snapshot mới nhất trước validation để tránh Accept proposal cũ giữa hai tab. Same-tab subscribers được notify trực tiếp; `storage` event từ tab khác chỉ hydrate/notify, không ghi ngược lại. Route-update banner chỉ xuất hiện khi `activeAcceptedPlanId` thực sự đổi, không phải mọi clock/progress update.

Provenance hiển thị suite/scenario/source, context/version rút gọn, state version, profile, accepted time và nhãn demo. Không hiển thị hash dài mặc định. UI tiếng Anh trong Phase 1; tên riêng/địa chỉ trong presentation catalog có thể giữ tiếng Việt và phải được gắn nhãn demo. Dữ liệu trong screenshot không thành business truth.

## 8. Kiểm thử và acceptance

Ba tầng: Vitest cho engine/invariants, Vitest cho API/persistence/subscription, React Testing Library cho hành vi Admin/Driver. Fixture contract test khẳng định S0 3 orders/2 vehicles và payload S2/S3/S4 đúng artifact; UI không hard-code số lượng. S4 fixture hiện có Polygon, nên assert polygon thật; nếu fixture pin đổi, test cập nhật theo artifact trước khi thay adapter.

Test bắt buộc gồm: repeated Optimize cùng state deterministic và reset selection; Accept clear proposals; direct load event chưa apply; session+version validity; immutable plan content/history; physical truth sau re-accept; S3 ONBOARD owner; S4 expiry; current-stop action validation; persistence serialize/reload/corrupt fallback; cross-tab không write loop và banner chỉ khi active ID đổi; loading/error states. Map test dữ liệu geometry/visibility được truyền vào, không test thuật toán Leaflet hoặc pixel. Kiểm tra cuối: build, typecheck, lint, tests và manual viewport/tile fallback.

**Definition of Done Phase 1:** `/admin` và `/driver` chạy cùng một snapshot qua refresh/tab; demo S0 → Optimize → Select → Accept → Driver → một event → Re-optimize → Select → Accept → Driver hoàn tất cho từng event ở round riêng; direct load S2/S3/S4 giữ event ở `READY_TO_TRIGGER`; mọi test lifecycle/API/UI ở trên pass; `typecheck`, `lint`, `build` pass; giao diện được kiểm tra ở desktop và 360/390/430 px, gồm tile fallback. Mỗi task chỉ được tick khi có chứng cứ kiểm tra tương ứng trong tracker.

## 9. Phase 2 và điều kiện bàn giao

Member 2 Step 7 đã bàn giao `DecisionResult` ba profile và `task02-m2-execution-view/2`; Phase 1.5 đã thêm adapter public contract, Leaflet và các sửa lỗi mock, mô tả trong [Phase 1.5 spec](phase-1.5-design-spec.md). `AlternativeMetrics` trong `common.py` chưa có ở subset local nên adapter giữ opaque field, không suy diễn KPI. Phase 2 chờ Member 3 giao API/state/event/accept/execution, auth/role, lỗi, đồng bộ và dữ liệu driver/customer. Khi đó `BackendDispatchApi` sẽ compose M2 views với M3 state vào UI; giữ MockDispatchApi cho demo/tests. Không ép Member 3 theo tên endpoint chưa được bàn giao.

Xem [implementation plan](phase-1-implementation-plan.md) và [task tracker](tasks.md) để biết phần đã xong, đang chờ và tiêu chí đánh dấu hoàn tất.
