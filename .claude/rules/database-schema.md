# Database Schema & Migrations

Hai file SQLite riêng, schema tự định nghĩa, migration inline mỗi lần start.

## `tracker.db` (Dữ liệu nghiệp vụ)

**Live data file** — chứa lịch sử thực tế, không xoá/reset tuỳ tiện. Backup = copy file.

### Bảng chính

- **results**: Cycle × Test Suite × Test Case × Model × Result (pass/fail/...). Columns: cycle, test_suite, test_case, model, state, result, author (Owner), team, submitted_by, submission_date.
- **fixes**: Ghi nhận fix (owner, test_suite, test_case, model_fixed, root_cause, fix_date, link, fix_status, fixed_after_cycle).
- **assignments**: Gán script/owner hiện tại (test_suite, test_case, owner, assigned_date). PK: (test_suite, test_case).
- **owners**: Danh sách owner + team (name PK, active, team). Soft-delete via `active=0`.
- **priority**: Bảng ưu tiên tính toán (test_suite, test_case, rank, ...).
- **models**: Danh sách model (name PK, active).
- **test_suites**: Danh sách test suite (name PK, active).
- **settings**: Key-value config (key PK, value).
- **new_scripts**: Script viết mới (test_suite, test_case, model, reason, link, item_id).

### Migration pattern

`init_db()` chạy mỗi lần start → idempotent:
- `CREATE TABLE IF NOT EXISTS` — không ghi đè schema có sẵn
- `ALTER TABLE ... ADD COLUMN` wrapped trong `try/except` — nếu cột tồn tại → skip
- Backfill data sau: `UPDATE ... SET ...` khi migration thêm cột mới

**Khi thêm cột mới**: thêm `ALTER TABLE` statement vào `init_db()`, **KHÔNG sửa `CREATE TABLE`** (tránh phá v schema cũ).

## `users.db` (Tài khoản & mật khẩu)

**Live data file** — tách khỏi tracker.db để riêng biệt account. Không xoá/reset tuỳ tiện.

### Bảng chính

- **users**:
  - `username` (TEXT PK): owner name
  - `password_hash` (TEXT): werkzeug hash
  - `role` (TEXT): admin | moderator | user
  - `permissions` (TEXT): CSV tab names (dashboard,input-results,...)
  - `active` (INTEGER): 1 = can login, 0 = locked out
  - `created_at` (TEXT): timestamp

### Migration pattern

`init_users_db()` chạy mỗi lần start → idempotent:
- Tạo users table nếu chưa có
- `ALTER TABLE ... ADD COLUMN` cho optional columns
- Seed/force `anh.hh` admin (luôn giữ admin role + full perms)
- **Backfill**: tạo account cho owner active (không ghi đè tài khoản có sẵn)

## Dữ liệu phụ

- `test_data/*.txt`, `test-script.txt`: sample dữ liệu tab-delimited để paste test, không dùng khi production
- Không có fixture JSON/SQL dump (dùng live DB files)

## Parameterization & Safety

- Toàn bộ SQL dùng `?` parameterization (không string interpolation) → prevent injection
- `sqlite3.Row` factory → truy cập `row["column"]` thay `row[0]`
- Xử lý transaction: `db.commit()` sau mutation, `db.close()` sau xong
