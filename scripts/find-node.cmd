@echo off
setlocal EnableExtensions
REM Resolve node.exe for steam-web. Errors go to stderr only (MCP stdio).
REM On success, sets NODE in the caller (use: call find-node.cmd).

if not defined STEAM_WEB_NODE goto :where
if not exist "%STEAM_WEB_NODE%" goto :where
call :export "%STEAM_WEB_NODE%"
exit /b 0

:where
set "WHERE_EXE=%SystemRoot%\System32\where.exe"
if not exist "%WHERE_EXE%" set "WHERE_EXE=where"
for /f "delims=" %%I in ('"%WHERE_EXE%" node 2^>nul') do (
  if /i "%%~xI"==".exe" (
    if exist "%%I" (
      set "FOUND=%%I"
      goto :use_found
    )
  )
)

if exist "%ProgramFiles%\nodejs\node.exe" (
  set "FOUND=%ProgramFiles%\nodejs\node.exe"
  goto :use_found
)

set "PF86=%ProgramFiles(x86)%"
if defined PF86 if exist "%PF86%\nodejs\node.exe" (
  set "FOUND=%PF86%\nodejs\node.exe"
  goto :use_found
)

if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" (
  set "FOUND=%LOCALAPPDATA%\Programs\nodejs\node.exe"
  goto :use_found
)

if defined NVM_SYMLINK if exist "%NVM_SYMLINK%\node.exe" (
  set "FOUND=%NVM_SYMLINK%\node.exe"
  goto :use_found
)

if exist "%USERPROFILE%\.volta\bin\node.exe" (
  set "FOUND=%USERPROFILE%\.volta\bin\node.exe"
  goto :use_found
)

if exist "%USERPROFILE%\scoop\apps\nodejs\current\node.exe" (
  set "FOUND=%USERPROFILE%\scoop\apps\nodejs\current\node.exe"
  goto :use_found
)

if not defined LOCALAPPDATA goto :fail
for /d %%D in ("%LOCALAPPDATA%\fnm_multishells\*") do (
  if exist "%%D\node.exe" (
    set "FOUND=%%D\node.exe"
    goto :use_found
  )
  if exist "%%D\bin\node.exe" (
    set "FOUND=%%D\bin\node.exe"
    goto :use_found
  )
)

:fail
echo steam-web: spawn node ENOENT - Node.js 18+ was not found (not a Steam API failure). Install Node 18+ from https://nodejs.org and fully quit and reopen Cursor. Or set STEAM_WEB_NODE to the full path of node.exe. 1>&2
exit /b 1

:use_found
call :export "%FOUND%"
exit /b 0

:export
set "FOUND=%~1"
endlocal & set "NODE=%FOUND%"
exit /b 0
