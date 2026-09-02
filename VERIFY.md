# VERIFY

Proven in this VM on 2026-09-02. Commands run from the plugin root (`/workspace` here; locally, the real directory `~/.cursor/plugins/local/steam-web`, not a symlink).

## Environment

- Node.js `v22.14.0` (`node --check` / offline tests; not used for Cursor spawn)
- bun `1.4.0` (`bun build --compile --minify --target=bun-linux-x64`)
- Bundled `bin/steam-web-mcp`: ELF 64-bit LSB executable, x86-64, dynamically linked glibc, **79MB** (not UPX — packing breaks bun overlay)
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

`plugin.json` uses the closed 1.0.0 field set (`author` is an object). `mcp.json` interpolates `${PLUGIN_ROOT}` (command path), `${STEAM_WEB_API_KEY}`, and `${STEAM_ID}`; those are placeholders, not committed secrets. `command` is `${PLUGIN_ROOT}/bin/steam-web-mcp` with `args` `[]` and `cwd` `${PLUGIN_ROOT}`. Proven-broken spawn shapes are not used: bare `node`, `./scripts/run-mcp`, `/bin/sh`, `${NODE}`, or a hardcoded linuxbrew Node path.

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
2. Spawns `bin/steam-web-mcp` (no `node`) and speaks JSON-RPC 2.0 with `Content-Length` framing
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

Asserts `command` is `${PLUGIN_ROOT}/bin/steam-web-mcp` with `args` `[]` (not `/bin/sh` / bare `node` / `./scripts/run-mcp` / `${NODE}` / a hardcoded linuxbrew path), `.cursor-plugin/plugin.json` does not require `NODE`, `bin/steam-web-mcp` is an executable ELF larger than 1MB, and initialize works with **no Node on PATH** (also via the optional `scripts/run-mcp` helper, which prefers the bundled binary).

**PASS**

## Cannot prove here

- Cursor **Customize** UI / local plugin loader on a user machine (`~/.cursor/plugins/local/steam-web` as a real directory, not a symlink)
- Cursor Linux AppImage actually expanding `${PLUGIN_ROOT}` in `command` (the bet; user variables such as `${NODE}` do not expand there)
- Host injection of `PLUGIN_DATA`
- Keyed tools (`STEAM_WEB_API_KEY` absent): library, friends, achievements, trades, Workshop search, `IStoreService/GetAppList`
- Private-profile `401`/`403` → `private_or_unavailable` against a real hidden profile
- Cursor Marketplace (out of scope; do not publish)
