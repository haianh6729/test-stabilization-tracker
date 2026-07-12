# Đề xuất cải tiến hệ thống Test Stabilization Tracker

Xếp theo mức ưu tiên dựa trên: giá trị cho mục tiêu 85% pass rate + giảm công sức vận hành hàng ngày. Mỗi mục ghi rõ lý do và phạm vi để có thể tách thành task riêng.

## Nhóm A — Giá trị cao, nên làm sớm

### A1. API nhập kết quả tự động từ test farm
- **Hiện tại**: copy-paste tab-delimited từ SDF export mỗi sáng — thủ công, dễ sót/nhầm, phụ thuộc 1 người.
- **Đề xuất**: endpoint `POST /api/results/import` nhận JSON/CSV (hoặc script CLI nhỏ chạy sau mỗi cycle trên farm đẩy kết quả lên). Giữ nguyên logic chuẩn hoá suite/cycle hiện có.
- **Giá trị**: dữ liệu luôn đủ và đúng giờ — điều kiện tiên quyết cho mọi báo cáo; bỏ được bước thủ công dễ lỗi nhất.

### A2. Nhãn Flaky + đếm reopen theo script
- **Hiện tại**: ⚠️ "Hết rồi fail lại" chỉ thấy theo từng lần fix; script pass/fail xen kẽ không được đánh dấu riêng.
- **Đề xuất**: tự đánh nhãn `Flaky` khi script đổi trạng thái pass↔fail ≥2 lần trong N cycle gần nhất; thêm cột reopen-count trong Bảng ưu tiên; KPI "flaky rate" trên Dashboard.
- **Giá trị**: giai đoạn tiến sát 85%, kẻ địch chính là flaky — cần nhìn thấy và xử lý riêng (quarantine, sửa wait/locator) thay vì fix đi fix lại.

### A3. Chuẩn hoá Root cause bằng danh mục chọn sẵn
- **Hiện tại**: root cause là text tự do; `compute_root_cause_pareto` gom nhóm từ text nên phụ thuộc cách viết của từng người.
- **Đề xuất**: dropdown nhóm nguyên nhân cố định (Locator/UI change, Timing/Sync, Test data, Infra/Device, App bug, Script logic) + ô mô tả chi tiết. Migration: map text cũ vào nhóm.
- **Giá trị**: Pareto chính xác → chọn đúng "chiến dịch batch-fix"; tách được % lỗi do hạ tầng cho báo cáo farm.

### A4. Endpoint báo cáo tự động theo mẫu
- **Đề xuất**: `GET /api/report/daily` và `/api/report/weekly` trả về markdown đúng mẫu trong [mau-bao-cao.md](mau-bao-cao.md), điền sẵn số liệu — lead chỉ bổ sung nhận định rồi gửi. Nâng cao: gửi tự động vào email/webhook (Telegram/Slack nội bộ) cuối ngày.
- **Giá trị**: giảm 80% thời gian soạn báo cáo, số liệu không bao giờ lệch hệ thống.

### A5. Backup & snapshot tự động
- **Hiện tại**: backup = copy tay `tracker.db`/`users.db`; xuất Excel thủ công.
- **Đề xuất**: job hàng ngày (scheduled task/cron trên máy chủ) copy 2 file DB + xuất Excel vào thư mục backup có ngày tháng, giữ 30 bản gần nhất.
- **Giá trị**: đây là dữ liệu sống của cả dự án trên 1 máy cá nhân — rủi ro mất trắng hiện tại là có thật.

## Nhóm B — Giá trị tốt, làm sau nhóm A

### B1. Module Test Farm (device tracking)
- **Đề xuất**: bảng `devices` (model, serial, status, last_seen, ghi chú), trang quản lý + log downtime; khi nhập kết quả có thể gắn device; Dashboard thêm KPI device availability và cảnh báo "model X fail đồng loạt — nghi lỗi device".
- **Giá trị**: hiện phần farm phải theo dõi bằng sheet ngoài; gộp vào giúp báo cáo ngày/tuần lấy số một chỗ và tự phân biệt lỗi script vs lỗi hạ tầng.

### B2. Theo dõi tiến độ viết mới so với kế hoạch 200
- **Đề xuất**: đặt target số script per app (7 app) trong Cài đặt; Dashboard thêm khối "Coverage: x/200 (y%)" và bảng per-app; đánh dấu script mới (<2 cycle đầu) để tuỳ chọn loại khỏi pass rate chính.
- **Giá trị**: quản lý đồng thời 2 trục tiến độ (viết mới + ổn định) trong 1 màn hình; pass rate không bị script mới kéo tụt gây nhiễu.

