# steam-web

Unofficial reader of the official Steam Web API (`https://api.steampowered.com`). Not affiliated with Valve. Steam® is a trademark of Valve Corporation.

See [PRIVACY.md](PRIVACY.md) and [TERMS.md](TERMS.md).

MIT. Author [TheAbsentTourist](https://github.com/TheAbsentTourist), chucktastictime@gmail.com.

## Requirements

- Node.js 18+ on the machine that launches the MCP
- A **user** Steam Web API key for keyed tools

Get a key at [https://steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey) (sign in with Steam). Valve caps usage at 100,000 calls per day.

**Windows Cursor.** Cursor currently resolves a plugin-relative `./scripts/run-mcp.cmd` **command** against the Cursor install directory (for example `%LOCALAPPDATA%\Programs\cursor\scripts\run-mcp.cmd`), not `PLUGIN_ROOT`. That fails with `The system cannot find the path specified.` `cmd /d /s /c ./scripts/run-mcp.cmd` also fails because `./` is parsed badly. Default `mcp.json` therefore uses bare `cmd.exe` (placeholders are **not** expanded in `command`) and puts the plugin path in **args**, which do expand:

```json
"command": "cmd.exe",
"args": ["/d", "/c", "call", "${PLUGIN_ROOT}\\scripts\\run-mcp.cmd"]
```

`cwd` is omitted so the host defaults to the plugin root. Do not set `"cwd": "${PLUGIN_ROOT}"`. Node `child_process` reports `spawn C:\WINDOWS\system32\cmd.exe ENOENT` for that exact System32 path when `cwd` is invalid — `cmd.exe` is present; the working directory is not. `scripts/run-mcp.cmd` still auto-finds `node.exe` when Cursor's spawn PATH does not include Node. Typical install: [official Windows installer](https://nodejs.org) → `%ProgramFiles%\nodejs\node.exe`. You can also set `STEAM_WEB_NODE` to the full path of `node.exe` for the launcher (env is expanded). Do **not** put `${STEAM_WEB_NODE}` or `${PLUGIN_ROOT}` in `command` — those placeholders are not expanded there. After installing Node, **fully quit Cursor** (not Reload Window) and reopen.

If bare `cmd.exe` is missing from spawn PATH on some hosts, a local override is `"command": "node"` with `"args": ["${PLUGIN_ROOT}\\server.mjs"]` **only if** `node` itself resolves. That is not the default. A bundled linux executable is not used, and `C:\Program Files\nodejs\node.exe` is not hardcoded in `mcp.json`.

If omitting `cwd` still yields `spawn …\cmd.exe ENOENT`, that is a Cursor MCP host bug (cannot spawn host executables, or plugin root is unusable as cwd). File it upstream.

**macOS / Linux Cursor.** Until clients support platform-specific command maps, `cmd.exe` will not run. Temporary local override: `"command": "node"` with `"args": ["${PLUGIN_ROOT}\\server.mjs"]` (or `"./server.mjs"`) if bare `node` is on PATH.

**Grok Bot** runs `server.mjs` directly and does not use `mcp.json`. Unchanged.

## Credentials

The MCP server reads, in order:

1. Host environment: `STEAM_WEB_API_KEY` (needed for keyed tools) and optional `STEAM_ID` (default 64-bit SteamID)
2. If a value is still missing: `$PLUGIN_DATA/config.json`

On a Marketplace install, set the same fields under **Plugins → Configure**.

Copy `config.example.json` to `$PLUGIN_DATA/config.json` and fill in strings:

```json
{
  "STEAM_WEB_API_KEY": "",
  "STEAM_ID": ""
}
```

These work without a key: news, current players, global achievement %, servers (when `addr` is provided), up-to-date check, server info, and published-file/collection details.

## Install locally in Cursor

Put a **real directory** at `~/.cursor/plugins/local/steam-web` (Windows: `%USERPROFILE%\.cursor\plugins\local\steam-web`). Clone into that path:

```bash
git clone https://github.com/TheAbsentTourist/steam-web.git ~/.cursor/plugins/local/steam-web
```

Copy or move this folder there works too.

Do **not** symlink a checkout that lives outside `~/.cursor/plugins/local`. Cursor rejects those with:

```
loadUserLocalPlugin steam-web rejected: symlink target ... is outside ~/.cursor/plugins/local
```

That is a Cursor local-plugin limitation, not a steam-web defect. If you already symlinked, remove the symlink and clone or copy into the folder instead.

Then **Developer: Reload Window**. **Customize** should show Steam Web (plugin) and steam-web (MCP/skill). Set `STEAM_WEB_API_KEY` and optional `STEAM_ID` under **Plugins → Configure** (or the host environment / `$PLUGIN_DATA/config.json`).

Windows Cursor local plugin spawn (`mcp.json`):

```json
"command": "cmd.exe",
"args": ["/d", "/c", "call", "${PLUGIN_ROOT}\\scripts\\run-mcp.cmd"]
```

`cwd` is omitted (spec default = plugin root). Do not use `"./scripts/run-mcp.cmd"` as `command` until Cursor resolves `./` against `PLUGIN_ROOT` before spawn. `scripts/run-mcp.cmd` locates `node.exe` (PATH, Program Files, nvm/volta/scoop/fnm, or `STEAM_WEB_NODE`) and runs `server.mjs`. Grok Bot already runs the same `server.mjs` without `mcp.json`.

On Teams/Enterprise, local plugin imports may be disabled by admin policy.

## What it can do

**Profiles, friends, bans, vanity.** Resolve a custom `/id/` or group URL to a SteamID. Fetch persona, avatar, visibility, and current game. Read friend lists and VAC / community / economy bans.

**Owned games and playtime.** Return a library and recently played games. Playtime is mapped to minutes: `playtime_forever` → `playtime_forever_min`, `playtime_2weeks` → `playtime_2weeks_min`.

**Level and badges.** Steam XP level, badge inventory, and quest progress for one community badge.

**Achievements, stats, schema, global %.** Per-user unlocks (with schema names and descriptions), raw stats, the achievement/stat schema for an app, and global unlock percentages. Current in-app player counts are included here too.

**News.** Official app news posts.

**Catalog.** Official catalog appids and names. Not store prices or wishlists.

**Game servers and version check.** Dedicated servers at an IP. Omit `addr` on `steam_get_servers_at_address` to use the profile `gameserverip` when that SteamID is in a multiplayer session; otherwise `invalid_arguments`. Do not invent an IP. `steam_up_to_date_check` needs the installed depot `version` (do not invent one from GetSchemaForGame).

**Web API util.** Steam Web API server time, and the official supported-method list (an optional key reveals more).

**Trades.** History, sent/received offers, a single offer, and pending-offer counts — typically for the Web API **key owner** only.

**Workshop.** Published-file details, collection children, one UGC file, and Workshop search.

Private or hidden profiles, including a private friend list (HTTP 401/403), return `{ "error": "private_or_unavailable", "message" }` — not a raw `http_error` with an empty body.

## Tools

| Tool | Returns |
| --- | --- |
| `steam_resolve_vanity` | SteamID for a vanity `/id/` or group URL |
| `steam_get_profile` | Persona, avatar, visibility, current game (up to 100 SteamIDs) |
| `steam_get_player_bans` | VAC, community, and economy ban status |
| `steam_get_friends` | Friend list (`private_or_unavailable` on 401/403) |
| `steam_get_owned_games` | Owned games and lifetime playtime |
| `steam_get_recently_played` | Recently played games and two-week playtime |
| `steam_get_steam_level` | Steam XP level |
| `steam_get_badges` | Badge inventory and XP |
| `steam_get_community_badge_progress` | Quest progress for one community badge |
| `steam_get_achievements` | Unlock state with schema names and descriptions |
| `steam_get_user_stats` | Per-user stat values for one app |
| `steam_get_schema_for_game` | Achievement and stat schema for an app |
| `steam_get_global_achievement_percentages` | Global unlock percentages |
| `steam_get_number_of_current_players` | Players in-app on Steam right now |
| `steam_get_news` | Official app news posts |
| `steam_get_app_list` | Catalog appids and names (paged; any key) |
| `steam_get_servers_at_address` | Game servers at an IP (omit `addr` to use profile `gameserverip` when in a session) |
| `steam_up_to_date_check` | Whether an installed depot version is current (`version` required) |
| `steam_get_server_info` | Steam Web API server time |
| `steam_get_supported_api_list` | Official method catalog |
| `steam_get_trade_history` | Key owner's trade history |
| `steam_get_trade_offers` | Key owner's sent and received trade offers |
| `steam_get_trade_offer` | One trade offer by id |
| `steam_get_trade_offers_summary` | Counts of pending offers |
| `steam_get_published_file_details` | Workshop item details |
| `steam_get_collection_details` | Workshop collection children |
| `steam_get_ugc_file_details` | One UGC file |
| `steam_query_files` | Workshop search results |

## Configure (Cursor)

On a catalog/Marketplace install, open **Plugins → Configure** and set `STEAM_WEB_API_KEY` (required for keyed tools) and optional `STEAM_ID` (default SteamID64).

## Contact and support

- Author: [TheAbsentTourist](https://github.com/TheAbsentTourist)
- Email: chucktastictime@gmail.com
- Issues: https://github.com/TheAbsentTourist/steam-web/issues

This is a community plugin. Best-effort GitHub issues; no SLA.

## Security

See [SECURITY.md](SECURITY.md). Do not paste a Steam Web API key or SteamID into a GitHub issue.
