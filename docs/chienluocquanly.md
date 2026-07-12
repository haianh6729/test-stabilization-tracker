# Chiến lược quản lý Test Stabilization — 200 test case × 7 ứng dụng Android

Mục tiêu: **Pass rate ≥ 85%** trên toàn bộ model, tiến độ viết script bám kế hoạch, chất lượng fix cao (fix một lần là hết lỗi, không tái phát).

Tài liệu này mô tả cách dùng hệ thống Test Stabilization Tracker như một "hệ điều hành" cho việc quản lý hàng ngày. Mẫu báo cáo ở [mau-bao-cao.md](mau-bao-cao.md), đề xuất nâng cấp hệ thống ở [de-xuat-cai-tien.md](de-xuat-cai-tien.md).

---

## 1. Thiết lập ban đầu (làm 1 lần)

1. **Tab ⚙️ Cài đặt**:
   - Đặt **Target Pass Rate = 0.85** và **Deadline** của dự án. Hệ thống sẽ tự tính: số script được phép còn lỗi, số script phải fix thêm (`fails_to_fix`), và **tốc độ fix cần thiết mỗi ngày** (`required_rate_per_day`) — đây là con số điều hành quan trọng nhất.
   - Chuẩn hoá danh mục: 7 Test Suite (tương ứng 7 app: Internet, Keyboard, Weather, Wallpaper, SamsungMember, Reminder, Now-brief), danh sách Model điện thoại, Owner + Team.
2. **Quy ước với team về Root cause**: thống nhất một bộ nhóm nguyên nhân chuẩn khi ghi nhận fix, ví dụ:
   - `Locator/UI change` — app đổi UI, element không tìm thấy
   - `Timing/Sync` — thiếu wait, race condition
   - `Test data` — dữ liệu test sai/hết hạn
   - `Infra/Device` — lỗi test farm, device treo, mất mạng (KHÔNG phải lỗi script)
   - `App bug` — lỗi thật của ứng dụng
   - `Script logic` — lỗi logic trong script
   - Viết root cause bắt đầu bằng nhóm này (VD: `Timing/Sync - thiếu wait sau khi mở settings`) để Pareto gom nhóm chính xác — Pareto chỉ hữu ích khi root cause được viết nhất quán.
3. **Quy ước Định nghĩa "hết lỗi" (exit criteria)**: một script chỉ coi là ổn định khi **Pass 2 cycle liên tiếp trên tất cả model**. Tab 🔬 Theo dõi Fix chính là công cụ kiểm chứng điều này (trạng thái ✅ Đã hết lỗi vs ⚠️ Hết rồi fail lại).

## 2. Nhịp vận hành hàng ngày (theo cycle)

Mỗi cycle = 1 ngày chạy trên test farm. Vòng lặp chuẩn:

| Thời điểm | Việc | Tab / công cụ |
|---|---|---|
| Sáng, sau khi farm chạy xong | Export kết quả từ SDF/test farm → dán vào hệ thống (cycle tự tính theo ngày trong Test ID; RUNNING bỏ qua, EXCEPTION = Fail) | 📥 Nhập kết quả |
| Standup 15 phút | Mở Dashboard: đọc pass rate cycle mới vs cycle trước (delta fail), **Nhận định tự động**, model yếu nhất, top root cause | 📊 Dashboard |
| Ngay sau standup | Rà Bảng ưu tiên: **mọi P0 (fail 4–5 model) phải có người phụ trách trong ngày**; gán tiếp P1 theo năng lực còn trống | 📋 Bảng ưu tiên |
| Trong ngày | Owner fix script; dùng nút "🔍 N Fail" lấy Test ID để tra log trên test farm | 📋 + test farm |
| Cuối ngày | Owner **ghi nhận fix kèm root cause** (bắt buộc, đúng quy ước nhóm nguyên nhân) | 🛠️ Ghi nhận Fix |
| Cuối ngày (lead) | Kiểm tra Theo dõi Fix của cycle trước: xử lý ngay các ⚠️ "Hết rồi fail lại" và ❌ "Chưa hết lỗi"; **Xuất Excel lưu snapshot** | 🔬 + ⬇️ Xuất Excel |

Nguyên tắc điều hành:

- **Fix theo root cause, không fix lẻ tẻ**: khi Pareto cho thấy 1 nguyên nhân chiếm >20–30% tổng lỗi, tổ chức "batch-fix" — 1 người fix gốc (VD: sửa hàm wait chung), sau đó verify cả loạt script liên quan trong cycle kế tiếp. Đây là đòn bẩy lớn nhất để kéo pass rate lên nhanh.
- **Điểm ưu tiên = Tổng Fail × Số model fail** — tin vào bảng xếp hạng, đừng để owner tự chọn script "dễ" fix trước. P0 → P1 → P2 → P3.
- **Phân biệt lỗi script vs lỗi farm**: fail hàng loạt trên đúng 1 model / 1 khung giờ thường là lỗi device/hạ tầng. Ghi root cause `Infra/Device`, không tính là chất lượng script kém, và xử lý phía farm (xem mục 5).

## 3. Nhịp hàng tuần

