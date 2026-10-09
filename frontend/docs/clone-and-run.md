# Clone và chạy frontend SafeRoute VN

Source frontend, `package-lock.json`, cấu hình Vite/TypeScript, fixtures mock,
tests và script kiểm tra nằm trong Git. Dùng Node.js 24 và npm; đây là phiên bản
đã dùng để kiểm tra bàn giao. Không cần copy `node_modules` hoặc `dist` từ máy khác.
Clone toàn bộ repo và giữ `scenarios/fixtures` cùng cấp với `frontend`: mock và
một số tests import các fixture S0–S4 từ thư mục này.

## 1. Clone và cài dependencies

Chạy trong PowerShell, tại thư mục muốn đặt repo:

```powershell
git clone https://github.com/HiimRaccoon/APEX-SafeRouteVN.git
cd APEX-SafeRouteVN/frontend
node --version
npm.cmd ci
```

## 2. Mở UI với mock, không cần backend

```powershell
npm.cmd run dev:mock -- --host 127.0.0.1 --port 5173 --strictPort
```

Mở <http://127.0.0.1:5173/admin> hoặc <http://127.0.0.1:5173/driver>.
Đây là demo offline, không kiểm chứng lỗi native runtime.
Dừng Vite bằng Ctrl+C trước khi chuyển sang backend thật.

## 3. Mở UI với backend M3 thật

Repo có source M3/M2 và contract. Native installation còn cần bộ dữ liệu M1 đã
xác minh, môi trường Python/dependencies, runtime đã seal và cấu hình/auth riêng.
Các thành phần này được bàn giao riêng; clone repo không tự tạo installation.
Xem [release r2](../../docs/M3_FORECAST_EXTENSION_RELEASE_20261007.md) và
[operations runbook](../../docs/M3_OPERATIONS_RUNBOOK.md) để chuẩn bị installation.
Các contract và runbook lịch sử được bổ sung để đọc đầy đủ hướng dẫn; OpenAPI hiện
hành là [2026-10-07](../../docs/M3_OPENAPI_20261007.json). Những receipt JSON lịch sử
được tài liệu cũ tham chiếu thuộc bộ bàn giao riêng, không cần để build/chạy UI.

Với installation đầy đủ có `backend-venv`, mở terminal tại **source root trùng
với `installation.json.snapshot_root`** rồi chạy:

```powershell
$M3Local = 'C:\path\to\private-native-installation'
$env:SAFEROUTE_CORS_ORIGINS = 'http://127.0.0.1:5173'
& "$M3Local\backend-venv\Scripts\python.exe" -B backend/scripts/run_backend.py --local-root $M3Local --port 8000
```

Thay đường dẫn bằng installation của bạn. Installation dùng lại Python environment
cần cách khởi động API/worker riêng theo [frontend README](../README.md).
Chỉ chạy một worker cho mỗi authority. Đợi launcher báo ready; kiểm tra trong
terminal khác:

```powershell
Invoke-RestMethod 'http://127.0.0.1:8000/ready' -TimeoutSec 180
```

Phải có `data.ready=true`. `/health` hoặc một port đang mở chưa đủ.

Tại terminal frontend:

```powershell
$env:VITE_DISPATCH_MODE = 'backend'
$env:VITE_M3_BASE_URL = 'http://127.0.0.1:8000'
npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Đổi `8000` ở cả lệnh kiểm tra và `VITE_M3_BASE_URL` nếu API dùng port khác.
Biến môi trường ở terminal áp dụng cho lần chạy này, tránh nhầm với file
`.env.development.local` từ máy cũ. `.env.example` có cấu hình mẫu không chứa token.

Mở `/admin`, mở DevTools → Console rồi chạy đoạn sau. Khi hộp thoại hiện ra,
dán **dispatcher bearer do người vận hành M3 cấp cho installation này**:

```javascript
(() => {
  const bearer = prompt('Dán M3 dispatcher bearer cho tab này');
  if (bearer?.trim()) {
    sessionStorage.setItem('saferoute.member3.bearer', bearer.trim());
    location.reload();
  }
})();
```

Token chỉ có hiệu lực trong tab hiện tại; làm lại cho tab Driver. Dùng cùng origin
và browser profile để chia sẻ session reference Admin/Driver. Token không thuộc
`VITE_*`, source hay Git. Sau khi tải S0, Admin có Optimize → Select → Accept;
Driver đọc execution đã Accept và điều khiển simulated replay.

## Khi không chạy được

- `Port 5173 is already in use`: kiểm tra terminal Vite đang chạy. Dùng server đó
  hoặc Ctrl+C tại terminal sở hữu nó trước khi khởi động lại. Nếu đổi port UI,
  thêm đúng origin mới vào CORS backend.
- `NETWORK_ERROR`: kiểm tra API URL, `/ready`, process API/worker và CORS cho
  đúng origin; `localhost` và `127.0.0.1` là hai origin khác nhau.
- `AUTH_REQUIRED`: cấu hình bearer trong đúng tab. 401/403 cần kiểm tra credential
  và ownership với người vận hành backend.
- Tải lâu hoặc `RUNTIME_BUSY` sau Optimize: xem
  [diagnostic handoff](runtime-busy-handoff-20261008.md). Request đã được nhận
  có thể vẫn đang chạy. Giữ session và request ID hiện có để reconcile; không
  reset authority hoặc tự tạo command mới để vượt trạng thái stale.

## Kiểm tra source

Chạy tại `frontend`:

```powershell
npm.cmd run test:run
npm.cmd run test:audit
npm.cmd run typecheck
npm.cmd run build
node scripts/audit-backend-build.mjs
```

Build và tests này không thay thế native UI verification. Hướng dẫn và phạm vi
native gates nằm trong [Phase 7 handoff](member3-phase7.md).

## Kiểm tra bàn giao clone ngày 2026-10-08

Đã export `frontend` và `scenarios` từ Git vào thư mục sạch, không dùng
`node_modules` hay `.env.development.local` của workspace. `npm.cmd ci --offline
--no-audit --no-fund` cài 148 packages bằng lockfile từ npm cache local.
`test:run -- --maxWorkers=4` đạt 342 tests/46 files; `test:audit` đạt 9 tests.
Typecheck, build backend, audit artifact backend và build mock đều đạt.
Chrome smoke cho mock Admin/Driver trên preview riêng đạt (`native=false`).
Lần export chỉ có `frontend` ban đầu thiếu các fixture bên ngoài và không đạt;
kiểm tra trên đã chạy lại với đầy đủ `scenarios`. Giới hạn 4 test workers giúp
giảm tải trên máy dùng để kiểm tra; không thay đổi test assertions.
Lỗi native `RUNTIME_BUSY` vẫn chưa sửa và không được tính là PASS trong lần bàn giao này.
