# Sunset City for Windows: the one-click script. Double-click unreal\SunsetCity.bat (it downloads the newest copy of this file and runs it).
#
# Every time it runs:
#   1. It fetches the newest version of the game's files from GitHub (only when something changed) into C:\SunsetCity\game.
#   2. If the game has already been built from exactly those files, it starts it straight away. That is the everyday case: one double-click.
#   3. Otherwise it does whatever is still missing, in order, carrying on from wherever it stopped last time:
#        Visual Studio Build Tools 2022 (the C++ compiler Unreal needs: it installs by itself after one Windows "Yes"),
#        Unreal Engine (it comes through the Epic Games Launcher and an Epic account: the launcher is installed and opened, the window
#        says what to click, and waits until it is there), building the game's code, setting up its map, materials and models in the
#        editor (with no window), packaging SunsetCity.exe, and a "Sunset City" icon (and "Sunset City on iPad") on the desktop.
#   4. If a step fails, what is needed to fix it goes into "Sunset City - send this to Claude.txt" on the desktop and onto the
#      clipboard, to paste into the chat. Double-clicking again after the fix carries on from that step.
#
# Options: -Stream (play in a browser, for example on the iPad, through Pixel Streaming), -Rebuild (do every step again).
# For testing: SC_HOME (where everything goes), SC_REF (a branch or commit instead of main), SC_SOURCE_DIR (a copy of the repository
# to use instead of downloading), SC_UNATTENDED=1 (never wait for a key or open a window, install nothing), SC_NO_MAIN=1 (only define
# the functions). Written for Windows PowerShell 5.1 (every Windows 10 and 11 has it) and kept to plain ASCII, which is how 5.1 reads it.
param(
    [switch]$Stream,
    [switch]$Rebuild,
    [string]$Launcher = ''
)

$ErrorActionPreference = 'Continue'      # (errors that matter are caught where they happen; a program writing to its error output must not stop the script)
$Repo = 'rauf-mushtaq/Racing'
$Ref = 'main'
if ($env:SC_REF) { $Ref = $env:SC_REF }
$Unattended = ($env:SC_UNATTENDED -eq '1')
$MapPath = '/Game/SunsetCity/Maps/Main'

# ------------------------------------------------------------------ talking to the person at the PC

function Say([string]$Text, [string]$Color = 'Gray') { Write-Host $Text -ForegroundColor $Color }

function Title([string]$Text) {
    Write-Host ''
    Write-Host ('== ' + $Text) -ForegroundColor Cyan
}

function Wait-Key([string]$Prompt = 'Press any key to carry on.') {
    if ($Unattended) { return }
    Write-Host $Prompt -ForegroundColor Yellow
    try { [void][Console]::ReadKey($true) } catch { [void](Read-Host) }
}

$script:StatusShown = $false
$script:LastStatusAt = [DateTime]::MinValue
function Show-Status([string]$Text) {
    # one line that keeps being rewritten while something long runs (a new line each minute when nobody is watching)
    if ($Unattended) {
        if (((Get-Date) - $script:LastStatusAt).TotalSeconds -ge 60 -and $Text) { Write-Host $Text; $script:LastStatusAt = Get-Date }
        return
    }
    $w = 79
    try { $w = [Math]::Max(20, [Console]::WindowWidth - 1) } catch { }
    if ($Text.Length -gt $w) { $Text = $Text.Substring(0, $w) }
    Write-Host ("`r" + $Text.PadRight($w)) -NoNewline
    $script:StatusShown = $true
}

function End-Status {
    if ($script:StatusShown) { Write-Host ''; $script:StatusShown = $false }
}

# ------------------------------------------------------------------ files, downloads, fingerprints

function Get-DefaultHome {
    # a short folder with no spaces (the editor is handed a script path, and long paths trouble Unreal): C:\SunsetCity, else the public folder
    foreach ($d in @((Join-Path $env:SystemDrive 'SunsetCity'), (Join-Path $env:PUBLIC 'SunsetCity'), (Join-Path $env:LOCALAPPDATA 'SunsetCity'))) {
        try {
            New-Item -ItemType Directory -Force -Path $d -ErrorAction Stop | Out-Null
            $t = Join-Path $d '.write-test'
            Set-Content -LiteralPath $t -Value 'x' -ErrorAction Stop
            Remove-Item -LiteralPath $t -Force -ErrorAction SilentlyContinue
            return $d
        } catch { }
    }
    throw 'Could not make a folder for Sunset City (tried C:\SunsetCity, the public folder and the local app data folder).'
}

function Get-StringHash([string]$Text) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $b = $sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Text)) } finally { $sha.Dispose() }
    return (($b | ForEach-Object { $_.ToString('x2') }) -join '')
}

function Get-TreeFiles([string]$Root) {
    # every file under $Root (a folder or a single file), leaving out what Unreal, Visual Studio or Python make by themselves
    if (-not $Root -or -not (Test-Path -LiteralPath $Root)) { return @() }
    $item = Get-Item -LiteralPath $Root -Force
    if (-not $item.PSIsContainer) { return @($item) }
    $base = $item.FullName
    $skip = '[\\/](Binaries|Intermediate|Saved|DerivedDataCache|Packaged|\.vs|__pycache__)([\\/]|$)'
    return @(Get-ChildItem -LiteralPath $base -Recurse -File -Force -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName.Substring($base.Length) -notmatch $skip -and $_.Extension -ne '.pyc' } |
        Sort-Object FullName)
}

