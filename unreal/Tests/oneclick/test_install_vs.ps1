# Installs Visual Studio Build Tools 2022 with the one-click script's own Install-BuildTools (the exact download and installer options a PC
# without Visual Studio gets), then checks the result is what Unreal 5.5 needs: the C++ compiler for 64-bit Windows (and the 14.38 one Unreal
# 5.5 prefers) and a Windows SDK. Run by hand from .github/workflows/windows-oneclick.yml: it takes about half an hour.
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$env:SC_NO_MAIN = '1'
$env:SC_HOME = Join-Path $env:RUNNER_TEMP 'vs-home'
New-Item -ItemType Directory -Force -Path $env:SC_HOME | Out-Null
. (Join-Path $repo 'unreal\tools\SunsetCity.ps1')
$t0 = Get-Date
Install-BuildTools
Write-Host ('Install-BuildTools returned after ' + [int]((Get-Date) - $t0).TotalMinutes + ' minutes')
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
$bt = @(& $vswhere -products Microsoft.VisualStudio.Product.BuildTools -version '[17.0,18.0)' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath)
$fails = 0
if ($bt.Count -eq 0 -or -not $bt[0]) { Write-Host 'FAIL no Build Tools 2022 with the C++ compiler afterwards'; $fails++ }
else {
    Write-Host ('ok   Build Tools 2022 with the C++ compiler at ' + $bt[0])
    $sets = @(Get-ChildItem -Path (Join-Path $bt[0] 'VC\Tools\MSVC') -Directory | ForEach-Object { $_.Name })
    Write-Host ('     compilers: ' + ($sets -join ', '))
    if (@($sets | Where-Object { $_ -like '14.38.*' }).Count -eq 0) { Write-Host 'FAIL the 14.38 compiler (what Unreal 5.5 prefers) is not there: the installer took the plain set'; $fails++ }
    else { Write-Host 'ok   the 14.38 compiler is there' }
}
if (Test-WindowsSdk) { Write-Host 'ok   a Windows 10/11 SDK is there' } else { Write-Host 'FAIL no Windows SDK'; $fails++ }
$found = Find-VCTools
if ($found) { Write-Host ('ok   the script''s own check finds ' + $found.Path) } else { Write-Host 'FAIL the script''s own check finds nothing'; $fails++ }
if ($fails) { exit 1 }
Write-Host 'every check passed'
