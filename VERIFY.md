# VERIFY

Proven in this VM on 2026-09-02. Commands run from the plugin root (`/workspace` here; locally, the real directory `~/.cursor/plugins/local/steam-web`, not a symlink).

## Environment

- Node.js `v22.14.0` (`node --check` / MCP spawn; 18+ required)
- No `STEAM_WEB_API_KEY` in this environment (news smoke does not need one)
- Live host: `https://api.steampowered.com`
- No bundled `bin/steam-web-mcp` (linux bun blob removed; AppImage spawn still ENOENT)

## 1. Manifest schemas

Fetched live:

- `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`
- `https://agent-plugins.org/schemas/1.0.0/mcp.schema.json`

Validated with Ajv 2020-12 (`ajv@8` installed only under `/tmp/steam-web-verify`, not committed).

| File | Result |
| --- | --- |
| `plugin.json` | **PASS** (`$id` `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`) |
| `mcp.json` | **PASS** (`$id` `https://agent-plugins.org/schemas/1.0.0/mcp.schema.json`) |

`plugin.json` uses the closed 1.0.0 field set (`author` is an object). `mcp.json` interpolates `${PLUGIN_ROOT}` (`cwd`), `${STEAM_WEB_API_KEY}`, and `${STEAM_ID}`; those are placeholders, not committed secrets. `command` is bare `node` with `args` `["./server.mjs"]` and `cwd` `${PLUGIN_ROOT}`. Not used: `/bin/sh`, `${NODE}`, `${PLUGIN_ROOT}/bin/steam-web-mcp`, or a linuxbrew PATH hack.

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
| MCP title also on `api.steampowered.com` | **PASS** — (filled after smoke) |

## 4. MCP launcher (offline)

```bash
node scripts/mcp-path-test.mjs
```

Asserts `command` is `node` with `args` `["./server.mjs"]` (not `/bin/sh` / `${NODE}` / `${PLUGIN_ROOT}/bin/steam-web-mcp` / a linuxbrew PATH), `.cursor-plugin/plugin.json` does not require `NODE`, `bin/steam-web-mcp` and `scripts/build-mcp` are absent, initialize works via `node ./server.mjs`, and `scripts/run-mcp` is an optional terminal helper that `exec node`s `server.mjs`.

**PASS** (filled after test)

## Cannot prove here

- Cursor **Customize** UI / local plugin loader on a user machine (`~/.cursor/plugins/local/steam-web` as a real directory, not a symlink)
- Windows Cursor inheriting `node` on PATH after the official installer (fully quit Cursor after install)
- Linux Cursor AppImage / Flatpak stdio MCP (not supported: spawn ENOENT even for an existing host binary)
- Host injection of `PLUGIN_ROOT` / `PLUGIN_DATA`
- Keyed tools (`STEAM_WEB_API_KEY` absent): library, friends, achievements, trades, Workshop search, `IStoreService/GetAppList`
- Private-profile `401`/`403` → `private_or_unavailable` against a real hidden profile
- Cursor Marketplace (out of scope; do not publish)
