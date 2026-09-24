param([ValidateSet('dev','build','test','browser','start','install')][string]$Task = 'dev')
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCommand) { $runtime = $nodeCommand.Source } else { $runtime = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' }
if (-not (Test-Path -LiteralPath $runtime)) { throw 'Node.js 24 or newer is required. Install Node.js, then run this script again.' }
$env:PATH = (Split-Path $runtime -Parent) + ';' + $env:PATH
if ($Task -eq 'install') {
  $npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if ($npmCommand) { & $npmCommand.Source install } else {
    $packageManager = Join-Path (Split-Path (Split-Path $runtime -Parent) -Parent) 'node_modules\pnpm\bin\pnpm.cjs'
    if (-not (Test-Path $packageManager)) { throw 'npm or pnpm is required to install dependencies.' }
    & $runtime $packageManager install --store-dir .cache/pnpm
  }
} elseif ($Task -eq 'dev') { & $runtime scripts/dev.mjs
} elseif ($Task -eq 'build') { & $runtime node_modules/typescript/bin/tsc --noEmit; if ($LASTEXITCODE -eq 0) { & $runtime node_modules/vite/bin/vite.js build }
} elseif ($Task -eq 'test') { & $runtime --test tests/*.test.mjs
} elseif ($Task -eq 'browser') { & $runtime node_modules/@playwright/test/cli.js test
} else { & $runtime backend/src/server.mjs }
exit $LASTEXITCODE
