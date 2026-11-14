@echo off
rem Sunset City, the Unreal Engine version, for Windows: double-click this file. That is all.
rem The first time, it downloads the game, installs what Unreal needs (Windows asks you to say Yes a couple of times, and Unreal Engine itself
rem comes through the Epic Games Launcher, which needs you to sign in and press Install), builds the game and puts a "Sunset City" icon on the
rem desktop. After that, the icon (or this file) starts the game straight away, fetching any new version first.
rem If a step goes wrong, it puts "Sunset City - send this to Claude.txt" on the desktop: paste that into the chat, then double-click again.
rem The work is done by tools\SunsetCity.ps1, which this downloads fresh each time so that fixes arrive by themselves.
setlocal
title Sunset City
if exist "%~dp0SunsetCity.bat.new" (
  move /y "%~dp0SunsetCity.bat.new" "%~f0" >nul
  "%~f0" %*
  exit /b
)
if not defined SC_HOME set "SC_HOME=%SystemDrive%\SunsetCity"
if not exist "%SC_HOME%" mkdir "%SC_HOME%" 2>nul
(type nul > "%SC_HOME%\.write-test") 2>nul || set "SC_HOME=%PUBLIC%\SunsetCity"
if not exist "%SC_HOME%" mkdir "%SC_HOME%" 2>nul
(type nul > "%SC_HOME%\.write-test") 2>nul || set "SC_HOME=%LOCALAPPDATA%\SunsetCity"
if not exist "%SC_HOME%" mkdir "%SC_HOME%"
del "%SC_HOME%\.write-test" 2>nul
if not defined SC_REF set "SC_REF=main"
set "PS1=%SC_HOME%\SunsetCity.ps1"
echo Sunset City: checking for a new version ...
if defined SC_SOURCE_DIR (
  copy /y "%SC_SOURCE_DIR%\unreal\tools\SunsetCity.ps1" "%PS1%" >nul
) else (
  curl.exe -sSfL --retry 2 --connect-timeout 20 -o "%PS1%.download" "https://raw.githubusercontent.com/rauf-mushtaq/Racing/%SC_REF%/unreal/tools/SunsetCity.ps1" && move /y "%PS1%.download" "%PS1%" >nul
)
if not exist "%PS1%" (
  echo.
  echo Could not download Sunset City. Is this PC connected to the internet?
  if not defined SC_UNATTENDED pause
  exit /b 1
)
if not exist "%SC_HOME%\SunsetCity.bat" type "%~f0" > "%SC_HOME%\SunsetCity.bat"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Launcher "%SC_HOME%\SunsetCity.bat" %*
set "RC=%errorlevel%"
if not "%RC%"=="0" if not defined SC_UNATTENDED pause
exit /b %RC%
