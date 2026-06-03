@echo off
chcp 65001 >nul 2>&1
title Mind Language System
cd /d "%~dp0"
setlocal enabledelayedexpansion

:MENU
cls
echo.
echo  ===== Mind Language System ====
echo.
echo  1. Install + Start
echo  2. Install only
echo  3. Start bridge
echo  4. Package VSIX
echo  5. Tutorial
echo  0. Exit
echo.
set /p "choice=Enter number: "

if "%choice%"=="" goto MENU
if "%choice%"=="1" goto INSTALL
if "%choice%"=="0" exit /b
goto MENU

:INSTALL
where node >nul 2>&1
if %errorlevel% neq 0 (echo [X] Node.js not found & pause & exit /b)
for /f "delims=" %%v in ('node --version') do set NODE_VER=%%v
echo [OK] Node: %NODE_VER%

cd /d "%~dp0mind-bridge" 2>nul
if %errorlevel% neq 0 (echo [X] bridge not found & pause & exit /b)
call npm install
echo [OK] bridge OK

cd /d "%~dp0mind-extension" 2>nul
if %errorlevel% neq 0 (echo [X] extension not found & pause & exit /b)
call npm install
call npm run build
echo [OK] extension OK

cd /d "%~dp0mind-bridge"
start "Mind Bridge" cmd /c "node src/index.js && pause"
echo Bridge started on port 3456
pause
goto MENU
