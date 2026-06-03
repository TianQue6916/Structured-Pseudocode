@echo off
chcp 65001 >nul 2>&1
title Mind 语言系统 -- 一键安装启动
cd /d "%~dp0"

:: ============================================================
:: Mind 语言系统 -- 一键傻瓜式安装启动器
:: ============================================================

setlocal enabledelayedexpansion

:MENU
cls
echo.
echo  ===== Mind Zi Ran Yu Yan Yi Biao Xi Tong =====
echo.
echo         1. Yi Jian An Zhuang + Qi Dong
echo         2. Jin An Zhuang
echo         3. Jin Qi Dong Qiao Jie Fu Wu
echo         4. Da Bao VS Code Cha Jian
echo         5. Shi Yong Jiao Cheng
echo         0. Tui Chu
echo.
set /p choice="Qing shu ru shu zi (0-5): "

if "%choice%"=="1" goto INSTALL_AND_START
if "%choice%"=="2" goto INSTALL_ONLY
if "%choice%"=="3" goto START_ONLY
if "%choice%"=="4" goto PACKAGE
if "%choice%"=="5" goto TUTORIAL
if "%choice%"=="0" exit /b
goto MENU

:INSTALL_AND_START
cls
echo.
echo ==== Bu Zhou 1/5: Jian Cha Xi Tong Huan Jing ====
echo.

:: Jian cha Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [X] Node.js wei an zhuang!
    echo     Qing cong https://nodejs.org/ xia zai Node.js 18+
    pause
    exit /b
)
for /f "delims=" %%v in ('node --version 2^>nul') do set NODE_VER=%%v
echo [V] Node.js: %NODE_VER%

:: Jian cha npm
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo [X] npm wei an zhuang!
    pause
    exit /b
)
for /f "delims=" %%v in ('npm --version 2^>nul') do set NPM_VER=%%v
echo [V] npm: %NPM_VER%

:: Jian cha VS Code
where code >nul 2>&1
if %errorlevel% equ 0 (
    echo [V] VS Code: yi an zhuang
) else (
    echo [!] VS Code ming ling xing gong ju wei zhao dao
    echo     Bu ying xiang qiao jie fu wu
)

echo.
echo ==== Bu Zhou 2/5: An Zhuang Qiao Jie Fu Wu Yi Lai ====
echo.
echo Zheng zai an zhuang mind-bridge yi lai...

cd /d "%~dp0mind-bridge" 2>nul
if %errorlevel% neq 0 (
    echo [X] wei zhao dao mind-bridge mu lu!
    echo     Qing que bao ben wen jian yu mind-bridge/ tong ji
    pause
    exit /b
)
if not exist "package.json" (
    echo [X] package.json wei zhao dao!
    pause
    exit /b
)

call npm install
if %errorlevel% neq 0 (
    echo [X] yi lai an zhuang shi bai!
    pause
    exit /b
)
echo [V] qiao jie fu wu yi lai an zhuang wan cheng

echo.
echo ==== Bu Zhou 3/5: Gou Jian VS Code Cha Jian ====
echo.
echo Zheng zai gou jian mind-extension...

cd /d "%~dp0mind-extension" 2>nul
if %errorlevel% neq 0 (
    echo [X] wei zhao dao mind-extension mu lu!
    pause
    exit /b
)
if not exist "package.json" (
    echo [X] package.json wei zhao dao!
    pause
    exit /b
)

call npm install
call npm run build
if %errorlevel% neq 0 (
    echo [X] cha jian gou jian shi bai!
    pause
    exit /b
)
echo [V] cha jian gou jian cheng gong

echo.
echo ==== Bu Zhou 4/5: Qi Dong Qiao Jie Fu Wu ====
echo.
echo Zheng zai qi dong Mind Bridge (duan kou 3456)...

cd /d "%~dp0mind-bridge"
start "Mind Bridge" cmd /c "node src/index.js && pause"

:: Deng dai fu wu qi dong
echo Deng dai fu wu jiu xu...
timeout /t 5 /nobreak >nul

:: Jian cha fu wu zhuang tai
call :CHECK_HEALTH
if %errorlevel% equ 0 (
    echo [V] qiao jie fu wu qi dong cheng gong!
) else (
    echo [!] Qiao jie fu wu ke neng zai qi dong zhong...
    echo     Qing shao hou fang wen http://localhost:3456/health jian cha
)

