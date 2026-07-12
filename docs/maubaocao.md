# Bộ mẫu báo cáo định kỳ — Test Stabilization

Nguyên tắc chung:

- **Mọi con số lấy từ hệ thống**, không tính tay: tab 📊 Dashboard (KPI, trend, insights), 📋 Bảng ưu tiên, 🔬 Theo dõi Fix, và file **⬇️ Xuất Excel** (8 sheet: Dashboard, Script_Priority_Tracker, Owner_Leaderboard, RootCause_Pareto, Test_Suite_Summary, Daily_Fix_Log, History_Log, Instructions).
- Xuất Excel **cuối mỗi ngày** → vừa là phụ lục báo cáo, vừa là snapshot lưu trữ để so sánh tuần/tháng.
- Cột "Nguồn" trong các mẫu dưới chỉ rõ lấy số ở đâu trong hệ thống.

---

## 1. BÁO CÁO NGÀY (gửi cuối ngày, ~10 phút soạn)

> **[Stabilization Daily] Cycle {N} — {dd/mm/yyyy}**
>
> **1. Kết quả cycle hôm nay**
> | Chỉ số | Hôm nay | Hôm qua | Δ | Nguồn |
> |---|---|---|---|---|
> | Pass rate | …% | …% | ▲/▼…% | Dashboard – trend |
> | Tổng script chạy | … | … | | Dashboard KPI |
> | Script còn lỗi | … | … | ▲/▼ | Dashboard KPI `still_failing` |
> | Số lỗi tăng/giảm so cycle trước | +…/−… | | | Dashboard – delta_fail |
> | P0 (fail 4–5 model) | … | … | | Dashboard tier_counts |
>
> **2. Fix trong ngày**
> - Fix mới ghi nhận: **…** (bởi … người) — *nguồn: Daily_Fix_Log lọc theo ngày*
> - Kết quả verify fix cycle trước: ✅ hết lỗi: … · ⚠️ fail lại: … · ❌ chưa hết: … · ⏳ chờ: … — *nguồn: tab Theo dõi Fix*
> - Fix fail lại / chưa hết cần chú ý: `{Test Case}` — {owner} — {lý do, hướng xử lý}
>
> **3. Cảnh báo & nhận định** *(chép từ "Nhận định tự động" + bổ sung đánh giá của lead)*
> - Model yếu nhất: **{model}** ({rate}%) — {lỗi device hay lỗi script?}
> - Top root cause hôm nay: **{nguyên nhân}** ({n} lỗi)
> - Tốc độ fix: {x} script/ngày so với mức cần {y}/ngày → {đủ/thiếu}
>
> **4. Test farm**
> | Chỉ số | Giá trị | Ghi chú |
> |---|---|---|
> | Device hoạt động / tổng | …/… | model nào thiếu device |
> | Run hoàn thành / dự kiến | …/… | thiếu = run treo/không chạy |
> | Kết quả RUNNING sót (chưa xong) | … | nghẽn farm nếu nhiều |
> | Sự cố hạ tầng trong ngày | … | device treo, mất mạng, re-run |
> | Fail do Infra/Device | … lỗi | root cause `Infra/Device` |
>
> **5. Kế hoạch ngày mai**: fix {n} script (danh sách P0/P1 đã gán), batch-fix nhóm nguyên nhân {X}, farm cần {sửa device Y…}
>
> **6. Blocker cần hỗ trợ**: …

## 2. BÁO CÁO TUẦN (gửi chiều thứ 6, ~30 phút soạn)

