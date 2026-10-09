# Nhận backend Member 3 qua Drive — 06/10/2026

Đọc tài liệu này trước khi chạy bản sao dự án trên máy M4. Backend HTTP hiện hành là **0.8.0**, SDK Step 7 giữ build `80694f511dc735d0b6a1a0a830edd7f6267df395e87dad0ccf180914b49d5a41`. M3 đã đạt 815 tests, năm job native mới và kiểm installer/launcher trên máy M3. Máy M4 cần nhận và kiểm môi trường của mình; kết quả này không thay nghiệm thu UI/browser.

## M3 gửi gì

Upload riêng thư mục `SafeRouteVN_Project_Structure_PLAN`, hiện nằm tại `D:\MLAI4\Apex-SafeRouteVN\SafeRouteVN_Project_Structure_PLAN`. Giữ cấu trúc thư mục và chờ upload hoàn tất. Inventory trước bàn giao ghi nhận khoảng **10,7 GB** theo đơn vị thập phân; quét tên file không phát hiện các file private runtime đã biết trong team tree. Đây là kiểm tên file/thư mục, không phải audit mọi nội dung secret.

- Giữ `backend`, `configs`, `docs`, `frontend`, `geo_data`, `optimization`, `scenarios`, `shared`, các thư mục nguồn còn lại và `releases`.
- Giữ snapshot M1 tại `scenarios/cached_context/hcmc/member1-tdbt-v1`. Các SQLite `routing/network.sqlite`, `features/features.sqlite`, `travel/travel.sqlite` là dữ liệu nguồn cần thiết, không phải authority riêng của backend. Không loại mọi file `.sqlite` khỏi bản tải.
- Giữ hai ZIP Step 7 Runtime/Integration trong `docs`, cùng handoff, upload map và verifier của M2.
- Gói backend hiện hành: [M3_backend_0.8.0_20261006_113056.zip](../releases/M3_backend_0.8.0_20261006_113056.zip).
- Không gửi thư mục **`D:\MLAI4\.local`**. Nó nằm ngoài team tree và chứa token, authority, metadata, venv và cấu hình tuyệt đối của máy M3. Các folder cache `__pycache__` không cần cho bản nhận.

ZIP SHA-256: `59196340dd63980f25a3a9dafd3b838ca2d299621645f52f3406fd9e7c271f35`.

Manifest SHA-256 sau giải nén: `6dab42a10f1fa631f1e1439304981cf4710f1b8de08c5c277b4bd9de5aa4539b`.

Các digest dùng để kiểm nhận bytes, không thay chữ ký số hoặc phê duyệt production của Leader.

## M4 chuẩn bị trên máy nhận

1. Tải **đầy đủ** team tree vào thư mục local, tránh chạy khi Drive đang đồng bộ dở hoặc file còn placeholder. M4 có thể chọn đường dẫn khác máy M3.
2. Có **Windows CPython 3.12 x64** và **Node.js trên PATH**. Python/Node executable không nằm trong gói. JS checks G0 dùng module built-in, không cần `npm install` cho các checks đó.
3. Chọn hai thư mục private **mới, chưa tồn tại**, ở ngoài team tree và tách nhau: một cho bootstrap/G0, một cho installation backend chính thức. Không copy venv hoặc `installation.json` của M3 sang máy M4.
4. Chuẩn bị dependencies M1 riêng. Wheelhouse backend/runtime trong ZIP **chưa có wheelhouse M1**. Chọn một trong hai cách: cài M1 theo `geo_data/requirements.lock.txt` khi còn mạng, hoặc nhận một wheelhouse M1 riêng đủ đúng lock. Runtime và M1 cần hai venv riêng; lock của chúng khác nhau.

Ví dụ máy M4 dùng:

```text
D:\SafeRouteVN\SafeRouteVN_Project_Structure_PLAN   # team tree đã tải
D:\SafeRouteVN-private\m4-g0-001                   # bootstrap mới
D:\SafeRouteVN-private\m4-backend-080-001          # installation mới
C:\Python312\python.exe                           # thay bằng Python thực tế của M4
```

## Cài và kiểm nhận

Script [receive_m3_backend.py](receive_m3_backend.py) dùng các đường dẫn máy M4, kiểm ZIP/manifest và inventory gói cùng source backend nhận được, tạo runtime/M1 venv, chạy G0 native mới rồi gọi installer. Script không thay source SDK, không xóa bản cài cũ, không in token và không tự khởi động server. Script được kiểm cú pháp, các guard đầu vào và đối chiếu chuỗi lệnh với CLI hiện hành; **chưa chạy toàn bộ installation/G0 trên máy M4**. Receipt trên máy nhận quyết định PASS/FAIL thực tế.

