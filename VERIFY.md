# VERIFY

Proven in this VM on 2026-09-03. The 0.2.10 npx spawn, placeholder-key, and packed-bin checks were re-run on 2026-11-18. Commands run from the plugin root (`/workspace` here; locally, the real directory `~/.cursor/plugins/local/steam-web`, not a symlink).

## Environment

- Node.js `v22.14.0` (`node --check` / direct MCP spawn; 18+ required)
- No `STEAM_WEB_API_KEY` in this environment (news smoke does not need one)
- Live host: `https://api.steampowered.com` (Web API) and keyless `https://store.steampowered.com/api/appdetails` (`steam_get_app_details` only)
- No bundled `bin/steam-web-mcp` (linux bun blob not reintroduced)
- This VERIFY host is Linux. Optional terminal helpers `scripts/run-mcp.cmd` / `scripts/find-node.cmd` are not spawned here (`cmd.exe` absent). They are **not** the Cursor `mcp.json` entry.

## 1. Manifest schemas

Fetched live:

- `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`
- `https://agent-plugins.org/schemas/1.0.0/mcp.schema.json`

Validated with Ajv 2020-12 (`ajv@8` installed only under `/tmp/steam-web-verify`, not committed).

| File | Result |
| --- | --- |
| `plugin.json` | **PASS** (`$id` `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`) |
| `mcp.json` | **PASS** (`$id` `https://agent-plugins.org/schemas/1.0.0/mcp.schema.json`) |

`plugin.json` uses the closed 1.0.0 field set (`author` is an object). `mcp.json` interpolates `${STEAM_WEB_API_KEY}` and `${STEAM_ID}`; those are placeholders, not committed secrets. Public spawn is `command` `npx`, `args` `["-y", "github:TheAbsentTourist/steam-web"]`, **no `cwd` key** and no local path. Not used: `node ./server.mjs` as the shipped command, `cmd.exe`, `./scripts/run-mcp.cmd` as `command`, `scripts\run-mcp.cmd` as the `mcp.json` entry, `${PLUGIN_ROOT}` in `command` or args, `"cwd": "${PLUGIN_ROOT}"`, a hardcoded `C:\Program Files\nodejs\node.exe`, `env.PATH`, or a bundled linux binary.

**Windows Cursor plugin MCP spawn is currently broken** for some portable configs (`spawn npx ENOENT` when `npx` is not on the plugin spawn PATH). Local workaround — **not** in public `mcp.json` — is a user MCP in `~/.cursor/mcp.json` with absolute `node.exe` + absolute installed plugin `server.mjs`. Grok Bot Directory runs the shipped `npx` command as written. macOS/Linux Cursor AppImage/Flatpak stdio MCP is also not supported (prior `ENOENT` even for existing host binaries).

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
| `tools/list` includes `steam_get_news` (35 tools, including store/tag/follow/economy) | **PASS** |
| MCP title also on `api.steampowered.com` | **PASS** — 2026-11-18 re-run overlapped `Team Fortress 2 spinoff Mann Versus Zombies looks so good it could almost be official`; `serverInfo.version` `0.2.10` |
| `steam_get_app_details` Factorio 427520 `cc=us` (keyless storefront) | **PASS** — name Factorio, `$35.00`, no HTML blobs |
| `steam_get_app_details` TF2 440 | **PASS** — `is_free` true, no `price_overview` |

## 4. MCP launcher (offline)

```bash
node scripts/mcp-path-test.mjs
```

Asserts `command` is `npx` with `args` `["-y", "github:TheAbsentTourist/steam-web"]`, **no `cwd`**, args are not blank or local paths, command/args do not contain `${PLUGIN_ROOT}`, `cmd.exe`, or `scripts\run-mcp.cmd` as the `mcp.json` entry, env placeholders `STEAM_WEB_API_KEY` / `STEAM_ID` unchanged, `package.json` `bin` is `server.mjs` (executable, node shebang), `skills/steam-web/SKILL.md` exists, `bin/steam-web-mcp` is absent, initialize still works via a direct `node ./server.mjs` spawn of this checkout, and the POSIX `scripts/run-mcp` helper still finds Node when PATH has none. Does **not** assert Windows `cmd.exe` spawn of `run-mcp.cmd` as the Cursor path. Optional `.cmd` helpers may still be content-checked; on this host `.cmd` spawn is skipped (no `cmd.exe`).

**PASS**

## 5. Packed bin (`npm pack`, then npx from `/tmp`)

`npm pack` includes executable `server.mjs` (`rwxr-xr-x`) and `skills/steam-web/SKILL.md`. From `/tmp`, with `STEAM_WEB_API_KEY` and `STEAM_ID` set to the literal placeholders `${STEAM_WEB_API_KEY}` and `${STEAM_ID}`:

```bash
npx -y --package /path/to/steam-web-0.2.10.tgz steam-web
```

MCP `initialize` returned `serverInfo` `steam-web` `0.2.10`. `tools/list` returned **35** tools. `steam_get_friends` with no id returned `missing_key` (the placeholder was not sent as a key).

**PASS**

## Cannot prove here

- Cursor **Customize** UI / local plugin loader on a user machine (`~/.cursor/plugins/local/steam-web` as a real directory, not a symlink)
- Windows Cursor plugin MCP spawn when `npx` is missing from the plugin spawn PATH (`spawn npx ENOENT`)
- User-MCP workaround: absolute `node.exe` + absolute `~\.cursor\plugins\local\steam-web\server.mjs` in `~\.cursor\mcp.json`
- Optional terminal helpers `scripts/run-mcp.cmd` / `scripts/find-node.cmd` on Windows (`call scripts\find-node.cmd` persisting `NODE`; missing-node stderr without `. was unexpected`)
- Linux Cursor AppImage / Flatpak stdio MCP spawn (not supported: `ENOENT` even for existing host binaries)
- Host injection of `PLUGIN_ROOT` / `PLUGIN_DATA` (not used in `mcp.json` command/args; env placeholders `STEAM_WEB_API_KEY` / `STEAM_ID` already work)
- Keyed tools (`STEAM_WEB_API_KEY` absent): library, friends, achievements, trades, Workshop search, `IStoreService/GetAppList`, tags, followed games, `ISteamEconomy/GetAssetClassInfo`
- Private-profile `401`/`403` → `private_or_unavailable` against a real hidden profile
- Cursor Marketplace (out of scope; do not publish)
