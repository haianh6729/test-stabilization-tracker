# UI Structure & Frontend Logic

## Pages

- **`/login`** (`templates/login.html`): Form đăng nhập (username, password). Chuyển `/` nếu thành công.
- **`/register`** (`templates/register.html`): Form đăng ký (username = active owner, password tuỳ ý). Chỉ chấp nhận owner tồn tại.
- **`/`** (`templates/index.html`): Tab UI chính (dashboard, nhập kết quả, ghi nhận fix, bảng ưu tiên, so sánh cycle, theo dõi fix, cài đặt). Redirect `/login` nếu chưa auth.
- **`/admin/<ADMIN_SECRET_KEY>`** (`templates/admin.html`): Tab CRUD admin (Cycle Results, Script viết mới, Fix Log, Assignments, **Tài khoản**, **Owner & Team**, **Audit Log**). Không yêu cầu login (gate bằng URL key).

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

### Tabs (10 cái)

| ID | Tên | Route & Gating | Nội dung |
|----|-----|---|---|
| dashboard | Dashboard (English) | GET `/api/dashboard`, `/api/leaderboard` | KPI (kèm flaky, Verify, coverage), Pareto ×2, Owner Leaderboard scoped (ngày/tuần/cộng dồn) + tooltip + Total row — **toàn bộ tab này tiếng Anh** |
| new-scripts | Script viết mới | POST `/api/new-scripts/*` + `@require_perm` | List (kèm tooltip + Total row), add, edit, bulk-assign |
| input-results | Nhập kết quả | POST `/api/results` + `@require_perm` | Paste tab-delimited results |
| input-fix | Ghi nhận Fix | POST `/api/fixes` + `@require_perm` | Dropdown nhóm root cause (bắt buộc) + **chi tiết nguyên nhân (bắt buộc, từ 2026-07-13)** |
| priority | Bảng ưu tiên | POST `/api/assignments` + `@require_perm` | Sort, assign, cột Flaky + Reopen, tier Verify, tooltip mỗi cột |
| cycle-compare | So sánh Cycle | GET `/api/script-cycle-matrix` | Matrix pass rate × item × cycle, tooltip header |
| fix-tracking | Theo dõi Fix | GET `/api/fix-tracking` | List fix + status + trend, tooltip mỗi cột |
| reports | 📤 Báo cáo (mới 2026-07-12, English từ 2026-07-13) | GET `/api/report/daily\|weekly` (login), GET `/api/report/daily\|weekly/export` (Excel) | Sinh markdown daily/weekly **tiếng Anh**, **cycle không bắt buộc** (fix/script viết mới trong ngày vẫn sinh được), mục "Script completion by Test Suite" mới + copy button (fallback execCommand cho LAN HTTP) + nút "📥 Tải xuống Excel" (nhiều sheet, parity đầy đủ với markdown, kèm sheet **Overview** đầu tiên + chart + conditional formatting — xem mục Excel report bên dưới) |
| integrations | 🔗 Đồng bộ (mới 2026-07-12) | POST `/api/integrations/*` + `@require_perm` | Farm fetch theo Test ID, sync/paste công ty + GitHub, đối chiếu 3 chiều |
| settings | Cài đặt | POST `/api/lists/*`, `/api/settings` + `@require_perm` | Mục tiêu, tiêu chí & KPI, tích hợp & API (token mask), backup, danh mục (suite có cột Đường dẫn script, **card mới "Nhóm nguyên nhân gốc" để đổi tên**) |

Role user mặc định: KHÔNG có input-results, integrations, settings. Tab reports/integrations load on-demand — không nằm trong polling 15s.

### Owner Leaderboard (tab Dashboard)
- Selector "Range": **Cumulative (all-time)** / **By day** / **By week** — đổi range gọi lại `GET /api/leaderboard?scope=...&date=|week=`.
- Cột **Scripts Written** (count `new_scripts` DONE theo range) + **Fixes** (count `fixes` theo range); các cột rate (Resolution/Verification) LUÔN all-time bất kể range đang chọn.
- Dòng tóm tắt năng suất TB/người/ngày (`#lbProductivity`) hiển thị `avg_write_per_person_day`/`avg_fix_per_person_day` từ response.

