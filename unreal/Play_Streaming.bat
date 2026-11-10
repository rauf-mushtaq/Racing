@echo off
rem Sunset City in any web browser (an iPad, a phone, a laptop): Unreal Pixel Streaming. The game runs on THIS PC (your graphics card draws it) and its picture is streamed
rem to the browser, which sends the touches, keys and mouse back. This starts the game (it needs Package_Windows.bat to have been run) and Unreal's signalling web server,
rem shows the address to open, and waits: press a key in its window when you have finished and it closes the game and the server again.
rem The PC and the browser's device must be on the same network (or joined with something like Tailscale).
rem If Unreal is not in the usual place, set UE_ROOT to the folder that contains "Engine" first.
setlocal
if "%UE_ROOT%"=="" set "UE_ROOT=C:\Program Files\Epic Games\UE_5.5"
set "GAME=%~dp0Packaged\Windows\SunsetCity.exe"
if not exist "%GAME%" (
  echo "%GAME%" is not there yet: run Package_Windows.bat first.
  pause
  exit /b 1
)
set "WS=%UE_ROOT%\Engine\Plugins\Media\PixelStreaming\Resources\WebServers"
set "SIG=%WS%\SignallingWebServer\platform_scripts\cmd"
if not exist "%SIG%" (
  echo Unreal's Pixel Streaming web server is not installed yet. Run this once, then run this file again:
  echo     "%WS%\get_ps_servers.bat"
  pause
  exit /b 1
)
rem A copy of the game left running from last time (it has no window of its own) would be a second one: close it, and the old server window.
taskkill /im SunsetCity.exe /t /f >nul 2>&1
taskkill /fi "WINDOWTITLE eq Pixel Streaming signalling server*" /t /f >nul 2>&1
set "SIGSCRIPT="
for %%S in (run_local.bat start.bat Start_SignallingServer.bat) do if exist "%SIG%\%%S" if not defined SIGSCRIPT set "SIGSCRIPT=%%S"
if not defined SIGSCRIPT (
  echo Could not find the signalling server's start script in "%SIG%". Start it by hand as the README says, then press a key.
  pause
) else (
  start "Pixel Streaming signalling server" /D "%SIG%" cmd /c "%SIGSCRIPT%"
  timeout /t 4 /nobreak >nul
)
rem Every spelling of the flags is given (the engine versions differ): the ones a version does not know are ignored.
start "Sunset City" "%GAME%" -AudioMixer -RenderOffScreen -ForceRes -ResX=1920 -ResY=1080 -Windowed -PixelStreamingURL=ws://127.0.0.1:8888 -PixelStreamingConnectionURL=ws://127.0.0.1:8888 -PixelStreamingIP=127.0.0.1 -PixelStreamingPort=8888
echo.
echo Sunset City is starting. It has no window on this PC: its picture goes to the browser.
echo In the browser, on this PC or on the iPad on the same Wi-Fi, open this address:
setlocal enabledelayedexpansion
set "COUNT=0"
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
  set "IP=%%a"
  set "IP=!IP: =!"
  echo     http://!IP!
  set /a COUNT+=1
)
if "!COUNT!"=="0" echo     No network address was found: is this PC on the Wi-Fi or a network cable?
if not "!COUNT!"=="0" if not "!COUNT!"=="1" echo If there are several, it is usually the one that starts with 192.168. Try the next one if the first does not open.
endlocal
echo You can also use the UNREAL ENGINE item in the web version's menu, which asks for this address.
echo The first time, Windows may ask whether to allow this through its firewall: say yes for private networks.
echo Click the picture in the browser to start. On a touch screen the controls appear when you touch it.
echo.
echo Leave this window open while you play. When you have finished, press a key HERE to close the game and the server.
pause >nul
taskkill /im SunsetCity.exe /t /f >nul 2>&1
taskkill /fi "WINDOWTITLE eq Pixel Streaming signalling server*" /t /f >nul 2>&1
echo Stopped.
timeout /t 2 /nobreak >nul