echo.
echo ==== Bu Zhou 5/5: An Zhuang VS Code Cha Jian ====
echo.
echo Liang zhong fang shi an zhuang cha jian:
echo.
echo   Fang shi A -- Cong VSIX an zhuang:
echo     1. Da kai ming ling xing -^> cd "%~dp0mind-extension"
echo     2. Yun xing: npx vsce package
echo     3. VS Code zhong: kuo zhan -^> ... -^> cong VSIX an zhuang
echo.
echo   Fang shi B -- Kai fa mo shi:
echo     1. VS Code da kai "%~dp0mind-extension"
echo     2. An F5 qi dong kuo zhan kai fa mo shi
echo.
echo  ================================
echo     An zhuang wan cheng!
echo     Xian zai ni ke yi chuang jian .mind wen jian le
echo     Shi li wen jian: "%~dp0..\package\示例.mind"
echo  ================================
echo.
pause
goto MENU

:INSTALL_ONLY
cls
echo [An zhuang] Jin an zhuang yi lai...
cd /d "%~dp0mind-bridge" 2>nul && call npm install
cd /d "%~dp0mind-extension" 2>nul && call npm install && call npm run build
echo [V] an zhuang wan cheng
pause
goto MENU

:START_ONLY
cls
echo [Qi dong] Qi dong qiao jie fu wu...
cd /d "%~dp0mind-bridge" 2>nul
start "Mind Bridge" cmd /c "node src/index.js && pause"
timeout /t 5 /nobreak >nul
call :CHECK_HEALTH
if %errorlevel% equ 0 (
    echo [V] Qiao jie fu wu yi zai yun xing (duan kou 3456)
) else (
    echo [!] Fu wu ke neng hai zai qi dong zhong
)
pause
goto MENU

:PACKAGE
cls
echo [Da bao] Sheng cheng VS Code cha jian an zhuang bao (.vsix)...
cd /d "%~dp0mind-extension" 2>nul
call npx vsce package
if %errorlevel% equ 0 (
    echo [V] Cha jian da bao cheng gong!
    dir /b *.vsix 2>nul
) else (
    echo [!] Da bao shi bai
)
pause
goto MENU

:TUTORIAL
cls
echo.
echo  ============ Mind Yu Yan Xi Tong ============
echo.
echo  -- Di Yi Bu: Qi Dong Qiao Jie Fu Wu --
echo  Yun xing ben jiao ben -^> xuan [1]
echo  huo shou dong: cd mind-bridge ^&^& npm start
echo.
echo  -- Di Er Bu: An Zhuang VS Code Cha Jian --
echo  cd mind-extension ^&^& npx vsce package
echo  VS Code zhong an zhuang .vsix wen jian
echo.
echo  -- Di San Bu: Chuang Jian .mind Wen Jian --
echo  Xin jian wen jian, hou zhui .mind
echo.
echo  -- Di Si Bu: Xie Xu Qiu, Zi Dong Sheng Cheng Dai Ma --
echo  Yong # @d kai tou xie xu qiu:
echo    # @d shi xian lian biao fan zhuan
echo    Define function reverse_list
echo.
echo  An Enter -^> zi dong fen xi -^> sheng cheng tong mu lu xia:
echo    test.py  (Python shi xian, han xiang zhu)
echo    test.c   (C shi xian, han xiang zhu)
echo.
echo  -- Di Wu Bu: Chao Lian Jie Dao Hang --
echo  Dian ji .mind zhong de # @d zhu shi
echo  -^> tiao zhuan dao .py/.c han shu wei zhi
echo.
pause
goto MENU

:: ============================================================
:: Zi cheng xu: Jian cha qiao jie fu wu jian kang
:: ============================================================
:CHECK_HEALTH
:: Shi yong curl (Windows 10+ nei zhi) huo PowerShell
where curl >nul 2>&1
if %errorlevel% equ 0 (
    curl -s http://localhost:3456/health >nul 2>&1
    exit /b %errorlevel%
)
:: curl bu ke yong, shi yong PowerShell
powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:3456/health' -TimeoutSec 3; exit 0 } catch { exit 1 }" >nul 2>&1
exit /b %errorlevel%
