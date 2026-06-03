@echo off
chcp 65001 >nul
title Mind 语言系统 — 一键安装启动
cd /d "%~dp0"

:: ============================================================
:: Mind 语言系统 — 一键傻瓜式安装启动器
:: ============================================================
:: 功能:
::   1. 检查系统环境（Node.js、npm、VS Code）
::   2. 安装桥接服务依赖
::   3. 构建 VS Code 插件
::   4. 启动桥接服务
::   5. 提示安装插件
::   6. 创建示例文件
:: ============================================================

setlocal enabledelayedexpansion

:MENU
cls
echo ╔══════════════════════════════════════════════════════╗
echo ║                                                      ║
echo ║       🧠 Mind 自然语言语义标注系统                    ║
echo ║       ─────────────────────────────                   ║
echo ║       一键安装 · 启动 · 管理                         ║
echo ║                                                      ║
echo ╚══════════════════════════════════════════════════════╝
echo.
echo 请选择操作:
echo.
echo   [1] 🚀 一键安装 + 启动（推荐）
echo   [2] 🔧 仅安装（不启动服务）
echo   [3] ▶  仅启动桥接服务
echo   [4] 📦 打包 VS Code 插件
echo   [5] ❓ 查看使用教程
echo   [0] 退出
echo.
set /p choice="请输入数字 (0-5): "

if "%choice%"=="1" goto INSTALL_AND_START
if "%choice%"=="2" goto INSTALL_ONLY
if "%choice%"=="3" goto START_ONLY
if "%choice%"=="4" goto PACKAGE
if "%choice%"=="5" goto TUTORIAL
if "%choice%"=="0" exit /b
goto MENU

:INSTALL_AND_START
cls
echo ╔══════════════════════════════════════════════════════╗
echo ║  步骤 1/5: 检查系统环境                              ║
echo ╚══════════════════════════════════════════════════════╝
echo.

:: 检查 Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [✗] Node.js 未安装！
    echo     请从 https://nodejs.org/ 下载安装 Node.js 18+
    echo     安装后重新运行此脚本
    pause
    exit /b
)
for /f "tokens=2" %%v in ('node --version 2^>nul') do set NODE_VER=%%v
echo [✓] Node.js: %NODE_VER%

:: 检查 npm
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo [✗] npm 未安装！
    pause
    exit /b
)
for /f "tokens=1" %%v in ('npm --version 2^>nul') do set NPM_VER=%%v
echo [✓] npm: %NPM_VER%

:: 检查 VS Code
where code >nul 2>&1
if %errorlevel% equ 0 (
    echo [✓] VS Code: 已安装
) else (
    echo [!] VS Code 命令行工具未找到
    echo     不影响桥接服务，但需要 VS Code 来安装插件
)

echo.
echo ╔══════════════════════════════════════════════════════╗
echo ║  步骤 2/5: 安装桥接服务依赖                          ║
echo ╚══════════════════════════════════════════════════════╝
echo.
echo 正在安装 mind-bridge 依赖...

cd /d "%~dp0mind-bridge"
if not exist "package.json" (
    echo [✗] 未找到 mind-bridge 目录！
    echo     请确保脚本在正确的位置运行
    pause
    exit /b
)

call npm install
if %errorlevel% neq 0 (
    echo [✗] 依赖安装失败！
    pause
    exit /b
)
echo [✓] 桥接服务依赖安装完成

echo.
echo ╔══════════════════════════════════════════════════════╗
echo ║  步骤 3/5: 构建 VS Code 插件                         ║
echo ╚══════════════════════════════════════════════════════╝
echo.
echo 正在构建 mind-extension...

cd /d "%~dp0mind-extension"
if not exist "package.json" (
    echo [✗] 未找到 mind-extension 目录！
    pause
    exit /b
)

call npm install
call npm run build
if %errorlevel% neq 0 (
    echo [✗] 插件构建失败！
    pause
    exit /b
)
echo [✓] 插件构建成功

echo.
echo ╔══════════════════════════════════════════════════════╗
echo ║  步骤 4/5: 启动桥接服务                               ║
echo ╚══════════════════════════════════════════════════════╝
echo.
echo 正在启动 Mind Bridge (端口 3456)...
echo 提示: 首次启动需要连接 DeepSeek API，需等待 20-30 秒
echo.

cd /d "%~dp0mind-bridge"
start "Mind Bridge" cmd /c "node src/index.js && pause"

:: 等待服务启动
echo 等待服务就绪...
timeout /t 5 /nobreak >nul