function Get-Relative([string]$Base, [string]$Full) {
    return $Full.Substring($Base.Length).TrimStart('\', '/')
}

function Get-Fingerprint([string]$Base, [string[]]$Parts) {
    # one hash for some files and folders of a copy of the game: it changes when any file in them is added, removed or changed
    $Base = (Get-Item -LiteralPath $Base -Force).FullName
    $lines = New-Object Collections.Generic.List[string]
    foreach ($part in $Parts) {
        $files = @(Get-TreeFiles (Join-Path $Base $part))
        if ($files.Count -eq 0) { $lines.Add($part + ' (none)'); continue }
        foreach ($f in $files) {
            $rel = (Get-Relative $Base $f.FullName).Replace('\', '/')
            $lines.Add($rel + ' ' + (Get-FileHash -LiteralPath $f.FullName -Algorithm SHA256).Hash)
        }
    }
    return Get-StringHash ($lines -join "`n")
}

function Test-SameFile([string]$A, [string]$B) {
    if (-not (Test-Path -LiteralPath $A) -or -not (Test-Path -LiteralPath $B)) { return $false }
    if ((Get-Item -LiteralPath $A -Force).Length -ne (Get-Item -LiteralPath $B -Force).Length) { return $false }
    return ((Get-FileHash -LiteralPath $A -Algorithm SHA256).Hash -eq (Get-FileHash -LiteralPath $B -Algorithm SHA256).Hash)
}

function Copy-OneFile([string]$From, [string]$To) {
    $dir = Split-Path -Parent $To
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    Copy-Item -LiteralPath $From -Destination $To -Force -ErrorAction Stop
}

function Sync-Game([string]$NewRoot, [string]$OldRoot, [string]$Game) {
    # brings the game folder from the old version of the files to the new one: copies what is new or changed between the two versions and
    # deletes what the new one no longer has (a source file left behind would still be compiled). Files the editor changed itself, in a
    # place the new version did not change, are kept. Returns how many files it touched.
    $n = 0
    foreach ($part in @('unreal', 'assets')) {
        $newPart = Join-Path $NewRoot $part
        $oldPart = Join-Path $OldRoot $part
        $gamePart = Join-Path $Game $part
        if (-not (Test-Path -LiteralPath $newPart)) { continue }
        $newBase = (Get-Item -LiteralPath $newPart -Force).FullName
        $inNew = @{}
        foreach ($f in @(Get-TreeFiles $newBase)) {
            $rel = Get-Relative $newBase $f.FullName
            $inNew[$rel.ToLowerInvariant()] = $true
            $dest = Join-Path $gamePart $rel
            $old = Join-Path $oldPart $rel
            if ((Test-Path -LiteralPath $dest) -and (Test-SameFile $f.FullName $old)) { continue }
            Copy-OneFile $f.FullName $dest
            $n++
        }
        if (Test-Path -LiteralPath $oldPart) {
            $oldBase = (Get-Item -LiteralPath $oldPart -Force).FullName
            foreach ($f in @(Get-TreeFiles $oldBase)) {
                $rel = Get-Relative $oldBase $f.FullName
                if ($inNew.ContainsKey($rel.ToLowerInvariant())) { continue }
                $dest = Join-Path $gamePart $rel
                if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Force -ErrorAction SilentlyContinue; $n++ }
            }
        }
    }
    return $n
}

function Copy-Tree([string]$From, [string]$To) {
    if (-not (Test-Path -LiteralPath $From)) { return }
    $base = (Get-Item -LiteralPath $From -Force).FullName
    foreach ($f in @(Get-TreeFiles $base)) { Copy-OneFile $f.FullName (Join-Path $To (Get-Relative $base $f.FullName)) }
}

function Remove-Folder([string]$Path) {
    if (Test-Path -LiteralPath $Path) { Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue }
}

function Get-File([string]$Url, [string]$OutFile) {
    $part = $OutFile + '.part'
    if (Test-Path -LiteralPath $part) { Remove-Item -LiteralPath $part -Force }
    $dir = Split-Path -Parent $OutFile
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    $curl = Join-Path $env:SystemRoot 'System32\curl.exe'
    if (Test-Path -LiteralPath $curl) {
        & $curl -sSfL --retry 3 --retry-delay 3 --connect-timeout 30 -o $part $Url
        if ($LASTEXITCODE -ne 0) { throw ('could not download ' + $Url + ' (curl stopped with ' + $LASTEXITCODE + ')') }
    } else {
        $old = $ProgressPreference
        $ProgressPreference = 'SilentlyContinue'
        try { Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $part -ErrorAction Stop } finally { $ProgressPreference = $old }
    }
    Move-Item -LiteralPath $part -Destination $OutFile -Force
}

function Get-Json([string]$Url) {
    $old = $ProgressPreference
    $ProgressPreference = 'SilentlyContinue'
    try {
        return Invoke-RestMethod -UseBasicParsing -Uri $Url -TimeoutSec 30 -ErrorAction Stop -Headers @{ 'User-Agent' = 'SunsetCity-OneClick'; 'Accept' = 'application/vnd.github+json' }
    } finally { $ProgressPreference = $old }
}

function Expand-Zip([string]$Zip, [string]$To) {
    New-Item -ItemType Directory -Force -Path $To | Out-Null
    $tar = Join-Path $env:SystemRoot 'System32\tar.exe'
    if (Test-Path -LiteralPath $tar) {
        & $tar -xf $Zip -C $To
        if ($LASTEXITCODE -eq 0) { return }
        Say 'Windows'' tar could not unpack it; trying another way.' Yellow
    }
    Expand-Archive -LiteralPath $Zip -DestinationPath $To -Force -ErrorAction Stop
}

# ------------------------------------------------------------------ what has been done (state.json in the Sunset City folder)

function Read-State {
    $s = @{}
    $p = Join-Path $ScHome 'state.json'
    if (Test-Path -LiteralPath $p) {
        try {
            $o = Get-Content -Raw -LiteralPath $p -ErrorAction Stop | ConvertFrom-Json
            foreach ($prop in $o.PSObject.Properties) { $s[$prop.Name] = $prop.Value }
        } catch { Say '(The note of what was done last time could not be read: starting again from the top.)' Yellow }
    }
    return $s
}

function Save-State {
    $p = Join-Path $ScHome 'state.json'
    Set-Content -LiteralPath $p -Value ($State | ConvertTo-Json) -Encoding UTF8
}

# ------------------------------------------------------------------ the game's files

function Update-GameFiles {
    # makes $Source (an untouched copy of the repository's unreal and assets folders) and $GameDir (the copy Unreal builds and changes)
    # the newest version
    $haveCopy = (Test-Path -LiteralPath (Join-Path $Source 'unreal')) -and (Test-Path -LiteralPath (Join-Path $GameDir 'unreal'))
    $newRoot = $null
    $version = $null
    if ($env:SC_SOURCE_DIR) {
        $newRoot = (Get-Item -LiteralPath $env:SC_SOURCE_DIR -Force).FullName
        $version = 'local ' + (Get-Fingerprint $newRoot @('unreal', 'assets'))
    } else {
        try {
            $list = @(Get-Json ('https://api.github.com/repos/' + $Repo + '/contents?ref=' + $Ref) | ForEach-Object { $_ })     # (5.1 hands a JSON list over as one object: this unpacks it)
            $u = $list | Where-Object { $_.name -eq 'unreal' } | Select-Object -First 1
            $a = $list | Where-Object { $_.name -eq 'assets' } | Select-Object -First 1
            if ($u -and $a) { $version = 'unreal ' + $u.sha + ', assets ' + $a.sha }
        } catch { }
        if (-not $version) {
            if ($haveCopy) { Say 'Could not ask GitHub whether there is a new version (is the PC on the internet?): using the copy already here.' Yellow; return }
            $version = 'downloaded ' + (Get-Date -Format 'yyyy-MM-dd HH:mm')
        }
    }
    if ($haveCopy -and $State['version'] -eq $version) { Say 'The game''s files are up to date.'; return }

    $dl = Join-Path $ScHome 'download'
    if (-not $env:SC_SOURCE_DIR) {
        Title 'Downloading the newest version of the game (about 45 MB)'
        Remove-Folder $dl
        $zip = Join-Path $dl 'game.zip'
        Get-File ('https://codeload.github.com/' + $Repo + '/zip/' + $Ref) $zip
        $x = Join-Path $dl 'unpacked'
        Expand-Zip $zip $x
        $top = Get-ChildItem -LiteralPath $x -Directory | Select-Object -First 1
        if (-not $top -or -not (Test-Path -LiteralPath (Join-Path $top.FullName 'unreal\SunsetCity\SunsetCity.uproject'))) {
            throw 'The download does not look like the game (there is no unreal\SunsetCity\SunsetCity.uproject in it).'
        }
        $newRoot = $top.FullName
    }
    $n = Sync-Game $newRoot $Source $GameDir
    $next = Join-Path $ScHome 'source.new'
    Remove-Folder $next
    foreach ($part in @('unreal', 'assets')) { Copy-Tree (Join-Path $newRoot $part) (Join-Path $next $part) }
    Remove-Folder $Source
    Rename-Item -LiteralPath $next -NewName (Split-Path -Leaf $Source) -ErrorAction Stop
    if (-not $env:SC_SOURCE_DIR) { Remove-Folder $dl }
    $State['version'] = $version
    Save-State
    Say ('Game files: ' + $n + ' new or changed.') Green
    # a newer SunsetCity.bat (the file behind the desktop icon) takes its own place the next time it starts
    $newBat = Join-Path $Source 'unreal\SunsetCity.bat'
    $myBat = Join-Path $ScHome 'SunsetCity.bat'
    if ((Test-Path -LiteralPath $newBat) -and (Test-Path -LiteralPath $myBat) -and -not (Test-SameFile $newBat $myBat)) {
        Copy-Item -LiteralPath $newBat -Destination ($myBat + '.new') -Force -ErrorAction SilentlyContinue
    }
}

# ------------------------------------------------------------------ Visual Studio and Unreal Engine

function Find-VCTools {
    # a Visual Studio 2022 (any edition, or the Build Tools) with the C++ compiler for 64-bit Windows
    $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
    if (-not (Test-Path -LiteralPath $vswhere)) { return $null }
    $paths = & $vswhere -products '*' -version '[17.0,18.0)' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    foreach ($p in @($paths)) {
        if (-not $p) { continue }
        $cl = @(Get-ChildItem -Path (Join-Path $p 'VC\Tools\MSVC\*\bin\Hostx64\x64\cl.exe') -ErrorAction SilentlyContinue)
        if ($cl.Count -gt 0) {
            $sets = ($cl | ForEach-Object { $_.Directory.Parent.Parent.Parent.Name }) -join ', '
            return [pscustomobject]@{ Path = $p; Toolsets = $sets }
        }
    }
    return $null
}

function Test-WindowsSdk {
    $kits = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\Include'
    return (@(Get-ChildItem -Path (Join-Path $kits '10.*\um\Windows.h') -ErrorAction SilentlyContinue).Count -gt 0)
}

function Start-Elevated([string]$Exe, [string]$Arguments) {
    # runs something that needs an administrator (Windows asks "Do you want to allow this app to make changes"); returns its exit code
    try { $p = Start-Process -FilePath $Exe -ArgumentList $Arguments -Verb RunAs -PassThru -ErrorAction Stop }
    catch { throw ('Windows did not let it start (was "No" pressed when it asked?): ' + $_.Exception.Message) }
    $null = $p.Handle
    $p.WaitForExit()
    return $p.ExitCode
}

function Install-BuildTools {
    Title 'Installing Visual Studio Build Tools 2022 (the C++ compiler Unreal needs, about 6 GB)'
    Say 'Windows will ask "Do you want to allow this app to make changes to your device?": press Yes.'
    Say 'A Visual Studio Installer window then shows how far it has got. It closes by itself; this window carries on after it.'
    $exe = Join-Path $ScHome 'download\vs_buildtools.exe'
    Get-File 'https://aka.ms/vs/17/release/vs_buildtools.exe' $exe
    $base = '--passive --wait --norestart --nocache --add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.VC.Tools.x86.x64 --includeRecommended'
    # Unreal 5.5 prefers the 14.38 compiler and a Windows 11 SDK; if the installer no longer offers those exact parts, the plain set is enough
    $full = $base + ' --add Microsoft.VisualStudio.Component.VC.14.38.17.8.x86.x64 --add Microsoft.VisualStudio.Component.Windows11SDK.22621'
    $code = -1
    foreach ($a in @($full, $base)) {
        $code = Start-Elevated $exe $a
        if ($code -eq 0 -or $code -eq 3010) {
            if ($code -eq 3010) { Say 'Windows would like a restart at some point; that can wait until you have finished.' Yellow }
            return
        }
        Say ('The Visual Studio installer stopped with code ' + $code + '.') Yellow
    }
    throw ('Visual Studio Build Tools did not install (the installer stopped with code ' + $code + '). Its own logs are the dd_*.log files in ' + $env:TEMP + '.')
}

function Get-EngineVersion([string]$Root) {
    try {
        $v = Get-Content -Raw -LiteralPath (Join-Path $Root 'Engine\Build\Build.version') -ErrorAction Stop | ConvertFrom-Json
        return [version]('{0}.{1}.{2}' -f $v.MajorVersion, $v.MinorVersion, $v.PatchVersion)
    } catch { return $null }
}

function Find-Engines {
    # every finished Unreal Engine 5.4 or later on this PC, the closest to 5.5 (what the game was written for) first. Only installs the Epic
    # Games Launcher has finished (or that are registered, or named by UE_ROOT) count, so one still downloading is not picked up half-done.
    $roots = New-Object Collections.Generic.List[string]
    if ($env:UE_ROOT) { $roots.Add($env:UE_ROOT) }
    $dat = Join-Path $env:ProgramData 'Epic\UnrealEngineLauncher\LauncherInstalled.dat'
    if (Test-Path -LiteralPath $dat) {
        try {
            foreach ($i in @((Get-Content -Raw -LiteralPath $dat -ErrorAction Stop | ConvertFrom-Json).InstallationList)) {
                if ($i.AppName -like 'UE_*' -and $i.InstallLocation) { $roots.Add([string]$i.InstallLocation) }
            }
        } catch { }
    }
    $key = 'HKLM:\SOFTWARE\EpicGames\Unreal Engine'
    if (Test-Path $key) {
        foreach ($k in @(Get-ChildItem $key -ErrorAction SilentlyContinue)) {
            $d = (Get-ItemProperty -LiteralPath $k.PSPath -ErrorAction SilentlyContinue).InstalledDirectory
            if ($d) { $roots.Add([string]$d) }
        }
    }
    $builds = 'HKCU:\SOFTWARE\Epic Games\Unreal Engine\Builds'
    if (Test-Path $builds) {
        foreach ($prop in @((Get-ItemProperty $builds -ErrorAction SilentlyContinue).PSObject.Properties)) {
            if ($prop.Name -notlike 'PS*' -and $prop.Value -is [string]) { $roots.Add($prop.Value) }
        }
    }
    $found = @()
    $seen = @{}
    foreach ($r in $roots) {
        $r = $r.TrimEnd('\', '/')
        if ($seen.ContainsKey($r.ToLowerInvariant())) { continue }
        $seen[$r.ToLowerInvariant()] = $true
        if (-not (Test-Path -LiteralPath (Join-Path $r 'Engine\Binaries\Win64\UnrealEditor-Cmd.exe'))) { continue }
        if (-not (Test-Path -LiteralPath (Join-Path $r 'Engine\Build\BatchFiles\Build.bat'))) { continue }
        $v = Get-EngineVersion $r
        if (-not $v -or $v.Major -ne 5 -or $v.Minor -lt 4) { continue }
        $found += [pscustomobject]@{ Root = $r; Version = $v }
    }
    return @($found | Sort-Object @{ Expression = { [Math]::Abs($_.Version.Minor - 5) } }, @{ Expression = { $_.Version }; Descending = $true })
}

function Find-EpicLauncher {
    foreach ($p in @(
            (Join-Path ${env:ProgramFiles(x86)} 'Epic Games\Launcher\Portal\Binaries\Win64\EpicGamesLauncher.exe'),
            (Join-Path ${env:ProgramFiles(x86)} 'Epic Games\Launcher\Portal\Binaries\Win32\EpicGamesLauncher.exe'),
            (Join-Path $env:ProgramFiles 'Epic Games\Launcher\Portal\Binaries\Win64\EpicGamesLauncher.exe'))) {
        if (Test-Path -LiteralPath $p) { return $p }
    }
    return $null
}

function Get-Engine {
    $e = @(Find-Engines)
    if ($e.Count -gt 0) { return $e[0] }
    Title 'Unreal Engine 5.5 is needed'
    if ($Unattended) { throw 'Unreal Engine is not installed (and this run is not allowed to wait for it).' }
    $launcher = Find-EpicLauncher
    if (-not $launcher) {
        Say 'Installing the Epic Games Launcher (Unreal Engine comes through it). Press Yes when Windows asks.'
        try {
            $msi = Join-Path $ScHome 'download\EpicInstaller.msi'
            Get-File 'https://launcher-public-service-prod06.ol.epicgames.com/launcher/api/installer/download/EpicGamesLauncherInstaller.msi' $msi
            $code = Start-Elevated 'msiexec.exe' ('/i "' + $msi + '" /passive /norestart')
            if ($code -ne 0 -and $code -ne 3010) { throw ('the installer stopped with code ' + $code) }
        } catch {
            Say ('It could not be installed by itself (' + $_.Exception.Message + ').') Yellow
            Say 'Opening the Epic Games download page instead: download the launcher there, run it, and this window carries on when it is in.' Yellow
            Start-Process 'https://store.epicgames.com/download'
        }
        while (-not (Find-EpicLauncher)) { Show-Status '  Waiting for the Epic Games Launcher to be installed ...'; Start-Sleep -Seconds 10 }
        End-Status
        $launcher = Find-EpicLauncher
    }
    Start-Process -FilePath $launcher
    Write-Host ''
    Say 'In the Epic Games Launcher that is opening:' White
    Say '  1. Sign in (or make a free Epic Games account).' White
    Say '  2. Click "Unreal Engine" on the left, then "Library" at the top.' White
    Say '  3. Click the + next to "ENGINE VERSIONS". On the new box, use its little arrow to choose 5.5, then click "Install".' White
    Say '     It is big (about 50 GB) and can take an hour or more. You can leave the PC alone.' White
    Say 'This window watches for it and carries on by itself as soon as it is installed.' Green
    Say '(Closing this window is fine too: double-click Sunset City again once Unreal is installed.)'
    $t0 = Get-Date
    while ($true) {
        Start-Sleep -Seconds 20
        $e = @(Find-Engines)
        if ($e.Count -gt 0) { End-Status; Say ('Unreal Engine ' + $e[0].Version + ' is installed.') Green; return $e[0] }
        Show-Status ('  Waiting for Unreal Engine to be installed ... ' + [int]((Get-Date) - $t0).TotalMinutes + ' min')
    }
}

# ------------------------------------------------------------------ running the long steps

function Read-NewText([string]$Path, [ref]$Pos) {
    if (-not (Test-Path -LiteralPath $Path)) { return '' }
    try {
        $fs = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]'ReadWrite, Delete')
        try {
            if ($fs.Length -lt $Pos.Value) { $Pos.Value = 0 }
            if ($fs.Length - $Pos.Value -gt 65536) { $Pos.Value = $fs.Length - 65536 }
            $n = [int]($fs.Length - $Pos.Value)
            if ($n -le 0) { return '' }
            $buf = New-Object byte[] $n
            [void]$fs.Seek($Pos.Value, [IO.SeekOrigin]::Begin)
            $got = $fs.Read($buf, 0, $n)
            $Pos.Value += $got
            return [Text.Encoding]::UTF8.GetString($buf, 0, $got)
        } finally { $fs.Dispose() }
    } catch { return '' }
}

