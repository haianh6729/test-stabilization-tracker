# CLAUDE.md

File này hướng dẫn Claude Code (claude.ai/code) khi làm việc với code trong repo này.

## Tổng quan dự án

Ứng dụng web nội bộ chạy trong mạng LAN, dùng cho team QA để theo dõi "test stabilization" — tức là theo dõi các test tự động bị fail/flaky qua từng "cycle" (đợt chạy test), gán người fix, xác nhận fix có thực sự hiệu quả không, và xuất báo cáo/dashboard. Chi tiết nghiệp vụ đầy đủ nằm trong [README.md](README.md) — README viết tiếng Việt, là nguồn tham khảo chính.

**Cập nhật gần đây**:
- **2026-07-11**: Hệ thống tài khoản + phân quyền per-tab (login, roles, admin panel).
- **2026-07-12**: Tự động hoá quản lý & báo cáo — 2 tab mới (📤 Báo cáo, 🔗 Đồng bộ), exit criteria N cycle (tier Verify mới), flaky detection, chuẩn hoá root cause group, coverage động từ hệ thống công ty, đối chiếu 3 chiều (DONE ↔ Performed ↔ file GitHub), backup tự động in-app, audit log, endpoint import cho farm. Adapter API farm/công ty là **stub chờ tài liệu API** (xem `normalize_farm_rows()` / `company_fetch_testcases()`).
- **2026-07-13**: Ghi nhận Fix bắt buộc cả Chi tiết nguyên nhân; **CRUD đầy đủ** Nhóm nguyên nhân gốc (thêm/đổi tên/xoá — persist ở settings, cascade `fixes`, xoá bị chặn nếu đang có fix dùng). Owner Leaderboard chọn được theo Ngày/Tuần/Cộng dồn (`/api/leaderboard`) + cột Scripts Written + năng suất TB/người/ngày. Báo cáo (daily/weekly) **không còn bắt buộc phải có cycle** (fix/script viết mới trong ngày cũng đủ để sinh báo cáo), thêm mục "Script completion by Test Suite" (nguồn chỉ từ hệ thống công ty). **Toàn bộ tab Dashboard + nội dung báo cáo sinh ra chuyển sang tiếng Anh** (nhãn cột); **tooltip (hover) trên Dashboard là tiếng Việt giải thích ý nghĩa trường** (không phải bản dịch tên cột) — các tab khác vẫn tiếng Việt hoàn toàn. Export Excel đạt **parity đầy đủ** với markdown (nhiều sheet) + **sheet "Overview" đầu tiên** (health status màu, KPI lớn, nhận định ngắn, chart pass-rate-trend + tier-distribution) + **conditional formatting đỏ/vàng/xanh** trên các cột tỷ lệ.

Dự án **đã có git + remote GitHub**. Lưu ý: `tracker.db`/`users.db` hiện vẫn được git track (đề xuất gỡ C3 chưa thực hiện — chờ quyết định chủ dự án).

## Kiến trúc & stack

- **Backend**: Python + Flask (`Flask>=3.0`), module `sqlite3` (không ORM)
- **Frontend**: HTML/CSS/JS thuần, không build step/npm. Chart.js vendor ở `static/chart.min.js`
- **Export**: `openpyxl` (Excel)
- **Dependencies**: 2 package chính ở `requirements.txt` (Flask + openpyxl)

### Code layout: `app.py` (~4600 dòng, monolithic)

