$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
if(-not (Test-Path '.venv/Scripts/python.exe')) { python -m venv .venv }
& .venv/Scripts/python.exe -m pip install -r requirements.txt
if($LASTEXITCODE -ne 0){throw 'Python dependency installation failed'}
npm.cmd ci --no-audit --no-fund
if($LASTEXITCODE -ne 0){throw 'Root dependency installation failed'}
npm.cmd --prefix apps/web ci --no-audit --no-fund
if($LASTEXITCODE -ne 0){throw 'Web dependency installation failed'}
New-Item -ItemType Directory -Force '.runtime' | Out-Null
'{"python":".venv/Scripts/python.exe","driver":"psycopg","compatibility":false}' | Set-Content -LiteralPath '.runtime/runtime.json' -Encoding ascii
Write-Host 'Setup complete. Run npm.cmd run dev. Keep this terminal open while using SatelliteRoofs.'
