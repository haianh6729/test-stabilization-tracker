# Hướng dẫn sử dụng Test Data

## File có sẵn

### 1. `results_sample.txt` — Dữ liệu kết quả test
Dùng để **nhập kết quả chạy test** vào tab "Nhập kết quả" trên dashboard chính.

**Format** (tab-delimited):
```
Test ID | Model | Test Suite | Test Case | Status | Note
```

**Ví dụ**:
```
TID-SAMPLE-001	SM-S721	Camera	Browser_SAMPLE_001 - Chup anh ngoai troi	Pass	Auto focus hoạt động tốt
TID-SAMPLE-002	SM-A175	Camera	Browser_SAMPLE_001 - Chup anh ngoai troi	Pass	Kết quả ổn định
TID-SAMPLE-003	SM-F966	Camera	Browser_SAMPLE_001 - Chup anh ngoai troi	Fail	Ảnh bị mờ do thiếu sáng
```

**Status có thể là**: `Pass`, `Fail`, `Check`, `Manual Check`, `NA`

**Cách dùng**:
1. Mở ứng dụng, vào tab "Nhập kết quả"
2. Copy toàn bộ nội dung file này (trừ dòng header)
3. Paste vào ô **"Paste tab-delimited data"**
4. Bấm **"Phân tích"** để xem dữ liệu
5. Bấm **"Lưu"** để lưu kết quả

---

### 2. `new_scripts_sample.txt` — Dữ liệu script viết mới
Dùng để **nhập dữ liệu script viết mới** vào admin CRUD của tab "Script viết mới".

**Format** (tab-delimited):
```
TC ID | Member | Status | Completed Date | Assign Week | Model 1 | Model 2 | ... | Remark
```

**Ví dụ**:
```
Browser_TEST001	anh.hh	DONE	2026-07-11	28	SM-S721	SM-A175	SM-F966	Script cơ bản cho camera
Browser_TEST002	duyhung.tr	DONE	2026-07-10	27	SM-X526	SM-F741	Kiểm tra zoom quang học
Keyboard_TEST001	tuyen.bv1	SKIP	2026-07-11	28		Chưa phân bổ được resource
```

**Lưu ý**:
- **TC ID**: Bắt đầu với tiền tố hợp lệ (VD: `Browser_`, `Keyboard_`, `Touch_`, `Battery_`, `Display_`, `Connectivity_`, `Audio_`)
- **Status**: `DONE` hoặc `SKIP`
- **Completed Date**: Format YYYY-MM-DD
- **Assign Week**: ISO week number (1-53)
- **Models**: Các model được chọn, cách nhau bởi tab (để trống nếu không có)
- **Remark**: Ghi chú tự do (bắt buộc nếu Status=SKIP)

**Cách dùng**:
1. Mở ứng dụng, vào tab "Cài đặt" → tìm nút "/admin/..." để vào trang quản trị
2. (hoặc truy cập trực tiếp `http://localhost:5000/admin/haianh6729`)
3. Vào tab **"New Scripts"** trong admin panel
4. Tìm phần "Nhập hàng loạt"
5. Copy toàn bộ nội dung file này (trừ dòng header nếu có)
6. Paste vào ô **"Paste tab-delimited"**
7. Bấm **"Nhập dữ liệu"** để import

---

## Cách tạo test data của riêng bạn

### Kết quả test (`results_sample.txt`):
```
Tạo file CSV/TSV với cột:
1. Test ID (tự do, ví dụ: TID-001, RUN-2026-001, v.v.)
2. Model phone (ví dụ: SM-S721, SM-A175, SM-F966, v.v.)
3. Test Suite (ví dụ: Camera, Keyboard, Battery, Display, v.v.)
4. Test Case (ví dụ: Browser_001, Touch_DRAG, v.v.)
5. Status (Pass / Fail / Check / Manual Check / NA)
6. Notes (ghi chú tự do)

Dùng TAB làm delimiter, không dùng dấu phẩy.
```

### Script viết mới (`new_scripts_sample.txt`):
```
Tạo file TSV với cột:
1. TC ID (bắt đầu với tiền tố: Browser_, Keyboard_, Touch_, Battery_, Display_, Connectivity_, Audio_)
2. Member name (tên đã tồn tại trong danh sách Owner, hoặc sẽ được thêm mới)
3. Status (DONE hoặc SKIP)
4. Completed Date (YYYY-MM-DD, ví dụ: 2026-07-11)
5. Assign Week (1-53, tính toán tự động từ Completed Date nếu có)
6. Model 1, Model 2, Model 3, ... (các model được chọn, mỗi model một cột)
7. Remark (ghi chú, bắt buộc nếu Status=SKIP)

Dùng TAB làm delimiter.
```

---

## Tips khi test

1. **Member không tồn tại**: Nếu Member chưa có trong danh sách Owner, hệ thống sẽ tự thêm. Bạn có thể chỉnh Team sau ở tab "Cài đặt"

2. **Model không tồn tại**: Chỉ có thể chọn model đã có trong danh sách. Thêm model mới ở tab "Cài đặt" trước

3. **Status = DONE**: Bắt buộc chọn ít nhất 1 model

4. **Status = SKIP**: Bắt buộc có Remark giải thích lý do

5. **TC ID tùy chọn**: Tiền tố phải khớp với 1 trong những item được định nghĩa (Browser, Keyboard, Touch, Battery, Display, Connectivity, Audio)

6. **Xoá dữ liệu test**:
   - Tab "Nhập kết quả": Xoá từ admin → Results
   - Tab "Script viết mới": Xoá từ admin → New Scripts (có nút delete)
   - Tab "Theo dõi Fix": Xoá từ admin → Fix Log (có nút delete)
