# Starts Rematerial for testers on other networks: one port (3001) serves the built pages and the API.
# cpolar then forwards an https address to http://127.0.0.1:3001.
$ErrorActionPreference = 'Stop'
$projectDir = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $projectDir
$port = 3001
try {
    $node = (Get-Command node -ErrorAction Stop).Source
    $npm = Join-Path (Split-Path $node -Parent) 'npm.cmd'
    if (!(Test-Path 'node_modules/vite/bin/vite.js')) { throw '缺少依赖。请先在项目文件夹里运行 npm install。' }
    $database = Join-Path $projectDir 'data\rematerial.sqlite'
    if (!(Test-Path -LiteralPath $database)) { throw "找不到数据库：$database" }

    Write-Host '1/4 关闭旧的预览（只关这个项目的）...'
    foreach ($p in 3001, 5173) {
        foreach ($c in @(Get-NetTCPConnection -State Listen -LocalPort $p -ErrorAction SilentlyContinue)) {
            $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$($c.OwningProcess)"
            if ($proc.Name -eq 'node.exe' -and $proc.CommandLine -like "*$projectDir*") { Stop-Process -Id $proc.ProcessId -Force }
            else { throw "端口 $p 被其他程序占用（$($proc.Name)，PID $($proc.ProcessId)）。请先关掉它。" }
        }
    }
    Start-Sleep -Milliseconds 800

    Write-Host '2/4 备份数据库...'
    $backupDir = Join-Path $projectDir 'backups'
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
    $backup = Join-Path $backupDir ("before-testing-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.sqlite')
    & $node (Join-Path $projectDir 'scripts/backup-db.mjs') $database $backup
    if ($LASTEXITCODE -ne 0) { throw '数据库备份失败，已停止启动。' }
    Write-Host "   已备份到 $backup"

    Write-Host '3/4 打包前端（大约 10-20 秒）...'
    & $npm run build | Out-Null
    if ($LASTEXITCODE -ne 0) { throw '前端打包失败。请把这个窗口截图发给 Claude。' }

    Write-Host '4/4 启动服务器...'
    $env:DATABASE_PATH = $database
    $env:UPLOAD_DIR = Join-Path $projectDir 'uploads'
    $env:PORT = "$port"
    $env:HOST = '127.0.0.1'
    $env:AUTH_ATTEMPTS_PER_MINUTE = '60'
    $logs = Join-Path $projectDir '.logs'
    New-Item -ItemType Directory -Path $logs -Force | Out-Null
    $logBase = Join-Path $logs ("test-server-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
    $server = Start-Process -FilePath $node -ArgumentList ('"' + (Join-Path $projectDir 'backend\src\server.mjs') + '"') -WorkingDirectory $projectDir -WindowStyle Hidden -RedirectStandardOutput "$logBase.out.log" -RedirectStandardError "$logBase.err.log" -PassThru
    $ready = $false
    for ($i = 0; $i -lt 60; $i++) {
        if ($server.HasExited) { throw "服务器启动失败：$([IO.File]::ReadAllText("$logBase.err.log"))" }
        try { $h = Invoke-RestMethod "http://127.0.0.1:$port/api/health" -TimeoutSec 2; if ($h.database) { $ready = $true; break } } catch {}
        Start-Sleep -Milliseconds 500
    }
    if (!$ready) { throw '服务器 30 秒内没有启动成功。' }
    Write-Host ''
    Write-Host "成功！本机地址：http://127.0.0.1:$port" -ForegroundColor Green
    Write-Host '下一步：确认 cpolar 隧道指向 127.0.0.1:3001，然后用手机打开 cpolar 给的 https 网址。'
    Write-Host '服务器在后台运行，可以关掉这个窗口。'
    exit 0
} catch {
    Write-Host "启动失败：$($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
