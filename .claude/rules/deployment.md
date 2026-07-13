# Deployment & Secrets

## Secrets (Hardcode hiện tại)

**Điểm yếu bảo mật đã biết** — không tự "sửa" thành env vars trừ khi người dùng yêu cầu.

Trong `app.py`:
- **`ADMIN_SECRET_KEY = "haianh6729"`**: secret key để truy cập `/admin/<secret_key>` page (CRUD admin)
- **`DEFAULT_RESET_PASSWORD = "abc123"`**: mật khẩu mặc định reset tài khoản + auto-create owner
- **`app.secret_key`**: Flask session encryption key (hardcode)

Trong `tracker.db` (bảng settings, mới 2026-07-12): token API farm/công ty/GitHub + `import_token` lưu **plaintext trong DB** (nhất quán với stance hardcode hiện tại). API `GET /api/settings` trả về dạng mask `********`; POST giá trị mask = giữ nguyên token cũ.

## .gitignore hiện tại

```
__pycache__/
*.pyc
.claude/settings.local.json
backups/          # snapshot DB hằng ngày — không commit
```

⚠️ **`tracker.db` và `users.db` hiện VẪN đang được git track và push lên GitHub** (users.db chứa password hash). Đề xuất C3 (gỡ bằng `git rm --cached` + gitignore) đã được nêu trong `docs/dexuatcaitien.md` nhưng chủ dự án quyết định **để sau** (2026-07-12). Khi thực hiện: bản cũ vẫn còn trong lịch sử git — cân nhắc đổi mật khẩu mặc định sau đó.

## Chạy

```bash
pip install -r requirements.txt
python app.py        # 0.0.0.0:5000
```

- Không có build step, không có test runner
- Không có linter/formatter setup
- Database (tracker.db, users.db) tạo tự động lần đầu; backup tự động vào `backups/` (daemon thread trong app, không cần cron)
- Chủ dự án chọn giữ Flask dev server đơn giản (không cài thêm WSGI server) — HTTP outbound dùng `urllib` stdlib, không thêm pip package
- **Restart server để áp dụng code mới**: server production chạy nền trên port 5000 — sau khi sửa code phải kill process cũ rồi `python app.py` lại (migration tự chạy)

## Cập nhật code

- **Thay đổi schema?** → thêm migration vào `init_db()` hoặc `init_users_db()`, **không sửa CREATE TABLE**
- **Thêm route mới?** → thêm `@app.route()`, apply `@require_login` + `@require_perm()` nếu cần
- **Thay đổi secret?** → edit constant, restart server (session cũ sẽ invalid)
- **Test?** → chạy server, test tay qua UI hoặc curl, hoặc paste sample data từ `test_data/`

## Đặc điểm hiện tại

- Single file `app.py` (~5800 dòng): tất cả routes, business logic, DB helpers, integrations, reports (markdown + Excel multi-sheet), backup
- Outbound API (mới 2026-07-12, qua `_http_json()` urllib): farm API (fetch kết quả theo Test ID), API hệ thống công ty (danh sách TC), GitHub API (git trees). **Adapter farm/công ty là stub chờ tài liệu API** — cấu hình URL/token trong tab Cài đặt; fallback paste tay dùng được ngay
- Script phía farm có thể push kết quả: `POST /api/results/import` + header `X-Import-Token` (token đặt trong Cài đặt)
- LAN-only (không qua internet), 10 tabs UI, ~1200 scripts / 60 tài khoản dữ liệu thật
