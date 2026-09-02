@echo off
setlocal EnableExtensions
REM Optional Windows terminal helper. NOT the Cursor mcp.json spawn.
REM Public mcp.json is command node, args ./server.mjs until Cursor's
REM Windows plugin MCP host is fixed. Do not write to stdout if you
REM pipe this helper into MCP stdio. Errors to stderr only.
call "%~dp0find-node.cmd"
if errorlevel 1 exit /b 1
if defined NODE goto :run
echo steam-web: spawn node ENOENT - Node.js 18+ was not found. This is not a Steam API failure. Install Node 18+ from https://nodejs.org and fully quit and reopen Cursor. Or set STEAM_WEB_NODE to the full path of node.exe. 1>&2
exit /b 1
:run
"%NODE%" "%~dp0..\server.mjs" %*
exit /b %ERRORLEVEL%
