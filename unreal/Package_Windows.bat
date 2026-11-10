@echo off
rem Sunset City: make the Windows game file (SunsetCity.exe) in unreal\Packaged.
rem Needs Unreal Engine 5 and Visual Studio 2022 installed, and the project set up once (see README.md: build it, then run Content\Python\sc_setup.py in the editor).
rem If Unreal is not in the usual place, set UE_ROOT to the folder that contains "Engine" first, for example:   set UE_ROOT=D:\UE_5.5
setlocal
if "%UE_ROOT%"=="" set "UE_ROOT=C:\Program Files\Epic Games\UE_5.5"
if not exist "%UE_ROOT%\Engine\Build\BatchFiles\RunUAT.bat" (
  echo Could not find Unreal Engine at "%UE_ROOT%".
  echo Set UE_ROOT to the folder that contains "Engine", for example:   set UE_ROOT=D:\UE_5.5
  exit /b 1
)
set "PROJECT=%~dp0SunsetCity\SunsetCity.uproject"
call "%UE_ROOT%\Engine\Build\BatchFiles\RunUAT.bat" BuildCookRun -project="%PROJECT%" -noP4 -platform=Win64 -clientconfig=Development -build -cook -map=/Game/SunsetCity/Maps/Main -stage -pak -archive -archivedirectory="%~dp0Packaged" -utf8output
if errorlevel 1 (
  echo.
  echo The packaging failed: scroll up for the first error and send it back.
  exit /b 1
)
echo.
echo Done. The game is "%~dp0Packaged\Windows\SunsetCity.exe"
