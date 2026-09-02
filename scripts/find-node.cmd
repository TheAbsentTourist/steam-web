@echo off
REM Resolve node.exe for steam-web. Errors go to stderr only (MCP stdio).
REM No setlocal/endlocal: `call find-node.cmd` must leave NODE set in the caller.

set "NODE="

if not defined STEAM_WEB_NODE goto :where
if not exist "%STEAM_WEB_NODE%" goto :where
set "NODE=%STEAM_WEB_NODE%"
exit /b 0

:where
set "WHERE_EXE=%SystemRoot%\System32\where.exe"
if not exist "%WHERE_EXE%" set "WHERE_EXE=where"
for /f "delims=" %%I in ('"%WHERE_EXE%" node 2^>nul') do (
  if /i "%%~xI"==".exe" (
    if exist "%%I" (
      set "NODE=%%I"
      goto :found
    )
  )
)

if exist "%ProgramFiles%\nodejs\node.exe" (
  set "NODE=%ProgramFiles%\nodejs\node.exe"
  goto :found
)

set "PF86=%ProgramFiles(x86)%"
if defined PF86 if exist "%PF86%\nodejs\node.exe" (
  set "NODE=%PF86%\nodejs\node.exe"
  goto :found
)

if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" (
  set "NODE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
  goto :found
)

if defined NVM_SYMLINK if exist "%NVM_SYMLINK%\node.exe" (
  set "NODE=%NVM_SYMLINK%\node.exe"
  goto :found
)

if exist "%USERPROFILE%\.volta\bin\node.exe" (
  set "NODE=%USERPROFILE%\.volta\bin\node.exe"
  goto :found
)

if exist "%USERPROFILE%\scoop\apps\nodejs\current\node.exe" (
  set "NODE=%USERPROFILE%\scoop\apps\nodejs\current\node.exe"
  goto :found
)

if not defined LOCALAPPDATA goto :fail
for /d %%D in ("%LOCALAPPDATA%\fnm_multishells\*") do (
  if exist "%%D\node.exe" (
    set "NODE=%%D\node.exe"
    goto :found
  )
  if exist "%%D\bin\node.exe" (
    set "NODE=%%D\bin\node.exe"
    goto :found
  )
)

:fail
echo steam-web: spawn node ENOENT - Node.js 18+ was not found. This is not a Steam API failure. Install Node 18+ from https://nodejs.org and fully quit and reopen Cursor. Or set STEAM_WEB_NODE to the full path of node.exe. 1>&2
exit /b 1

:found
exit /b 0
