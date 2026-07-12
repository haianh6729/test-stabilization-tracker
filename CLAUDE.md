# CLAUDE.md

File này hướng dẫn Claude Code (claude.ai/code) khi làm việc với code trong repo này.

## Tổng quan dự án

Ứng dụng web nội bộ chạy trong mạng LAN, dùng cho team QA để theo dõi "test stabilization" — tức là theo dõi các test tự động bị fail/flaky qua từng "cycle" (đợt chạy test), gán người fix, xác nhận fix có thực sự hiệu quả không, và xuất báo cáo/dashboard. Chi tiết nghiệp vụ đầy đủ nằm trong [README.md](README.md) — README viết tiếng Việt, là nguồn tham khảo chính.

**Cập nhật gần đây**:
- **2026-07-11**: Hệ thống tài khoản + phân quyền per-tab (login, roles, admin panel).
- **2026-07-12**: Tự động hoá quản lý & báo cáo — 2 tab mới (📤 Báo cáo, 🔗 Đồng bộ), exit criteria N cycle (tier Verify mới), flaky detection, chuẩn hoá root cause group, coverage động từ hệ thống công ty, đối chiếu 3 chiều (DONE ↔ Performed ↔ file GitHub), backup tự động in-app, audit log, endpoint import cho farm. Adapter API farm/công ty là **stub chờ tài liệu API** (xem `normalize_farm_rows()` / `company_fetch_testcases()`).

Dự án **đã có git + remote GitHub**. Lưu ý: `tracker.db`/`users.db` hiện vẫn được git track (đề xuất gỡ C3 chưa thực hiện — chờ quyết định chủ dự án).

## Kiến trúc & stack

- **Backend**: Python + Flask (`Flask>=3.0`), module `sqlite3` (không ORM)
- **Frontend**: HTML/CSS/JS thuần, không build step/npm. Chart.js vendor ở `static/chart.min.js`
- **Export**: `openpyxl` (Excel)
- **Dependencies**: 2 package chính ở `requirements.txt` (Flask + openpyxl)

### Code layout: `app.py` (~4600 dòng, monolithic)

1. **Constants**: secrets, default password, role/perm config, model list, `ROOT_CAUSE_GROUPS`, `SENSITIVE_SETTINGS` (mask token), `COMPANY_PERFORMED_STATES`, `BACKUP_DIR`, `classify_root_cause_group()`
2. **DB helpers + migrations**: `get_db()`, `get_users_db()`, `init_db()`, `init_users_db()` (+ backfill owner accounts, backfill perms mới theo role, backfill `root_cause_group`)
3. **Auth functions**: decorators `@require_login`/`@require_perm()`, `current_user()`, `perm_error()`, `log_audit()`, `_http_json()` (urllib outbound), `get_setting()/get_setting_int()`
4. **Business logic**: `classify_result`, `derive_test_suite`, `compute_root_cause_pareto` (từ description kết quả), `compute_fix_root_cause_pareto` (từ fix log), `compute_cycle_trend`, `compute_adjusted_trend`, `compute_coverage`, `compute_suite_model_matrix`, `get_script_priority` (tier + flaky/reopen + exit criteria), owner helpers
5. **Routes**:
   - Auth: `/login`, `/register`, `/api/auth/*`
   - Main app: `/api/dashboard`, `/api/results` (+`/api/results/import` token-gated), `/api/fixes` (nhận `root_cause_group`), `/api/assignments`, `/api/lists/*` (+ `test_suites/<name>/path`), `/api/priority`, `/api/fix-tracking`, `/api/new-scripts`, `/api/handover`, export routes
   - Integrations: `/api/integrations/farm/fetch`, `company/sync|manual|testcases`, `github/sync|manual`, `reconcile`, `status`
   - Reports: `/api/report/daily`, `/api/report/weekly` (markdown)
   - Backup: `/api/backup/run`, `/api/backup/status` (+ daemon thread `backup_daemon`)
   - Admin: `/api/admin/*` (users/owners CRUD, results/fixes/scripts/assignments bulk, `audit-log`)
6. **Main**: `if __name__: init_db(); init_users_db(); start_backup_daemon(); app.run(...)`

### Frontend

- **`templates/login.html`**, **`templates/register.html`**: form auth (mới)
- **`templates/index.html`**: UI tab chính (10 tabs). Topbar có user box + Đổi MK modal + Đăng xuất button
- **`templates/admin.html`**: 7 tabs admin (Results, Scripts, Fixes, Assignments, Accounts, Owner & Team, Audit Log)
- **`static/app.js`**: init auth, polling `/api/me`, permission sync, tab handlers, API wrapper, form parser
- **`static/style.css`**: toàn bộ styling (topbar, tabs, cards, tables, modals)
- **`static/chart.min.js`**: Chart.js (dashboard, cycle-compare)

