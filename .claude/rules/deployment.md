# Deployment & Secrets

## Secrets (Hardcode hiện tại)

**Điểm yếu bảo mật đã biết** — không tự "sửa" thành env vars trừ khi người dùng yêu cầu.

Trong `app.py`:
- **`ADMIN_SECRET_KEY = "haianh6729"`**: secret key để truy cập `/admin/<secret_key>` page (CRUD admin)
- **`DEFAULT_RESET_PASSWORD = "abc123"`**: mật khẩu mặc định reset tài khoản + auto-create owner
- **`app.secret_key`**: Flask session encryption key (hardcode)

**Khuyến cáo**: app không có authentication system thực thụ (README ghi rõ). Nếu sau này cần production-grade auth → tạo issue riêng.

## .gitignore (khi khởi tạo git)

```
__pycache__/
*.pyc
*.egg-info/
.env
.vscode/

# Live data files — KHÔNG commit
tracker.db
users.db
```

**Quyết định trước khi commit**: tracker.db chứa dữ liệu sản xuất → hỏi người dùng commit hay gitignore.

## Chạy

```bash
pip install -r requirements.txt
python app.py        # 0.0.0.0:5000
```

- Không có build step, không có test runner
- Không có linter/formatter setup
- Database (tracker.db, users.db) tạo tự động lần đầu
- Production: nên dùng WSGI server (gunicorn, etc), không dùng Flask dev server

## Cập nhật code

- **Thay đổi schema?** → thêm migration vào `init_db()` hoặc `init_users_db()`, **không sửa CREATE TABLE**
- **Thêm route mới?** → thêm `@app.route()`, apply `@require_login` + `@require_perm()` nếu cần
- **Thay đổi secret?** → edit constant, restart server (session cũ sẽ invalid)
- **Test?** → chạy server, test tay qua UI hoặc curl, hoặc paste sample data từ `test_data/`

## Đặc điểm hiện tại

- Single file `app.py` (~3300 dòng): tất cả routes, business logic, DB helpers
- No external API calls (tự chứa toàn bộ logic)
- LAN-only (không qua internet)
- ~8 tabs UI, vài trăm scripts/owners dữ liệu