### Tooltip & Total row (pattern dùng chung)
- Header tĩnh: `<th title="...">`. Header động (Priority, Cycle-compare): mẫu cột `[key, label, tooltip]` → `<th data-key="${key}" title="${tooltip}">`.
- **Ngôn ngữ tooltip trên Dashboard (từ 2026-07-13)**: nhãn `<th>` = tiếng Anh, nhưng `title=` = **tiếng Việt, giải thích Ý NGHĨA/cách tính của trường** — KHÔNG phải bản dịch nghĩa đen tên cột. VD đúng: `Owner` → `title="Người đang phụ trách xử lý script này"`. VD sai (không làm): `Owner` → `title="Chủ sở hữu"`. Áp dụng cho mọi cột kể cả cột nhìn đơn giản (Date, Cycle, Team...) nếu ý nghĩa/cách tính không tự rõ qua tên. Các tab khác (Priority, Cycle-compare...) tooltip vốn đã tiếng Việt, không đổi.
- Total row: `<tr class="total-row">` append cuối `tbody`. **Bắt buộc** dùng class `total-row` — hàm dùng chung `ttApply()` (`app.js`) đã patch để dòng này KHÔNG tham gia sort/filter và luôn được re-append ở cuối bảng sau mỗi lần sort (áp dụng cho mọi bảng trong `ENHANCED_TABLE_IDS`).

### Excel report — sheet Overview + chart + conditional formatting (mới 2026-07-13)
- Sheet **"Overview"** luôn là sheet ĐẦU TIÊN của cả 2 file Excel (daily/weekly) — hàm dùng chung `_excel_overview_sheet()` (`app.py`), gọi trước khi tạo sheet "Summary" (giờ là `wb.create_sheet("Summary")` thay vì `wb.active`). Nội dung: 1 ô health status to màu (xanh "ON TRACK"/vàng "AT RISK"/đỏ "BEHIND" so pass rate hiện tại với target), 5 ô KPI lớn (Current/Target Pass Rate, Still Failing, P0, Days to Deadline), 1-2 dòng nhận định ngắn, 2 chart nhúng (`openpyxl.chart`): `LineChart` pass rate theo TOÀN BỘ lịch sử cycle (không chỉ 3 cycle gần nhất), `PieChart` phân bố tier (màu khớp bảng `_TIER_COLORS` = đúng màu Dashboard `#e74c3c…#2ecc71`).
- **Conditional formatting** (`ColorScaleRule`, đỏ→vàng→xanh chuẩn Excel `F8696B/FFEB84/63BE7B`): áp trên cột tỷ lệ ở sheet `Pass Rate Matrix`, `Completion by Suite`, `Team Quality` (weekly). Điều kiện bắt buộc: cell phải chứa **giá trị numeric thật** (`float` 0..1, `number_format="0.0%"`) chứ không phải chuỗi `"88.3%"` — `_excel_style_data_row()` tự set `number_format` khi value là `float`; các cell "không có dữ liệu" vẫn giữ string `"—"`/`"…"` (ColorScaleRule tự bỏ qua non-numeric).
- Sheet "Completion by Suite" chỉ có conditional formatting khi `coverage["configured"]` — cache công ty rỗng thì sheet chỉ có 1 dòng thông báo "not synced", không có bảng/màu.

## Admin App (`admin.html`)

### Tabs (7 cái, lazy-load)
1. **Cycle Results**: search, edit, delete results
2. **Script viết mới**: search, edit, delete, bulk import new scripts
3. **Fix Log**: search, edit, delete, bulk import fixes
4. **Assignments**: search, edit, delete, bulk import assignments
5. **👥 Tài khoản**: list users, role dropdown, permission checkboxes, reset PW, toggle active, delete
6. **🧑‍🤝‍🧑 Owner & Team**: list owners, add, rename, set team, deactivate, hard-delete
7. **📜 Audit Log** (mới 2026-07-12): xem lịch sử thao tác (GET `/api/admin/audit-log?key=&q=&limit=`)

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

## Ngôn ngữ & UX

- **Từ 2026-07-13**: tab **Dashboard** (KPI, insights, charts, Owner Leaderboard, coverage, Pareto) + **nội dung báo cáo sinh ra** (markdown + Excel, daily/weekly) dùng **tiếng Anh**. **Mọi tab/trang khác** (nhập liệu, ghi fix, ưu tiên, so sánh cycle, theo dõi fix, đồng bộ, cài đặt, admin) giữ **tiếng Việt** như trước — không dịch, không "sửa chính tả"
- Emoji trong button label (⬆️, 🔍, ✏️, 🗑️, etc) → quick scan
- Color-coded status: ✅ xanh, ⚠️ cam, ❌ đỏ, ⏳ xám
