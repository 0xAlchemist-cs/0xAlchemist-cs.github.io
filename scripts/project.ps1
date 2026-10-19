param(
  [ValidateSet('install','dev','check','lint','format','test','build','preview','verify','test:browser','audit:content','audit:site','sync:github','release:check')]
  [string]$Task = 'dev',
  [Parameter(ValueFromRemainingArguments = $true)][string[]]$TaskArguments
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeDirectory = Join-Path $projectRoot '.tools/node-v22.22.0-win-x64'
$runtimeExecutable = Join-Path $runtimeDirectory 'node.exe'
$npmEntry = Join-Path $runtimeDirectory 'node_modules/npm/bin/npm-cli.js'
if (-not (Test-Path -LiteralPath $runtimeExecutable)) { throw 'Run: powershell -ExecutionPolicy Bypass -File scripts/bootstrap.ps1' }
$originalPath = $env:PATH
$originalCache = $env:npm_config_cache
Push-Location $projectRoot
try {
  $env:PATH = $runtimeDirectory + [IO.Path]::PathSeparator + $originalPath
  $env:npm_config_cache = Join-Path $projectRoot '.tools/npm-cache'
  if ($Task -eq 'install') { & $runtimeExecutable $npmEntry ci @TaskArguments }
  else { & $runtimeExecutable $npmEntry run $Task -- @TaskArguments }
  $taskExitCode = $LASTEXITCODE
} finally {
  $env:PATH = $originalPath
  $env:npm_config_cache = $originalCache
  Pop-Location
}
exit $taskExitCode
