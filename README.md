# steam-web

Unofficial reader of the official Steam Web API (`https://api.steampowered.com`). Not affiliated with Valve. Steam® is a trademark of Valve Corporation.

See [PRIVACY.md](PRIVACY.md) and [TERMS.md](TERMS.md).

MIT. Author [TheAbsentTourist](https://github.com/TheAbsentTourist), chucktastictime@gmail.com.

## Requirements

- A **user** Steam Web API key for keyed tools
- Cursor Linux AppImage / Bazzite: **no host Node**. The plugin ships `bin/steam-web-mcp` (linux x64). Cursor spawn cannot see host `node`, `/bin/sh`, or `/home/linuxbrew` (AppImage overlay; only `$HOME` is reliably visible). Plugin user variables such as `${NODE}` do **not** expand in `command`.

Get a key at [https://steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey) (sign in with Steam). Valve caps usage at 100,000 calls per day.

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

`mcp.json` spawn is the bundled executable (not `node`, not `/bin/sh`, not `./scripts/run-mcp`):

```json
"command": "${PLUGIN_ROOT}/bin/steam-web-mcp",
"args": [],
"cwd": "${PLUGIN_ROOT}"
```

`${PLUGIN_ROOT}` is a Cursor plugin-dir token. The AppImage can see files under `~/.cursor/plugins/local/steam-web`. `scripts/run-mcp` is only a terminal helper (it prefers `bin/steam-web-mcp` when present).

**Windows.** `mcp.json` always names `bin/steam-web-mcp` (linux x64 / unix). Rebuild a Windows extra with `STEAM_WEB_MCP_CROSS=1 ./scripts/build-mcp` to get `bin/steam-web-mcp.exe`; use that from a terminal (`scripts/run-mcp.cmd`) or a local override. Do not rename the linux binary; Cursor Linux spawn depends on that exact filename.

Rebuild the linux x64 binary (needs [bun](https://bun.sh)): `./scripts/build-mcp`. `server.mjs` is the source of truth. Other unix names (`bin/steam-web-mcp-linux-arm64`, `bin/steam-web-mcp-darwin-arm64`, `bin/steam-web-mcp-darwin-x64`) are optional extras from the same script; `mcp.json` cannot point at more than one command name.

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

On a catalog/Marketplace install, open **Plugins → Configure** and set `STEAM_WEB_API_KEY` (required for keyed tools) and optional `STEAM_ID` (default SteamID64). Host Node is not required: Cursor spawn uses `bin/steam-web-mcp`.

## Contact and support

- Author: [TheAbsentTourist](https://github.com/TheAbsentTourist)
- Email: chucktastictime@gmail.com
- Issues: https://github.com/TheAbsentTourist/steam-web/issues

This is a community plugin. Best-effort GitHub issues; no SLA.

## Security

See [SECURITY.md](SECURITY.md). Do not paste a Steam Web API key or SteamID into a GitHub issue.
