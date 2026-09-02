@echo off
setlocal EnableExtensions
REM Resolve node.exe for steam-web. Errors go to stderr only (MCP stdio).
REM On success, sets NODE in the caller (use: call find-node.cmd).

if not defined STEAM_WEB_NODE goto :where
if exist "%STEAM_WEB_NODE%" (
  call :export "%STEAM_WEB_NODE%"
  exit /b 0
)

:where
set "WHERE_EXE=%SystemRoot%\System32\where.exe"
if not exist "%WHERE_EXE%" set "WHERE_EXE=where"
for /f "delims=" %%I in ('"%WHERE_EXE%" node 2^>nul') do (
  if /i "%%~xI"==".exe" if exist "%%I" (
    call :export "%%I"
    exit /b 0
  )
)

if exist "%ProgramFiles%\nodejs\node.exe" (
  call :export "%ProgramFiles%\nodejs\node.exe"
  exit /b 0
)

set "PF86=%ProgramFiles(x86)%"
if defined PF86 if exist "%PF86%\nodejs\node.exe" (
  call :export "%PF86%\nodejs\node.exe"
  exit /b 0
)

if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" (
  call :export "%LOCALAPPDATA%\Programs\nodejs\node.exe"
  exit /b 0
)

if defined NVM_SYMLINK if exist "%NVM_SYMLINK%\node.exe" (
  call :export "%NVM_SYMLINK%\node.exe"
  exit /b 0
)

if exist "%USERPROFILE%\.volta\bin\node.exe" (
  call :export "%USERPROFILE%\.volta\bin\node.exe"
  exit /b 0
)

if exist "%USERPROFILE%\scoop\apps\nodejs\current\node.exe" (
  call :export "%USERPROFILE%\scoop\apps\nodejs\current\node.exe"
  exit /b 0
)

if defined LOCALAPPDATA for /d %%D in ("%LOCALAPPDATA%\fnm_multishells\*") do (
  if exist "%%D\node.exe" (
    call :export "%%D\node.exe"
    exit /b 0
  )
  if exist "%%D\bin\node.exe" (
    call :export "%%D\bin\node.exe"
    exit /b 0
  )
)

echo steam-web: spawn node ENOENT - Node.js 18+ was not found (not a Steam API failure). Install Node 18+ from https://nodejs.org and fully quit and reopen Cursor. Or set STEAM_WEB_NODE to the full path of node.exe. 1>&2
exit /b 1

:export
set "FOUND=%~1"
endlocal & set "NODE=%FOUND%"
exit /b 0
