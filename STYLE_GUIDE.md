# 🎨 QUY TẮC THIẾT KẾ & STYLE TỐI GIẢN CHỮ (MINIMALIST UI & TYPOGRAPHY)

> **Mục đích:** Tài liệu kim chỉ nam cho thiết kế giao diện Web POS. Mọi màn hình, modal, nút bấm và thông báo bắt buộc phải tuân theo phong cách tối giản chữ (Zero-Bloat Text), loại bỏ mọi văn bản thừa thãi, rườm rà.

---

## 🌟 1. Triết lý Thiết kế Cốt lõi (Core Philosophy)

1. **"Giao diện trực quan tự giải thích"**: Người dùng ngày nay đã rất quen thuộc với smartphone. Giao diện tốt là giao diện người dùng nhìn vào biết bấm ngay, không cần đọc hướng dẫn.
2. **Loại bỏ văn bản giải thích dài dòng**:
   - ❌ **CẤM:** Các khung hướng dẫn màu mè dài dòng: *"Bước 1: Mở Camera trên điện thoại... Bước 2: Quét mã QR... Bước 3: Bấm vào liên kết..."*.
   - ✅ **ĐÚNG:** Chỉ hiển thị đối tượng chính (Mã QR, danh sách, bảng giá) kèm tối đa 1 dòng phụ đề ngắn gọn (`text-[11px] text-slate-400`).
3. **Ưu tiên khoảng trắng và phân cấp thị giác**: Tận dụng khoảng cách (`space-y-*`, `p-*`), bo góc mềm mại (`rounded-2xl`), và icon trực quan (`FontAwesome 6`) thay cho những đoạn văn dài.

---

## ✍️ 2. Quy Tắc Vàng Về Chữ & Nội Dung (Typography Rules)

### A. Tiêu Đề (Headings & Modal Titles)
- **Độ dài:** Tối đa **2 – 4 từ**, ngắn gọn, rõ ràng, đanh thép.
- **Kích thước:** `text-sm` đến `text-base`, `font-bold` hoặc `font-black`, màu `text-slate-800`.
- **Ví dụ so sánh:**
  - ❌ *Bảng tạo mã QR quét điện thoại cho nhân viên vào gọi món*
  - ✅ **Mã QR Thêm Nhân Viên**
  - ❌ *Danh sách các thiết bị di động và tài khoản đang đồng bộ dữ liệu*
  - ✅ **Thiết Bị & Nhân Viên**

### B. Nhãn Nhập Liệu (Input Labels & Placeholders)
- **Label:** `text-xs font-semibold text-slate-700`, tối đa 2-3 từ.
- **Placeholder:** Gợi ý ngắn gọn (Ví dụ: `Nhập họ tên`, `0912345678`).
- Không thêm câu hướng dẫn bên dưới ô input nếu ô đó đã rõ ràng.

### C. Nút Bấm Hành Động (Action Buttons)
- **Độ dài:** Tối đa **1 – 3 từ**, luôn bắt đầu bằng động từ hành động.
- **Cỡ chữ:** `text-xs font-bold`.
- **Ví dụ so sánh:**
  - ❌ *Nhấn vào đây để sao chép liên kết vào bộ nhớ tạm*
  - ✅ **Sao chép**
  - ❌ *Mở thử giao diện gọi món trên một tab trình duyệt mới*
  - ✅ **Mở tab mới**
  - ❌ *Bấm vào đây để đóng cửa sổ này lại*
  - ✅ **Đóng**

### D. Phụ Đề & Chú Thích (Helper / Metadata Text)
- **Độ dài:** Tối đa **1 dòng duy nhất**.
- **Cỡ chữ:** `text-[10px]` hoặc `text-[11px]`, `font-medium`, màu `text-slate-400` hoặc `text-slate-500`.
- **Ví dụ:**
  - `Dùng Camera iPhone / Android quét mã`
  - `Quét điện thoại để vào đặt món`
  - `1 Online`

### E. Thông Báo Trạng Thái & Lỗi (Toasts & Error Messages)
- **Nguyên tắc:** Nói thẳng vào vấn đề, không vòng vo.
- **Ví dụ:**
  - ❌ *Rất tiếc, đã có lỗi xảy ra trong quá trình hệ thống cố gắng lưu lại thông tin tài khoản nhân viên này.*
  - ✅ **Không thể lưu thông tin**
  - ❌ *Bạn chưa điền đầy đủ số điện thoại của nhân viên, vui lòng kiểm tra lại.*
  - ✅ **Vui lòng nhập số điện thoại**

---

## 📐 3. Bảng Phân Cấp Typography Tailwind (Cheat Sheet)

| Thành phần UI | Tailwind Classes | Kích thước & Trọng số | Màu sắc khuyên dùng |
| :--- | :--- | :--- | :--- |
| **Tiêu đề App/Trang** | `text-base sm:text-lg font-black` | 16-18px, Black | `text-slate-900` |
| **Tiêu đề Modal** | `text-sm sm:text-base font-bold` | 14-16px, Bold | `text-slate-800` |
| **Tiêu đề Nhóm/Section** | `text-xs font-bold uppercase tracking-wider` | 12px, Bold | `text-slate-500` |
| **Nội dung chính / Thẻ** | `text-xs sm:text-sm font-semibold` | 12-14px, Semibold | `text-slate-800` |
| **Nhãn Form (Label)** | `text-xs font-semibold` | 12px, Semibold | `text-slate-700` |
| **Nút bấm (Button)** | `text-xs font-bold` | 12px, Bold | Nền màu: `text-white`, Nền phụ: `text-slate-700` |
| **Phụ đề / Gợi ý** | `text-[11px] font-medium` | 11px, Medium | `text-slate-400` |
| **Huy hiệu (Badge/Tag)** | `text-[9px] sm:text-[10px] font-black px-1.5 py-0.5 rounded-full` | 9-10px, Black | `bg-emerald-100 text-emerald-700` |
| **Mã số / Tiền tệ** | `font-mono font-bold text-xs sm:text-sm` | Mono, Bold | `text-emerald-700` hoặc `text-slate-700` |

---

## 🛡️ 4. Quy Tắc Sinh Mã QR Không Trắng (Zero-Fail QR Rule)

1. **Không phụ thuộc API ảnh ngoài**: Không sử dụng `https://api.qrserver.com` đơn thuần vì sẽ bị trắng khi mất mạng internet hoặc chạy mạng LAN nội bộ.
2. **Tích hợp thư viện Offline**: Dùng `qrcode.min.js` (Canvas/SVG cục bộ), sinh mã QR trực tiếp trong bộ nhớ trình duyệt tức thì (< 5ms).
3. **Luôn có thẻ chứa Canvas (`#...CanvasContainer`)** kèm ảnh dự phòng, đảm bảo bất kể hoàn cảnh nào QR code cũng hiển thị rõ nét 100%.

---
*Tài liệu này được lưu trữ tại `STYLE_GUIDE.md` và `ANTIGRAVITY.md` để đảm bảo mọi phiên bản thiết kế web luôn giữ vững chuẩn mực tối giản.*