Chạy trong PowerShell; thay Python path nếu khác:

```powershell
$M3Team = 'D:\SafeRouteVN\SafeRouteVN_Project_Structure_PLAN'
$M3Python = 'C:\Python312\python.exe'
$M3Boot = 'D:\SafeRouteVN-private\m4-g0-001'
$M3Local = 'D:\SafeRouteVN-private\m4-backend-080-001'

# Có mạng trong bước chuẩn bị M1; backend/runtime vẫn cài từ wheelhouse đã seal.
& $M3Python -B "$M3Team\docs\receive_m3_backend.py" --team-root $M3Team --python312 $M3Python --boot-root $M3Boot --local-root $M3Local --install-m1-online
```

Nếu đã nhận wheelhouse M1 đầy đủ và muốn cài không dùng index mạng, thay lệnh cuối bằng:

```powershell
& $M3Python -B "$M3Team\docs\receive_m3_backend.py" --team-root $M3Team --python312 $M3Python --boot-root $M3Boot --local-root $M3Local --m1-wheelhouse 'D:\SafeRouteVN-received\m1-wheelhouse'
```

Không dùng cả `--install-m1-online` và `--m1-wheelhouse`. Script Python chạy bằng interpreter đã chọn, không thay execution policy của Windows.

G0 phải đồng thời đạt `G0_TECHNICAL_PASS` và `COMPLETE_VERIFIED`, đúng snapshot root của M4, trước khi installer chạy. Receipt cũ ghi đường dẫn `D:\MLAI4\...` của M3 là bằng chứng lịch sử; không chỉnh JSON đó để giả lập PASS trên đường dẫn mới. Preflight cập nhật file `docs/M3_STEP1_PREFLIGHT_20261005.json` trên **bản sao của M4**; script giữ bản M3 đã nhận ở `$M3Boot\received_M3_step1_preflight.json`, đồng thời lưu receipt mới trong private bootstrap root.

Nếu thất bại, giữ receipt/log và diagnostic, đối chiếu bước lỗi. Đừng sửa DB, bypass hash/gate hoặc đổi runtime pin. Bản cài dở được giữ lại; lần thử mới dùng Boot/Local directory mới.

## Chạy API và nối frontend

Sau khi script trả `M4_RECEIVE_INSTALL_PASS`, chạy ở cùng PowerShell:

```powershell
& $M3Python -B "$M3Team\backend\scripts\run_backend.py" --local-root $M3Local --port 8000 --offline
```

Đợi launcher báo `READY` và `GET http://127.0.0.1:8000/ready` trả 200. `/health` chỉ là liveness. OpenAPI/Swagger tại `/openapi.json` và `/docs`. Ctrl+C yêu cầu API/worker dừng qua cơ chế launcher.

Installer tạo token mới tại `$M3Local\backend\dev_access.json`. M4 sử dụng token của installation của mình; thao tác ghi cần dispatcher và session cùng owner. Không đưa token vào source frontend, repo hoặc upload chung. CORS mặc định cho `http://localhost:5173`, `http://127.0.0.1:5173`, `http://localhost:3000`; origin khác cần cấu hình `SAFEROUTE_CORS_ORIGINS` tường minh trước khi chạy launcher.

`127.0.0.1` là máy đang chạy browser. Với luồng nhận này, M4 chạy cả frontend và backend trên máy M4. Mock là process/token riêng, chỉ đọc pinned examples; xem API bổ sung. Giữ nhãn MOCK_DEMO, không đổi sang mock để che lỗi native.

## Tài liệu và biên bản cần đọc

- [API chính](M3_API_HANDOFF.md) và [API 0.8.0 bổ sung](M3_COMPLETION_API_HANDOFF.md).
- [OpenAPI hiện hành](M3_OPENAPI_20261006.json), [runbook](M3_OPERATIONS_RUNBOOK.md).
- [Nghiệm thu backend M3](M3_COMPLETION_ACCEPTANCE_20261006.md).
- [Checklist M3–M4](M3_M4_E2E_CHECKLIST.md): chạy S2/S3/S4, auth/owner, lỗi/retry, comparison, accept/event/replay, autoplay, observed/forecast/null, geometry, narrative, notifications/artifacts và offline/reload trên UI thật.

M4 ghi source/UI hash, backend release/SDK build, environment receipt, scenario/session, PASS/FAIL/BLOCKED và screenshot/frame. G0 trên máy nhận không thay browser E2E/full-team G3 hoặc Leader production approval. Giữ các giới hạn E4, calibration, PERFORMANCE_NOT_MET, SIMULATED_REPLAY_NOT_GPS, EXPOSURE_IS_PROXY và NOT_OPTIMALITY.
