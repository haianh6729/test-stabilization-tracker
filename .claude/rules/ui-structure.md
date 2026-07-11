# UI Structure & Frontend Logic

## Pages

- **`/login`** (`templates/login.html`): Form đăng nhập (username, password). Chuyển `/` nếu thành công.
- **`/register`** (`templates/register.html`): Form đăng ký (username = active owner, password tuỳ ý). Chỉ chấp nhận owner tồn tại.
- **`/`** (`templates/index.html`): Tab UI chính (dashboard, nhập kết quả, ghi nhận fix, bảng ưu tiên, so sánh cycle, theo dõi fix, cài đặt). Redirect `/login` nếu chưa auth.
- **`/admin/<ADMIN_SECRET_KEY>`** (`templates/admin.html`): Tab CRUD admin (Cycle Results, Script viết mới, Fix Log, Assignments, **Tài khoản**, **Owner & Team**). Không yêu cầu login (gate bằng URL key).

## Main App (`index.html` + `app.js`)

### Topbar
- Logo "🧪 Test Stabilization Tracker"
- Tab buttons (ẩn nếu user không có quyền)
- Kết nối status (● Đã kết nối / ● Mất kết nối)
- **Topbar phải** (user box): tên user (👤 username (role)), 🔑 Đổi MK, Đăng xuất, ⚙️ Quản trị (admin only)

### Startup & Auth (`app.js`)
```javascript
state.me = await fetchMe();  // /api/me
if (!state.me) { window.location = "/login"; return; }
applyPermissions();  // ẩn tab không có quyền
initAuthUI();        // wire Đổi MK modal, Đăng xuất
```

### Polling (15s)
- `setInterval(() => { ... }, 15000)`:
  - Re-fetch `/api/me` → check permission change → `applyPermissions()` nếu khác
  - Nếu deactivated → redirect `/login`
  - Reload dữ liệu (reference data, priority, failing scripts, dashboard, active tab)

### Modal: Đổi mật khẩu
- ID: `#changePwModal`
- Input: `#cpCurrent`, `#cpNew`
- Button: `#btnDoChangePw`
- Gọi `POST /api/auth/change-password` → `{current, new}`

### Tabs (8 cái)

| ID | Tên | Route & Gating | Nội dung |
|----|-----|---|---|
| dashboard | Dashboard | GET `/api/dashboard` | Overview pass rate, script, cycle |
| input-results | Nhập kết quả | POST `/api/results` + `@require_perm` | Paste tab-delimited results |
| input-fix | Ghi nhận Fix | POST `/api/fixes` + `@require_perm` | Paste tab-delimited fixes |
| new-scripts | Script viết mới | POST `/api/new-scripts/*` + `@require_perm` | List, add, edit, delete |
| priority | Bảng ưu tiên | POST `/api/assignments` + `@require_perm` | Sort, assign owners |
| cycle-compare | So sánh Cycle | GET `/api/cycle-matrix` | Matrix pass rate × item × cycle |
| fix-tracking | Theo dõi Fix | GET `/api/fix-tracking` | List fix + status + trend |
| settings | Cài đặt | POST `/api/lists/*` + `@require_perm` | Owner, team, test suite, model, settings |

## Admin App (`admin.html`)

### Tabs (6 cái, lazy-load)
1. **Cycle Results**: search, edit, delete results
2. **Script viết mới**: search, edit, delete, bulk import new scripts
3. **Fix Log**: search, edit, delete, bulk import fixes
4. **Assignments**: search, edit, delete, bulk import assignments
5. **👥 Tài khoản**: list users, role dropdown, permission checkboxes, reset PW, toggle active, delete
6. **🧑‍🤝‍🧑 Owner & Team**: list owners, add, rename, set team, deactivate, hard-delete

Tất cả gated bằng `X-Admin-Key` header hoặc `?key=` query param.

## Static Assets

- `static/app.js`: toàn bộ frontend logic (init, tab handlers, API wrapper, table filters/sort, modals, polling)
- `static/style.css`: CSS dùng chung (topbar, tabs, forms, tables, modals, colors)
- `static/chart.min.js`: Chart.js vendor (dùng dashboard, cycle-compare)

## API Wrapper

```javascript
async function api(path, options = {}) {
  const res = await fetch(path, options);
  if (res.status === 401) { window.location = "/login"; return; }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || ("HTTP " + res.status));
  return body;
}
```

## Form Patterns

- **Paste tab-delimited**: `parsePaste()` → tokenize → validate → submit
- **Search/filter**: input + button → call API + re-render table
- **Edit modal**: open → populate fields → save (PUT) → close + reload
- **Delete**: confirm → call API → reload

## Tiếng Việt & UX

- UI text toàn tiếng Việt (intent của app)
- Emoji trong button label (⬆️, 🔍, ✏️, 🗑️, etc) → quick scan
- Color-coded status: ✅ xanh, ⚠️ cam, ❌ đỏ, ⏳ xám
