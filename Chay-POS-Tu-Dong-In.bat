@echo off
chcp 65001 >nul
echo ===================================================================
echo     BÚN MẮM MIỀN TÂY POS - CHẾ ĐỘ TỰ ĐỘNG IN (KIOSK SILENT PRINT)
echo ===================================================================
echo.
echo [*] Đang khởi động POS trên Google Chrome chế độ in tự động ngầm...
echo [*] Bất kỳ điện thoại nào bấm "In Báo Bếp", máy in sẽ tự động in ngay
echo     lập tức mà KHÔNG CẦN bấm nút xác nhận trên màn hình!
echo.
echo ===================================================================

start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir="%LOCALAPPDATA%\Google\Chrome\POS_Profile" --kiosk-printing --app="https://pos-cuahang.onrender.com/"

exit
