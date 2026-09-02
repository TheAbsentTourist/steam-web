@echo off
setlocal EnableExtensions
set "SERVER=%~dp0..\server.mjs"

where node >nul 2>&1
if not errorlevel 1 (
  node "%SERVER%" %*
  exit /b %ERRORLEVEL%
)

if exist "C:\Program Files\nodejs\node.exe" (
  "C:\Program Files\nodejs\node.exe" "%SERVER%" %*
  exit /b %ERRORLEVEL%
)

if exist "C:\Program Files (x86)\nodejs\node.exe" (
  "C:\Program Files (x86)\nodejs\node.exe" "%SERVER%" %*
  exit /b %ERRORLEVEL%
)

if not defined NVM_HOME if exist "%APPDATA%\nvm" set "NVM_HOME=%APPDATA%\nvm"
if defined NVM_HOME (
  for /d %%D in ("%NVM_HOME%\v*") do (
    if exist "%%D\node.exe" (
      "%%D\node.exe" "%SERVER%" %*
      exit /b %ERRORLEVEL%
    )
  )
)

echo steam-web: spawn node ENOENT - Node.js 18+ was not found (not a Steam API failure). Install Node on the machine (official installer), then fully quit and reopen Cursor. 1>&2
exit /b 1
