@echo off
chcp 65001 >nul
title HỆ THỐNG BÁN HÀNG POS
echo ===================================================================
echo     🚀 ĐANG KHỞI ĐỘNG HỆ THỐNG BÁN HÀNG POS (NODE.JS + SQLITE)
echo ===================================================================
echo.
echo  Đang mở trình duyệt tại: http://localhost:3000 ...
start http://localhost:3000
echo.
echo  Máy chủ đang chạy... Bấm Ctrl+C nếu bạn muốn dừng máy chủ.
echo.
node server.js
pause
