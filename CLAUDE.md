# CLAUDE.md

File này hướng dẫn Claude Code (claude.ai/code) khi làm việc với code trong repo này.

## Tổng quan dự án

Ứng dụng web nội bộ chạy trong mạng LAN, dùng cho team QA để theo dõi "test stabilization" — tức là theo dõi các test tự động bị fail/flaky qua từng "cycle" (đợt chạy test), gán người fix, xác nhận fix có thực sự hiệu quả không, và xuất báo cáo/dashboard. Chi tiết nghiệp vụ đầy đủ nằm trong [README.md](README.md) — README viết tiếng Việt, là nguồn tham khảo chính.

**Cập nhật gần đây (2026-07-11)**: Thêm hệ thống tài khoản + phân quyền per-tab (login, roles, admin panel).

Dự án hiện **chưa khởi tạo git**.

## Kiến trúc & stack

- **Backend**: Python + Flask (`Flask>=3.0`), module `sqlite3` (không ORM)
- **Frontend**: HTML/CSS/JS thuần, không build step/npm. Chart.js vendor ở `static/chart.min.js`
- **Export**: `openpyxl` (Excel)
- **Dependencies**: 2 package chính ở `requirements.txt` (Flask + openpyxl)

### Code layout: `app.py` (~3300 dòng, monolithic)

1. **Constants** (line 1–50): secrets, default password, role/perm config, model list
2. **DB helpers** (line 50–330): `get_db()`, `get_users_db()`, `init_db()`, `init_users_db()` (+ auto-backfill owner accounts)
3. **Auth functions** (line 330–440): `ensure_account_for_owner()`, decorators `@require_login`/`@require_perm()`, helpers `perms_to_list()`, `owner_is_active()`, `current_user()`, `perm_error()`
4. **Business logic** (line 440–980): `classify_result`, `derive_test_suite`, `compute_root_cause_pareto`, `compute_cycle_trend`, `extract_date_from_test_id`, owner helpers `owner_op_add/rename/deactivate/hard_delete`
5. **Routes** (line 980–3200):
   - Auth: `/login`, `/register`, `/api/auth/*`
   - Main app: `/` (tab UI), `/api/dashboard`, `/api/results`, `/api/fixes`, `/api/assignments`, `/api/lists/*` (models, owners, test_suites, settings), `/api/priority`, `/api/fix-tracking`, `/api/cycle-matrix`, `/api/new-scripts`, `/api/handover`, export routes
   - Admin: `/api/admin/*` (users CRUD, owners CRUD, results/fixes/scripts/assignments bulk)
6. **Main**: `if __name__: init_db(); init_users_db(); app.run(...)`

### Frontend

- **`templates/login.html`**, **`templates/register.html`**: form auth (mới)
- **`templates/index.html`**: UI tab chính (8 tabs). Topbar có user box + Đổi MK modal + Đăng xuất button
- **`templates/admin.html`**: 6 tabs admin (Results, Scripts, Fixes, Assignments, Accounts, Owner & Team)
- **`static/app.js`**: init auth, polling `/api/me`, permission sync, tab handlers, API wrapper, form parser
- **`static/style.css`**: toàn bộ styling (topbar, tabs, cards, tables, modals)
- **`static/chart.min.js`**: Chart.js (dashboard, cycle-compare)

### Dữ liệu

- **`tracker.db`** — **live production data**, không xoá/reset. Schema: results, fixes, assignments, owners, models, test_suites, priority, settings, new_scripts
- **`users.db`** — **live production data** (mới 2026-07-11), schema: users (username, password_hash, role, permissions, active, created_at). Auto-tạo khi start
- **`test_data/`** — sample tab-delimited files để paste test (không dùng production)

## Chi tiết chi thành từng aspect

Xem các file rule riêng biệt:

- **[`.claude/rules/auth-system.md`](.claude/rules/auth-system.md)** — Login, roles (admin/moderator/user), permissions per-tab, enforcement, auto-create account, session, admin page
- **[`.claude/rules/database-schema.md`](.claude/rules/database-schema.md)** — tracker.db schema, users.db schema, migration pattern (inline, idempotent)
- **[`.claude/rules/deployment.md`](.claude/rules/deployment.md)** — Secrets (hardcode), .gitignore, run command, update guidelines
- **[`.claude/rules/ui-structure.md`](.claude/rules/ui-structure.md)** — Pages (/login, /register, /, /admin), tabs, topbar, modals, startup flow, polling

