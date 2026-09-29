param([ValidateSet('client','server','demo')][string]$Service = 'client')
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodeExecutable = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' }
if (-not (Test-Path -LiteralPath $nodeExecutable)) { throw 'Node.js 24 or newer is required. Install it and reopen your terminal.' }
if ($Service -eq 'demo') { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'launch-preview.ps1') }
elseif ($Service -eq 'server') {
    & $nodeExecutable scripts/import-samples.mjs
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $nodeExecutable --watch backend/src/server.mjs
}
else { & $nodeExecutable node_modules/vite/bin/vite.js --host localhost --port 5173 --strictPort }
exit $LASTEXITCODE
