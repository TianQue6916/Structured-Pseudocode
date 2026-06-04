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

if exist "%VSIX%" set FOUND=%VSIX%
if exist "..\extension\%VSIX%" set FOUND=..\extension\%VSIX%
if exist "..\mind-extension\%VSIX%" set FOUND=..\mind-extension\%VSIX%
if exist "%USERPROFILE%\Desktop\工具箱\AI   文件夹\mind-extension\%VSIX%" set FOUND=%USERPROFILE%\Desktop\工具箱\AI   文件夹\mind-extension\%VSIX%

if "%FOUND%"=="" (
  echo [X] Cannot find %VSIX%
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
echo  Open .mind file -^> two buttons in editor title:
echo    [分析代码变量]      - analyze variables, colors, diagnostics
echo    [AI检测注释并生成]  - detect # @d and generate Python
echo    [状态栏 Mind]       - view Token usage panel
echo.
echo Reload VS Code: Ctrl+Shift+P ^> Developer: Reload Window
echo.
pause