## Lệnh chạy / dev

```bash
pip install -r requirements.txt
python app.py        # 0.0.0.0:5000
# Database (tracker.db, users.db) tạo tự động lần đầu
```

**Startup flow**:
1. `init_db()` → create/migrate tracker.db (business data)
2. `init_users_db()` → create/migrate users.db, seed anh.hh (admin), **backfill accounts cho 42+ active owners**
3. Flask listen 0.0.0.0:5000

**Test**:
- Không có unit test, linter, formatter, build step
- Test tay: qua UI (paste sample từ `test_data/`, hoặc login + use), hoặc curl endpoint `/api/*` + `/admin/*`
- Login test user: bất kỳ active owner, password = `abc123` (default)

**Develop**:
- Thay code → restart server (auto-migrate DB)
- Thêm route → apply `@require_login`, `@require_perm("tab")` nếu cần gate
- Thêm schema → migration idempotent vào `init_db()` / `init_users_db()`

## Các điểm cần lưu ý

### Secrets (Xem chi tiết: [`.claude/rules/deployment.md`](.claude/rules/deployment.md))

- **Hardcode**: `ADMIN_SECRET_KEY`, `DEFAULT_RESET_PASSWORD`, Flask `secret_key` — tất cả plaintext trong `app.py`
- **Không "sửa"** theo hướng env vars trừ khi người dùng yêu cầu (đây là trạng thái hiện tại, chấp nhận được)
- **`DEFAULT_RESET_PASSWORD = "abc123"`**: seed admin, reset PW, auto-create owner account
- Form "Nhập kết quả" **không còn** mật khẩu gate riêng (đã bỏ `SUBMIT_PASSWORD`) — quyền truy cập chỉ dựa vào `@require_perm("input-results")`

### Database (Xem chi tiết: [`.claude/rules/database-schema.md`](.claude/rules/database-schema.md))

- **Hai file DB riêng biệt**: `tracker.db` (data), `users.db` (accounts). **Cả hai là live data** — không xoá/reset tuỳ tiện
- **Migration idempotent**: thêm bước mới vào `init_db()` / `init_users_db()`, **KHÔNG sửa CREATE TABLE** (tránh phá schema cũ)
- **SQL parameterization**: toàn bộ dùng `?`, không string interpolation → prevent injection

### Auth & Permissions

- **3 roles**: admin, moderator, user. Per-account custom permissions (CSV). Khi đổi role → reset perms về mặc định
- **Enforcement 2-layer**: frontend (hide tab), backend (decorator + 403). Reads không gate (hỗ trợ polling)
- **Auto-create**: owner mới → account tự sinh (role=user, perms mặc định, pw=abc123). Không ghi đè tài khoản có sẵn
- **Cascade**: rename/deactivate/delete owner → sync username/account ở users.db
- **Startup**: Luôn seed/force anh.hh = admin, backfill owner accounts

### Frontend (Xem chi tiết: [`.claude/rules/ui-structure.md`](.claude/rules/ui-structure.md))

- **8 tabs**: dashboard, new-scripts, input-results, input-fix, priority, cycle-compare, fix-tracking, settings. Hiển thị theo permission
- **Polling 15s**: re-fetch `/api/me`, re-sync permissions nếu admin đổi
- **Tiếng Việt là intent**: không "sửa chính tả" hay dịch sang Anh. Comment + variable = English, UI text = tiếng Việt

### Trạng thái hiện tại (2026-07-11)

- ✅ Login system (session-based)
- ✅ Per-tab permissions + enforcement
- ✅ Admin user/owner management
- ✅ Auto-create accounts cho owner
- ✅ Default password = `abc123`
- ❌ Không có test suite (test tay qua UI/curl)
- ❌ Chưa git init

## Quy ước code

- **Python**: snake_case, 4-space indent, SQL triple-quoted với `?` parameterization
- **JS**: ES6+ (async/await, arrow function), monolithic `app.js`, không module system
- **HTML**: không framework (vanilla form/input/button)
- **SQL**: `sqlite3.Row` factory → truy cập `row["col"]`
