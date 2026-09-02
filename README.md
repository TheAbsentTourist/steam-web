# steam-web

Ask Cursor or Grok Bot about Steam libraries, playtime, achievements, friends, profiles, Workshop items, trades, and more — live data from the official Steam Web API (`https://api.steampowered.com`).

Not affiliated with Valve. Steam® is a trademark of Valve Corporation.

MIT · [TheAbsentTourist](https://github.com/TheAbsentTourist) · chucktastictime@gmail.com

[Privacy](PRIVACY.md) · [Terms](TERMS.md) · [Security](SECURITY.md)

## What you need

1. **Node.js 18+** — [nodejs.org](https://nodejs.org) (Windows installer is fine)
2. **A Steam Web API key** (for most player/library tools) — free at [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey)

Valve allows up to 100,000 API calls per day per key.

Some tools work **without** a key: news, current player counts, global achievement percentages, server info, up-to-date checks, and published-file / collection details (when you already have an id).

Optional: set a default **SteamID64** so you don’t have to pass your id on every call.

## Install in Cursor (local plugin)

Copy or clone this repo into Cursor’s local plugins folder as a **real directory** (not a symlink from somewhere else):

```text
Windows:  %USERPROFILE%\.cursor\plugins\local\steam-web
macOS/Linux:  ~/.cursor/plugins/local/steam-web
```

```bash
git clone https://github.com/TheAbsentTourist/steam-web.git ~/.cursor/plugins/local/steam-web
```

Then reload Cursor (**Developer: Reload Window**). You should see **Steam Web** under Customize / Plugins.

**Teams / Enterprise:** your admin may need to allow local plugin imports.

### Windows: make the MCP actually start

Cursor on Windows often can’t start this plugin’s MCP from the portable config alone (it doesn’t find `node`, and plugin path setup is unreliable). The reliable fix is a **user** MCP entry with full paths.

Create or edit `%USERPROFILE%\.cursor\mcp.json`:

```json
{
  "mcpServers": {
    "steam-web": {
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": [
        "C:\\Users\\YOUR_USERNAME\\.cursor\\plugins\\local\\steam-web\\server.mjs"
      ]
    }
  }
}
```

Adjust the two paths if your Node or plugin folder lives somewhere else. After installing Node, **fully quit Cursor** and reopen it (Reload Window is not enough for PATH changes).

Then set your API key (and optional SteamID) under **Plugins → Configure**, or use the options below.

### API key and default SteamID

Pick one:

- **Plugins → Configure** — set `STEAM_WEB_API_KEY` and optional `STEAM_ID`
- **Environment variables** — same names in the environment Cursor inherits
- **Config file** — copy `config.example.json` to the plugin data directory as `config.json` and fill in:

```json
{
  "STEAM_WEB_API_KEY": "your_key_here",
  "STEAM_ID": "7656119xxxxxxxxxxxxx"
}
```

Don’t commit keys or paste them into GitHub issues.

## What you can ask

- **Profiles & social** — vanity URLs → SteamID, persona/avatar/status, friends, VAC/community/economy bans
- **Library & playtime** — owned games, recently played (times exposed as minutes)
- **Level & badges** — Steam level, badges, community badge quest progress
- **Achievements & stats** — unlocks with names/descriptions, raw stats, schema, global unlock %
- **Live players & news** — who is in-game right now; official app news
- **Catalog** — official appids and names (not store prices or wishlists)
- **Servers** — dedicated servers at an IP; or omit the IP when that player is in a multiplayer session and Steam reports a server address
- **Version check** — whether an installed depot `version` is current (you must supply the real version)
- **Trades** — history and offers for the **API key owner**
- **Workshop** — item details, collections, UGC files, search

Private profiles (and private friend lists) come back as `private_or_unavailable` instead of an empty HTTP error.

## Tools

| Tool | Returns |
| --- | --- |
| `steam_resolve_vanity` | SteamID for a vanity `/id/` or group URL |
| `steam_get_profile` | Persona, avatar, visibility, current game (up to 100 ids) |
| `steam_get_player_bans` | VAC, community, and economy bans |
| `steam_get_friends` | Friend list |
| `steam_get_owned_games` | Library and lifetime playtime |
| `steam_get_recently_played` | Recent games and two-week playtime |
| `steam_get_steam_level` | Steam XP level |
| `steam_get_badges` | Badges and XP |
| `steam_get_community_badge_progress` | Quests for one community badge |
| `steam_get_achievements` | Unlocks with schema names/descriptions |
| `steam_get_user_stats` | Per-user stats for one app |
| `steam_get_schema_for_game` | Achievement/stat schema |
| `steam_get_global_achievement_percentages` | Global unlock % |
| `steam_get_number_of_current_players` | Current in-app players |
| `steam_get_news` | Official app news |
| `steam_get_app_list` | Catalog appids and names |
| `steam_get_servers_at_address` | Servers at an IP (or session server when `addr` omitted) |
| `steam_up_to_date_check` | Depot up-to-date check (`version` required) |
| `steam_get_server_info` | Web API server time |
| `steam_get_supported_api_list` | Official method list |
| `steam_get_trade_history` | Key owner’s trade history |
| `steam_get_trade_offers` | Key owner’s trade offers |
| `steam_get_trade_offer` | One offer by id |
| `steam_get_trade_offers_summary` | Pending offer counts |
| `steam_get_published_file_details` | Workshop item details |
| `steam_get_collection_details` | Collection children |
| `steam_get_ugc_file_details` | One UGC file |
| `steam_query_files` | Workshop search |

## Help

- Issues: https://github.com/TheAbsentTourist/steam-web/issues
- Email: chucktastictime@gmail.com

Community project — best-effort support, no SLA.
]()
