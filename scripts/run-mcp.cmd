@echo off
setlocal EnableExtensions
REM Cursor spawn (Windows-first): mcp.json command ./scripts/run-mcp.cmd
REM Do not write to stdout — MCP uses stdio. Errors to stderr only.
call "%~dp0find-node.cmd"
if errorlevel 1 exit /b %ERRORLEVEL%
if not defined NODE (
  echo steam-web: spawn node ENOENT - Node.js 18+ was not found (not a Steam API failure). Install Node 18+ from https://nodejs.org and fully quit and reopen Cursor. Or set STEAM_WEB_NODE to the full path of node.exe. 1>&2
  exit /b 1
)
"%NODE%" "%~dp0..\server.mjs" %*
exit /b %ERRORLEVEL%