function Invoke-Logged([string]$CommandLine, [string]$Log, [double]$Hours) {
    # runs a command line through cmd.exe with everything it prints going into $Log (and its newest line shown here while it runs), so that
    # nothing it leaves running in the background can hold this script up; returns its exit code (-1 if it ran out of time and was stopped)
    if (Test-Path -LiteralPath $Log) { Remove-Item -LiteralPath $Log -Force -ErrorAction SilentlyContinue }
    $line = '/d /s /c "' + $CommandLine + ' > "' + $Log + '" 2>&1"'
    $p = Start-Process -FilePath $env:ComSpec -ArgumentList $line -NoNewWindow -PassThru
    $null = $p.Handle
    $t0 = Get-Date
    $pos = 0L
    $last = 'starting'
    while (-not $p.WaitForExit(2000)) {
        $new = Read-NewText $Log ([ref]$pos)
        if ($new) {
            $l = @($new -split "`r?`n" | Where-Object { $_.Trim() }) | Select-Object -Last 1
            if ($l) { $last = $l.Trim() }
        }
        Show-Status ('  [' + [int]((Get-Date) - $t0).TotalMinutes + ' min] ' + $last)
        if (((Get-Date) - $t0).TotalHours -gt $Hours) {
            & $env:ComSpec /d /c ('taskkill /PID ' + $p.Id + ' /T /F >nul 2>&1')
            End-Status
            Add-Content -LiteralPath $Log -Value ('(Stopped by the Sunset City script after ' + $Hours + ' hours with no end.)') -ErrorAction SilentlyContinue
            return -1
        }
    }
    $p.WaitForExit()
    End-Status
    return [int]$p.ExitCode
}

