# S0: ba phương án đường khác nhau

Bản sửa áp dụng cho demo offline trong `MLAI/SafeRouteVN_Project_Structure_PLAN`.
Backend M3 và runtime đã khóa phiên bản vẫn giữ nguyên. Không dùng gói demo này
như kết quả được backend chứng nhận.

Nguyên nhân: gói S0 cũ chứa cùng một tuyến cho cả ba profile. Bộ dựng miền tuyến
ưu tiên thời gian và dừng khi vừa đủ phủ đơn, nên bộ chọn profile thiếu các
tuyến thể hiện sự đánh đổi giữa thời gian và rủi ro.

Bộ dựng mới tìm đường riêng theo thời gian, trọng số BALANCED và exposure;
mang theo cạnh đi vào để tuân thủ cấm rẽ; mở rộng các thứ tự giao hàng; kiểm tra
từng tuyến bằng bộ kiểm tra độc lập trên SQLite nguồn. Sau đó chọn ba phương án
không bị phương án khác tốt hơn mọi mặt, giao đủ đơn, cùng mức trễ tối thiểu,
khác ít nhất 1% tập đoạn đường và nằm trong giới hạn chất lượng 25%.
Đây là tìm kiếm có giới hạn, không phải chứng minh tối ưu toàn cục.

Kết quả S0:

| Profile | Tổng thời gian xe chạy | Chi phí tuyến | Exposure |
| --- | ---: | ---: | ---: |
| FASTEST | 78,8 phút | 83.479 VND | 11,2243 |
| BALANCED | 79,6 phút | 81.162 VND | 10,7371 |
| SAFER | 94,6 phút | 79.414 VND | 10,1303 |

Cả ba dùng V1 giao O003 → O001 → O002 rồi về depot; V2 rảnh. Các đoạn đường
khác nhau, dù thứ tự điểm giao giống nhau. BALANCED vẫn có nhãn Recommended.
Thời gian trên là tổng thời gian chạy xe, không phải giờ đến từng điểm giao.

Chạy từ PowerShell:

```powershell
cd D:\MLAI\SafeRouteVN_Project_Structure_PLAN\frontend
npm.cmd run dev:mock -- --host 127.0.0.1 --port 5174 --strictPort
```

Mở `http://127.0.0.1:5174/admin`, tải lại trang, chọn/reset S0 trong Demo tools
rồi Optimize để bỏ các đề xuất cũ đã lưu. Reset bắt đầu phiên demo mới.

Tính lại dữ liệu từ thư mục gốc dự án:

```powershell
python -B -m optimization.diverse_offline --scenario S0 --seconds 240
```

Đầu ra kiểm tra: `outputs/diverse_profiles/S0/report.json` và `domain.json`.
Gói frontend: `src/mocks/data/member2-diverse-road-packs.json`. Chỉ thay gói khi
đã kiểm tra thành công; dữ liệu audit đầy đủ giữ ở domain, không đưa vào localStorage.

Các scenario/event cũ chưa được tính lại bằng bộ dựng mới. Nếu chúng chứa tuyến
trùng, giao diện vô hiệu hóa lựa chọn trùng và báo số tuyến thực có; không sửa
số liệu để tạo khác biệt. Nhãn Recommended vẫn giữ ở BALANCED.
