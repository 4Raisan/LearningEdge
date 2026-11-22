@echo off
setlocal EnableExtensions EnableDelayedExpansion
title LearningEdge Launcher

pushd "%~dp0" || goto :failed

set "MODE=release"
set "FORCE_REBUILD=0"
set "FORCE_HEAL=0"

:parse_args
if "%~1"=="" goto :args_done
if /I "%~1"=="--dev" set "MODE=dev"
if /I "%~1"=="--check" set "MODE=check"
if /I "%~1"=="--rebuild" set "FORCE_REBUILD=1"
if /I "%~1"=="--heal" set "FORCE_HEAL=1"
shift
goto :parse_args
:args_done

echo ============================================================
echo   LearningEdge Self-Healing Launcher  [mode=%MODE%]
echo ============================================================
echo.

REM --- 1. Heal PATH and compiler stack limit ---
if exist "%USERPROFILE%\.cargo\bin" set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
if exist "%ProgramFiles%\Volta" set "PATH=%ProgramFiles%\Volta;%PATH%"
if exist "%ProgramFiles%\nodejs" set "PATH=%ProgramFiles%\nodejs;%PATH%"
if exist "%LOCALAPPDATA%\Microsoft\WinGet\Links" set "PATH=%LOCALAPPDATA%\Microsoft\WinGet\Links;%PATH%"
if exist "%APPDATA%\npm" set "PATH=%APPDATA%\npm;%PATH%"
set "RUST_MIN_STACK=33554432"

REM --- 2. Check & auto-install core system dependencies ---
call :ensure_tool node "OpenJS.NodeJS.LTS" "Node.js LTS" || goto :failed
call :ensure_pnpm || goto :failed
call :ensure_tool cargo "Rustlang.Rustup" "Rust / Cargo" || goto :failed
call :ensure_tool ffmpeg "Gyan.FFmpeg.Essentials" "FFmpeg" || goto :failed
call :ensure_webview2 || goto :failed

REM --- 3. Heal ghost processes and stale WebView2 locks (0x800700AA) ---
set "KILLED_GHOST=0"
tasklist /FI "IMAGENAME eq learningedge.exe" 2>nul | find /I "learningedge.exe" >nul
if not errorlevel 1 (
    echo [HEAL] Closing running LearningEdge instance to prevent WebView2 lock...
    taskkill /F /IM learningedge.exe >nul 2>&1
    set "KILLED_GHOST=1"
    timeout /t 1 /nobreak >nul
)

if "%KILLED_GHOST%"=="1" set "FORCE_HEAL=1"
if "%FORCE_HEAL%"=="1" (
    if exist "%LOCALAPPDATA%\com.learningedge.app\EBWebView" (
        echo [HEAL] Clearing stale WebView2 profile lock...
        rmdir /S /Q "%LOCALAPPDATA%\com.learningedge.app\EBWebView" >nul 2>&1
    )
)

REM --- 4. Ensure project Node dependencies (Konva, tsx, Svelte, Tauri CLI) ---
set "NEED_PNPM_INSTALL=0"
if "%FORCE_HEAL%"=="1" set "NEED_PNPM_INSTALL=1"
if not exist "node_modules\tsx\dist\cli.mjs" set "NEED_PNPM_INSTALL=1"
if not exist "node_modules\konva\package.json" set "NEED_PNPM_INSTALL=1"

if "%NEED_PNPM_INSTALL%"=="1" (
    echo [DEPS] Installing project packages with pnpm...
    call pnpm install --frozen-lockfile
    if errorlevel 1 (
        echo [HEAL] Frozen lockfile install failed; retrying with pnpm install...
        call pnpm install || goto :failed
    )
) else (
    echo [OK]   Node dependencies present ^(node_modules^)
)

REM --- 5. Ensure frontend dist build exists ---
if not exist "dist\index.html" set "NEED_DIST=1"
if "%FORCE_REBUILD%"=="1" set "NEED_DIST=1"
if defined NEED_DIST (
    echo [BUILD] Building frontend bundle ^(dist/^)...
    call pnpm build || goto :failed
) else (
    echo [OK]   Frontend bundle present ^(dist/index.html^)
)

REM --- 6. Mode dispatch ---
if /I "%MODE%"=="dev" goto :run_dev

set "RELEASE_EXE=%CD%\src-tauri\target\release\learningedge.exe"
if not exist "%RELEASE_EXE%" set "FORCE_REBUILD=1"

