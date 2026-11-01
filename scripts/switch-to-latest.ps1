# Switches this project to the latest version and serves it to phones through cpolar.
# Usually started by 切换到最新版.cmd, which runs a temporary copy so it works from any branch.
# "Latest" = the branch with the newest commit (local or on GitHub), leaving out the frozen test versions,
# so new branches and new commits are picked up automatically. -Branch <name> picks one by hand.
# Data: data\rematerial.sqlite, the same file the development preview uses.
param([string]$ProjectDir = (Split-Path $PSScriptRoot -Parent), [string]$Branch)
$ErrorActionPreference = 'Stop'
$frozen = '^(user-test-1008|test/remote-testers|snapshot/.*)$'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}
try {
    $ProjectDir = (Resolve-Path -LiteralPath $ProjectDir).Path
    Set-Location -LiteralPath $ProjectDir
    $node = (Get-Command node -ErrorAction Stop).Source

    Write-Host '1/4 查找最新版本...'
    git fetch --quiet origin
    if ($LASTEXITCODE -ne 0) { Write-Host '   连不上 GitHub，只看本机的分支。' -ForegroundColor Yellow }
    if (!$Branch) {
        foreach ($line in git for-each-ref --sort=-committerdate --format='%(refname:short)' refs/heads refs/remotes/origin) {
            $name = $line -replace '^origin/', ''
            if ($line -eq 'origin' -or $name -eq 'HEAD' -or $name -match $frozen) { continue }
            $Branch = $name; break
        }
        if (!$Branch) { throw '没有找到可以切换的分支。' }
    }
    $previous = (git rev-parse --abbrev-ref HEAD).Trim()
    $hasLocal = [bool](git branch --list $Branch)
    $remote = "origin/$Branch"
    $hasRemote = [bool](git branch -r --list $remote)
    if (!$hasLocal -and !$hasRemote) { throw "找不到分支 $Branch。" }
    Write-Host "   最新版本：$Branch"

    Write-Host '2/4 关闭旧的预览（只关这个项目的）...'
    foreach ($p in 3001, 5173) {
        foreach ($c in @(Get-NetTCPConnection -State Listen -LocalPort $p -ErrorAction SilentlyContinue)) {
            $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$($c.OwningProcess)"
            if ($proc.Name -eq 'node.exe' -and $proc.CommandLine -like "*$ProjectDir*") { Stop-Process -Id $proc.ProcessId -Force }
            else { throw "端口 $p 被其他程序占用（$($proc.Name)，PID $($proc.ProcessId)）。请先关掉它。" }
        }
    }
    Start-Sleep -Milliseconds 800

    Write-Host "3/4 切换代码到 $Branch..."
    if ($previous -ne $Branch) {
        # Uncommitted work on the branch we are already on is kept and included; leaving a branch with it is refused.
        $changes = git status --porcelain --untracked-files=no
        if ($changes) { throw "当前分支 $previous 有没提交的改动，先提交或撤销再切换：`n$($changes -join "`n")" }
        if ($hasLocal) { git checkout $Branch } else { git checkout --track $remote }
        if ($LASTEXITCODE -ne 0) { throw "切换到分支 $Branch 失败。" }
    }
    if ($hasRemote) {
        git merge-base --is-ancestor HEAD $remote
        if ($LASTEXITCODE -eq 0) {
            git merge --ff-only --quiet $remote
            if ($LASTEXITCODE -ne 0) { Write-Host "   没能合并 GitHub 上 $Branch 的更新，继续使用本机的版本。" -ForegroundColor Yellow }
        } else {
            git merge-base --is-ancestor $remote HEAD
            if ($LASTEXITCODE -ne 0) { Write-Host "   本机和 GitHub 上的 $Branch 各有不同的修改，使用本机的版本。" -ForegroundColor Yellow }
        }
    }
    Write-Host "   当前代码：$(git log -1 --format='%h %ad %s' --date=format:'%m-%d %H:%M')"

    Write-Host '4/4 打包并启动...'
    $start = Join-Path $ProjectDir 'scripts\start-test-server.ps1'
    if (!(Test-Path -LiteralPath $start)) { throw "分支 $Branch 里没有 scripts\start-test-server.ps1，不能用手机预览。" }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $start
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
    $qr = Join-Path $ProjectDir '.logs\phone-preview-qr.png'
    & $node -e "require('qrcode').toFile(process.argv[1],process.argv[2],{width:420,margin:2}).catch(e=>{console.error(e.message);process.exit(1)})" $qr $url
    if ($LASTEXITCODE -eq 0) { Start-Process $qr }

    Write-Host ''
    if ($online) { Write-Host "手机打开：$url" -ForegroundColor Green }
    else { Write-Host "本机已启动，但暂时从外网打不开 $url 。cpolar 免费版网址会变，请到 http://localhost:9200 查看 rematerial 隧道的最新网址。" -ForegroundColor Yellow }
    Write-Host '网址已复制到剪贴板，二维码图片已打开，用手机扫码即可。'
    Write-Host "电脑上也可以打开 http://127.0.0.1:3001 。原来的分支是 $previous。"
    exit 0
} catch {
    Write-Host "切换失败：$($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
