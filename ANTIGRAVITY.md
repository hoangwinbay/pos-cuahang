# ANTIGRAVITY INSTRUCTIONS: WEB POS DESIGN & TYPOGRAPHY STANDARDS

## 🎯 QUY TẮC BẮT BUỘC KHI THIẾT KẾ WEB & UI
Khi thực hiện bất kỳ thay đổi nào liên quan đến giao diện Web POS trong dự án này, BẮT BUỘC tuân thủ:

1. **STYLE TỐI GIẢN CHỮ (ZERO-BLOAT TEXT)**:
   - **Tuyệt đối không thêm các box hướng dẫn dài dòng**: Người dùng smartphone đã biết cách dùng, không tạo các box "Bước 1: Mở camera... Bước 2: Quét mã...".
   - **Tiêu đề đanh thép, ngắn gọn**: Tối đa 2 - 4 từ (Ví dụ: "Mã QR Thêm Nhân Viên", "Thiết Bị & Nhân Viên").
   - **Nút bấm hành động**: 1 - 3 từ bắt đầu bằng động từ ("Sao chép", "Đóng", "Mở tab mới", "Thanh toán").
   - **Phụ đề / Helper text**: Tối đa 1 dòng, cỡ chữ nhỏ `text-[11px] text-slate-400`.
   - **Chi tiết xem thêm tại:** [STYLE_GUIDE.md](file:///d:/POS/STYLE_GUIDE.md).

2. **SINH MÃ QR OFFLINE (KHÔNG ĐỂ TRẮNG HÌNH)**:
   - Sử dụng thư viện `public/js/qrcode.min.js` (hàm `renderQrCodeHelper`) để render QR code qua HTML5 Canvas trực tiếp trong trình duyệt.
   - Không được phụ thuộc thuần túy vào API ảnh bên thứ 3 (như `api.qrserver.com`) vì sẽ bị trắng khi offline / mạng LAN / chặn quảng cáo.

3. **LUÔN REBUILD MOUNT VÀ DEPLOY RENDER**:
   - Mỗi lần sửa `public/index.html`, luôn chạy `npm run build` để đồng bộ template `public/js/mount.js`.
   - Sau khi hoàn thành, commit và `git push origin main` để Render tự động deploy lên `https://pos-cuahang.onrender.com`.
