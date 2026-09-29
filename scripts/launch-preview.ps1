param([switch]$Demo, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$projectDir = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $projectDir

function Get-PortOwner([int]$Port) {
    $connections = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object LocalPort -eq $Port)
    foreach ($ownerId in @($connections.OwningProcess | Select-Object -Unique)) {
        if ($ownerId) { Get-CimInstance Win32_Process -Filter "ProcessId=$ownerId" }
    }
}
function Test-Owner($Owner, [string]$Entry) {
    return $Owner.Name -eq 'node.exe' -and $Owner.CommandLine -and $Owner.CommandLine.Contains((Join-Path $projectDir $Entry))
}
function Test-Ready([int]$Port, [bool]$Api) {
    try {
        if ($Api) {
            $health = Invoke-RestMethod "http://localhost:$Port/api/health" -TimeoutSec 2
            return $health.status -eq 'ok' -and $health.database -eq $true
        }
        $page = Invoke-WebRequest "http://localhost:$Port/" -UseBasicParsing -TimeoutSec 2
        $health = Invoke-RestMethod "http://localhost:$Port/api/health" -TimeoutSec 2
        return $page.StatusCode -eq 200 -and $page.Content.Contains('/frontend/src/main.tsx') -and $health.database -eq $true
    } catch { return $false }
}

try {
    $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
    $nodeExe = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' }
    if (!(Test-Path -LiteralPath $nodeExe)) { throw 'Node.js 24+ was not found. Install Node.js and try again.' }
    $version = & $nodeExe --version
    if ($LASTEXITCODE -ne 0 -or [int]($version.TrimStart('v').Split('.')[0]) -lt 24) { throw 'Node.js 24 or newer is required.' }
    if (!(Test-Path 'node_modules/vite/bin/vite.js')) { throw 'Dependencies are missing. Run npm install in this project first.' }

    if ($Demo) { Write-Host 'The old demo shortcut now opens the unified preview on port 5173.' }
    $specs = @(@{Port=3001;Api=$true;Entry='backend\src\server.mjs';Label='backend'}, @{Port=5173;Api=$false;Entry='node_modules\vite\bin\vite.js';Label='frontend'})
    # Check every port before starting anything. Never terminate an unknown owner.
    foreach ($spec in $specs) {
        $owners = @(Get-PortOwner $spec.Port)
        foreach ($owner in $owners) {
            if (!(Test-Owner $owner $spec.Entry)) {
                throw "Port $($spec.Port) is occupied by $($owner.Name) (PID $($owner.ProcessId)). Cannot verify it belongs to this project. No process was stopped. Command: $($owner.CommandLine)"
            }
        }
        $spec.Running = $owners.Count -gt 0
    }
    $database = Join-Path $projectDir 'data\rematerial.sqlite'
    if (!(Test-Path -LiteralPath $database)) { throw "Existing database missing: $database. Startup stopped to avoid creating an empty replacement." }
    $env:DATABASE_PATH = $database
    $env:UPLOAD_DIR = Join-Path $projectDir 'uploads'
    $env:PORT = '3001'
    $env:FRONTEND_ORIGIN = 'http://localhost:5173'
    # Idempotent import: first-time data changes make a complete DB/uploads backup;
    # later starts reuse the existing sample mapping without creating duplicates.
    & $nodeExe (Join-Path $projectDir 'scripts\import-samples.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Sample import failed. Existing data was preserved; see the message above.' }
    $logs = Join-Path $projectDir '.logs'
    New-Item -ItemType Directory -Path $logs -Force | Out-Null
    $started = @()
    foreach ($spec in $specs) {
        if ($spec.Running) { Write-Host "Reusing $($spec.Label) on port $($spec.Port)."; continue }
        $entry = Join-Path $projectDir $spec.Entry
        $arguments = '"' + $entry + '"'
        if ($spec.Label -eq 'frontend') { $arguments += ' --host localhost --port 5173 --strictPort' }
        $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
        $logBase = Join-Path $logs "preview-$($spec.Label)-$stamp"
        $child = Start-Process -FilePath $nodeExe -ArgumentList $arguments -WorkingDirectory $projectDir -WindowStyle Hidden -RedirectStandardOutput "$logBase.out.log" -RedirectStandardError "$logBase.err.log" -PassThru
        $started += @{Process=$child;Log=$logBase}
        Write-Host "Starting $($spec.Label), PID $($child.Id). Logs: $logBase"
    }
    $deadline = (Get-Date).AddSeconds(60)
    do {
        foreach ($child in $started) {
            if ($child.Process.HasExited) { throw "Service exited. Details: $([IO.File]::ReadAllText($child.Log + '.err.log'))" }
        }
        $ready = $true
        foreach ($spec in $specs) { if (!(Test-Ready $spec.Port $spec.Api)) { $ready = $false } }
        if ($ready) { break }
        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $deadline)
    if (!$ready) { throw "Services did not become ready within 60 seconds. Check $logs. Existing processes were not stopped." }
    $url = 'http://localhost:5173/'
    Write-Host "Ready: $url"
    Write-Host 'Services run in the background. This launcher and VS Code can be closed. Double-click the launcher again after restarting Windows.'
    if (!$NoBrowser) { Start-Process $url }
    exit 0
} catch {
    Write-Host "Preview could not start: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'No existing process was terminated. Copy this message if you need help.'
    exit 1
}
