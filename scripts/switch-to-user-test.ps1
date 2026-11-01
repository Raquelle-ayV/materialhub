# Switches this project back to the 10.8 user-test version (code + data) and serves it to phones through cpolar.
# Usually started by 切换到10.8测试版.cmd, which runs a temporary copy so it works from any branch.
# Data comes from the local snapshot backups\user-test-1008 (never committed) and runs from its own file
# data\user-test-1008.sqlite, so data\rematerial.sqlite (the latest version's data) is never touched.
param([string]$ProjectDir = (Split-Path $PSScriptRoot -Parent))
$ErrorActionPreference = 'Stop'
$branch = 'user-test-1008'
$port = 3001
try {
    $ProjectDir = (Resolve-Path -LiteralPath $ProjectDir).Path
    Set-Location -LiteralPath $ProjectDir
    $node = (Get-Command node -ErrorAction Stop).Source
    $snapshot = Join-Path $ProjectDir "backups\$branch"
    $snapshotDb = Join-Path $snapshot 'rematerial.sqlite'
    $database = Join-Path $ProjectDir 'data\user-test-1008.sqlite'
    $uploads = Join-Path $ProjectDir 'uploads'

    Write-Host '1/6 检查快照和代码...'
    if (!(Test-Path -LiteralPath $snapshotDb)) { throw "找不到 10.8 测试数据快照：$snapshot" }
    $manifest = Get-Content -LiteralPath (Join-Path $snapshot 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if ((Get-FileHash -LiteralPath $snapshotDb -Algorithm SHA256).Hash -ne $manifest.sqlite_sha256) { throw '快照数据库和 manifest.json 对不上，可能被改过。已停止，没有动任何文件。' }
    $changes = git status --porcelain --untracked-files=no
    if ($LASTEXITCODE -ne 0) { throw 'git 不可用。' }
    if ($changes) { throw "当前分支有没提交的改动，先提交或撤销再切换：`n$($changes -join "`n")" }
    $previous = (git rev-parse --abbrev-ref HEAD).Trim()

    Write-Host '2/6 关闭旧的预览（只关这个项目的）...'
    foreach ($p in 3001, 5173) {
        foreach ($c in @(Get-NetTCPConnection -State Listen -LocalPort $p -ErrorAction SilentlyContinue)) {
            $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$($c.OwningProcess)"
            if ($proc.Name -eq 'node.exe' -and $proc.CommandLine -like "*$ProjectDir*") { Stop-Process -Id $proc.ProcessId -Force }
            else { throw "端口 $p 被其他程序占用（$($proc.Name)，PID $($proc.ProcessId)）。请先关掉它。" }
        }
    }
    Start-Sleep -Milliseconds 800

    Write-Host '3/6 备份上一次 10.8 测试留下的数据...'
    $backupDir = Join-Path $ProjectDir ("backups\before-switch-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
    if (Test-Path -LiteralPath $database) {
        & $node -e "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(process.argv[1]);try{db.prepare('VACUUM INTO ?').run(process.argv[2]);}finally{db.close();}" $database (Join-Path $backupDir 'rematerial.sqlite')
        if ($LASTEXITCODE -ne 0) { throw '数据库备份失败，已停止，没有动任何文件。' }
    }
    "data\user-test-1008.sqlite as left by the previous 10.8 session (empty folder if there was none), saved before it was reset to the snapshot.`r`nThe latest version's data\rematerial.sqlite is not touched by this switch." | Out-File (Join-Path $backupDir 'RESTORE.txt') -Encoding utf8
    Write-Host "   已备份到 $backupDir"

    Write-Host "4/6 切换代码到 $branch..."
    if ($previous -ne $branch) {
        git checkout $branch
        if ($LASTEXITCODE -ne 0) { throw "切换到分支 $branch 失败。" }
    }

    Write-Host '5/6 恢复 10.8 测试数据...'
    Remove-Item -LiteralPath "$database-wal", "$database-shm" -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Path (Split-Path $database), $uploads -Force | Out-Null
    Copy-Item -LiteralPath $snapshotDb -Destination $database -Force
    # Photo names are unique, so only add missing ones; never delete or overwrite.
    $added = 0
    foreach ($f in Get-ChildItem -LiteralPath (Join-Path $snapshot 'uploads') -File) {
        $target = Join-Path $uploads $f.Name
        if (!(Test-Path -LiteralPath $target)) { Copy-Item -LiteralPath $f.FullName -Destination $target; $added++ }
    }
    Write-Host "   数据库已恢复，补回 $added 张照片"

    Write-Host '6/6 打包并启动（和测试那天同一个启动脚本）...'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $ProjectDir 'scripts\start-test-server.ps1') -Database $database
    if ($LASTEXITCODE -ne 0) { throw '启动脚本失败，看上面的提示。' }

    Write-Host ''
    Write-Host '查找 cpolar 网址...'
    if (!(Get-Process cpolar -ErrorAction SilentlyContinue)) { throw 'cpolar 没有在运行。请打开 cpolar（或在“服务”里启动 cpolar），再重新运行这个脚本。' }
    $url = $null
    $logs = Get-ChildItem -Path (Join-Path $env:USERPROFILE '.cpolar\logs') -Filter 'cpolar_service.log*' -ErrorAction SilentlyContinue | Where-Object { $_.Name -notlike '*master*' } | Sort-Object LastWriteTime -Descending
    foreach ($log in $logs) {
        $hits = Select-String -LiteralPath $log.FullName -Pattern 'TunnelName\\":\\"rematerial\\".*?\\"Url\\":\\"(https://[^\\"]+)' -AllMatches
        if ($hits) { $url = $hits[-1].Matches[-1].Groups[1].Value; break }
    }
    if (!$url) { throw '没在 cpolar 日志里找到 rematerial 隧道的网址。打开 http://localhost:9200 登录 cpolar，在“在线隧道列表”里看 rematerial 的 https 网址。' }
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $online = $false
    for ($i = 0; $i -lt 10 -and !$online; $i++) {
        try { $online = (Invoke-RestMethod "$url/api/health" -TimeoutSec 10).database } catch { Start-Sleep -Seconds 2 }
    }
    try { Set-Clipboard -Value $url } catch {}
    # A new file each time: an image viewer still showing the last code keeps that file locked.
    $qr = Join-Path $env:TEMP ('rematerial-qr-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.png')
    & $node -e "require('qrcode').toFile(process.argv[1],process.argv[2],{width:420,margin:2}).catch(e=>{console.error(e.message);process.exit(1)})" $qr $url
    $qrShown = $LASTEXITCODE -eq 0
    if ($qrShown) { Start-Process $qr }

    Write-Host ''
    if ($online) { Write-Host "手机打开：$url" -ForegroundColor Green }
    else { Write-Host "本机已启动，但暂时从外网打不开 $url 。cpolar 免费版网址会变，请到 http://localhost:9200 查看 rematerial 隧道的最新网址。" -ForegroundColor Yellow }
    if ($qrShown) { Write-Host '网址已复制到剪贴板，二维码图片已打开，用手机扫码即可。' }
    else { Write-Host '网址已复制到剪贴板。二维码没能生成，请在手机上直接输入网址。' }
    Write-Host "原来的分支是 $previous。最新版本的数据仍在 data\rematerial.sqlite，没有被改动。"
    exit 0
} catch {
    Write-Host "切换失败：$($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
