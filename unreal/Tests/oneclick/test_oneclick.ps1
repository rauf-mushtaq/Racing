# Real-Windows test of the one-click script (unreal\SunsetCity.bat and unreal\tools\SunsetCity.ps1), run by .github/workflows/windows-oneclick.yml
# on a GitHub Windows machine (Windows PowerShell 5.1, cmd.exe, Visual Studio 2022). Unreal Engine cannot be installed there, so a stand-in
# engine is made: its Build.bat, RunUAT.bat and editor are small programs that write down how they were called and act out success or
# failure. Everything else is the real thing: cmd.exe running the .bat files, Windows PowerShell running the script, the Visual Studio
# check, the downloads from GitHub, the desktop icons, Play_Streaming.bat and Package_Windows.bat.
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$base = $env:RUNNER_TEMP
if (-not $base) { $base = 'C:\' }
$work = Join-Path $base ('oc' + (Get-Random -Maximum 99999))
New-Item -ItemType Directory -Force -Path $work | Out-Null
$script:fails = 0
$script:runs = 0

function Check([string]$Name, [bool]$Ok, [string]$Info = '') {
    if ($Ok) { Write-Host ('ok   ' + $Name) -ForegroundColor Green }
    else { Write-Host ('FAIL ' + $Name + '   ' + $Info) -ForegroundColor Red; $script:fails++ }
}

function Run-Bat([string]$Bat, [string]$BatArgs = '') {
    # runs a .bat as a double-click would (but with no keyboard: a pause returns at once); prints what it printed; returns its exit code
    $script:runs++
    $out = Join-Path $work ('run' + $script:runs + '.txt')
    $line = '/d /s /c ""' + $Bat + '" ' + $BatArgs + ' > "' + $out + '" 2>&1 < nul"'
    $p = Start-Process -FilePath $env:ComSpec -ArgumentList $line -NoNewWindow -PassThru
    $null = $p.Handle
    if (-not $p.WaitForExit(900000)) { Stop-Process -Id $p.Id -Force; Write-Host 'TIMED OUT'; return 999 }
    Write-Host ('----- run ' + $script:runs + ': ' + (Split-Path -Leaf $Bat) + ' ' + $BatArgs + ' (exit ' + $p.ExitCode + ')')
    if (Test-Path -LiteralPath $out) { Get-Content -LiteralPath $out | ForEach-Object { Write-Host ('  | ' + $_) } }
    $script:lastOutput = ''
    if (Test-Path -LiteralPath $out) { $script:lastOutput = Get-Content -Raw -LiteralPath $out }
    return [int]$p.ExitCode
}

$calls = Join-Path $work 'calls.log'
Set-Content -LiteralPath $calls -Value '' -Encoding ASCII
$env:FAKE_CALLS = $calls
function Mark { return @(Get-Content -LiteralPath $calls).Count }
function CallsSince([int]$From) { return @(Get-Content -LiteralPath $calls | Select-Object -Skip $From | Where-Object { $_ }) }
function Wait-Call([int]$From, [string]$Like) {
    # the game is started without waiting for it, so its note can come a moment after the script has finished
    for ($i = 0; $i -lt 40; $i++) { if (@(CallsSince $From | Where-Object { $_ -like $Like }).Count -gt 0) { return $true }; Start-Sleep -Milliseconds 500 }
    return $false
}
function Count([string[]]$Lines, [string]$Like) { return @($Lines | Where-Object { $_ -like $Like }).Count }
function Test-SameText([string]$A, [string]$B) {
    if (-not (Test-Path -LiteralPath $A) -or -not (Test-Path -LiteralPath $B)) { return $false }
    return (((Get-Content -Raw -LiteralPath $A) -replace "`r`n", "`n") -eq ((Get-Content -Raw -LiteralPath $B) -replace "`r`n", "`n"))
}

# ---------------------------------------------------------------- the scripts are what Windows PowerShell 5.1 and cmd.exe expect
$ps1 = Join-Path $repo 'unreal\tools\SunsetCity.ps1'
$tokens = $null; $perr = $null
[void][Management.Automation.Language.Parser]::ParseFile($ps1, [ref]$tokens, [ref]$perr)
Check 'SunsetCity.ps1 parses in Windows PowerShell 5.1' ($perr.Count -eq 0) (($perr | ForEach-Object { $_.Message }) -join '; ')
foreach ($f in @('unreal\tools\SunsetCity.ps1', 'unreal\SunsetCity.bat', 'unreal\Play_Streaming.bat', 'unreal\Package_Windows.bat')) {
    $bytes = [IO.File]::ReadAllBytes((Join-Path $repo $f))
    Check ($f + ' is plain ASCII') (@($bytes | Where-Object { $_ -gt 127 }).Count -eq 0)
}

# ---------------------------------------------------------------- a stand-in Unreal Engine 5.5
$ue = Join-Path $work 'UE_5.5'
$bin = Join-Path $ue 'Engine\Binaries\Win64'
$bf = Join-Path $ue 'Engine\Build\BatchFiles'
$sig = Join-Path $ue 'Engine\Plugins\Media\PixelStreaming\Resources\WebServers\SignallingWebServer\platform_scripts\cmd'
foreach ($d in @($bin, $bf, $sig)) { New-Item -ItemType Directory -Force -Path $d | Out-Null }
Set-Content -LiteralPath (Join-Path $ue 'Engine\Build\Build.version') -Encoding ASCII -Value '{ "MajorVersion": 5, "MinorVersion": 5, "PatchVersion": 4, "Changelist": 0, "BranchName": "++UE5+Release-5.5" }'
$cs = @'
using System;
using System.IO;
using System.Linq;
public static class FakeUnreal
{
    public static int Main(string[] args)
    {
        string me = System.Reflection.Assembly.GetEntryAssembly().Location;
        if (args.Length > 0 && args[0] == "-fake-runuat")
        {
            Console.WriteLine("Parsing command line: " + string.Join(" ", args.Skip(1)));
            if (Environment.GetEnvironmentVariable("FAKE_PACKAGE") == "fail")
            {
                Console.WriteLine("LogCook: Error: (stand-in) the cook failed");
                Console.WriteLine("AutomationTool exiting with ExitCode=25 (Error_UnknownCookFailure)");
                return 25;
            }
            string dir = args.Where(a => a.StartsWith("-archivedirectory=", StringComparison.OrdinalIgnoreCase)).Select(a => a.Substring(18)).FirstOrDefault();
            if (dir == null) { Console.WriteLine("ERROR: no -archivedirectory"); return 1; }
            Directory.CreateDirectory(Path.Combine(dir, "Windows"));
            File.Copy(me, Path.Combine(dir, "Windows", "SunsetCity.exe"), true);
            Console.WriteLine("AutomationTool exiting with ExitCode=0 (Success)");
            return 0;
        }
        string line = Path.GetFileName(me) + " " + string.Join(" ", args);
        Console.WriteLine("LogInit: Display: (stand-in) " + line);
        string calls = Environment.GetEnvironmentVariable("FAKE_CALLS");
        if (!string.IsNullOrEmpty(calls)) File.AppendAllText(calls, line + Environment.NewLine);
        bool viaExec = args.Any(a => a.StartsWith("-ExecutePythonScript=", StringComparison.OrdinalIgnoreCase));
        bool viaRun = args.Any(a => a.StartsWith("-script=", StringComparison.OrdinalIgnoreCase));
        string result = Environment.GetEnvironmentVariable("SC_SETUP_RESULT");
        if ((viaExec || viaRun) && !string.IsNullOrEmpty(result))
        {
            string mode = Environment.GetEnvironmentVariable("FAKE_SETUP") ?? "ok";
            if (mode == "fail")
            {
                Console.WriteLine("LogPython: Error: RuntimeError: the map /Game/SunsetCity/Maps/Main was not made");
                File.WriteAllText(result, "FAILED\nTraceback (most recent call last):\nRuntimeError: the map /Game/SunsetCity/Maps/Main was not made\n");
            }
            else if (mode == "ignore-first" && viaExec) Console.WriteLine("LogPython: (stand-in) not running the script this way");
            else File.WriteAllText(result, "OK\n42 assets in /Game/SunsetCity\n");
        }
        return 0;
    }
}
'@
$fakeExe = Join-Path $bin 'UnrealEditor-Cmd.exe'
Add-Type -TypeDefinition $cs -OutputAssembly $fakeExe -OutputType ConsoleApplication -ReferencedAssemblies 'System.Core'
Copy-Item -LiteralPath $fakeExe -Destination (Join-Path $bin 'UnrealEditor.exe')
Set-Content -LiteralPath (Join-Path $bf 'Build.bat') -Encoding ASCII -Value @(
    '@echo off',
    '>> "%FAKE_CALLS%" echo Build.bat %*',
    'echo Using bundled DotNet SDK (stand-in)',
    'if /i "%FAKE_BUILD%"=="fail" goto fail',
    'echo Result: Succeeded',
    'exit /b 0',
    ':fail',
    'echo C:\SunsetCity\game\unreal\SunsetCity\Source\SunsetCity\SCWorld.cpp(120): error C2065: ''FooBar'': undeclared identifier',
    'echo Result: Failed (OtherCompilationError)',
    'exit /b 6')
Set-Content -LiteralPath (Join-Path $bf 'RunUAT.bat') -Encoding ASCII -Value @(
    '@echo off',
    '>> "%FAKE_CALLS%" echo RunUAT.bat %*',
    '"%~dp0..\..\Binaries\Win64\UnrealEditor-Cmd.exe" -fake-runuat %*',
    'exit /b %errorlevel%')
Set-Content -LiteralPath (Join-Path $sig 'start.bat') -Encoding ASCII -Value @('@echo off', '>> "%FAKE_CALLS%" echo signalling server start.bat')
$datDir = Join-Path $env:ProgramData 'Epic\UnrealEngineLauncher'
New-Item -ItemType Directory -Force -Path $datDir | Out-Null
$dat = Join-Path $datDir 'LauncherInstalled.dat'
$datText = '{ "InstallationList": [ { "InstallLocation": "' + $ue.Replace('\', '\\') + '", "NamespaceId": "ue", "ItemId": "x", "ArtifactId": "UE_5.5", "AppVersion": "5.5.4-0+++UE5+Release-5.5-Windows", "AppName": "UE_5.5" } ] }'
Set-Content -LiteralPath $dat -Encoding ASCII -Value $datText
Check 'the stand-in engine is in place' ((Test-Path (Join-Path $bin 'UnrealEditor-Cmd.exe')) -and (Test-Path $dat))

$desk = [Environment]::GetFolderPath('Desktop')
if (-not $desk) { $desk = Join-Path $env:USERPROFILE 'Desktop' }
$report = Join-Path $desk 'Sunset City - send this to Claude.txt'
function Clear-Report { if (Test-Path -LiteralPath $report) { Remove-Item -LiteralPath $report -Force } }

# ---------------------------------------------------------------- a copy of the repository the script takes its files from
$src = Join-Path $work 'repo'
foreach ($part in @('unreal', 'assets')) { Copy-Item -LiteralPath (Join-Path $repo $part) -Destination (Join-Path $src $part) -Recurse }
$home1 = Join-Path $work 'home'
$env:SC_HOME = $home1
$env:SC_SOURCE_DIR = $src
$env:SC_UNATTENDED = '1'
$bat = Join-Path $repo 'unreal\SunsetCity.bat'
$project = Join-Path $home1 'game\unreal\SunsetCity\SunsetCity.uproject'
$runner = Join-Path $home1 'game\unreal\SunsetCity\Content\Python\sc_oneclick_setup.py'
$packaged = Join-Path $home1 'game\unreal\Packaged'
Clear-Report

# 1. the first time: everything, in order
$m = Mark
$rc = Run-Bat $bat
$c = CallsSince $m
Check 'first run: finishes' ($rc -eq 0) "exit $rc"
Check 'first run: builds the code with Build.bat, for the editor, on the downloaded project' ((Count $c ('Build.bat SunsetCityEditor Win64 Development -Project="' + $project + '" *')) -eq 1) ($c -join ' | ')
Check 'first run: sets up in the editor with no window, handing it the set-up script' ((Count $c ('UnrealEditor-Cmd.exe ' + $project + ' -ExecutePythonScript=' + $runner + ' -unattended*')) -eq 1)
Check 'first run: packages with RunUAT into game\unreal\Packaged' ((Count $c ('RunUAT.bat BuildCookRun -project="' + $project + '" *-map=/Game/SunsetCity/Maps/Main*-archivedirectory="' + $packaged + '"*')) -eq 1)
Check 'first run: in that order' (([array]::IndexOf($c, ($c | Where-Object { $_ -like 'Build.bat*' } | Select-Object -First 1)) -lt [array]::IndexOf($c, ($c | Where-Object { $_ -like 'UnrealEditor-Cmd.exe*' } | Select-Object -First 1))) -and ([array]::IndexOf($c, ($c | Where-Object { $_ -like 'UnrealEditor-Cmd.exe*' } | Select-Object -First 1)) -lt [array]::IndexOf($c, ($c | Where-Object { $_ -like 'RunUAT.bat*' } | Select-Object -First 1))))
Check 'first run: starts the game it made' (Wait-Call $m 'SunsetCity.exe*')
Check 'first run: SunsetCity.exe is where the icons point' (Test-Path (Join-Path $packaged 'Windows\SunsetCity.exe'))
$shell = New-Object -ComObject WScript.Shell
$lnk = Join-Path $desk 'Sunset City.lnk'
$lnk2 = Join-Path $desk 'Sunset City on iPad.lnk'
Check 'first run: "Sunset City" and "Sunset City on iPad" icons on the desktop' ((Test-Path $lnk) -and (Test-Path $lnk2))
if (Test-Path $lnk2) {
    $s = $shell.CreateShortcut($lnk2)
    Check 'the iPad icon runs the copy of SunsetCity.bat in the Sunset City folder, with -Stream' ($s.TargetPath -eq (Join-Path $home1 'SunsetCity.bat') -and $s.Arguments -eq '-Stream') ($s.TargetPath + ' ' + $s.Arguments)
}
Check 'first run: a copy of SunsetCity.bat is kept in the Sunset City folder' (Test-SameText (Join-Path $home1 'SunsetCity.bat') $bat)
Check 'first run: no problem report' (-not (Test-Path $report))
$state = Get-Content -Raw (Join-Path $home1 'state.json') | ConvertFrom-Json
Check 'first run: every step is noted as done' ($state.code -and $state.setup -and $state.package -and $state.everPackaged)

# 2. the everyday case: nothing changed, so it only starts the game
$m = Mark
$t0 = Get-Date
$rc = Run-Bat (Join-Path $home1 'SunsetCity.bat')
$c = CallsSince $m
Check 'second run (from the desktop icon''s file): finishes' ($rc -eq 0) "exit $rc"
Check 'second run: builds, sets up and packages nothing' ((Count $c 'Build.bat*') + (Count $c 'UnrealEditor-Cmd.exe*') + (Count $c 'RunUAT.bat*') -eq 0) ($c -join ' | ')
Check 'second run: starts the game' (Wait-Call $m 'SunsetCity.exe*')
Check ('second run: quick (' + [int]((Get-Date) - $t0).TotalSeconds + ' s)') (((Get-Date) - $t0).TotalSeconds -lt 60)
Check 'second run: says it is up to date' ($script:lastOutput -like '*built and up to date*')

# 3. a change to the code: build and package again, no set-up
Add-Content -LiteralPath (Join-Path $src 'unreal\SunsetCity\Source\SunsetCity\SCUtil.cpp') -Value '// (test change 1)'
$m = Mark
$rc = Run-Bat $bat
$c = CallsSince $m
Check 'code changed: finishes' ($rc -eq 0) "exit $rc"
Check 'code changed: builds and packages, does not set up again' ((Count $c 'Build.bat*') -eq 1 -and (Count $c 'UnrealEditor-Cmd.exe*') -eq 0 -and (Count $c 'RunUAT.bat*') -eq 1) ($c -join ' | ')
Check 'code changed: the change reached the game copy' ((Get-Content -Raw (Join-Path $home1 'game\unreal\SunsetCity\Source\SunsetCity\SCUtil.cpp')) -like '*(test change 1)*')

# 4. a change to the set-up scripts: set up and package again, no build
Add-Content -LiteralPath (Join-Path $src 'unreal\SunsetCity\Content\Python\sc_setup.py') -Value '# (test change 2)'
$m = Mark
$rc = Run-Bat $bat
$c = CallsSince $m
Check 'set-up changed: sets up and packages, does not build' ($rc -eq 0 -and (Count $c 'Build.bat*') -eq 0 -and (Count $c 'UnrealEditor-Cmd.exe*') -eq 1 -and (Count $c 'RunUAT.bat*') -eq 1) ("exit $rc; " + ($c -join ' | '))

# 5. the code does not compile: a report on the desktop, and the last version that worked starts
Add-Content -LiteralPath (Join-Path $src 'unreal\SunsetCity\Source\SunsetCity\SCUtil.cpp') -Value '// (test change 3)'
$env:FAKE_BUILD = 'fail'
Clear-Report
$codeBefore = (Get-Content -Raw (Join-Path $home1 'state.json') | ConvertFrom-Json).code
$m = Mark
$rc = Run-Bat $bat
$c = CallsSince $m
Check 'build fails: the script says it did not work (exit code not 0)' ($rc -ne 0) "exit $rc"
Check 'build fails: a report is on the desktop' (Test-Path $report)
if (Test-Path $report) {
    $r = Get-Content -Raw $report
    Check 'build fails: the report names the step and has the compiler''s error line' ($r -like '*building the game''s code did not work*' -and $r -like '*error C2065*' -and $r -like '*Result: Failed*')
    Check 'build fails: the report describes the PC (Visual Studio, Unreal)' (($r -like '*Visual Studio: *Microsoft Visual Studio*') -and ($r -like '*Unreal Engine: 5.5.4 at*'))
}
Check 'build fails: the window says where the report is' ($script:lastOutput -like '*send this to Claude.txt*')
Check 'build fails: nothing is packaged' ((Count $c 'RunUAT.bat*') -eq 0)
Check 'build fails: the last version that worked starts meanwhile' (Wait-Call $m 'SunsetCity.exe*')
Check 'build fails: the code is not noted as built' ((Get-Content -Raw (Join-Path $home1 'state.json') | ConvertFrom-Json).code -eq $codeBefore)

# 6. fixed: double-click again and it carries on
$env:FAKE_BUILD = ''
$m = Mark
$rc = Run-Bat $bat
$c = CallsSince $m
Check 'after the fix: builds and packages again, and finishes' ($rc -eq 0 -and (Count $c 'Build.bat*') -eq 1 -and (Count $c 'RunUAT.bat*') -eq 1) ("exit $rc; " + ($c -join ' | '))

# 7. an editor that does not run a script handed over with -ExecutePythonScript: the other way is tried
$env:FAKE_SETUP = 'ignore-first'
Add-Content -LiteralPath (Join-Path $src 'unreal\SunsetCity\Content\Python\sc_setup.py') -Value '# (test change 4)'
$m = Mark
$rc = Run-Bat $bat
$c = CallsSince $m
Check 'set-up script not run the first way: the commandlet way is tried and it carries on' ($rc -eq 0 -and (Count $c '*-ExecutePythonScript=*') -eq 1 -and (Count $c ('UnrealEditor-Cmd.exe ' + $project + ' -run=pythonscript -script=' + $runner + '*')) -eq 1) ("exit $rc; " + ($c -join ' | '))

# 8. the set-up script fails: a report with its error
$env:FAKE_SETUP = 'fail'
Add-Content -LiteralPath (Join-Path $src 'unreal\SunsetCity\Content\Python\sc_setup.py') -Value '# (test change 5)'
Clear-Report
$rc = Run-Bat $bat
Check 'set-up fails: not 0, and a report with the script''s error' ($rc -ne 0 -and (Test-Path $report) -and ((Get-Content -Raw $report) -like '*the map /Game/SunsetCity/Maps/Main was not made*')) "exit $rc"

# 9. packaging fails: a report, and the last version that worked starts
$env:FAKE_SETUP = ''
$env:FAKE_PACKAGE = 'fail'
Clear-Report
$m = Mark
$rc = Run-Bat $bat
Check 'packaging fails: not 0, and a report with the packager''s error' ($rc -ne 0 -and (Test-Path $report) -and ((Get-Content -Raw $report) -like '*ExitCode=25*')) "exit $rc"
Check 'packaging fails: the last version that worked starts meanwhile' (Wait-Call $m 'SunsetCity.exe*')

# 10. the iPad icon: packages (it failed last time) and then streams through Play_Streaming.bat
$env:FAKE_PACKAGE = ''
$m = Mark
$rc = Run-Bat (Join-Path $home1 'SunsetCity.bat') '-Stream'
$c = CallsSince $m
Check 'iPad: finishes' ($rc -eq 0) "exit $rc"
Check 'iPad: packages first, as it had not worked' ((Count $c 'RunUAT.bat*') -eq 1)
Check 'iPad: starts the signalling web server' (Wait-Call $m 'signalling server start.bat')
Check 'iPad: starts the game for Pixel Streaming (no window, the server''s address)' (Wait-Call $m 'SunsetCity.exe -AudioMixer -RenderOffScreen*-PixelStreamingURL=ws://127.0.0.1:8888*')
$gw = @(Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } | ForEach-Object { $_.IPv4Address } | ForEach-Object { $_.IPAddress })
Check 'iPad: shows first the address on the network the PC uses (the one with a router), to type on the iPad' ($gw.Count -gt 0 -and $script:lastOutput -match ('open this address:\s+http://' + [regex]::Escape($gw[0]) + '\s')) ('gateway address ' + ($gw -join ', '))

# 11. -Rebuild does every step again
$m = Mark
$rc = Run-Bat $bat '-Rebuild'
$c = CallsSince $m
Check '-Rebuild: every step again' ($rc -eq 0 -and (Count $c 'Build.bat*') -eq 1 -and (Count $c 'UnrealEditor-Cmd.exe*') -eq 1 -and (Count $c 'RunUAT.bat*') -eq 1) ("exit $rc; " + ($c -join ' | '))

# 12. no Unreal Engine on the PC: says so (and, when nobody is there to install it, stops with a report)
Move-Item -LiteralPath $dat -Destination ($dat + '.away')
$env:SC_HOME = Join-Path $work 'home-without-unreal'
Clear-Report
$rc = Run-Bat $bat
Check 'no Unreal Engine: not 0, and a report saying so' ($rc -ne 0 -and (Test-Path $report) -and ((Get-Content -Raw $report) -like '*getting Unreal Engine did not work*')) "exit $rc"
Move-Item -LiteralPath ($dat + '.away') -Destination $dat
$env:SC_HOME = $home1

# 13. Package_Windows.bat on its own (as the README describes), with UE_ROOT pointing at the engine
$env:UE_ROOT = $ue
$m = Mark
$rc = Run-Bat (Join-Path $repo 'unreal\Package_Windows.bat')
$c = CallsSince $m
Check 'Package_Windows.bat: packages into unreal\Packaged next to it' ($rc -eq 0 -and (Count $c ('RunUAT.bat BuildCookRun -project="' + (Join-Path $repo 'unreal\') + 'SunsetCity\SunsetCity.uproject" *-archivedirectory="' + (Join-Path $repo 'unreal\') + 'Packaged"*')) -eq 1 -and (Test-Path (Join-Path $repo 'unreal\Packaged\Windows\SunsetCity.exe'))) ("exit $rc; " + ($c -join ' | '))
$env:UE_ROOT = ''

# 14. for real from GitHub, as the person at the PC gets it: the .bat alone in Downloads, no folder given, this commit's files downloaded
$sha = $env:GITHUB_SHA
if ($sha) {
    $env:SC_HOME = ''
    $env:SC_SOURCE_DIR = ''
    $env:SC_REF = $sha
    $dl = Join-Path $work 'Downloads'
    New-Item -ItemType Directory -Force -Path $dl | Out-Null
    Copy-Item -LiteralPath $bat -Destination (Join-Path $dl 'SunsetCity.bat')
    $realHome = Join-Path $env:SystemDrive 'SunsetCity'
    $m = Mark
    $rc = Run-Bat (Join-Path $dl 'SunsetCity.bat')
    Check 'from GitHub: finishes' ($rc -eq 0) "exit $rc"
    Check 'from GitHub: everything goes in C:\SunsetCity' ((Test-Path (Join-Path $realHome 'game\unreal\SunsetCity\SunsetCity.uproject')) -and (Test-Path (Join-Path $realHome 'game\assets\cars\ferrari.glb')))
    Check 'from GitHub: the script it downloaded is this commit''s' (Test-SameText (Join-Path $realHome 'SunsetCity.ps1') $ps1)
    $st = Get-Content -Raw (Join-Path $realHome 'state.json') | ConvertFrom-Json
    Check 'from GitHub: the version is GitHub''s folder hashes' ($st.version -match '^unreal [0-9a-f]{40}, assets [0-9a-f]{40}$') $st.version
    Check 'from GitHub: built and started' (Wait-Call $m 'SunsetCity.exe*')
    $m = Mark
    $rc = Run-Bat (Join-Path $realHome 'SunsetCity.bat')
    $c = CallsSince $m
    Check 'from GitHub, again: up to date, so it only starts the game' ($rc -eq 0 -and $script:lastOutput -like '*files are up to date*' -and (Count $c 'Build.bat*') -eq 0 -and (Wait-Call $m 'SunsetCity.exe*')) ("exit $rc")
    # a newer SunsetCity.bat put beside the old one takes its place the next time it starts
    $new = (Get-Content -Raw -LiteralPath $bat) + "rem (a newer version)`r`n"
    Set-Content -LiteralPath (Join-Path $realHome 'SunsetCity.bat.new') -Value $new -Encoding ASCII -NoNewline
    $rc = Run-Bat (Join-Path $realHome 'SunsetCity.bat')
    Check 'a newer SunsetCity.bat replaces the old one, which then runs as usual' ($rc -eq 0 -and -not (Test-Path (Join-Path $realHome 'SunsetCity.bat.new')) -and ((Get-Content -Raw (Join-Path $realHome 'SunsetCity.bat')) -like '*(a newer version)*')) "exit $rc"
    $env:SC_REF = ''
} else { Write-Host 'skipped the download from GitHub (GITHUB_SHA is not set)' }

# 15. the downloads the script would make when something is missing exist
foreach ($u in @('https://aka.ms/vs/17/release/vs_buildtools.exe', 'https://launcher-public-service-prod06.ol.epicgames.com/launcher/api/installer/download/EpicGamesLauncherInstaller.msi')) {
    $code = & curl.exe -sSL -r 0-1023 -o NUL -w '%{http_code}' $u
    Check ('the download ' + $u + ' answers') ($code -eq '200' -or $code -eq '206') "HTTP $code"
}

Write-Host ''
if ($script:fails) { Write-Host ($script:fails.ToString() + ' CHECK(S) FAILED') -ForegroundColor Red; exit 1 }
Write-Host 'every check passed' -ForegroundColor Green
exit 0
