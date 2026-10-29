$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
$runtimePath=Join-Path $projectRoot '.runtime'
if(Test-Path -LiteralPath $runtimePath){New-Item -ItemType File -Force -Path (Join-Path $runtimePath 'stop.request') | Out-Null;Write-Host 'SatelliteRoofs shutdown requested. Only this launcher and its owned child processes will stop.'}
