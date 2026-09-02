@echo off
REM Optional terminal helper. Cursor spawn uses ${PLUGIN_ROOT}/bin/steam-web-mcp (Linux).
REM On Windows, this helper prefers bin\steam-web-mcp.exe when present.
setlocal EnableExtensions
set "BUNDLED=%~dp0..\bin\steam-web-mcp.exe"
set "SERVER=%~dp0..\server.mjs"

if exist "%BUNDLED%" (
  "%BUNDLED%" %*
  exit /b %ERRORLEVEL%
)

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

echo steam-web: spawn node ENOENT - Node.js 18+ was not found (not a Steam API failure). Linux Cursor uses bin/steam-web-mcp; for this helper install Node on the machine, then fully quit and reopen Cursor. 1>&2
exit /b 1
