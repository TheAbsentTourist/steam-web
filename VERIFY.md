# VERIFY

Proven in this VM on 2026-09-02. Commands run from the plugin root (`/workspace` here; locally, the real directory `~/.cursor/plugins/local/steam-web`, not a symlink).

## Environment

- Node.js `v22.14.0` (`node --check` / direct MCP spawn; 18+ required)
- No `STEAM_WEB_API_KEY` in this environment (news smoke does not need one)
- Live host: `https://api.steampowered.com`
- No bundled `bin/steam-web-mcp` (linux bun blob not reintroduced)
- This VERIFY host is Linux: `cmd.exe` is absent, so `.cmd` spawn, NODE persist (`call scripts\find-node.cmd`), missing-node stderr, and PATH-stripped `cmd.exe /d /c call scripts\run-mcp.cmd` checks are skipped. Scripts are written so those commands would work on Windows.

## 1. Manifest schemas

Fetched live:

- `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`
- `https://agent-plugins.org/schemas/1.0.0/mcp.schema.json`

Validated with Ajv 2020-12 (`ajv@8` installed only under `/tmp/steam-web-verify`, not committed).

| File | Result |
| --- | --- |
| `plugin.json` | **PASS** (`$id` `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`) |
| `mcp.json` | **PASS** (`$id` `https://agent-plugins.org/schemas/1.0.0/mcp.schema.json`) |

`plugin.json` uses the closed 1.0.0 field set (`author` is an object). `mcp.json` interpolates `${STEAM_WEB_API_KEY}` and `${STEAM_ID}`; those are placeholders, not committed secrets. `command` is `cmd.exe` (no placeholders in `command`). `args` are separate tokens `["/d", "/c", "call", "scripts\\run-mcp.cmd"]` — **no `${PLUGIN_ROOT}`** until Cursor expands it — and **no `cwd` key** (spec default = plugin root; `"./"` would also be valid). Cursor currently does not expand `${PLUGIN_ROOT}` in plugin MCP args; an unexpanded token yields `The system cannot find the path specified.` Not used: `"command": "./scripts/run-mcp.cmd"` (Windows Cursor resolves `./` against the Cursor install dir, e.g. `%LOCALAPPDATA%\Programs\cursor\scripts\run-mcp.cmd` → `The system cannot find the path specified.`), `"cwd": "${PLUGIN_ROOT}"` (invalid cwd makes spawn report `cmd.exe` ENOENT even when System32 `cmd.exe` exists), `${PLUGIN_ROOT}\\scripts\\run-mcp.cmd` in args, bare `node` as the default, `"command": "cmd"` (use `cmd.exe`), `${NODE}` / `${STEAM_WEB_NODE}` / `${PLUGIN_ROOT}` in `command` or args, a hardcoded `C:\Program Files\nodejs\node.exe`, `env.PATH`, or a bundled linux binary. If relative `scripts\run-mcp.cmd` still path-specified, Cursor cwd is not the plugin root — file upstream. If bare `cmd.exe` is missing from spawn PATH, a documented fallback is `"command": "node"` with `"args": ["./server.mjs"]` only when `node` itself resolves — not the default. If omitting `cwd` still yields `spawn …\cmd.exe ENOENT`, that is a Cursor MCP host bug — file upstream; the plugin cannot fix it by hardcoding Program Files paths.

Upstream bugs to file: (a) `${PLUGIN_ROOT}` / `${PLUGIN_DATA}` not expanded in plugin MCP args; (b) plugin-relative `./` command resolved against the Cursor install dir; (c) confirm default cwd for plugin MCP is the plugin root on Windows.

## 2. Syntax

```bash
node --check server.mjs
```

**PASS**

## 3. Live MCP smoke (`steam_get_news` appid 440)

```bash
node scripts/smoke.mjs
```

The script:

1. GETs `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=440&count=5` directly
2. Spawns `node ./server.mjs` and speaks JSON-RPC 2.0 with `Content-Length` framing
3. Sends `initialize`, `notifications/initialized`, `tools/list`, `tools/call` `steam_get_news` `{ "appid": 440, "count": 5 }`
4. Asserts an overlapping real news **title** (not faked)

| Check | Result |
| --- | --- |
| initialize `serverInfo.name` = `steam-web` | **PASS** |
| `protocolVersion` | `2024-11-05` |
| `tools/list` includes `steam_get_news` (28 tools) | **PASS** |
| MCP title also on `api.steampowered.com` | **PASS** — `Australian Hightower Highjinx 2026` |

## 4. MCP launcher (offline)

```bash
node scripts/mcp-path-test.mjs
```

Asserts `command` is `cmd.exe` with `args` `["/d", "/c", "call", "scripts\\run-mcp.cmd"]` (JSON-escaped backslashes matching `mcp.json`; no `${PLUGIN_ROOT}` in args), **no `cwd`** (or `cwd` `"./"` — never `${PLUGIN_ROOT}` as a cwd value), env placeholders `STEAM_WEB_API_KEY` / `STEAM_ID` unchanged, `scripts/find-node.cmd` has no `setlocal`/`endlocal` and sets `NODE` in the caller, `.cmd` echo text has no parentheses, `.cursor-plugin/plugin.json` does not require `NODE`, `bin/steam-web-mcp` is absent, initialize works via `node ./server.mjs` (Grok Bot / direct-run), and the POSIX `scripts/run-mcp` helper still finds Node when PATH has none. On this host `.cmd` spawn is skipped (no `cmd.exe`). On Windows: `call scripts\find-node.cmd` must leave `NODE` defined; missing-node must exit 1 with stderr and no `. was unexpected at this time.`; PATH-stripped `cmd.exe /d /c call scripts\run-mcp.cmd` (cwd = plugin root) must still initialize when `node.exe` exists under Program Files.

**PASS**

## Cannot prove here

- Cursor **Customize** UI / local plugin loader on a user machine (`~/.cursor/plugins/local/steam-web` as a real directory, not a symlink)
- Windows Cursor launching `cmd.exe /d /c call scripts\run-mcp.cmd` with cwd = plugin root when spawn PATH lacks `node` (Program Files / `STEAM_WEB_NODE`); `call scripts\find-node.cmd` persisting `NODE`; missing-node stderr without `. was unexpected`
- Whether Cursor expands `${PLUGIN_ROOT}` / `${PLUGIN_DATA}` in plugin MCP args (today it does not; unexpanded token → `The system cannot find the path specified.`)
- Whether Cursor default cwd for plugin MCP is the plugin root on Windows (if relative `scripts\run-mcp.cmd` is still path-specified, cwd is wrong)
- Whether Cursor still reports `spawn C:\WINDOWS\system32\cmd.exe ENOENT` after omitting `cwd` (that would be a host bug, not a missing `cmd.exe`)
- macOS/Linux Cursor running `cmd.exe` (may need a local override to `"command": "node"`, `"args": ["./server.mjs"]` until platform-specific command maps exist)
- Linux Cursor AppImage / Flatpak stdio MCP spawn
- Host injection of `PLUGIN_ROOT` / `PLUGIN_DATA` (not used in `mcp.json` command/args; env placeholders `STEAM_WEB_API_KEY` / `STEAM_ID` already work)
- Keyed tools (`STEAM_WEB_API_KEY` absent): library, friends, achievements, trades, Workshop search, `IStoreService/GetAppList`
- Private-profile `401`/`403` → `private_or_unavailable` against a real hidden profile
- Cursor Marketplace (out of scope; do not publish)
