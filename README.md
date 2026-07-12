# Test Stabilization Tracker — Local Web App

Ứng dụng web nhỏ chạy ngay trên máy bạn (không cần internet, không cần cloud).
Cả team truy cập qua trình duyệt trong cùng mạng LAN/Wifi để cùng nhập dữ liệu real-time.

## Kiến trúc

- **Backend**: Python + Flask, lưu dữ liệu vào 2 file SQLite:
  - `tracker.db` — dữ liệu nghiệp vụ (results, fixes, assignments, owners, models, test suites, v.v.)
  - `users.db` — tài khoản + mật khẩu hash (login system)
- **Frontend**: HTML/CSS/JS thuần (Chart.js vendor) — không cần cài Node/npm.
- **Auth**: Session-based login, 3 roles (admin/moderator/user), per-tab permissions.
- Mọi người mở trình duyệt trỏ vào máy bạn, dữ liệu đổ thẳng vào database dùng chung, dashboard tự refresh mỗi 15 giây.

## Cài đặt (làm 1 lần)

Cần có Python 3.9+ (kiểm tra bằng `python3 --version` hoặc `python --version`).

```bash
cd test_stabilization_app
pip install -r requirements.txt
```

(Nếu máy có nhiều phiên bản Python, dùng `pip3 install -r requirements.txt`)

## Chạy server

```bash
python app.py
```

Bạn sẽ thấy:
```
Test Stabilization Tracker dang chay!
May nay:        http://localhost:5000
May khac trong LAN: http://<IP-may-ban>:5000
```

- Trên chính máy bạn: mở trình duyệt vào `http://localhost:5000` → **chuyển hướng `/login`** để đăng nhập
- **Login mặc định**: username = bất kỳ active owner nào, password = `abc123` (mặc định). Admin: username `anh.hh`, password `abc123`
- Để đồng nghiệp trong cùng mạng Wifi/LAN văn phòng truy cập được: tìm địa chỉ IP máy bạn:
  - Windows: mở CMD, gõ `ipconfig`, tìm dòng "IPv4 Address" (VD: 192.168.1.23)
  - Mac/Linux: mở Terminal, gõ `ifconfig` hoặc `ip a`, tìm địa chỉ dạng 192.168.x.x
  - Gửi cho team địa chỉ: `http://<IP đó>:5000` (ví dụ `http://192.168.1.23:5000`) — họ sẽ thấy `/login`
- **Admin Panel**: `/admin/<ADMIN_SECRET_KEY>` (hardcoded, không cần login) — CRUD người dùng, owner, team, dữ liệu
- Máy bạn phải **đang bật và chạy `python app.py`** thì người khác mới truy cập được — tắt máy hoặc tắt terminal là server dừng.
- Nếu đồng nghiệp không vào được, kiểm tra Firewall của Windows/Mac có đang chặn cổng 5000 không (cho phép Python/Flask qua tường lửa mạng riêng).

Để dừng server: bấm `Ctrl + C` trong terminal đang chạy.

## Cách dùng

**Tabs chính** (8 cái, ẩn/hiển thị theo quyền):
- 📊 Dashboard
- 📝 Script viết mới
- 📥 Nhập kết quả
- 🛠️ Ghi nhận Fix
- 📋 Bảng ưu tiên
- 📈 So sánh Cycle
- 🔬 Theo dõi Fix
- ⚙️ Cài đặt

### Chi tiết từng tab

1. **Nhập kết quả** (tab 📥): dán dữ liệu **6 cột** (Test ID, Model, Test suite, Test Case, State, Description) hoặc **8 cột** (Request ID, Model, Test Suite, Test Case, State, Description, Author, Team) copy thẳng từ Excel/SDF export, bấm Gửi. Ai cũng làm được, không giới hạn 1 người.
   - **Test Suite / Test Case tự chuẩn hoá**: cột thô có thể là đường dẫn đầy đủ (`Internet/test suite/Internet_ui90_part4.ts`) hoặc tên file (`Browser_000118.py`) — hệ thống tự suy ra đúng Test Suite (theo tiền tố tên Test Case: Browser/Internet→Internet, Keyboard/SKBD→Keyboard, Weather, Wallpaper, SM→SamsungMember, Reminder, NowBrief→Now-brief) và Test Case (`Browser_000118`).
   - **Cycle tự động theo ngày trong Test ID**: KHÔNG cần nhập cycle thủ công. Test ID mã hoá ngày tạo ở 6 số đầu (`260706-...` = 06/07/2026). Các Test ID **cùng ngày = cùng 1 cycle**; ngày sau = cycle kế tiếp; đánh số tăng dần theo thời gian. (Test ID không có mã ngày thì dùng ngày chạy nhập tay làm dự phòng.)
   - **State RUNNING bị bỏ qua** (chưa chạy xong); **EXCEPTION tính là Fail**; nhận đúng cả PASS/FAIL viết hoa.
   - **Author = Owner của script**: tự đăng ký vào danh sách Owner (kèm Team) và tự gán "đang phụ trách" trong Bảng ưu tiên.