### Dữ liệu

- **`tracker.db`** — **live production data**, không xoá/reset. Schema: results, fixes (+root_cause_group), assignments, owners, models, test_suites (+script_path), settings, new_scripts, company_testcases (cache hệ thống công ty), repo_files (cache GitHub), audit_log
- **`users.db`** — **live production data** (mới 2026-07-11), schema: users (username, password_hash, role, permissions, active, created_at). Auto-tạo khi start
- **`backups/`** — snapshot tự động hằng ngày của 2 file DB (giữ 30 bản gần nhất, gitignored)
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
2. `init_users_db()` → create/migrate users.db, seed anh.hh (admin), **backfill accounts cho 42+ active owners** + backfill perms mới theo role
3. `start_backup_daemon()` → daemon thread backup hằng ngày vào `backups/YYYY-MM-DD/` (sqlite backup API, WAL-safe)
4. Flask listen 0.0.0.0:5000

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

- **10 tabs**: dashboard, new-scripts, input-results, input-fix, priority, cycle-compare, fix-tracking, reports, integrations, settings. Hiển thị theo permission (role user mặc định: không input-results, không integrations, không settings)
- **Polling 15s**: re-fetch `/api/me`, re-sync permissions nếu admin đổi. 2 tab mới (reports/integrations) load on-demand, KHÔNG nằm trong polling
- **Tiếng Việt là intent**: không "sửa chính tả" hay dịch sang Anh. Comment + variable = English, UI text = tiếng Việt

### Nghiệp vụ quan trọng (2026-07-12)

- **Exit criteria (setting `exit_criteria_cycles`, mặc định 2)**: script chỉ "Done" khi MỌI model nó từng chạy đều pass ≥N cycle liên tiếp gần nhất. Cycle mới nhất không fail nhưng chưa đủ chuỗi → tier **"Verify"** (đang xác minh). `N=1` = hành vi cũ (đã regression-test khớp 100%). **"Còn lỗi"/`fails_to_fix`/open_workload chỉ đếm P0–P3** — Verify không tính (không có gì để fix)
- **Verdict 1 (model, cycle)** = kết quả LẦN CHẠY CUỐI trong cycle đó (fail rồi re-run pass = Pass) — nhất quán với `get_latest_status`
- **Flaky** (`flaky_window`=5, `flaky_min_flips`=2): script đổi pass↔fail ≥2 lần trong 5 cycle gần nhất nó có chạy
- **Root cause 2 lớp**: cột mới `fixes.root_cause_group` (dropdown 7 nhóm chuẩn `ROOT_CAUSE_GROUPS`) + text cũ `root_cause` compose "Group - detail" (consumer cũ không đổi). Pareto có 2 loại: từ description kết quả (đang fail vì gì) và từ fix log (nguyên nhân đã xác nhận)
- **Coverage động**: tổng TC cần script lấy từ cache `company_testcases` (SKIP không tính), KHÔNG BAO GIỜ fallback về số cứng
- **Adapter stub chờ API**: `normalize_farm_rows()`, `company_fetch_testcases()` raise lỗi tiếng Việt rõ ràng — cập nhật khi có tài liệu API công ty. Fallback paste tay hoạt động đầy đủ
- **Token settings bị mask** (`********`) khi GET; POST giá trị mask = giữ nguyên

### Trạng thái hiện tại (2026-07-12)

- ✅ Login system + per-tab permissions
- ✅ Báo cáo daily/weekly tự sinh markdown (5 mục bắt buộc: Item×Model×cycle, lỗi môi trường, coverage, sản lượng từng người, ETA)
- ✅ Backup tự động hằng ngày in-app + audit log
- ✅ Import kết quả qua API token (`POST /api/results/import` + `X-Import-Token`)
- ⏳ Farm API / Company API: chờ tài liệu → chỉ cần viết adapter, UI/flow đã xong
- ❌ Không có test suite trong repo (đợt 2026-07-12 đã verify bằng sandbox + regression so code cũ trên snapshot DB thật)

## Quy ước code

- **Python**: snake_case, 4-space indent, SQL triple-quoted với `?` parameterization
- **JS**: ES6+ (async/await, arrow function), monolithic `app.js`, không module system
- **HTML**: không framework (vanilla form/input/button)
- **SQL**: `sqlite3.Row` factory → truy cập `row["col"]`