function Stop-OurProcesses {
    # the editor with this project open would stop the build (Live Coding), and a running SunsetCity.exe would stop the packaging
    $procs = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
            ($_.Name -like 'UnrealEditor*' -and $_.CommandLine -and $_.CommandLine.IndexOf($Project, [StringComparison]::OrdinalIgnoreCase) -ge 0) -or
            ($_.Name -like 'SunsetCity*' -and $_.ExecutablePath -and $_.ExecutablePath.StartsWith($PackagedDir, [StringComparison]::OrdinalIgnoreCase)) })
    foreach ($p in $procs) {
        Say ('Closing ' + $p.Name + ' (it has this copy of Sunset City open, which would get in the way).') Yellow
        Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

function Step-Build($Engine) {
    Title 'Building the game''s code (a few minutes; the first time, longer)'
    $bat = Join-Path $Engine.Root 'Engine\Build\BatchFiles\Build.bat'
    $cmd = '"' + $bat + '" SunsetCityEditor Win64 Development -Project="' + $Project + '" -WaitMutex -FromMsBuild'
    return Invoke-Logged $cmd (Join-Path $Logs 'build.log') 3
}

function Step-Setup($Engine) {
    # opens the editor with no window to run Content\Python\sc_oneclick_setup.py (the map, the materials, the models); returns $null when it
    # worked, or what went wrong. Two ways of handing the editor a script are tried, in case one of them does not run it.
    Title 'Setting up the map, the materials and the models in the Unreal editor (no window; the first time, shaders take a long while)'
    $editor = Join-Path $Engine.Root 'Engine\Binaries\Win64\UnrealEditor-Cmd.exe'
    $runner = Join-Path $UProjectDir 'Content\Python\sc_oneclick_setup.py'
    $result = Join-Path $Logs 'setup_result.txt'
    $env:SC_SETUP_RESULT = $result
    $ways = @(('-ExecutePythonScript="' + $runner + '"'), ('-run=pythonscript -script="' + $runner + '"'))
    for ($i = 0; $i -lt $ways.Count; $i++) {
        if (Test-Path -LiteralPath $result) { Remove-Item -LiteralPath $result -Force }
        $cmd = '"' + $editor + '" "' + $Project + '" ' + $ways[$i] + ' -unattended -nopause -nosplash -stdout -FullStdOutLogOutput'
        $code = Invoke-Logged $cmd (Join-Path $Logs ('setup' + ($i + 1) + '.log')) 4
        if (Test-Path -LiteralPath $result) {
            $r = (Get-Content -Raw -LiteralPath $result).Trim()
            if ($r -match '^OK') { Say ('Set up: ' + (($r -split "`r?`n") -join '; ')) Green; return $null }
            return $r
        }
        Say ('The editor finished (code ' + $code + ') without running the set-up script.') Yellow
    }
    return 'The editor never ran the set-up script (it was handed it in two different ways and wrote no result either time).'
}

function Step-Package($Engine) {
    Title 'Packaging SunsetCity.exe (cooking the content; the first time, this is the long one)'
    $uat = Join-Path $Engine.Root 'Engine\Build\BatchFiles\RunUAT.bat'
    $cmd = '"' + $uat + '" BuildCookRun -project="' + $Project + '" -noP4 -platform=Win64 -clientconfig=Development -build -cook -map=' + $MapPath +
        ' -stage -pak -archive -archivedirectory="' + $PackagedRoot + '" -utf8output'
    return Invoke-Logged $cmd (Join-Path $Logs 'package.log') 6
}

# ------------------------------------------------------------------ when something goes wrong

function Get-Desktop {
    $d = [Environment]::GetFolderPath('Desktop')
    if (-not $d) { $d = Join-Path $env:USERPROFILE 'Desktop' }
    if (-not (Test-Path -LiteralPath $d)) { New-Item -ItemType Directory -Force -Path $d | Out-Null }
    return $d
}

function Get-ErrorLines([string[]]$Lines) {
    $want = '(?i)(\berror\b|\bfatal\b|exception|traceback|\bfailed\b|unable to |could not |cannot open|unresolved external|ExitCode=[1-9]|\[SunsetCity\])'
    $noise = '(?i)(\b0 error|\berrors?: 0\b|warnaserror|errorlevel|\bno errors\b)'
    $seen = @{}
    $out = New-Object Collections.Generic.List[string]
    foreach ($l in $Lines) {
        if ($l -notmatch $want -or $l -match $noise) { continue }
        $t = $l.Trim()
        if ($t.Length -gt 400) { $t = $t.Substring(0, 400) + ' ...' }
        if ($seen.ContainsKey($t)) { continue }
        $seen[$t] = $true
        $out.Add($t)
        if ($out.Count -ge 150) { break }
    }
    return $out.ToArray()
}

function Get-PcSummary {
    $L = New-Object Collections.Generic.List[string]
    try { $os = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop; $L.Add('Windows: ' + $os.Caption + ' ' + $os.Version + ', ' + [Math]::Round($os.TotalVisibleMemorySize / 1MB) + ' GB of memory') } catch { $L.Add('Windows: ' + [Environment]::OSVersion.VersionString) }
    try { $L.Add('Graphics: ' + ((@(Get-CimInstance Win32_VideoController -ErrorAction Stop) | ForEach-Object { $_.Name + ' (driver ' + $_.DriverVersion + ')' }) -join '; ')) } catch { }
    try { $drive = New-Object IO.DriveInfo ($ScHome.Substring(0, 1)); $L.Add('Free space on ' + $drive.Name + ': ' + [Math]::Round($drive.AvailableFreeSpace / 1GB) + ' GB') } catch { }
    $vs = Find-VCTools
    if ($vs) { $L.Add('Visual Studio: ' + $vs.Path + ' (C++ compilers ' + $vs.Toolsets + '); Windows SDK: ' + (Test-WindowsSdk)) } else { $L.Add('Visual Studio 2022 with C++: not found') }
    $e = @(Find-Engines)
    if ($e.Count -gt 0) { $L.Add('Unreal Engine: ' + (($e | ForEach-Object { [string]$_.Version + ' at ' + $_.Root }) -join '; ')) } else { $L.Add('Unreal Engine: none found') }
    return $L.ToArray()
}

function Write-Report([string]$Step, [string]$Detail, [string[]]$LogFiles) {
    $L = New-Object Collections.Generic.List[string]
    $L.Add('Sunset City (the Unreal version, one-click Windows script): ' + $Step + ' did not work.')
    $L.Add('Paste all of this into the chat with Claude.')
    $L.Add('')
    $L.Add('When: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm'))
    $L.Add('Game files: ' + $State['version'])
    $L.Add('Script: ' + $ScriptId)
    foreach ($s in @(Get-PcSummary)) { $L.Add($s) }
    if ($Detail) { $L.Add(''); $L.Add('--- What happened ---'); $L.Add($Detail) }
    foreach ($log in @($LogFiles)) {
        if (-not $log -or -not (Test-Path -LiteralPath $log)) { continue }
        $lines = @()
        try { $lines = [IO.File]::ReadAllLines($log) } catch { }
        $leaf = Split-Path -Leaf $log
        $errs = @(Get-ErrorLines $lines)
        $L.Add('')
        $L.Add('--- Lines about errors in ' + $leaf + ' (' + $errs.Count + ') ---')
        foreach ($e in $errs) { $L.Add($e) }
        $L.Add('')
        $L.Add('--- The last 60 lines of ' + $leaf + ' ---')
        foreach ($e in @($lines | Select-Object -Last 60)) { $L.Add($e) }
    }
    $L.Add('')
    $L.Add('(The whole logs are in ' + $Logs + '.)')
    $text = $L -join "`r`n"
    if ($text.Length -gt 60000) { $text = $text.Substring(0, 60000) + "`r`n... (cut short here; the whole logs are in " + $Logs + ')' }
    $file = $null
    try { $file = Join-Path (Get-Desktop) 'Sunset City - send this to Claude.txt'; Set-Content -LiteralPath $file -Value $text -Encoding UTF8 -ErrorAction Stop }
    catch { $file = Join-Path $Logs 'Sunset City - send this to Claude.txt'; Set-Content -LiteralPath $file -Value $text -Encoding UTF8 }
    $copied = $false
    try { Set-Clipboard -Value $text -ErrorAction Stop; $copied = $true } catch { }
    return [pscustomobject]@{ File = $file; Copied = $copied }
}

