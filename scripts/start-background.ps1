param([switch]$HostOnly)
$ErrorActionPreference='Stop'
$taskRoot=Split-Path -Parent $PSScriptRoot
$taskRuntime=Join-Path $taskRoot '.runtime'
if($HostOnly){
    $taskProcess=Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList @('scripts/run.mjs','--production') -WorkingDirectory $taskRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskRuntime 'server.stdout.log') -RedirectStandardError (Join-Path $taskRuntime 'server.stderr.log') -PassThru
    $taskProcess.Id | Set-Content (Join-Path $taskRuntime 'launcher.pid') -Encoding ascii
    exit
}
if(Get-NetTCPConnection -State Listen -LocalPort 3210 -ErrorAction SilentlyContinue){throw 'Port 3210 is already in use. Stop the existing SatelliteRoofs launcher before starting another.'}
if(!(Test-Path (Join-Path $taskRoot 'apps/web/.next/BUILD_ID'))){throw 'Run npm.cmd run build first.'}
# Launch once through Windows process management so the local server is not tied
# to an agent shell job. This creates no scheduled task or automatic startup rule.
$taskStartup=New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ShowWindow=[uint16]0}
$taskShell=(Get-Command powershell.exe).Source
$taskCommand='"'+$taskShell+'" -NoProfile -File "'+$PSCommandPath+'" -HostOnly'
$taskResult=Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine=$taskCommand;CurrentDirectory=$taskRoot;ProcessStartupInformation=$taskStartup}
if($taskResult.ReturnValue -ne 0){throw "Windows could not launch SatelliteRoofs (code $($taskResult.ReturnValue))."}
Write-Output 'SatelliteRoofs background launch requested. Logs are in .runtime/server.stdout.log and server.stderr.log.'
