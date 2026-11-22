@echo off
setlocal
pushd "%~dp0" || goto :failed

netstat -ano -p tcp | findstr /R /C:":1420 .*LISTENING" >nul
if not errorlevel 1 (
    echo Port 1420 is already in use. Close the running LearningEdge window or dev server, then try again.
    goto :failed
)

if exist "%USERPROFILE%\.cargo\bin\cargo.exe" set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"

where pnpm >nul 2>&1 || (
    echo pnpm was not found. Install pnpm and reopen this launcher.
    goto :failed
)
where cargo >nul 2>&1 || (
    echo Cargo was not found. Install Rust with rustup and reopen this launcher.
    goto :failed
)

echo Checking LearningEdge dependencies...
call pnpm install --frozen-lockfile || goto :failed

echo Starting LearningEdge...
call pnpm tauri dev || goto :failed
popd
exit /b 0

:failed
echo.
echo LearningEdge could not start. See the message above.
pause
exit /b 1