function Report-Failure([string]$Step, [string]$Detail, [string[]]$LogFiles) {
    End-Status
    $r = Write-Report $Step $Detail $LogFiles
    Write-Host ''
    Say ('This step did not work: ' + $Step + '.') Red
    if ($Detail -and $Detail.Length -lt 300) { Say $Detail Red }
    Say 'Everything needed to fix it is in this file on your desktop:' White
    Say ('    ' + $r.File) White
    if ($r.Copied) { Say 'It is also copied already: paste it (Ctrl+V) into the chat with Claude.' White }
    else { Say 'Open it, select everything (Ctrl+A), copy it and paste it into the chat with Claude.' White }
    Say 'When Claude says it is fixed, double-click Sunset City again: it fetches the fix and carries on from this step.' Green
    if (-not $Unattended) { Start-Process -FilePath 'notepad.exe' -ArgumentList ('"' + $r.File + '"') }
}

# ------------------------------------------------------------------ playing

function Start-PackagedGame([string]$Why) {
    if (@(Get-Process -Name 'SunsetCity' -ErrorAction SilentlyContinue).Count -gt 0) { Say 'Sunset City is already running.' Green; return }
    Title $Why
    Start-Process -FilePath $Exe -WorkingDirectory (Split-Path -Parent $Exe)
}

