$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$toolsDirectory = Join-Path $projectRoot '.tools'
$runtimeDirectory = Join-Path $toolsDirectory 'node-v22.22.0-win-x64'
if (Test-Path -LiteralPath (Join-Path $runtimeDirectory 'node.exe')) {
  & (Join-Path $runtimeDirectory 'node.exe') --version
  exit $LASTEXITCODE
}
New-Item -ItemType Directory -Force -Path $toolsDirectory | Out-Null
$archivePath = Join-Path $toolsDirectory 'node-v22.22.0-win-x64.zip'
$checksumPath = Join-Path $toolsDirectory 'SHASUMS256.txt'
if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
  & curl.exe --fail --location --retry 4 --retry-all-errors --output $archivePath 'https://nodejs.org/dist/v22.22.0/node-v22.22.0-win-x64.zip'
  if ($LASTEXITCODE -ne 0) { throw 'Node archive download failed.' }
  & curl.exe --fail --location --retry 4 --output $checksumPath 'https://nodejs.org/dist/v22.22.0/SHASUMS256.txt'
  if ($LASTEXITCODE -ne 0) { throw 'Node checksum download failed.' }
} else {
  Invoke-WebRequest -Uri 'https://nodejs.org/dist/v22.22.0/node-v22.22.0-win-x64.zip' -OutFile $archivePath
  Invoke-WebRequest -Uri 'https://nodejs.org/dist/v22.22.0/SHASUMS256.txt' -OutFile $checksumPath
}
$actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $archivePath).Hash.ToLowerInvariant()
$expectedHash = ((Get-Content -LiteralPath $checksumPath | Where-Object { $_ -match ' node-v22.22.0-win-x64.zip$' }) -split '\s+')[0]
if ($actualHash -ne $expectedHash) { throw 'Node archive checksum mismatch; do not extract.' }
Expand-Archive -LiteralPath $archivePath -DestinationPath $toolsDirectory -Force
& (Join-Path $runtimeDirectory 'node.exe') --version
