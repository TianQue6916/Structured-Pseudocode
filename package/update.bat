@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"
setlocal enabledelayedexpansion
title Mind Update

echo.
echo === Mind Plugin Update ===
echo.

set VSIX=mind-language-1.0.0.vsix
set FOUND=

:: Try multiple locations
if exist "%VSIX%" set FOUND=%VSIX%
if exist "..\extension\%VSIX%" set FOUND=..\extension\%VSIX%
if exist "..\mind-extension\%VSIX%" set FOUND=..\mind-extension\%VSIX%
if exist "C:\Users\27063\Desktop\åw±\AI   ‡ö9\mind-extension\%VSIX%" set FOUND=C:\Users\27063\Desktop\åw±\AI   ‡ö9\mind-extension\%VSIX%

if "%FOUND%"=="" (
  echo [X] Cannot find %VSIX%
  echo  Looked in current dir, parent dirs, and toolbox path
  pause
  exit /b
)
echo [OK] Found: %FOUND%
echo.

echo [1/2] Removing old versions...
for %%v in (mind-lang.mind-language tianquexuan.mind-language) do (
  code --uninstall-extension %%v-1.0.0 1>nul 2>&1
  if exist "%USERPROFILE%\.vscode\extensions\%%v-1.0.0" (
    rmdir /s /q "%USERPROFILE%\.vscode\extensions\%%v-1.0.0"
  )
)
echo [OK] Removed
echo.

echo [2/2] Installing...
code --install-extension "%FOUND%" --force
echo [OK] Installed
echo.
echo Reload VS Code: Ctrl+Shift+P ^> Developer: Reload Window
echo.
pause