function Start-EditorGame($Engine) {
    Title 'Meanwhile, starting the game straight from the editor''s files (slower to start, the same game)'
    $editor = Join-Path $Engine.Root 'Engine\Binaries\Win64\UnrealEditor.exe'
    Start-Process -FilePath $editor -ArgumentList ('"' + $Project + '" -game')
}

function Start-Streaming($Engine) {
    # Play_Streaming.bat does the work (the signalling server, the game with no window, the addresses to type on the iPad); this makes sure
    # Unreal's Pixel Streaming web server is there and can be written to, which it needs on its first start
    $ws = Join-Path $Engine.Root 'Engine\Plugins\Media\PixelStreaming\Resources\WebServers'
    if (Test-Path -LiteralPath $ws) {
        $probe = Join-Path $ws '.sunsetcity-write-test'
        $writable = $true
        try { Set-Content -LiteralPath $probe -Value 'x' -ErrorAction Stop; Remove-Item -LiteralPath $probe -Force } catch { $writable = $false }
        if (-not $writable -and -not $Unattended) {
            Title 'Letting Unreal''s streaming web server set itself up (once)'
            Say 'It lives in Unreal''s folder, which only an administrator may change: press Yes when Windows asks.'
            [void](Start-Elevated "$env:SystemRoot\System32\icacls.exe" ('"' + $ws + '" /grant *S-1-5-32-545:(OI)(CI)M /T /Q'))
        }
        $sig = Join-Path $ws 'SignallingWebServer\platform_scripts\cmd'
        $get = Join-Path $ws 'get_ps_servers.bat'
        if (-not (Test-Path -LiteralPath $sig) -and (Test-Path -LiteralPath $get)) {
            Title 'Fetching Unreal''s Pixel Streaming web server (once)'
            & $env:ComSpec /d /c ('"' + $get + '"') | Out-Host
        }
    }
    $env:UE_ROOT = $Engine.Root
    & $env:ComSpec /d /c ('"' + (Join-Path $GameDir 'unreal\Play_Streaming.bat') + '"') | Out-Host     # (shown, not returned: it prints the addresses to type)
}

