# HỆ THỐNG BÁN HÀNG POS (POINT OF SALE) CHUYÊN NGHIỆP

Hệ thống POS bán hàng hiện đại, đa thiết bị, hỗ trợ chạy đồng thời trên **máy tính PC/Laptop của chủ cửa hàng** và **điện thoại di động của nhân viên** qua mạng Wi-Fi nội bộ.

---

## 🌟 TÀI KHOẢN VÀ PHÂN QUYỀN HỆ THỐNG

Hệ thống phân chia 2 cấp quyền rõ ràng:

### 👑 1. Tài khoản Chủ Cửa Hàng (Admin)
- **Tên đăng nhập:** `admin`
- **Mật khẩu:** `123`
- **Mã PIN nhanh:** `9999`
- **Quyền hạn:** **Toàn quyền cao nhất**
  - Bán hàng, tính tiền, in hóa đơn.
  - Xem báo cáo doanh thu, lợi nhuận thực tế (Doanh thu - Giá vốn), số lượng đơn hàng và biểu đồ thống kê.
  - Quản lý giá vốn nhập hàng, giá bán lẻ, điều chỉnh tồn kho, thêm/sửa/xóa sản phẩm.
  - Quản lý danh sách tài khoản nhân viên (Thêm nhân viên mới, đổi mật khẩu, đổi mã PIN, khóa tài khoản).
  - Quyền hủy hóa đơn và tự động hoàn trả tồn kho.
  - Cài đặt thông tin cửa hàng và tài khoản ngân hàng nhận tiền VietQR.

### 👤 2. Tài khoản Nhân Viên Thu Ngân (Staff)
- **Tên đăng nhập:** `nhanvien`
- **Mật khẩu:** `123`
- **Mã PIN nhanh:** `1234`
- **Quyền hạn:** **Phục vụ bán hàng trực tiếp trên điện thoại hoặc quầy thu ngân**
  - Tìm kiếm sản phẩm, quét mã vạch và thêm vào giỏ hàng.
  - Áp dụng giảm giá, chọn phương thức tiền mặt hoặc hiện mã VietQR cho khách quét.
  - In hóa đơn tính tiền (Hóa đơn ghi rõ tên nhân viên thu ngân phụ trách đơn hàng).
  - Tra cứu hóa đơn trong ca làm việc.
  - **DỮ LIỆU BẢO MẬT BỊ KHÓA:**
    - ❌ **Ẩn hoàn toàn Giá vốn nhập hàng** (nhân viên không thấy giá nhập và biên lợi nhuận của cửa hàng).
    - ❌ **Ẩn hoàn toàn Báo cáo doanh thu & Lợi nhuận**.
    - ❌ **Không được quyền Thêm / Sửa / Xóa sản phẩm**.
    - ❌ **Không được quyền Hủy hóa đơn đã thanh toán** (tránh gian lận, chỉ chủ quán mới được hủy đơn).
    - ❌ **Không được quyền truy cập Cài đặt cửa hàng & Quản lý nhân viên**.

## 📱 MÔ HÌNH 100% ĐIỆN THOẠI KHÔNG CẦN MÁY TÍNH

Nếu bạn **không muốn bật máy tính**, hoàn toàn có thể vận hành quán 100% trên điện thoại di động:

### 1. Kết nối Điện Thoại với Máy In Bill
- **Máy in nhiệt Bluetooth cầm tay (Khuyên dùng):**
  - Mua máy in bill Bluetooth mini (VD: Xprinter XP-P58C, PT-210, MPT-II... giá ~300k - 500k).
  - Bật Bluetooth trên điện thoại, vào POS bấm nút **`Máy In`** $\rightarrow$ **`Quét & Kết Nối Máy In`**.
  - Điện thoại tự động in trực tiếp qua sóng Bluetooth (công nghệ Web Bluetooth ESC/POS), không cần cài thêm ứng dụng nào khác!
- **Máy in nhiệt Wi-Fi / LAN:**
  - Cắm máy in vào modem Wi-Fi của quán.
  - In trực tiếp từ điện thoại qua chức năng in hệ thống (iOS AirPrint hoặc Android Print Service).

### 2. Chạy POS 24/7 Không Cần Bật Máy Tính
- **Cách 1: Đưa lên Cloud miễn phí (Render / Railway / Glitch)**
  - Hệ thống sẽ có link web riêng (VD: `https://taphoa-pos.onrender.com`).
  - Bạn và nhân viên có thể tắt hoàn toàn máy tính. Cả 2 đều mở điện thoại từ bất cứ đâu (4G hoặc Wi-Fi).
  - Cài làm App điện thoại: Mở trên Chrome/Safari $\rightarrow$ Bấm **"Thêm vào màn hình chính" (Add to Home Screen)** để tạo icon ứng dụng riêng biệt.
- **Cách 2: Dùng 1 điện thoại Android cũ làm máy chủ tại quán (Termux)**
  - Chạy `node server.js` trực tiếp trên điện thoại Android, cắm sạc cả ngày chỉ tốn vài Watt điện.

## 🚀 CÁCH KHỞI ĐỘNG HỆ THỐNG

### Cách 1: Bấm trực tiếp file khởi động (Khuyên dùng trên Windows)
- Bấm đúp chuột vào file **`start.bat`** trong thư mục `D:\POS`.
- Trình duyệt sẽ tự động mở trang bán hàng tại địa chỉ `http://localhost:3000`.

### Cách 2: Khởi động qua Terminal
```bash
npm start
```
Terminal sẽ hiển thị địa chỉ máy chủ nội bộ cho điện thoại:
```
=================================================
🚀 POS SERVER ĐÃ KHỞI ĐỘNG THÀNH CÔNG!
💻 Máy tính: http://localhost:3000
📱 Điện thoại nhân viên: http://192.168.10.58:3000
=================================================
```

---

## ⌨️ PHÍM TẮT THAO TÁC NHANH (TRÊN MÁY TÍNH)

| Phím tắt | Chức năng |
| :--- | :--- |
| `F1` | Chuyển đến màn hình **Bán Hàng** |
| `F2` | Focus vào ô **Tìm kiếm / Quét mã vạch** (hoặc mở trang Sản phẩm) |
| `F3` | Mở danh sách **Lịch sử Hóa Đơn** |
| `F4` | Mở bảng **Báo Cáo & Doanh Thu** (Chủ cửa hàng) |
| `F9` | Mở hộp thoại **Thanh Toán Đơn Hàng** |
| `Esc` | Đóng các cửa sổ Popup / Modal / Giỏ hàng |
