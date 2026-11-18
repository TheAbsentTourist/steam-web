# CHANGELOG 0.2.10

Shipped `mcp.json` now launches with `npx -y github:TheAbsentTourist/steam-web` and no `cwd` or local paths, so a directory validator can run the setup as written. `package.json` adds a `steam-web` bin (`server.mjs`, executable) and a `files` list (`server.mjs`, `skills`, `assets`, `LICENSE`, `README.md`). Blank and unexpanded `${VAR}` environment values are treated as unset instead of as a Steam Web API key or SteamID. The server reads config only from `$PLUGIN_DATA/config.json` and does not locate package files with `process.cwd()`. Version 0.2.10.
