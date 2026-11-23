@echo off
setlocal
set "LE_BAT_DIR=%~dp0"
set "LE_ARGS=%*"
set "PS_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS_EXE%" set "PS_EXE=powershell.exe"
"%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -Command "$raw = Get-Content -LiteralPath '%~f0' -Raw; $idx = $raw.LastIndexOf('#__LEARNINGEDGE_PS_BODY__'); $code = $raw.Substring($idx); $sb = [scriptblock]::Create($code); & $sb $env:LE_BAT_DIR $env:LE_ARGS"
set "EC=%ERRORLEVEL%"
if not "%EC%"=="0" (
    echo.
    echo ============================================================
    echo   LearningEdge could not start ^(exit code %EC%^).
    echo ============================================================
    pause
)
exit /b %EC%

#__LEARNINGEDGE_PS_BODY__
param(
    [string]$BatDir,
    [string]$RawArgLine
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$RawArgs = if ([string]::IsNullOrWhiteSpace($RawArgLine)) { @() } else { $RawArgLine -split '\s+' }

$Dev = $false
$Check = $false
$Rebuild = $false
$Heal = $false
foreach ($a in @($RawArgs)) {
    if ($a -ieq "--dev") { $Dev = $true }
    if ($a -ieq "--check") { $Check = $true }
    if ($a -ieq "--rebuild") { $Rebuild = $true }
    if ($a -ieq "--heal") { $Heal = $true }
}

$Mode = if ($Dev) { "dev" } elseif ($Check) { "check" } else { "release" }

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  LearningEdge Self-Healing Launcher  [mode=$Mode]" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

function Resolve-ProjectRoot([string]$startDir) {
    $cleanStart = $startDir.TrimEnd('\', '/')
    $candidates = @(
        $cleanStart,
        (Join-Path $cleanStart "LearningEdge"),
        (Join-Path $env:USERPROFILE "Desktop\LearningEdge"),
        (Join-Path $env:USERPROFILE "LearningEdge")
    )
    foreach ($c in $candidates) {
        if ((Test-Path -LiteralPath (Join-Path $c "package.json")) -and (Test-Path -LiteralPath (Join-Path $c "src-tauri"))) {
            return (Resolve-Path -LiteralPath $c).Path
        }
    }
    throw "Could not locate LearningEdge project folder. Place run.bat inside LearningEdge or on Desktop next to the LearningEdge folder."
}

$ProjectRoot = Resolve-ProjectRoot $BatDir
Set-Location $ProjectRoot
$ToolsRoot = Join-Path $ProjectRoot ".tools"
Write-Host "[OK]   Project root: $ProjectRoot" -ForegroundColor Green

function Refresh-ProcessPath {
    $parts = New-Object System.Collections.Generic.List[string]
    $seen = New-Object System.Collections.Generic.HashSet[string] ([System.StringComparer]::OrdinalIgnoreCase)

    $addDir = {
        param([string]$dir)
        if ([string]::IsNullOrWhiteSpace($dir)) { return }
        $clean = $dir.Trim().Trim('"')
        if ([string]::IsNullOrWhiteSpace($clean)) { return }
        if ((Test-Path -LiteralPath $clean) -and $seen.Add($clean)) {
            $parts.Add($clean)
        }
    }

    # Local portable .tools directories (created automatically in fresh Windows / Sandbox)
    if (Test-Path -LiteralPath $ToolsRoot) {
        Get-ChildItem -LiteralPath $ToolsRoot -Filter "node.exe" -Recurse -ErrorAction SilentlyContinue | ForEach-Object { & $addDir $_.DirectoryName }
        Get-ChildItem -LiteralPath $ToolsRoot -Filter "pnpm.cmd" -Recurse -ErrorAction SilentlyContinue | ForEach-Object { & $addDir $_.DirectoryName }
        Get-ChildItem -LiteralPath $ToolsRoot -Filter "ffmpeg.exe" -Recurse -ErrorAction SilentlyContinue | ForEach-Object { & $addDir $_.DirectoryName }
    }

    # Standard Windows tool locations
    $known = @(
        "$env:USERPROFILE\.cargo\bin",
        "$env:ProgramW6432\Volta",
        "$env:ProgramFiles\Volta",
        "$env:LOCALAPPDATA\Volta\bin",
        "$env:ProgramW6432\nodejs",
        "$env:ProgramFiles\nodejs",
        "$env:LOCALAPPDATA\Microsoft\WindowsApps",
        "$env:LOCALAPPDATA\Microsoft\WinGet\Links",
        "$env:ProgramData\chocolatey\bin",
        "$env:APPDATA\npm",
        "$env:SystemRoot\System32",
        "$env:SystemRoot"
    )
    foreach ($d in $known) { & $addDir $d }

    $wingetPkgs = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages"
    if (Test-Path -LiteralPath $wingetPkgs) {
        Get-ChildItem -LiteralPath $wingetPkgs -Filter "Gyan.FFmpeg*" -Directory -ErrorAction SilentlyContinue | ForEach-Object {
            Get-ChildItem -LiteralPath $_.FullName -Filter "ffmpeg.exe" -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
                & $addDir $_.DirectoryName
            }
        }
    }

    foreach ($scope in @("Machine", "User")) {
        $raw = [Environment]::GetEnvironmentVariable("Path", $scope)
        if ($raw) {
            foreach ($entry in ($raw -split ';')) { & $addDir $entry }
        }
    }
    if ($env:PATH) {
        foreach ($entry in ($env:PATH -split ';')) { & $addDir $entry }
    }

    $env:PATH = ($parts -join ';')
    $env:RUST_MIN_STACK = "33554432"
    $env:LEARNINGEDGE_ROOT = $ProjectRoot
}

function Find-Tool([string]$name) {
    $cmd = Get-Command $name -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($cmd) { return $cmd.Source }
    return $null
}

function Ensure-Node {
    if (Find-Tool "node") {
        Write-Host "[OK]   Node.js found ($(Find-Tool 'node'))" -ForegroundColor Green
        return
    }
    Write-Host "[DEPS] Node.js not found. Downloading portable Node.js LTS into .tools\node..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Force -Path $ToolsRoot | Out-Null
    $idx = Invoke-RestMethod "https://nodejs.org/dist/index.json"
    $lts = $idx | Where-Object { $_.lts } | Select-Object -First 1
    $ver = $lts.version
    $zipUrl = "https://nodejs.org/dist/$ver/node-$ver-win-x64.zip"
    $zipPath = Join-Path $env:TEMP "node-$ver-win-x64.zip"
    $nodeDest = Join-Path $ToolsRoot "node"
    Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing
    if (Test-Path -LiteralPath $nodeDest) { Remove-Item -LiteralPath $nodeDest -Recurse -Force }
    Expand-Archive -Path $zipPath -DestinationPath $nodeDest -Force
    Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
    Refresh-ProcessPath
    if (-not (Find-Tool "node")) {
        throw "Portable Node.js download completed, but node.exe was not found."
    }
    Write-Host "[OK]   Portable Node.js ready ($(Find-Tool 'node'))" -ForegroundColor Green
}

function Ensure-Pnpm {
    if (Find-Tool "pnpm") {
        Write-Host "[OK]   pnpm found ($(Find-Tool 'pnpm'))" -ForegroundColor Green
        return
    }
    Write-Host "[DEPS] Installing pnpm automatically..." -ForegroundColor Yellow
    $npm = Find-Tool "npm"
    if (-not $npm) { throw "npm not found alongside Node.js." }
    & $npm install -g pnpm --no-fund --no-audit
    Refresh-ProcessPath
    if (-not (Find-Tool "pnpm")) {
        # Fallback: install pnpm into local .tools\pnpm
        $pnpmDir = Join-Path $ToolsRoot "pnpm"
        New-Item -ItemType Directory -Force -Path $pnpmDir | Out-Null
        & $npm install --prefix $pnpmDir pnpm --no-fund --no-audit
        $pnpmBin = Join-Path $pnpmDir "node_modules\.bin"
        if (Test-Path -LiteralPath $pnpmBin) { $env:PATH = "$pnpmBin;$env:PATH" }
    }
    if (-not (Find-Tool "pnpm")) {
        throw "Failed to install pnpm automatically."
    }
    Write-Host "[OK]   pnpm ready ($(Find-Tool 'pnpm'))" -ForegroundColor Green
}

function Ensure-FFmpeg {
    if ((Find-Tool "ffmpeg") -and (Find-Tool "ffprobe")) {
        Write-Host "[OK]   FFmpeg found ($(Find-Tool 'ffmpeg'))" -ForegroundColor Green
        return
    }
    Write-Host "[DEPS] FFmpeg not found. Downloading portable FFmpeg essentials into .tools\ffmpeg..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Force -Path $ToolsRoot | Out-Null
    $zipUrl = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
    $zipPath = Join-Path $env:TEMP "ffmpeg-release-essentials.zip"
    $ffDest = Join-Path $ToolsRoot "ffmpeg"
    Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing
    if (Test-Path -LiteralPath $ffDest) { Remove-Item -LiteralPath $ffDest -Recurse -Force }
    Expand-Archive -Path $zipPath -DestinationPath $ffDest -Force
    Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
    Refresh-ProcessPath
    if (-not (Find-Tool "ffmpeg")) {
        throw "Portable FFmpeg download completed, but ffmpeg.exe was not found."
    }
    Write-Host "[OK]   Portable FFmpeg ready ($(Find-Tool 'ffmpeg'))" -ForegroundColor Green
}

function Ensure-Cargo {
    if (Find-Tool "cargo") {
        Write-Host "[OK]   Rust / Cargo found ($(Find-Tool 'cargo'))" -ForegroundColor Green
        return
    }
    Write-Host "[DEPS] Rust / Cargo not found. Installing via official rustup-init.exe..." -ForegroundColor Yellow
    $rustupExe = Join-Path $env:TEMP "rustup-init.exe"
    Invoke-WebRequest -Uri "https://win.rustup.rs/x86_64" -OutFile $rustupExe -UseBasicParsing
    Start-Process -FilePath $rustupExe -ArgumentList "-y --default-toolchain stable" -Wait -NoNewWindow
    Remove-Item -LiteralPath $rustupExe -Force -ErrorAction SilentlyContinue
    Refresh-ProcessPath
    if (-not (Find-Tool "cargo")) {
        throw "Rust / Cargo installation completed, but cargo.exe was not found."
    }
    Write-Host "[OK]   Rust / Cargo ready ($(Find-Tool 'cargo'))" -ForegroundColor Green
}

function Ensure-WebView2 {
    $regPaths = @(
        "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
        "HKCU:\Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
    )
    foreach ($rp in $regPaths) {
        if (Test-Path $rp) {
            Write-Host "[OK]   Microsoft Edge WebView2 Runtime found" -ForegroundColor Green
            return
        }
    }
    Write-Host "[DEPS] Installing Microsoft Edge WebView2 Runtime..." -ForegroundColor Yellow
    $wvExe = Join-Path $env:TEMP "MicrosoftEdgeWebview2Setup.exe"
    Invoke-WebRequest -Uri "https://go.microsoft.com/fwlink/p/?LinkId=2124703" -OutFile $wvExe -UseBasicParsing
    Start-Process -FilePath $wvExe -ArgumentList "/silent /install" -Wait
    Remove-Item -LiteralPath $wvExe -Force -ErrorAction SilentlyContinue
    Write-Host "[OK]   Microsoft Edge WebView2 Runtime ready" -ForegroundColor Green
}

function Heal-RuntimeLocks([bool]$forceReset) {
    $killed = $false
    $existing = Get-Process -Name "learningedge" -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Host "[HEAL] Stopping running LearningEdge instance(s) to prevent WebView2 lock..." -ForegroundColor Yellow
        $existing | Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 800
        $killed = $true
    }
    $orphans = Get-CimInstance Win32_Process -Filter "Name = 'msedgewebview2.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -match 'com\.learningedge\.app' }
    if ($orphans) {
        Write-Host "[HEAL] Stopping orphaned WebView2 process locking LearningEdge profile..." -ForegroundColor Yellow
        foreach ($o in $orphans) {
            Stop-Process -Id $o.ProcessId -Force -ErrorAction SilentlyContinue
        }
        Start-Sleep -Milliseconds 600
        $killed = $true
    }
    if ($killed -or $forceReset) {
        $ebDir = Join-Path $env:LOCALAPPDATA "com.learningedge.app\EBWebView"
        if (Test-Path -LiteralPath $ebDir) {
            Write-Host "[HEAL] Clearing stale WebView2 profile lock..." -ForegroundColor Yellow
            Remove-Item -LiteralPath $ebDir -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

# --- Execute Self-Healing Sequence ---
Refresh-ProcessPath
Ensure-Node
Ensure-Pnpm
Ensure-FFmpeg
Ensure-WebView2

$ReleaseExe = Join-Path $ProjectRoot "src-tauri\target\release\learningedge.exe"
$NeedCargo = $Dev -or $Rebuild -or (-not (Test-Path -LiteralPath $ReleaseExe))
if ($NeedCargo) {
    Ensure-Cargo
} else {
    if (Find-Tool "cargo") {
        Write-Host "[OK]   Rust / Cargo found ($(Find-Tool 'cargo'))" -ForegroundColor Green
    } else {
        Write-Host "[OK]   Standalone executable already built (Rust toolchain not needed)" -ForegroundColor Green
    }
}

Heal-RuntimeLocks -forceReset:$Heal

$TsxCli = Join-Path $ProjectRoot "node_modules\tsx\dist\cli.mjs"
$KonvaPkg = Join-Path $ProjectRoot "node_modules\konva\package.json"
if ($Heal -or (-not (Test-Path -LiteralPath $TsxCli)) -or (-not (Test-Path -LiteralPath $KonvaPkg))) {
    Write-Host "[DEPS] Installing project Node packages with pnpm..." -ForegroundColor Yellow
    & pnpm install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[HEAL] Retrying with pnpm install..." -ForegroundColor Yellow
        & pnpm install
        if ($LASTEXITCODE -ne 0) { throw "pnpm install failed." }
    }
} else {
    Write-Host "[OK]   Node dependencies present (node_modules)" -ForegroundColor Green
}

$DistHtml = Join-Path $ProjectRoot "dist\index.html"
if ($Rebuild -or (-not (Test-Path -LiteralPath $DistHtml))) {
    Write-Host "[BUILD] Building frontend bundle (dist/)..." -ForegroundColor Yellow
    & pnpm build
    if ($LASTEXITCODE -ne 0) { throw "pnpm build failed." }
} else {
    Write-Host "[OK]   Frontend bundle present (dist/index.html)" -ForegroundColor Green
}

if ($Dev) {
    $portPids = Get-NetTCPConnection -LocalPort 1420 -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($pidToKill in $portPids) {
        Write-Host "[HEAL] Freeing port 1420 (PID $pidToKill)..." -ForegroundColor Yellow
        Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
    }
    Write-Host "[DEV]  Starting LearningEdge in hot-reload dev mode..." -ForegroundColor Cyan
    & pnpm tauri dev
    exit $LASTEXITCODE
}

if ($Rebuild -or (-not (Test-Path -LiteralPath $ReleaseExe))) {
    Write-Host "[BUILD] Building standalone LearningEdge executable (no localhost needed)..." -ForegroundColor Yellow
    & pnpm tauri build --no-bundle
    if ($LASTEXITCODE -ne 0) { throw "pnpm tauri build --no-bundle failed." }
}

if (-not (Test-Path -LiteralPath $ReleaseExe)) {
    throw "Expected executable not found: $ReleaseExe"
}

Write-Host "[OK]   Standalone executable ready: $ReleaseExe" -ForegroundColor Green

if ($Check) {
    Write-Host ""
    Write-Host "[PASS] All LearningEdge checks and self-healing steps succeeded." -ForegroundColor Green
    exit 0
}

Write-Host ""
Write-Host "[LAUNCH] Starting LearningEdge desktop app..." -ForegroundColor Cyan
Start-Process -FilePath $ReleaseExe -WorkingDirectory $ProjectRoot
exit 0