### B3. Exit criteria cấu hình được cho trạng thái "Done"
- **Đề xuất**: "Done" = Pass N cycle liên tiếp trên mọi model (N cấu hình, mặc định 2) thay vì chỉ nhìn cycle gần nhất.
- **Giá trị**: tránh flaky lọt qua thành "Done" rồi quay lại danh sách lỗi — pass rate báo cáo ổn định, đáng tin hơn.

### B4. So sánh tuần-với-tuần trong Dashboard
- **Đề xuất**: view "Báo cáo tuần" gom sẵn: pass rate đầu/cuối tuần, số fix trong tuần, reopen rate, biến động per-suite so tuần trước.
- **Giá trị**: phục vụ trực tiếp mẫu báo cáo tuần, khỏi đối chiếu 2 file Excel.

### B5. Audit log thao tác nguy hiểm
- **Đề xuất**: bảng log (ai, làm gì, khi nào) cho các thao tác sửa/xoá ở trang admin và đổi danh mục.
- **Giá trị**: nhiều người dùng chung, có xoá/sửa bulk — cần truy vết khi số liệu bất thường.

## Nhóm C — Nền tảng / kỹ thuật

### C1. Deploy ổn định trên máy chủ nội bộ
- Chuyển từ Flask dev server trên máy cá nhân → máy nội bộ cố định chạy 24/7 với WSGI server (waitress/gunicorn) + tự khởi động cùng máy. Dữ liệu không còn phụ thuộc "máy lead có bật không".

### C2. Siết bảo mật trang admin
- Đã có hệ thống login/phân quyền (07/2026), nhưng `/admin/<ADMIN_SECRET_KEY>` vẫn vào thẳng bằng URL key hardcode — bất kỳ ai biết key là toàn quyền xoá dữ liệu. Đề xuất: yêu cầu đăng nhập role admin cho trang admin (giữ key như lớp phụ nếu muốn); bắt buộc đổi mật khẩu mặc định `abc123` ở lần đăng nhập đầu.

### C3. Gỡ file dữ liệu sống ra khỏi git (khẩn cấp nhất nhóm C)
- **Hiện tại**: `tracker.db` và `users.db` đang được commit và push lên GitHub — `users.db` chứa password hash của toàn bộ tài khoản, `tracker.db` là dữ liệu sản xuất. Kể cả repo private, đây vẫn là rủi ro: lộ dữ liệu nếu quyền repo thay đổi, và file binary gây conflict/ghi đè nhầm dữ liệu sống khi merge.
- **Đề xuất**: thêm `tracker.db`, `users.db` vào `.gitignore` + `git rm --cached` 2 file này; backup DB đi đường riêng (A5), không đi qua git. Cân nhắc đổi toàn bộ mật khẩu mặc định sau khi gỡ.

### C4. Đồng bộ tài liệu nội bộ với hiện trạng
- `CLAUDE.md` còn ghi "dự án chưa khởi tạo git" trong khi repo đã ở trên GitHub; giữ thói quen commit mốc trước mỗi lần sửa code để rollback được khi cập nhật lỗi.

### C5. Bộ smoke test tối thiểu
- Hiện không có test nào cho chính tracker (~3300 dòng `app.py`). Đề xuất bộ smoke test nhỏ (pytest + Flask test client, DB tạm): login, nhập kết quả mẫu, dashboard trả đủ KPI, ghi nhận fix, phân quyền 403. Chạy tay trước mỗi lần deploy bản sửa.
- **Giá trị**: hệ thống này giờ là nguồn số liệu báo cáo chính thức — nó hỏng âm thầm thì báo cáo sai theo.

## Lộ trình gợi ý

| Giai đoạn | Hạng mục | Kết quả |
|---|---|---|
| Tuần 1–2 | A5 (backup), C2 (admin auth), C3 (README) | An toàn dữ liệu + đúng hiện trạng |
| Tuần 3–4 | A3 (root cause chuẩn), A2 (flaky) | Pareto & fix-tracking sắc bén |
| Tuần 5–6 | A1 (auto ingest), A4 (auto report) | Bỏ thao tác thủ công hàng ngày |
| Sau đó | B1 (farm module), B2, B3, B4, C1, C5 | Nâng nền tảng dài hạn |
