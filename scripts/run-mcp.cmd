@echo off
REM Optional terminal helper. Cursor spawn is mcp.json: node ./server.mjs
setlocal EnableExtensions
set "SERVER=%~dp0..\server.mjs"

where node >nul 2>&1
if errorlevel 1 (
  echo steam-web: spawn node ENOENT - Node.js 18+ was not found (not a Steam API failure). Install Node from https://nodejs.org then fully quit and reopen Cursor. 1>&2
  exit /b 1
)

node "%SERVER%" %*
exit /b %ERRORLEVEL%