1. **Constants**: secrets, default password, role/perm config, model list, `ROOT_CAUSE_GROUPS` (default; đọc qua `get_root_cause_groups(db)` để lấy tên đã đổi), `SENSITIVE_SETTINGS` (mask token), `COMPANY_PERFORMED_STATES`, `BACKUP_DIR`, `classify_root_cause_group()`
2. **DB helpers + migrations**: `get_db()`, `get_users_db()`, `init_db()`, `init_users_db()` (+ backfill owner accounts, backfill perms mới theo role, backfill `root_cause_group`)
3. **Auth functions**: decorators `@require_login`/`@require_perm()`, `current_user()`, `perm_error()`, `log_audit()`, `_http_json()` (urllib outbound), `get_setting()/get_setting_int()`
4. **Business logic**: `classify_result`, `derive_test_suite`, `compute_root_cause_pareto` (từ description kết quả), `compute_fix_root_cause_pareto` (từ fix log), `compute_cycle_trend`, `compute_adjusted_trend`, `compute_coverage`, `compute_suite_model_matrix`, `get_script_priority` (tier + flaky/reopen + exit criteria), `get_owner_stats` (leaderboard, có `scripts_written`), `get_root_cause_groups()` (đọc tên nhóm đã đổi từ settings), owner helpers
5. **Routes**:
   - Auth: `/login`, `/register`, `/api/auth/*`
   - Main app: `/api/dashboard`, `/api/results` (+`/api/results/import` token-gated), `/api/fixes` (nhận `root_cause_group` + `root_cause_detail` bắt buộc), `/api/assignments`, `/api/lists/*` (+ `test_suites/<name>/path`, `root_cause_groups` POST thêm mới, `root_cause_groups/<name>` PUT đổi tên/DELETE xoá), `/api/leaderboard` (scope cumulative/day/week), `/api/priority`, `/api/fix-tracking`, `/api/new-scripts`, `/api/handover`, export routes
   - Integrations: `/api/integrations/farm/fetch`, `company/sync|manual|testcases`, `github/sync|manual`, `reconcile`, `status`
   - Reports: `/api/report/daily`, `/api/report/weekly` (markdown, English, cycle không bắt buộc), `/api/report/daily/export`, `/api/report/weekly/export` (Excel nhiều sheet + sheet Overview + chart + conditional formatting, parity với markdown)
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
- **Ngôn ngữ (từ 2026-07-13)**: **nhãn** tab Dashboard (bảng, KPI, chart legend) + nội dung **báo cáo sinh ra** (daily/weekly, markdown + Excel) dùng **tiếng Anh** — phục vụ cấp trên/khách hàng đọc trực tiếp. **Mọi tab khác** (nhập liệu, ưu tiên, cài đặt, đồng bộ...) vẫn giữ **tiếng Việt** như trước — không "sửa chính tả" hay dịch các tab đó. Comment + variable trong code = English (như cũ)
- **Tooltip + Total row**: các bảng dữ liệu Dashboard có `title="..."` trên `<th>` — nhãn cột hiển thị tiếng Anh nhưng **nội dung tooltip là tiếng Việt, giải thích Ý NGHĨA/cách tính của trường** (không phải bản dịch nghĩa đen tên cột, VD "Owner" → "Người đang phụ trách xử lý script này" chứ không phải "Chủ sở hữu"); bảng chứa cột đếm (count) luôn có dòng cuối `class="total-row"` (không tham gia sort/filter — xem `ttApply()` trong `app.js`, luôn ghim ở cuối bảng)

### Nghiệp vụ quan trọng (2026-07-12)

