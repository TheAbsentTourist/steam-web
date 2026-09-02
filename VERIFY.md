# VERIFY

Proven in this VM on 2026-09-01. Commands run from the plugin root (`/workspace` here; locally, the real directory `~/.cursor/plugins/local/steam-web`, not a symlink).

## Environment

- Node.js `v22.14.0` (`node --check` requires 18+)
- No `STEAM_WEB_API_KEY` in this environment (news smoke does not need one)
- Live host: `https://api.steampowered.com`

## 1. Manifest schemas

Fetched live:

- `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`
- `https://agent-plugins.org/schemas/1.0.0/mcp.schema.json`

Validated with Ajv 2020-12 (`ajv@8` installed only under `/tmp/steam-web-verify`, not committed).

| File | Result |
| --- | --- |
| `plugin.json` | **PASS** (`$id` `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`) |
| `mcp.json` | **PASS** (`$id` `https://agent-plugins.org/schemas/1.0.0/mcp.schema.json`) |

`plugin.json` uses the closed 1.0.0 field set (`author` is an object). `mcp.json` interpolates `${STEAM_WEB_API_KEY}` and `${STEAM_ID}` from the host environment; those are placeholders, not committed secrets. `command` is `./scripts/run-mcp` (plugin-relative launcher). Agent Plugins does not expand placeholders in `command`, so this is not `${PLUGIN_ROOT}/scripts/run-mcp`.

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

Asserts `command` is `./scripts/run-mcp` (not bare `node` / `cmd.exe` / `node.exe`), `scripts/run-mcp` is executable, the Windows `.cmd` sibling exists, initialize works when PATH has no `node`, and a missing-Node run prints `spawn node ENOENT` (not a Steam API failure).

**PASS**

## Cannot prove here

<<<<<<< HEAD
- Cursor **Customize** UI / local plugin loader on a user machine (`~/.cursor/plugins/local/steam-web` as a real directory, not a symlink)
=======
- Cursor **Customize** UI / local plugin loader on a user machine (`~/.cursor/plugins/local/steam-web` as a real directory)
- Cursor Flatpak/Bazzite GUI spawn of `./scripts/run-mcp` when Node is only inside a toolbox
>>>>>>> cd0beca (fix: launcher finds Node when Cursor PATH lacks it)
- Host injection of `PLUGIN_ROOT` / `PLUGIN_DATA`
- Keyed tools (`STEAM_WEB_API_KEY` absent): library, friends, achievements, trades, Workshop search, `IStoreService/GetAppList`
- Private-profile `401`/`403` → `private_or_unavailable` against a real hidden profile
- Cursor Marketplace (out of scope; do not publish)
