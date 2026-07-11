# Auth System & Permissions

Hệ thống tài khoản và phân quyền theo tab chức năng (2026-07-11).

## Kiến trúc

- **Hai DB file riêng biệt**:
  - `tracker.db`: dữ liệu nghiệp vụ sống (results, fixes, assignments, owners)
  - `users.db`: tài khoản + mật khẩu hash (werkzeug) — **cũng là dữ liệu sống**, không xoá/reset tuỳ tiện

- **Startup flow**:
  1. `init_db()` → tạo/migrate `tracker.db`
  2. `init_users_db()` → tạo/migrate `users.db`, seed `anh.hh` (admin), **auto-backfill accounts cho toàn bộ owner active** (role=user, perms mặc định)
  3. Thêm owner mới qua UI/API → auto-create account ngay (không cần đăng ký thủ công)

## Login & Session

- Routes: `/login`, `/register` (HTML form pages) + `/api/auth/login`, `/api/auth/register`, `/api/auth/logout`, `/api/me`, `/api/auth/change-password`
- Gating: `/` redirect → `/login` nếu chưa auth. Auth dùng Flask session (secret key hardcode ở `app.secret_key`)
- Constraint: **chỉ owner active mới login được** (owner.active=1 ở tracker.db). Deactivate owner → lock account.

## Roles & Permissions

```python
3 roles + mặc định:
  - admin      → 8 tab (toàn quyền)
  - moderator  → 8 tab (toàn quyền)
  - user       → 6 tab (không input-results, không settings)

ALL_TABS = [
  'dashboard', 'input-results', 'input-fix', 'new-scripts',
  'priority', 'cycle-compare', 'fix-tracking', 'settings'
]
```

- Per-account `permissions` field (CSV): override role defaults khi admin custom
- Changing role → reset permissions về mặc định của role đó (rồi có thể custom lại)

## Enforcement (2-layer)

1. **Frontend** (`app.js` + `index.html`):
   - `/api/me` → fetch user info (username, role, permissions)
   - `applyPermissions()` → ẩn tab button/panel nếu user không có quyền
   - Polling 15s → re-sync permissions nếu admin đổi (phản ánh ≤15s)

2. **Backend** (`app.py`):
   - `@require_login` decorator → 401 nếu chưa auth
   - `@require_perm("tab_name")` decorator → 403 nếu không có quyền
   - `perm_error("tab_name")` inline check cho handler GET+POST hỗn hợp (không check GET)
   - Reads (GET) **không gate** bởi permission (hỗ trợ polling lấy dữ liệu)

## Admin Page (`/admin/<ADMIN_SECRET_KEY>`)

- **Không thay đổi auth**: vẫn dùng `ADMIN_SECRET_KEY` trong URL (không cần login)
- **Tab mới "👥 Tài khoản"**: list users, đổi role, custom perms per user, reset PW → `abc123`, toggle active, delete (chỉ inactive)
- **Tab mới "🧑‍🤝‍🧑 Owner & Team"**: list owners, thêm/đổi tên/đổi team/deactivate/hard-delete
- **Cascade sync**:
  - Rename owner → cascade username ở users.db
  - Deactivate owner → deactivate account (vô hiệu hóa login)
  - Hard-delete owner → delete account (khi inactive, không còn tham chiếu)

## Mật khẩu mặc định

- **`DEFAULT_RESET_PASSWORD = "abc123"`** — dùng cho:
  - Seed `anh.hh` lần đầu (lần sau giữ nguyên)
  - Admin reset password user → `abc123`
  - Auto-create account cho owner mới → password = `abc123`

- **`SUBMIT_PASSWORD = "smartlab1@"`** — **riêng biệt**, dùng cho form "Nhập kết quả" (tab submit data), không liên quan tài khoản

## Registration

- `/register` form: **chỉ chấp nhận username = active owner name** (không owner lạ, không owner ngừng hoạt động)
- Sau auto-backfill, hầu hết owner đã có account → đăng ký sẽ báo "account exists"
- Vẫn hữu ích: nếu admin xoá hẳn 1 account mà owner vẫn active → owner có thể tự đăng ký lại

## Key Functions

- `ensure_account_for_owner(udb, name)`: tạo user nếu chưa có (idempotent, không ghi đè)
- `owner_op_add()`: helper tạo owner, gọi auto-create account
- `owner_op_rename()`, `owner_op_deactivate()`, `owner_op_hard_delete()`: cascade sync username
- `require_login`, `require_perm(tab)`: decorators gate permission
- `perms_to_list()`, `owner_is_active()`, `current_user()`, `perm_error()`