:: 检查是否启动成功
curl -s http://localhost:3456/health >nul 2>&1
if %errorlevel% equ 0 (
    echo [✓] 桥接服务启动成功！(端口 3456)
) else (
    echo [!] 桥接服务可能还在启动中...
    echo     请稍后访问 http://localhost:3456/health 检查
    echo     或在任务管理器中检查是否有 node.exe 进程
)

echo.
echo ╔══════════════════════════════════════════════════════╗
echo ║  步骤 5/5: 安装 VS Code 插件                         ║
echo ╚══════════════════════════════════════════════════════╝
echo.
echo 两种方式安装插件:
echo.
echo  方式 A — 从 VSIX 安装（推荐）:
echo     1. 打开命令行 → cd "%~dp0mind-extension"
echo     2. 运行: npx vsce package
echo     3. 在 VS Code 中: 扩展 → ... → 从 VSIX 安装
echo.
echo  方式 B — 开发模式:
echo     1. VS Code 打开 "%~dp0mind-extension"
echo     2. 按 F5 启动扩展开发模式
echo     3. 新窗口中打开 .mind 文件
echo.
echo  方式 C — 直接复制文件夹:
echo     将 mind-extension 文件夹复制到
echo     %%USERPROFILE%%\.vscode\extensions\ 目录
echo.
echo ──────────────────────────────────────────────────
echo  🎉 安装完成！
echo  现在你可以在 VS Code 中创建 .mind 文件了
echo  示例文件: "%~dp0示例.mind"
echo ──────────────────────────────────────────────────
echo.

pause
goto MENU

:INSTALL_ONLY
cls
echo [安装] 仅安装依赖，不启动服务...
cd /d "%~dp0mind-bridge"
call npm install
cd /d "%~dp0mind-extension"
call npm install
call npm run build
echo [✓] 安装完成
pause
goto MENU

:START_ONLY
cls
echo [启动] 启动桥接服务...
cd /d "%~dp0mind-bridge"
start "Mind Bridge" cmd /c "node src/index.js && pause"
timeout /t 3 /nobreak >nul
curl -s http://localhost:3456/health >nul 2>&1
if %errorlevel% equ 0 (
    echo [✓] 桥接服务已在运行 (端口 3456)
) else (
    echo [!] 服务可能还在启动，请稍后检查
)
pause
goto MENU

:PACKAGE
cls
echo [打包] 生成 VS Code 插件安装包 (.vsix)...
cd /d "%~dp0mind-extension"
call npx vsce package
if %errorlevel% equ 0 (
    echo [✓] 插件打包成功！
    dir /b *.vsix 2>nul
) else (
    echo [!] 打包失败，请检查错误信息
)
pause
goto MENU

:TUTORIAL
cls
echo ╔══════════════════════════════════════════════════════╗
echo ║              Mind 语言系统 — 使用教程                 ║
echo ╚══════════════════════════════════════════════════════╝
echo.
echo  ─── 第一步: 启动桥接服务 ───
echo  运行本脚本 → 选 [1] 一键安装启动
echo  或手动: cd mind-bridge ^&^& npm start
echo.
echo  ─── 第二步: 安装 VS Code 插件 ───
echo  方式 A: cd mind-extension ^&^& npx vsce package
echo         然后安装生成的 .vsix 文件
echo  方式 B: 用 VS Code 打开 mind-extension 文件夹
echo         按 F5 启动开发模式
echo.
echo  ─── 第三步: 创建 .mind 文件 ───
echo  新建文件，后缀 .mind，例如 test.mind
echo.
echo  ─── 第四步: 写需求，自动生成代码 ───
echo  在 .mind 中用 # @d 开头写需求:
echo.
echo    # @d 实现链表反转
echo    # 要求: 输入头节点，返回反转后的头
echo    Define function reverse_list
echo    if head is null return null
echo.
echo  写完按 Enter → 自动分析 → 生成同目录下:
echo    test.py   (Python 实现，含详细注释)
echo    test.c    (C 实现，含详细注释)
echo.
echo  ─── 第五步: 超链接导航 ───
echo  在 .mind 中点击 # @d 注释 → 跳转到 .py/.c 函数
echo  在 .py/.c 中点击函数注释 → 跳回 .mind 需求
echo.
echo  ─── 快捷键 ───
echo  Ctrl+Shift+P → "Mind: 立即分析"
echo  Ctrl+Shift+P → "Mind: 显示状态"
echo.
echo  ─── 设置 ───
echo  VS Code 设置 → 扩展 → Mind Language
echo  (颜色/缩进线/端口/行为 全部可调)
echo.
pause
goto MENU