function New-Shortcut([string]$Path, [string]$Arguments, [string]$Description) {
    $shell = New-Object -ComObject WScript.Shell
    $s = $shell.CreateShortcut($Path)
    $s.TargetPath = $LauncherBat
    $s.Arguments = $Arguments
    $s.WorkingDirectory = $ScHome
    if (Test-Path -LiteralPath $Exe) { $s.IconLocation = $Exe + ',0' }
    $s.Description = $Description
    $s.Save()
}

function Add-Shortcuts {
    if (-not (Test-Path -LiteralPath $LauncherBat)) { return }
    try {
        foreach ($dir in @((Get-Desktop), [Environment]::GetFolderPath('Programs'))) {
            if (-not $dir) { continue }
            New-Shortcut (Join-Path $dir 'Sunset City.lnk') '' 'Play Sunset City (the Unreal Engine version) on this PC'
            New-Shortcut (Join-Path $dir 'Sunset City on iPad.lnk') '-Stream' 'Play Sunset City on an iPad or in a browser, streamed from this PC'
        }
        Say 'Made the "Sunset City" and "Sunset City on iPad" icons on the desktop (and in the Start menu).' Green
    } catch { Say ('(Could not make the desktop icons: ' + $_.Exception.Message + ')') Yellow }
}

# ------------------------------------------------------------------ the whole thing

