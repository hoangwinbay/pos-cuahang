@echo off
chcp 65001 >nul
echo ===================================================================
echo     BÚN MẮM MIỀN TÂY POS - CHẾ ĐỘ TỰ ĐỘNG IN (KIOSK SILENT PRINT)
echo ===================================================================
echo.
echo [*] Đang đóng cửa sổ POS cũ để giải phóng cache...
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"name = 'chrome.exe'\" | Where-Object { $_.CommandLine -like '*POS_Profile*' -or $_.CommandLine -like '*pos-cuahang*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" 2>nul
timeout /t 1 /nobreak >nul
echo [*] Đang dọn dẹp cache để đảm bảo chạy phiên bản mới nhất...
rmdir /s /q "%LOCALAPPDATA%\Google\Chrome\POS_Profile\Default\Cache" 2>nul
rmdir /s /q "%LOCALAPPDATA%\Google\Chrome\POS_Profile\Default\Code Cache" 2>nul
rmdir /s /q "%LOCALAPPDATA%\Google\Chrome\POS_Profile\Default\GPUCache" 2>nul
rmdir /s /q "%LOCALAPPDATA%\Google\Chrome\POS_Profile\Default\DawnGraphiteCache" 2>nul
rmdir /s /q "%LOCALAPPDATA%\Google\Chrome\POS_Profile\Default\DawnWebGPUCache" 2>nul
rmdir /s /q "%LOCALAPPDATA%\Google\Chrome\POS_Profile\Default\Service Worker" 2>nul
echo [*] Đang khởi động POS trên Google Chrome chế độ in tự động...
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir="%LOCALAPPDATA%\Google\Chrome\POS_Profile" --disk-cache-size=1 --media-cache-size=1 --kiosk-printing --app="https://pos-cuahang.onrender.com/"
exit