if "%FORCE_REBUILD%"=="1" (
    echo [BUILD] Building standalone LearningEdge executable ^(no localhost needed^)...
    call pnpm tauri build --no-bundle || goto :failed
)

if not exist "%RELEASE_EXE%" (
    echo [ERR]  Expected executable not found: %RELEASE_EXE%
    goto :failed
)

echo [OK]   Standalone executable ready: %RELEASE_EXE%

if /I "%MODE%"=="check" (
    echo.
    echo [PASS] All LearningEdge checks and self-healing steps succeeded.
    popd
    exit /b 0
)

echo.
echo [LAUNCH] Starting LearningEdge desktop app...
start "LearningEdge" /D "%CD%" "%RELEASE_EXE%"
popd
exit /b 0

:run_dev
REM Auto-heal port 1420 if occupied
for /f "tokens=5" %%P in ('netstat -ano -p tcp ^| findstr /R /C:":1420 .*LISTENING"') do (
    echo [HEAL] Freeing port 1420 ^(PID %%P^)...
    taskkill /F /PID %%P >nul 2>&1
)
echo [DEV]  Starting LearningEdge in hot-reload dev mode...
call pnpm tauri dev || goto :failed
popd
exit /b 0

REM ==================== Helper Subroutines ====================

:ensure_tool
set "CMD_NAME=%~1"
set "WINGET_ID=%~2"
set "DISPLAY_NAME=%~3"
where %CMD_NAME% >nul 2>&1
if not errorlevel 1 (
    echo [OK]   %DISPLAY_NAME% found
    exit /b 0
)
echo [DEPS] %DISPLAY_NAME% not found. Installing via winget ^(%WINGET_ID%^)...
where winget >nul 2>&1
if errorlevel 1 (
    echo [ERR]  winget is not available. Please install %DISPLAY_NAME% manually.
    exit /b 1
)
winget install -e --id %WINGET_ID% --accept-package-agreements --accept-source-agreements
if errorlevel 1 (
    echo [ERR]  Failed to install %DISPLAY_NAME% via winget.
    exit /b 1
)
if exist "%USERPROFILE%\.cargo\bin" set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
if exist "%ProgramFiles%\nodejs" set "PATH=%ProgramFiles%\nodejs;%PATH%"
if exist "%LOCALAPPDATA%\Microsoft\WinGet\Links" set "PATH=%LOCALAPPDATA%\Microsoft\WinGet\Links;%PATH%"
where %CMD_NAME% >nul 2>&1
if errorlevel 1 (
    echo [WARN] %DISPLAY_NAME% was installed. Please reopen run.bat if PATH has not refreshed yet.
    exit /b 1
)
echo [OK]   %DISPLAY_NAME% installed and ready
exit /b 0

:ensure_pnpm
where pnpm >nul 2>&1
if not errorlevel 1 (
    echo [OK]   pnpm found
    exit /b 0
)
echo [DEPS] pnpm not found. Enabling via corepack / npm...
where corepack >nul 2>&1
if not errorlevel 1 (
    call corepack enable >nul 2>&1
)
where pnpm >nul 2>&1
if errorlevel 1 (
    call npm install -g pnpm || exit /b 1
)
where pnpm >nul 2>&1
if errorlevel 1 (
    echo [ERR]  pnpm could not be installed automatically.
    exit /b 1
)
echo [OK]   pnpm installed and ready
exit /b 0

:ensure_webview2
reg query "HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" >nul 2>&1
if not errorlevel 1 (
    echo [OK]   Microsoft Edge WebView2 Runtime found
    exit /b 0
)
reg query "HKCU\Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" >nul 2>&1
if not errorlevel 1 (
    echo [OK]   Microsoft Edge WebView2 Runtime found
    exit /b 0
)
echo [DEPS] Microsoft Edge WebView2 Runtime not found. Installing via winget...
winget install -e --id Microsoft.EdgeWebView2Runtime --accept-package-agreements --accept-source-agreements
if errorlevel 1 (
    echo [ERR]  Could not install WebView2 Runtime automatically.
    exit /b 1
)
echo [OK]   Microsoft Edge WebView2 Runtime installed
exit /b 0

:failed
echo.
echo ============================================================
echo   LearningEdge could not start. See the error above.
echo ============================================================
popd
pause
exit /b 1
