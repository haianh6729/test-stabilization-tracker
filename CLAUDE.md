# CLAUDE.md

File này hướng dẫn Claude Code (claude.ai/code) khi làm việc với code trong repo này.

## Tổng quan dự án

Đây là ứng dụng web nội bộ chạy trong mạng LAN, dùng cho team QA để theo dõi "test stabilization" — tức là theo dõi các test tự động bị fail/flaky qua từng "cycle" (đợt chạy test), gán người fix, xác nhận fix có thực sự hiệu quả không, và xuất báo cáo/dashboard. Chi tiết nghiệp vụ đầy đủ (quy trình nhập kết quả, ghi nhận fix, bảng ưu tiên, handover...) nằm trong [README.md](README.md) — README viết bằng tiếng Việt và là nguồn tham khảo chính cho nghiệp vụ.

Dự án hiện **chưa khởi tạo git**.

## Kiến trúc & stack

- Backend: Python + Flask (`Flask>=3.0`), dùng thẳng module `sqlite3` (không ORM).
- Frontend: HTML/CSS/JS thuần, không build step, không npm. Chart.js được vendor sẵn tại `static/chart.min.js` (không load qua CDN dù README ghi vậy).
- Xuất Excel: `openpyxl`.
- Toàn bộ dependency nằm trong `requirements.txt` (chỉ 2 package).

### Gần như toàn bộ logic nằm trong 1 file duy nhất: `app.py` (~2100 dòng)

Thứ tự trong file, từ trên xuống:
1. Config/constants (đầu file) — bao gồm 2 secret hardcode, xem mục Gotcha bên dưới.
2. DB helpers + `init_db()` — tạo schema và chạy **migration inline** mỗi lần khởi động (xem Gotcha).
3. Logic nghiệp vụ thuần (không phải route) — `classify_result`, `derive_test_suite`, `compute_root_cause_pareto`, `compute_cycle_trend`, `extract_date_from_test_id` (parse `YYMMDD` từ đầu Test ID để suy ra cycle), v.v.
4. ~40 route `/api/*` — models, owners, test_suites, results, fixes, priority, fix-tracking, assignments, handover, dashboard, export (csv/excel)...
5. Route `/admin/<secret_key>` — trang debug cho phép CRUD thẳng vào bảng `results`, đi vòng qua validate thông thường.
6. `if __name__ == "__main__":` — gọi `init_db()` rồi `app.run(host="0.0.0.0", port=5000, threaded=True)`.

### Frontend

- `templates/index.html` — UI dạng tab đơn trang (dashboard, nhập kết quả, ghi nhận fix, bảng ưu tiên, so sánh cycle, theo dõi fix, cài đặt).
- `templates/admin.html` — trang admin/debug, được bảo vệ bằng `ADMIN_SECRET_KEY` trong URL (không phải auth thật).
- `static/app.js` — toàn bộ logic frontend: wrapper `api()` để fetch, hệ thống bảng sort/filter dùng chung (các hàm `tt*`), parser cho dữ liệu paste dạng tab-delimited (`parsePaste`, `tokenizeDelimited`), dashboard tự refresh theo polling ~15s.
- `static/style.css`, `static/chart.min.js`.

### Dữ liệu

- `tracker.db` — **file SQLite chứa dữ liệu thật đang dùng, không phải file mẫu/fixture**. Không xoá, không ghi đè, không tạo lại tuỳ tiện. Muốn backup chỉ cần copy file này.
- `test_data/*.txt`, `test-script.txt` — dữ liệu mẫu dạng tab-delimited để paste thử vào tab "Nhập kết quả" khi test tay.

## Lệnh chạy / dev

```
pip install -r requirements.txt
python app.py        # chạy tại 0.0.0.0:5000
```

- **Không có test tự động, không có linter/formatter, không có build step nào cả.**
- Cách "test" hiện tại là chạy server rồi paste thủ công một file trong `test_data/` vào tab "Nhập kết quả" trên UI, hoặc gọi trực tiếp các endpoint `/api/*` bằng `curl`.

## Các điểm cần lưu ý (quan trọng)

- **Secret hardcode trong `app.py`**: `SUBMIT_PASSWORD` và `ADMIN_SECRET_KEY` được viết thẳng dạng plaintext trong code, không qua biến môi trường hay file config. Đây là điểm yếu bảo mật đã biết (README cũng nói rõ app không có cơ chế đăng nhập/authentication). Không tự ý di chuyển/expose thêm các secret này, và không tự "sửa" theo hướng thêm hệ thống env/config nếu người dùng chưa yêu cầu.
- **Migration chạy inline mỗi lần start**: `init_db()` vừa tạo schema vừa chạy các bước migrate (ALTER TABLE có try/except, backfill cột, recompute cycle, dedupe fix trùng...) mỗi lần app khởi động — đây là hệ thống migration tự chế, không dùng Alembic hay tool tương tự. Khi cần đổi schema, hãy thêm một bước migration mới idempotent vào đây, **không sửa trực tiếp/phá vỡ câu `CREATE TABLE`** đã có.
- **`tracker.db` là dữ liệu sống**: chứa lịch sử thật, không phải fixture — xử lý cẩn thận, không xoá/ghi đè tuỳ tiện.
- **Chưa có `.gitignore`**: nếu sau này khởi tạo git, cần loại `__pycache__/` và cân nhắc kỹ với `tracker.db` (hỏi người dùng trước khi quyết định commit hay ignore).
- **Tiếng Việt là chủ đích**: text hiển thị UI và một số comment cố tình dùng tiếng Việt — không tự "sửa lỗi chính tả" hay dịch sang tiếng Anh. Tên biến/hàm/route giữ tiếng Anh như hiện trạng.
- **Route `/admin/<secret_key>`** là một đường CRUD song song, bỏ qua validate thông thường — cần lưu ý khi đụng vào logic auth hoặc toàn vẹn dữ liệu.
- **Không có test suite** — cách xác minh thay đổi duy nhất hiện nay là test tay qua UI (paste file mẫu) hoặc gọi API bằng curl.

## Quy ước code quan sát được (không có tool enforce)

- Python: snake_case, thụt lề 4 space, SQL viết dạng triple-quoted string với `?` parameterization (không ORM/query builder).
- JS: ES6+ (`async`/`await`, arrow function), không dùng module system, tất cả nằm trong 1 file global `app.js`.