function Invoke-Main {
    Write-Host ''
    Write-Host '  SUNSET CITY  -  Unreal Engine 5 version' -ForegroundColor Yellow
    Write-Host ''

    $script:Mutex = New-Object Threading.Mutex($false, 'Local\SunsetCityOneClick')
    $got = $false
    try { $got = $script:Mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $got = $true }
    if (-not $got) { Say 'Sunset City is already being set up in another window: look for that one.' Yellow; return 1 }

    try {
        # keep the PC from going to sleep while this window is open (the first build takes a while)
        Add-Type -Namespace SunsetCity -Name Power -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint flags);' -ErrorAction Stop
        [void][SunsetCity.Power]::SetThreadExecutionState([uint32]2147483649)     # ES_CONTINUOUS | ES_SYSTEM_REQUIRED
    } catch { }

    foreach ($d in @($ScHome, $Logs)) { if (-not (Test-Path -LiteralPath $d)) { New-Item -ItemType Directory -Force -Path $d | Out-Null } }
    $script:State = Read-State
    if ($Rebuild) { foreach ($k in @('code', 'setup', 'package')) { $State.Remove($k) } }

    try { Update-GameFiles }
    catch { Report-Failure 'getting the game''s files' $_.Exception.Message @(); return 1 }

    $fpCode = Get-Fingerprint $Source @('unreal\SunsetCity\Source', 'unreal\SunsetCity\SunsetCity.uproject', 'unreal\SunsetCity\Config')
    $fpSetup = Get-Fingerprint $Source @('unreal\SunsetCity\Content\Python', 'assets')
    $fpPackage = Get-StringHash ($fpCode + ' ' + $fpSetup)

    if ($State['package'] -eq $fpPackage -and (Test-Path -LiteralPath $Exe)) {
        Say 'Sunset City is built and up to date.' Green
        return (Start-Play $null)
    }

    # something has to be done: first see what is missing, and say so the first time
    $vs = Find-VCTools
    $sdk = Test-WindowsSdk
    $engines = @(Find-Engines)
    if (-not $State['everPackaged']) {
        Title 'Getting Sunset City ready on this PC. This happens once; after it, the desktop icon starts the game straight away.'
        if (-not $vs -or -not $sdk) { Say '  - Visual Studio Build Tools 2022 (Microsoft''s free C++ compiler, about 6 GB) installs by itself: press Yes when Windows asks.' White }
        if ($engines.Count -eq 0) { Say '  - Unreal Engine 5.5 (free, about 50 GB) comes through the Epic Games Launcher: you sign in and press Install (this window says where).' White }
        Say '  - Then the game is built, set up and packaged by itself. The PC will be busy for an hour or two (mostly compiling shaders).' White
        Say '  - It needs about 30 GB of free space here, as well as the space for Unreal Engine.' White
        Say '  If something goes wrong, the window says so and puts what to send Claude on the desktop.' White
        if (-not $Unattended) {
            for ($i = 15; $i -gt 0; $i--) { Show-Status ('  Starting in ' + $i + ' seconds. (Close this window to stop.)'); Start-Sleep -Seconds 1 }
            End-Status
        }
    }
    try {
        $drive = New-Object IO.DriveInfo ($ScHome.Substring(0, 1))
        $gb = [Math]::Round($drive.AvailableFreeSpace / 1GB)
        if ($gb -lt 30) {
            Say ('Only ' + $gb + ' GB is free on ' + $drive.Name + ', and building the game takes about 30 GB. It may run out part of the way through.') Yellow
            Wait-Key 'Free some space and press a key to carry on (or close this window).'
        }
    } catch { }

    if (-not $vs -or -not $sdk) {
        if ($Unattended -and $env:SC_ALLOW_INSTALL -ne '1') { Report-Failure 'finding Visual Studio' 'Visual Studio 2022 with the C++ compiler and a Windows SDK is not installed (and this run is not allowed to install it).' @(); return 1 }
        try { Install-BuildTools } catch { Report-Failure 'installing Visual Studio Build Tools' $_.Exception.Message @(); return 1 }
        $vs = Find-VCTools
        if (-not $vs -or -not (Test-WindowsSdk)) { Report-Failure 'installing Visual Studio Build Tools' 'The installer finished, but the C++ compiler or the Windows SDK is still not there.' @(); return 1 }
    }
    Say ('C++ compiler: Visual Studio at ' + $vs.Path + ' (' + $vs.Toolsets + ')')

    try { $engine = Get-Engine } catch { Report-Failure 'getting Unreal Engine' $_.Exception.Message @(); return 1 }
    Say ('Unreal Engine ' + $engine.Version + ' at ' + $engine.Root)
    if ($engine.Version.Minor -ne 5) { Say ('(The game was written for 5.5; ' + $engine.Version + ' should be close enough, but if the build fails that may be why.)') Yellow }
    $engineId = $engine.Root + ' ' + $engine.Version
    if ($State['engine'] -ne $engineId) {
        foreach ($k in @('code', 'setup', 'package')) { $State.Remove($k) }
        $State['engine'] = $engineId
        Save-State
    }
    $haveOld = (Test-Path -LiteralPath $Exe) -and [bool]$State['everPackaged']

    Stop-OurProcesses
    if ($State['code'] -ne $fpCode) {
        $code = Step-Build $engine
        if ($code -ne 0) {
            Report-Failure 'building the game''s code' ('Build.bat stopped with code ' + $code + '.') @((Join-Path $Logs 'build.log'))
            if ($haveOld) { Start-PackagedGame 'Meanwhile, starting the last version that worked' }
            return 1
        }
        $State['code'] = $fpCode
        Save-State
        Say 'The code is built.' Green
    }
    if ($State['setup'] -ne $fpSetup) {
        $problem = Step-Setup $engine
        if ($problem) {
            Report-Failure 'setting up the map, materials and models' $problem @((Join-Path $Logs 'setup1.log'), (Join-Path $Logs 'setup2.log'))
            if ($haveOld) { Start-PackagedGame 'Meanwhile, starting the last version that worked' }
            return 1
        }
        $State['setup'] = $fpSetup
        Save-State
    }
    $code = Step-Package $engine
    if ($code -ne 0 -or -not (Test-Path -LiteralPath $Exe)) {
        $why = 'RunUAT BuildCookRun stopped with code ' + $code + '.'
        if ($code -eq 0) { $why = 'RunUAT said it worked, but there is no ' + $Exe + '.' }
        Report-Failure 'packaging SunsetCity.exe' $why @((Join-Path $Logs 'package.log'))
        if ($haveOld) { Start-PackagedGame 'Meanwhile, starting the last version that worked' } else { Start-EditorGame $engine }
        return 1
    }
    $State['package'] = $fpPackage
    $State['everPackaged'] = $true
    Save-State
    Say 'SunsetCity.exe is made.' Green
    Add-Shortcuts
    return (Start-Play $engine)
}

function Start-Play($Engine) {
    if ($Stream) {
        if (-not $Engine) { $e = @(Find-Engines); if ($e.Count -gt 0) { $Engine = $e[0] } }
        if (-not $Engine) { Report-Failure 'playing on the iPad' 'Streaming needs Unreal Engine on this PC (its web server comes with it), and none was found.' @(); return 1 }
        Start-Streaming $Engine
        return 0
    }
    Start-PackagedGame 'Starting Sunset City. Have fun! (This window closes by itself.)'
    if (-not $Unattended) { Start-Sleep -Seconds 4 }
    return 0
}

# ------------------------------------------------------------------ where things are

if ($env:SC_HOME) { $ScHome = $env:SC_HOME } elseif ($env:SC_NO_MAIN -eq '1') { $ScHome = '' } else { $ScHome = Get-DefaultHome }
$Source = Join-Path $ScHome 'source'                    # the repository's unreal and assets folders exactly as downloaded
$GameDir = Join-Path $ScHome 'game'                     # the copy that is built (Unreal adds its own folders to it)
$UProjectDir = Join-Path $GameDir 'unreal\SunsetCity'
$Project = Join-Path $UProjectDir 'SunsetCity.uproject'
$PackagedRoot = Join-Path $GameDir 'unreal\Packaged'
$PackagedDir = Join-Path $PackagedRoot 'Windows'
$Exe = Join-Path $PackagedDir 'SunsetCity.exe'
$Logs = Join-Path $ScHome 'logs'
$LauncherBat = $Launcher
if (-not $LauncherBat) { $LauncherBat = Join-Path $ScHome 'SunsetCity.bat' }
$ScriptId = 'unknown'
try { $ScriptId = (Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.Substring(0, 12) } catch { }
$State = @{}

if ($env:SC_NO_MAIN -ne '1') {
    $rc = 1
    try { $rc = Invoke-Main }
    catch {
        $rc = 1
        try { Report-Failure 'the Sunset City script itself' ($_.Exception.Message + "`r`n" + $_.InvocationInfo.PositionMessage + "`r`n" + $_.ScriptStackTrace) @() }
        catch { Write-Host ('The Sunset City script stopped: ' + $_.Exception.Message) -ForegroundColor Red }
    }
    $last = @($rc) | Select-Object -Last 1
    if ($last -isnot [int]) { $last = 1 }
    exit $last
}
