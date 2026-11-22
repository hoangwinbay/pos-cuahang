@echo off
chcp 65001 >nul
echo ===================================================================
echo     BÚN MẮM MIỀN TÂY POS - CHẾ ĐỘ TỰ ĐỘNG IN (KIOSK SILENT PRINT)
echo ===================================================================
echo.
echo [*] Đang tìm kiếm đường dẫn Google Chrome...
set "CHROME_BIN="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME_BIN=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME_BIN=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "CHROME_BIN=%LocalAppData%\Google\Chrome\Application\chrome.exe"

if "%CHROME_BIN%"=="" (
    echo [!] KHONG TIM THAY GOOGLE CHROME TREN MAY!
    echo Vui long cai dat Google Chrome truoc khi chay POS.
    pause
    exit /b
)

echo [*] Tim thay Chrome tai: "%CHROME_BIN%"

:: Kiem tra xem may chu POS (cong 3000) da chay chua
netstat -ano | findstr ":3000 " | findstr "LISTENING" >nul 2>&1
if %errorlevel% neq 0 (
    echo [*] May chu POS chua chay, dang tu dong khoi dong may chu...
    start "POS Server - Bun Mam Mien Tay" /min cmd /c "cd /d "%~dp0" && node scripts\start-pos.js"
    timeout /t 2 /nobreak >nul
) else (
    echo [*] May chu POS da san sang hoat dong!
)

echo [*] Dang don dep cache de cap nhat phien ban moi nhat...
rmdir /s /q "%LOCALAPPDATA%\Google\Chrome\POS_Profile\Default\Cache" 2>nul
rmdir /s /q "%LOCALAPPDATA%\Google\Chrome\POS_Profile\Default\Code Cache" 2>nul
rmdir /s /q "%LOCALAPPDATA%\Google\Chrome\POS_Profile\Default\GPUCache" 2>nul
rmdir /s /q "%LOCALAPPDATA%\Google\Chrome\POS_Profile\Default\DawnGraphiteCache" 2>nul
rmdir /s /q "%LOCALAPPDATA%\Google\Chrome\POS_Profile\Default\DawnWebGPUCache" 2>nul
rmdir /s /q "%LOCALAPPDATA%\Google\Chrome\POS_Profile\Default\Service Worker" 2>nul

echo [*] Dang khoi dong POS che do Kiosk Silent Print...
start "" "%CHROME_BIN%" --user-data-dir="%LOCALAPPDATA%\Google\Chrome\POS_Profile" --disk-cache-size=1 --media-cache-size=1 --kiosk-printing --app="http://localhost:3000/"
exit
