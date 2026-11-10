@echo off
rem Sunset City in any web browser (an iPad, a phone, a laptop): Unreal Pixel Streaming. The game runs on THIS PC (your graphics card draws it) and its picture is streamed
rem to the browser, which sends the touches, keys and mouse back. This starts the game (it needs Package_Windows.bat to have been run) and Unreal's signalling web server, then
rem tells you the address to open. The PC and the browser's device must be on the same network (or joined with something like Tailscale).
rem If Unreal is not in the usual place, set UE_ROOT to the folder that contains "Engine" first.
setlocal enabledelayedexpansion
if "%UE_ROOT%"=="" set "UE_ROOT=C:\Program Files\Epic Games\UE_5.5"
set "GAME=%~dp0Packaged\Windows\SunsetCity.exe"
if not exist "%GAME%" (
  echo "%GAME%" is not there yet: run Package_Windows.bat first.
  exit /b 1
)
set "WS=%UE_ROOT%\Engine\Plugins\Media\PixelStreaming\Resources\WebServers"
set "SIG=%WS%\SignallingWebServer\platform_scripts\cmd"
if not exist "%SIG%" (
  echo Unreal's Pixel Streaming web server is not installed yet. Run this once, then run this file again:
  echo     "%WS%\get_ps_servers.bat"
  exit /b 1
)
set "SIGSCRIPT="
for %%S in (run_local.bat start.bat Start_SignallingServer.bat) do if exist "%SIG%\%%S" if not defined SIGSCRIPT set "SIGSCRIPT=%%S"
if not defined SIGSCRIPT (
  echo Could not find the signalling server's start script in "%SIG%". Start it by hand as the README says, then press a key.
  pause
) else (
  start "Pixel Streaming signalling server" /D "%SIG%" cmd /c "%SIGSCRIPT%"
  timeout /t 4 /nobreak >nul
)
rem Both spellings of the flags (the engine versions differ) are given: the one it does not know is ignored.
start "Sunset City" "%GAME%" -AudioMixer -RenderOffScreen -ForceRes -ResX=1920 -ResY=1080 -Windowed -PixelStreamingURL=ws://127.0.0.1:8888 -PixelStreamingIP=127.0.0.1 -PixelStreamingPort=8888
set "IP="
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do if not defined IP set "IP=%%a"
set "IP=%IP: =%"
echo.
echo Sunset City is starting. In the browser (on this PC, or on the iPad on the same Wi-Fi) open:
echo     http://%IP%
echo (or use the "Unreal" page of the web version, which asks for this address). Click the picture to start; on a touch screen the controls appear when you touch it.
echo Close the two windows to stop.