- **Họp tuần (30–45'), dựa trên Dashboard + Excel export**:
  1. Xu hướng pass rate theo cycle — đang bám mốc ramp-up chưa (xem mục 4)?
  2. Tốc độ fix thực tế vs `required_rate_per_day` — thiếu thì thêm người hoặc batch-fix.
  3. Root cause Pareto — chọn 1–2 nhóm nguyên nhân làm "chiến dịch" tuần sau.
  4. Owner Leaderboard — xem mục KPI cá nhân bên dưới.
  5. Suite/app nào tụt lại (done% thấp nhất) — điều phối người giữa các team.
- **Review chất lượng fix**: ai có nhiều fix ⚠️ "Hết rồi fail lại" → pair-review cách fix (thường là fix triệu chứng thay vì fix gốc, hoặc thiếu verify local trước khi ghi nhận).

## 4. Mốc kiểm soát pass rate (ramp plan)

Đặt mốc trung gian thay vì chỉ nhìn đích 85% — ví dụ với baseline hiện tại X%:

| Tuần | Mục tiêu pass rate | Trọng tâm |
|---|---|---|
| 1 | Baseline + ổn định quy trình nhập liệu | Gán hết P0, chuẩn hoá root cause |
| 2–3 | +5–7%/tuần | Batch-fix theo top Pareto |
| 4–5 | Tiệm cận 80% | Diệt flaky (script pass/fail xen kẽ) |
| 6+ | **≥85% và giữ vững 2 tuần** | Chỉ còn P2/P3 + lỗi app thật |

Lưu ý: giai đoạn cuối tăng chậm hơn nhiều so với giai đoạn đầu (lỗi còn lại là lỗi khó). Nếu 2 cycle liên tiếp `delta_fail > 0` (lỗi tăng) → dừng lại tìm regression: app build mới? farm đổi cấu hình? script mới thêm gây lỗi?

## 5. Quản lý test farm gắn với hệ thống

Hệ thống hiện chưa có module farm riêng (xem đề xuất cải tiến), nhưng vận hành được ngay bằng quy ước:

- **Trước mỗi cycle**: kiểm tra đủ device cho tất cả model đang track; device thiếu/treo → ghi lại (mẫu báo cáo có mục này).
- **Sau mỗi cycle**: so sánh số kết quả nhận được vs số script dự kiến chạy — thiếu tức là có run treo/không hoàn thành. RUNNING sót lại nhiều là dấu hiệu farm nghẽn.
- **Dấu hiệu lỗi farm cần nhận diện nhanh** (để không phí công fix script): 1 model fail đồng loạt bất thường (Dashboard "model yếu nhất" tụt sâu); nhiều suite khác nhau cùng fail 1 kiểu; pass rate rớt đột ngột toàn cục.
- **Fail do farm** → ghi nhận fix với root cause `Infra/Device` để Pareto tách được "% lỗi do hạ tầng" — chỉ số này đưa vào báo cáo tuần.
- Theo dõi ngoài hệ thống (tạm bằng sheet, chờ nâng cấp): device availability %, số run phải re-run, thời gian chạy hết 1 cycle, downtime.

## 6. KPI cá nhân & quản lý con người

Từ Owner Leaderboard (Dashboard + sheet Owner_Leaderboard):

| KPI | Ý nghĩa | Ngưỡng gợi ý |
|---|---|---|
| Resolution Rate | % script từng fix nay đã hết lỗi hoàn toàn trên mọi model — chất lượng thật | ≥ 70% |
| Verification Rate | % fix được xác nhận đúng ngay lần đầu (không reopen) | ≥ 80% |
| Open Workload | Số script còn lỗi đang được gán | ≤ 8–10 script/người |

Cách dùng đúng: KPI để **điều phối và huấn luyện**, không phải để phạt — nếu dùng để phạt, team sẽ né ghi nhận fix hoặc ghi root cause qua loa, và dữ liệu hỏng ngay. Người Resolution Rate thấp → xem root cause họ hay gặp là gì, ghép cặp với người mạnh mảng đó. Open Workload lệch → dùng "Gán người" cân lại. Nhân sự nghỉ → làm đúng quy trình Chuyển giao (ngừng hoạt động + chuyển giao, KHÔNG đổi tên).

## 7. Theo dõi tiến độ viết mới (đủ 200 script)

- Mọi script viết mới ghi vào tab **Script viết mới** ngay khi hoàn thành (kèm suite/model/lý do/link).
- Tiến độ = số script đã có kết quả chạy + số trong new_scripts, so với kế hoạch 200, chia theo 7 app. Báo cáo tuần luôn có dòng "x/200 (y%)" và app nào đang chậm.
- Script mới chạy cycle đầu thường fail nhiều — tách riêng khi đọc pass rate ("pass rate không tính script mới trong 2 cycle đầu" là cách đọc công bằng hơn; hiện phải tự lọc, xem đề xuất cải tiến).

## 8. Kỷ luật dữ liệu (điều kiện để mọi thứ trên hoạt động)

1. Nhập kết quả **ngay trong buổi sáng** sau cycle — nhập muộn làm Theo dõi Fix xếp nhầm trạng thái.
2. **Không có fix nào không ghi nhận** — fix xong mà không ghi = Leaderboard và fix-tracking sai.
3. Root cause đúng quy ước nhóm ở mục 1.
4. Xuất Excel cuối mỗi ngày + copy `tracker.db`, `users.db` ra nơi lưu trữ (backup).
5. Quản lý tài khoản: owner mới tự có account (mật khẩu mặc định `abc123`) — nhắc đổi mật khẩu ngay lần đầu đăng nhập.