> **[Stabilization Weekly] Tuần {W} ({dd/mm–dd/mm}) — Cycle {a}–{b}**
>
> **1. Tóm tắt điều hành (3–5 dòng)**
> Pass rate {đầu tuần}% → {cuối tuần}% (mục tiêu 85%, deadline {ngày} — còn {n} ngày). {Đánh giá 1 câu: đúng tiến độ / chậm, vì sao}. {1 quyết định/đề nghị chính}.
>
> **2. Chỉ số chính vs mục tiêu**
> | Chỉ số | Tuần trước | Tuần này | Mục tiêu | Nguồn |
> |---|---|---|---|---|
> | Pass rate (cycle cuối tuần) | | | ≥85% | Dashboard trend |
> | Script còn lỗi | | | ≤ {15% tổng} | KPI still_failing |
> | Số script phải fix thêm để đạt target | | | ↓ | KPI fails_to_fix |
> | Tốc độ fix cần thiết (script/ngày) | | | | KPI required_rate_per_day |
> | Tốc độ fix thực tế (script/ngày) | | | ≥ mức cần | Daily_Fix_Log đếm theo tuần |
> | P0 / P1 | | | P0 = 0 | tier_counts |
> | Tiến độ viết mới | …/200 (…%) | | theo kế hoạch | tab Script viết mới |
>
> **3. Xu hướng** — dán chart pass rate theo cycle (Dashboard) hoặc sheet Dashboard trong Excel đính kèm.
>
> **4. Theo 7 ứng dụng** *(nguồn: Test_Suite_Summary)*
> | App/Suite | Tổng script | Done | Còn lỗi | Done % | Ghi chú |
> |---|---|---|---|---|---|
> | Internet | | | | | |
> | Keyboard | | | | | |
> | Weather | | | | | |
> | Wallpaper | | | | | |
> | SamsungMember | | | | | |
> | Reminder | | | | | |
> | Now-brief | | | | | |
>
> **5. Root cause Pareto (top 5)** *(nguồn: RootCause_Pareto)* — mỗi dòng kèm hành động:
> | Nguyên nhân | Số lỗi | % | Hành động tuần sau / người phụ trách |
> |---|---|---|---|
>
> **6. Chất lượng fix & team** *(nguồn: Owner_Leaderboard + Theo dõi Fix)*
> - Resolution Rate toàn team: …% · Verification Rate: …% · Tỉ lệ reopen (⚠️ fail lại): …% (mục tiêu ≤10%)
> - Ghi nhận nổi bật: {owner} … · Cần hỗ trợ: {owner} … (lý do, kế hoạch kèm cặp)
> - Cân bằng workload: ai đang quá tải (Open Workload > 10) → điều chỉnh gì
>
> **7. Test farm tuần**
> | Chỉ số | Giá trị | Tuần trước |
> |---|---|---|
> | Device availability trung bình | …% | |
> | Số cycle chạy trọn vẹn / kế hoạch | …/… | |
> | % fail do Infra/Device (trên tổng fail) | …% | |
> | Sự cố lớn + thời gian khắc phục | | |
> | Kế hoạch bảo trì / thay device tuần sau | | |
>
> **8. Rủi ro & đề nghị**: {rủi ro, tác động, đề nghị cụ thể — thêm người/thiết bị/lùi mốc…}
>
> **Đính kèm**: `Test_Stabilization_Tracker_{ngày}.xlsx`

## 3. Checklist số liệu trước khi gửi

- [ ] Kết quả cycle mới nhất đã nhập đủ (số kết quả ≈ số script × số model dự kiến)?
- [ ] Mọi fix trong kỳ đã được ghi nhận (hỏi nhanh trong standup)?
- [ ] Đã xuất Excel snapshot và đính kèm?
- [ ] Con số pass rate trong báo cáo khớp Dashboard (không tính tay)?
- [ ] Fail do farm đã ghi root cause `Infra/Device` (không lẫn vào chất lượng script)?

## 4. Gợi ý kênh gửi

- Daily: nhắn kênh chat nhóm (paste nguyên khối markdown trên).
- Weekly: email cho quản lý cấp trên + kênh chat, đính kèm Excel.
- Cuối tháng: dùng chính mẫu weekly nhưng so sánh 4 tuần + cập nhật ramp plan trong [chien-luoc-quan-ly.md](chien-luoc-quan-ly.md).
