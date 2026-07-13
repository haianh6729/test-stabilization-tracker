# Database Schema & Migrations

Hai file SQLite riêng, schema tự định nghĩa, migration inline mỗi lần start.

## `tracker.db` (Dữ liệu nghiệp vụ)

**Live data file** — chứa lịch sử thực tế, không xoá/reset tuỳ tiện. Backup tự động hằng ngày vào `backups/` (xem mục Backup).

### Bảng chính

- **results**: Cycle × Test Suite × Test Case × Model × Result (pass/fail/...). Columns: cycle, cycle_date, test_id, test_suite, test_case, model, state, description, result, created_by, author (Owner), team.
- **fixes**: Ghi nhận fix (owner, test_suite, test_case, model_fixed, root_cause, **root_cause_group** — nhóm chuẩn từ `ROOT_CAUSE_GROUPS` (mới 2026-07-12; tên nhóm có thể đổi qua Cài đặt, xem key `root_cause_groups` bên dưới), fix_date, note, fixed_after_cycle). Từ 2026-07-13, chi tiết nguyên nhân (`root_cause_detail`) **bắt buộc** khi ghi qua form UI.
- **assignments**: Gán script/owner hiện tại (test_suite, test_case, owner, assigned_date). PK: (test_suite, test_case).
- **owners**: Danh sách owner + team (name PK, active, team). Soft-delete via `active=0`.
- **models**: Danh sách model (name PK, sort_order).
- **test_suites**: Danh sách test suite (name PK, **script_path** — thư mục script của Item trên repo GitHub cho đối chiếu 3 chiều, mới 2026-07-12).
- **settings**: Key-value config (key PK, value). Keys tích hợp mới 2026-07-12: `farm_api_url/token`, `import_token`, `company_api_url/token`, `github_api_base/repo/branch/token`, `flaky_window`, `flaky_min_flips`, `exit_criteria_cycles`, `exclude_new_scripts_cycles`, `backup_enabled/retention`, `last_backup_date`. Token thuộc `SENSITIVE_SETTINGS` → GET trả mask `********`, POST giá trị mask = không đổi. **Mới 2026-07-13**: `root_cause_groups` — JSON list tên nhóm nguyên nhân gốc hiện hành (đọc qua `get_root_cause_groups(db)`; nếu key rỗng → fallback hằng số `ROOT_CAUSE_GROUPS` trong `app.py`). CRUD đầy đủ: `POST /api/lists/root_cause_groups` thêm nhóm mới; `PUT /api/lists/root_cause_groups/<name>` đổi tên (cascade `UPDATE fixes SET root_cause_group=...` + rewrite prefix `"<old> - "` trong `root_cause`); `DELETE /api/lists/root_cause_groups/<name>` xoá — chặn nếu còn fix nào dùng nhóm đó (`SELECT COUNT(*) FROM fixes WHERE root_cause_group=?`) hoặc nếu xoá sẽ làm rỗng danh sách (phải giữ ≥1 nhóm).
- **new_scripts**: Script viết mới (item, tc_id UNIQUE, member, team, assign_week, completed_date, status DONE/SKIP/ASSIGNED, models_written CSV, sdf_id, remark).
- **company_testcases** (mới 2026-07-12): cache TC từ hệ thống công ty (tc_id PK, item, status, raw, source 'api'|'manual', synced_at). Nguồn tổng số TC cần script (SKIP không tính); "Performed" = xong bên công ty.
- **repo_files** (mới 2026-07-12): cache file script nhánh main GitHub (path PK, source, synced_at).
- **audit_log** (mới 2026-07-12): id, ts, username, action, target, detail — ghi qua `log_audit()` cùng transaction với mutation.

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

## Backup (mới 2026-07-12)

- Daemon thread trong app (`backup_daemon`, start ở `__main__`): kiểm tra mỗi 30 phút, mỗi ngày snapshot 2 file DB vào `backups/YYYY-MM-DD/` bằng **sqlite3 backup API** (bắt buộc — DB chạy WAL, copy file thường mất dữ liệu trong `-wal`). Giữ `backup_retention` bản gần nhất (mặc định 30). `backups/` đã gitignore.
- Backup tay: `POST /api/backup/run` (perm settings); trạng thái: `GET /api/backup/status`.

## Dữ liệu phụ

- `test_data/*.txt`, `test-script.txt`: sample dữ liệu tab-delimited để paste test, không dùng khi production
- Không có fixture JSON/SQL dump (dùng live DB files)

## Parameterization & Safety

- Toàn bộ SQL dùng `?` parameterization (không string interpolation) → prevent injection
- `sqlite3.Row` factory → truy cập `row["column"]` thay `row[0]`
- Xử lý transaction: `db.commit()` sau mutation, `db.close()` sau xong
