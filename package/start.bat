@echo off
chcp 65001 >nul 2>&1
title Mind Language System
cd /d "%~dp0"
setlocal enabledelayedexpansion

:: --- Auto-detect path layout ---
if exist "%~dp0mind-bridge" (
  set BRIDGE=%~dp0mind-bridge
  set EXT=%~dp0mind-extension
) else (
  set BRIDGE=%~dp0..\bridge
  set EXT=%~dp0..\extension
)
if not exist "!BRIDGE!\package.json" (echo [X] bridge not found & pause & exit /b)
if not exist "!EXT!\package.json" (echo [X] ext not found & pause & exit /b)

:MENU
cls
echo.
echo  ===== Mind Language System =====
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
if "%choice%"=="2" goto INSTALL_ONLY
if "%choice%"=="3" goto START_BRIDGE
if "%choice%"=="4" goto PACKAGE
if "%choice%"=="5" goto TUTORIAL
if "%choice%"=="0" exit /b
goto MENU

:INSTALL
where node >nul 2>&1
if %errorlevel% neq 0 (echo [X] Node.js required & pause & exit /b)
for /f "delims=" %%v in ('node --version') do set NODE_VER=%%v
echo [OK] Node: %NODE_VER%

cd /d "!BRIDGE!"
call npm install
if %errorlevel% neq 0 (echo [X] npm failed & pause & exit /b)
echo [OK] bridge deps

cd /d "!EXT!"
call npm install
call npm run build
echo [OK] extension built

cd /d "!BRIDGE!"
start "Mind Bridge" cmd /c "node src/index.js && pause"
echo Bridge starting on port 3456...
echo.
echo  1) Install VSIX:  cd !EXT! ^& npx vsce package
echo  2) Create .mind file with # @d
echo.
pause
goto MENU

:INSTALL_ONLY
cls
cd /d "!BRIDGE!" && call npm install
cd /d "!EXT!" && call npm install && call npm run build
echo [OK] Done
pause
goto MENU

:START_BRIDGE
cls
cd /d "!BRIDGE!"
start "Mind Bridge" cmd /c "node src/index.js && pause"
timeout /t 5 /nobreak >nul
echo [OK] Bridge on port 3456
pause
goto MENU

:PACKAGE
cls
cd /d "!EXT!"
call npx vsce package
if %errorlevel% equ 0 (echo [OK] VSIX created & dir /b *.vsix 2>nul) else (echo [i] failed)
pause
goto MENU

:TUTORIAL
cls
echo.
echo  1) Start bridge (menu option 1 or 3)
echo  2) Package VSIX (menu option 4)
echo  3) Install .vsix in VS Code
echo  4) Create .mind, use # @d, press Enter
echo     .py and .c auto-generated
echo.
pause
goto MENU