2. **Script viết mới** (tab 📝): quản lý danh sách script mới được viết, chưa đưa vào test suite chính. Thêm, sửa, xoá script; nhãn trạng thái (pending/in-progress/completed, v.v.); liên kết tới ticket/PR; ghi chú lý do viết.

3. **Ghi nhận Fix** (tab 🛠️): **chọn trực tiếp script đang fail** từ danh sách (có ô lọc nhanh) — hệ thống tự điền Test suite / Test Case / các Model đang lỗi / Fixed_after_cycle. Hoặc bấm "Nhập tay" để gõ tự do. **Bắt buộc nhập Root cause (nguyên nhân gốc của lỗi)** — không có sẽ không ghi nhận được. Sau khi ghi nhận, xem tab 🔬 Theo dõi Fix để biết kết quả.
4. **Bảng ưu tiên** (tab 📋): **xếp hạng #1, #2... theo Điểm ưu tiên = Tổng lần Fail × Số model từng fail** (tính trên TẤT CẢ model & TẤT CẢ cycle) — test case lỗi nhiều & rộng nhất lên đầu để fix trước. Có cột Tổng Fail, Số model fail, nhãn P0-P3 (độ rộng lỗi hiện tại), cột **Team** (nhóm nhỏ của người đang phụ trách), chi tiết Pass/Fail từng model, nút **"🔍 N Fail"** mở danh sách từng lần fail kèm **Test ID** (click copy để tra trên test farm), và cột "Đang phụ trách" + nút "Gán người". **Mỗi cột có ô filter riêng** (gõ để lọc realtime, kết hợp AND), sort, xuất Excel/CSV bất kỳ lúc nào.

5. **So sánh Cycle** (tab 📈): so sánh pass rate giữa các cycle — dạng heatmap hoặc biểu đồ xu hướng.

6. **Theo dõi Fix** (tab 🔬): mỗi lần fix đã ghi nhận được đối chiếu với các lần chạy **SAU** cycle fix, tự phân loại 4 trạng thái: ✅ **Đã hết lỗi** (chạy lại Pass & giữ nguyên) · ⚠️ **Hết rồi fail lại** (Pass ngay sau fix nhưng cycle sau tái lỗi) · ❌ **Chưa hết lỗi** (ngay sau fix vẫn Fail) · ⏳ **Chờ dữ liệu** (chưa có lần chạy sau fix). Có KPI tổng hợp + lọc theo owner/trạng thái. Đây là nơi đánh giá test case lỗi đã thực sự cải thiện chưa.

7. **Dashboard** (tab 📊): KPI, biểu đồ xu hướng, root cause pareto, biểu đồ so sánh Resolution Rate theo owner và % hoàn thành theo test suite, bảng xếp hạng Owner Leaderboard đầy đủ KPI, cùng phần "Nhận định tự động" (rule-based, dựa trên số liệu thực tế — không phải AI phân tích sâu, chỉ là các cảnh báo ngưỡng đơn giản như model yếu nhất, nguyên nhân lỗi phổ biến nhất, tốc độ fix có bám kịp mục tiêu không).

