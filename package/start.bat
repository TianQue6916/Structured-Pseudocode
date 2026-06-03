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
if "%choice%"=="2" goto INSTALL_ONLY
if "%choice%"=="3" goto START_BRIDGE
if "%choice%"=="4" goto PACKAGE
if "%choice%"=="5" goto TUTORIAL
if "%choice%"=="0" exit /b
goto MENU

:INSTALL
where node >nul 2>&1
if %errorlevel% neq 0 (echo [X] Node.js not found & pause & exit /b)
for /f "delims=" %%v in ('node --version') do set NODE_VER=%%v
echo [OK] Node: %NODE_VER%

cd /d "%~dp0mind-bridge" 2>nul
if %errorlevel% neq 0 (echo [X] bridge dir not found & pause & exit /b)
call npm install
if %errorlevel% neq 0 (echo [X] npm failed & pause & exit /b)
echo [OK] bridge deps installed

cd /d "%~dp0mind-extension" 2>nul
if %errorlevel% neq 0 (echo [X] extension dir not found & pause & exit /b)
call npm install
call npm run build
echo [OK] extension built

cd /d "%~dp0mind-bridge"
start "Mind Bridge" cmd /c "node src/index.js && pause"
echo Bridge starting on port 3456...
echo.
echo ============ HOW TO USE ============
echo 1. Install VS Code extension:
echo    Go to option 4 to package .vsix
echo    or open mind-extension/ in VS Code, press F5
echo.
echo 2. Create a .mind file and start writing
echo    Use # @d for code generation
echo ===================================
pause
goto MENU

:INSTALL_ONLY
cls
echo [Install] Only installing dependencies...
cd /d "%~dp0mind-bridge" 2>nul && call npm install
cd /d "%~dp0mind-extension" 2>nul && call npm install && call npm run build
echo [OK] Done
pause
goto MENU

:START_BRIDGE
cls
echo [Start] Starting bridge on port 3456...
cd /d "%~dp0mind-bridge" 2>nul
start "Mind Bridge" cmd /c "node src/index.js && pause"
echo Wait 5 seconds...
timeout /t 5 /nobreak >nul
echo [OK] Bridge should be running
echo Check: http://localhost:3456/health
pause
goto MENU

:PACKAGE
cls
echo [Package] Building VS Code extension .vsix...
cd /d "%~dp0mind-extension" 2>nul
if %errorlevel% neq 0 (echo [X] dir not found & pause & exit /b)
call npx vsce package
if %errorlevel% equ 0 (
    echo [OK] Extension packaged!
    dir /b *.vsix 2>nul
) else (
    echo [i] Package failed - try: cd mind-extension ^&^& npx vsce package
)
pause
goto MENU

:TUTORIAL
cls
echo.
echo  ====== Mind Language System Tutorial ======
echo.
echo  Step 1: Run option 1 (Install + Start)
echo    - Installs npm dependencies
echo    - Builds VS Code extension
echo    - Starts bridge on port 3456
echo.
echo  Step 2: Install the VS Code extension
echo    Option 4 packages a .vsix file
echo    Install it in VS Code Extensions panel
echo.
echo  Step 3: Create a .mind file
echo    Write requirements with # @d prefix
echo    Press Enter to trigger analysis
echo.
echo  Step 4: Python + C code auto-generated
echo    In the same folder as your .mind file
echo.
pause
goto MENU