- **Exit criteria (setting `exit_criteria_cycles`, mặc định 2)**: script chỉ "Done" khi MỌI model nó từng chạy đều pass ≥N cycle liên tiếp gần nhất. Cycle mới nhất không fail nhưng chưa đủ chuỗi → tier **"Verify"** (đang xác minh). `N=1` = hành vi cũ (đã regression-test khớp 100%). **"Còn lỗi"/`fails_to_fix`/open_workload chỉ đếm P0–P3** — Verify không tính (không có gì để fix)
- **Verdict 1 (model, cycle)** = kết quả LẦN CHẠY CUỐI trong cycle đó (fail rồi re-run pass = Pass) — nhất quán với `get_latest_status`
- **Flaky** (`flaky_window`=5, `flaky_min_flips`=2): script đổi pass↔fail ≥2 lần trong 5 cycle gần nhất nó có chạy
- **Root cause 2 lớp**: cột mới `fixes.root_cause_group` (dropdown nhóm chuẩn, mặc định `ROOT_CAUSE_GROUPS` — đọc qua `get_root_cause_groups(db)` vì admin có **CRUD đầy đủ** nhóm trong Cài đặt: thêm mới (`POST /api/lists/root_cause_groups`), đổi tên + xoá (`PUT`/`DELETE /api/lists/root_cause_groups/<name>` — xoá bị chặn nếu đang có fix dùng nhóm đó, và phải giữ lại ≥1 nhóm), tất cả persist ở settings key `root_cause_groups` JSON, rename cascade update `fixes` cũ) + text cũ `root_cause` compose "Group - detail" (consumer cũ không đổi). **Chi tiết nguyên nhân (`root_cause_detail`) bắt buộc** khi ghi fix qua form (từ 2026-07-13) — không còn optional. Pareto có 2 loại: từ description kết quả (đang fail vì gì) và từ fix log (nguyên nhân đã xác nhận). Nhãn hệ thống tự sinh (`ROOT_CAUSE_RULES`) có bản dịch tiếng Anh riêng (`_translate_root_cause_label()`) chỉ dùng khi `compute_root_cause_pareto(..., english=True)` cho Dashboard/báo cáo — consumer khác (export Excel toàn bộ dữ liệu ở tab Ưu tiên) vẫn dùng nhãn tiếng Việt gốc
- **Coverage động**: tổng TC cần script lấy từ cache `company_testcases` (SKIP không tính), KHÔNG BAO GIỜ fallback về số cứng. Bảng "Script completion by Test Suite" trong báo cáo + Dashboard dùng đúng nguồn này — cache rỗng → ghi rõ "not synced", không bịa số
- **Adapter stub chờ API**: `normalize_farm_rows()`, `company_fetch_testcases()` raise lỗi tiếng Việt rõ ràng — cập nhật khi có tài liệu API công ty. Fallback paste tay hoạt động đầy đủ
- **Token settings bị mask** (`********`) khi GET; POST giá trị mask = giữ nguyên
- **Owner Leaderboard scoped**: `/api/leaderboard?scope=cumulative|day|week` — `cumulative` = KPI all-time (`get_owner_stats`, rate luôn all-time); `day`/`week` đếm `fixes`/`new_scripts` DONE trong khoảng, kèm `totals.avg_write_per_person_day`/`avg_fix_per_person_day` (năng suất TB, mẫu số = số ngày có hoạt động thực tế qua `_activity_days()`, không phải số ngày lịch để tránh chia sai)
- **Báo cáo không bắt buộc cycle**: `build_daily_report`/`build_weekly_report` chỉ lỗi khi ngày/tuần đó KHÔNG có bất kỳ dữ liệu nào (không cycle, không fix, không script DONE); có cycle → hiện đầy đủ, không có cycle nhưng có fix/script → mục dựa-trên-cycle ghi "No cycle ran", các mục khác (fix, script viết mới, coverage, ETA) vẫn tính bình thường

### Trạng thái hiện tại (2026-07-13)

- ✅ Login system + per-tab permissions
- ✅ Báo cáo daily/weekly tự sinh markdown, tiếng Anh, cycle không bắt buộc (mục bắt buộc: Item×Model×cycle, lỗi môi trường, completion-by-suite, sản lượng từng người, ETA) + export Excel nhiều sheet đạt parity đầy đủ + **sheet "Overview" đầu tiên** (health status, KPI lớn, nhận định, 2 chart) + conditional formatting đỏ/vàng/xanh trên cột tỷ lệ
- ✅ Owner Leaderboard chọn theo Ngày/Tuần/Cộng dồn + Scripts Written + năng suất TB/người/ngày
- ✅ Ghi nhận Fix bắt buộc chi tiết nguyên nhân; **CRUD đầy đủ** nhóm nguyên nhân gốc (thêm/đổi tên/xoá, persist + cascade)
- ✅ Tooltip giải thích ý nghĩa trường (tiếng Việt trên Dashboard) + Total row cho bảng đếm
- ✅ Backup tự động hằng ngày in-app + audit log
- ✅ Import kết quả qua API token (`POST /api/results/import` + `X-Import-Token`)
- ⏳ Farm API / Company API: chờ tài liệu → chỉ cần viết adapter, UI/flow đã xong
- ❌ Không có test suite trong repo (đợt 2026-07-12 đã verify bằng sandbox + regression so code cũ trên snapshot DB thật; đợt 2026-07-13 verify trực tiếp trên snapshot DB thật qua script Python — xem lịch sử conversation)

## Quy ước code

- **Python**: snake_case, 4-space indent, SQL triple-quoted với `?` parameterization
- **JS**: ES6+ (async/await, arrow function), monolithic `app.js`, không module system
- **HTML**: không framework (vanilla form/input/button)
- **SQL**: `sqlite3.Row` factory → truy cập `row["col"]`