8. **Cài đặt** (tab ⚙️): đặt Target Pass Rate và Deadline; quản lý 4 danh mục dùng chung cho cả team:
   - **Test Suite**: thêm mới, đổi tên, xoá (nếu chưa có kết quả nào dùng).
   - **Model điện thoại**: thêm mới, đổi tên — dùng khi 1 model bị thay thế bằng model khác trong dự án (đổi tên giữ nguyên toàn bộ lịch sử kết quả cũ, chỉ đổi nhãn hiển thị).
   - **Owner + Team**: mỗi thành viên thuộc 1 **Team** (nhóm nhỏ, thường đặt theo tên team-lead). Team **tự động điền từ cột Team khi nhập kết quả** (Author → Owner + Team); có thể chỉnh tay bằng nút "Đổi Team". Ngoài ra: thêm mới (kèm team), đổi tên (chỉ dùng khi CÙNG 1 người — giữ nguyên team & lịch sử fix), hoặc "Ngừng hoạt động" nếu người đó rời dự án.
   - **Chuyển giao công việc**: khi nhân sự nghỉ và người khác tiếp quản — xem mục riêng bên dưới.
   - Các danh mục này cũng tự động ghi nhận thêm khi có suite/model/owner mới xuất hiện qua việc nhập kết quả hoặc ghi nhận fix — không bắt buộc phải khai báo trước.

## Tài khoản & Quyền hạn

Kể từ 2026-07-11, hệ thống có login system + per-tab permissions:

- **3 roles**: admin (quản trị), moderator (điều hành), user (thành viên)
- **Admin panel** (`/admin/<ADMIN_SECRET_KEY>`): CRUD tài khoản, đổi role, reset password, quản lý owner & team
- **Mật khẩu mặc định**: `abc123` (dùng cho admin seed lần đầu, reset tài khoản, auto-create owner)
- **Auto-create account**: owner mới xuất hiện → tự tạo tài khoản (không cần đăng ký thủ công)
- **Per-tab permissions**: admin/moderator có toàn quyền 8 tabs, user mặc định không access "Nhập kết quả" + "Cài đặt" (có thể custom)
- **Polling 15s**: frontend tự động re-sync permissions nếu admin đổi quyền

## Bàn giao công việc khi nhân sự thay đổi (A nghỉ, B tiếp quản)

Hệ thống tách biệt 2 khái niệm để không bao giờ mất lịch sử:
- **Lịch sử fix** (bảng Daily_Fix_Log): ghi lại CHÍNH XÁC ai đã fix gì, khi nào — không bao giờ bị ghi đè, kể cả khi người đó rời dự án.
- **Người đang phụ trách** (assignment): chỉ là một "con trỏ" cho biết hiện tại ai nên làm tiếp script đó — có thể đổi bất cứ lúc nào mà không ảnh hưởng tới lịch sử.

Quy trình khi A nghỉ, B tiếp quản:
1. Vào tab ⚙️ Cài đặt → mục "Danh sách Owner" → bấm "Ngừng hoạt động" cho A (giữ nguyên lịch sử, chỉ ẩn A khỏi danh sách chọn cho lần sau).
2. Vào mục "🔄 Chuyển giao công việc" → chọn A ở "Từ", nhập tên B ở "Sang" → bấm Chuyển giao.
3. Hệ thống tự động chuyển **toàn bộ script mà A đang phụ trách và CÒN LỖI (chưa Done)** sang cho B. Các script A đã fix xong trước đó (Done) không cần chuyển, và **toàn bộ lịch sử "A đã fix được bao nhiêu, hết lỗi bao nhiêu" trong Owner Leaderboard vẫn giữ nguyên chính xác** — không bị gán nhầm công cho B.
4. B tiếp tục ghi nhận các lần fix MỚI dưới tên của chính mình ở tab 🛠️ Ghi nhận Fix.

⚠️ Không dùng chức năng "Đổi tên" cho trường hợp này — đổi tên là để sửa tên của CÙNG một người, dùng sai sẽ khiến lịch sử của A bị gán nhầm hoàn toàn sang tên B.

## Owner Leaderboard — KPI cá nhân

Trong tab Dashboard và trong file Excel xuất ra, có bảng xếp hạng theo 2 chỉ số chính:
- **Resolution Rate** = số script khác nhau mà người đó từng fix và NAY ĐÃ HẾT LỖI HOÀN TOÀN trên mọi model / tổng số script khác nhau người đó từng fix. Đây là KPI phản ánh đúng nhất "chất lượng fix thực sự", không chỉ đếm số lần thao tác.
- **Verification Rate** = trong các lần fix đã có dữ liệu cycle sau để đối chiếu, bao nhiêu % được xác nhận đúng ngay lần đầu (không bị fail lại/reopen).
- **Open Workload** = số script đang được gán cho người đó mà vẫn còn lỗi (dùng để cân bằng khối lượng công việc).

