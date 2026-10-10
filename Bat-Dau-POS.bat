@echo off
title MAY CHU POS - BUN MAM MIEN TAY
chcp 65001 >nul
cd /d "%~dp0"
echo ===================================================
echo     DANG KHOI DONG MAY CHU POS VA DUONG TRUYEN
echo ===================================================
node scripts\start-pos.js
pause