## Xuất Excel — báo cáo song song, dự phòng khi hệ thống không dùng được

Nút "⬇️ Xuất Excel" ở tab Bảng ưu tiên tạo ra file `Test_Stabilization_Tracker_<ngày giờ>.xlsx` đầy đủ 8 sheet: Instructions, Dashboard (có biểu đồ), Script_Priority_Tracker (kèm chi tiết theo từng model), Owner_Leaderboard, RootCause_Pareto, Test_Suite_Summary, Daily_Fix_Log, History_Log.

Khác với bản Excel dùng công thức trước đây, mọi giá trị trong file này là **số liệu thực tế đã được tính sẵn** (không phải công thức) — nên mở bằng bất kỳ Excel/LibreOffice nào cũng đọc đúng ngay, không lo lỗi công thức. Nên xuất file này định kỳ (VD: cuối mỗi ngày/mỗi cycle) để lưu trữ báo cáo và làm phương án dự phòng: nếu máy chủ gặp sự cố, có thể tạm thời ghi tay vào 2 sheet History_Log/Daily_Fix_Log (đúng định dạng cột) rồi nhập lại vào hệ thống khi hoạt động trở lại.

## Lưu ý về bảo mật

- **Login system**: Hệ thống hiện có session-based login với 3 roles + per-tab permissions. Cần đăng nhập để truy cập main app.
- **Admin panel gating**: `/admin/<ADMIN_SECRET_KEY>` — không cần login nhưng cần biết secret key (hardcoded). Phù hợp cho admin nội bộ; nếu cần tăng cường bảo mật, có thể đổi key ở `app.py` (constant `ADMIN_SECRET_KEY`).
- **Hardcoded secrets**: `ADMIN_SECRET_KEY`, `DEFAULT_RESET_PASSWORD`, Flask session key hiện tại là plaintext ở code (tính năng bảo mật cơ sở). Nếu cần production-grade, có thể migrate sang env vars.
- **Phù hợp cho**: team nội bộ tin cậy lẫn nhau trong mạng văn phòng; không phù hợp nếu cần kiểm soát tuyệt đối hoặc truy cập từ ngoài internet.

## Sao lưu / di chuyển dữ liệu

Dữ liệu nằm trong 2 file SQLite:
- **`tracker.db`** — dữ liệu nghiệp vụ (results, fixes, assignments, owners, models, test suites, v.v.)
- **`users.db`** — tài khoản + mật khẩu hash

Muốn backup, chỉ cần copy cả 2 file này.
Muốn xuất dữ liệu ra Excel để lưu trữ hoặc gửi báo cáo: dùng nút "Xuất Excel" ở tab Bảng ưu tiên.

## Giới hạn cần biết

- Đây là server chạy trên 1 máy cá nhân (không phải server doanh nghiệp) — phù hợp cho team ~20 người dùng nội bộ trong giờ làm việc, dữ liệu chỉ tồn tại khi máy bạn bật và server đang chạy.
- Nếu cần dùng lâu dài/ổn định hơn (chạy 24/7, nhiều người dùng hơn, hoặc truy cập từ ngoài văn phòng), nên cân nhắc host trên 1 máy chủ nội bộ cố định hoặc dịch vụ cloud nhỏ (VD: PythonAnywhere, Render, VPS nội bộ công ty) — mã nguồn hiện tại vẫn dùng được, chỉ cần deploy đúng cách.
- Dashboard tự refresh mỗi 15 giây (gần-real-time), không phải cập nhật tức thời từng giây.
- Hệ thống đơn file `app.py` (~3300 dòng) — dễ bảo trì + tuỳ chỉnh nhưng không hỗ trợ architecture phức tạp.
- Không có unit test hay CI/CD — test tay qua UI hoặc curl endpoint.

## Công nghệ

- **Backend**: Python 3.9+, Flask 3.0+, sqlite3 (no ORM)
- **Frontend**: HTML/CSS/JS thuần (ES6+, no framework)
- **Export**: openpyxl
- **Dependencies**: chỉ 2 package chính (`Flask`, `openpyxl`)
- **Không có**: Node/npm, build step, database ORM, email/SMS, external API calls
