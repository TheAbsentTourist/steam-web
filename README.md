# steam-web

**0.2.9** — unofficial Steam Web API plugin for Cursor and other MCP hosts (including Grok Bot).

Ask about libraries, playtime, achievements, friends, profiles, Workshop items, trades, store pages, tags, followed games, and in-game item class metadata. Live data from Valve’s official Web API (`https://api.steampowered.com`) plus keyless storefront details (`https://store.steampowered.com/api/appdetails`).

Not affiliated with Valve. Steam® is a trademark of Valve Corporation.

MIT · [TheAbsentTourist](https://github.com/TheAbsentTourist) · [chucktastictime@gmail.com](mailto:chucktastictime@gmail.com)

[Privacy](PRIVACY.md) · [Terms](TERMS.md) · [Security](SECURITY.md)

## What you need

1. **Node.js 18+** — [nodejs.org](https://nodejs.org) (the official Windows installer is fine)
2. **A Steam Web API key** for most player and library tools — free at [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey)

Valve allows up to 100,000 API calls per day per key. Keep the key private; do not commit it or paste it into issues.

**Works without a key:** official news, current player counts, global achievement percentages, server info, depot up-to-date checks, Workshop published-file / collection details (when you already have an id), and **store app details** (keyless storefront).

Optional: set a default **SteamID64** so you don’t have to pass your id on every call.

## Install in Cursor (local plugin)

Copy or clone this repo into Cursor’s local plugins folder as a **real directory** (not a symlink from somewhere else):

```text
Windows:      %USERPROFILE%\.cursor\plugins\local\steam-web
macOS/Linux:  ~/.cursor/plugins/local/steam-web
```

```bash
git clone https://github.com/TheAbsentTourist/steam-web.git ~/.cursor/plugins/local/steam-web
```

Then reload Cursor (**Developer: Reload Window**). You should see **Steam Web** under Customize / Plugins.

**Teams / Enterprise:** your admin may need to allow local plugin imports.

Public `mcp.json` is the portable spawn other hosts already use:

```json
"command": "node",
"args": ["./server.mjs"]
```

### Windows: make the MCP actually start

Cursor on Windows often cannot start this plugin’s MCP from that portable config alone (it doesn’t find `node`, and plugin path setup is unreliable). The reliable workaround is a **user** MCP entry with full paths.

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

Adjust the two paths if Node or the plugin folder lives somewhere else. After installing Node, **fully quit Cursor** and reopen it — Reload Window is not enough for PATH changes.

Then set your API key (and optional SteamID) under **Plugins → Configure**, or use the options below.

### Other MCP hosts (Grok Bot, etc.)

Run `node ./server.mjs` from the plugin directory (same shape as public `mcp.json`). Set `STEAM_WEB_API_KEY` and optional `STEAM_ID` in the environment the host inherits.

### API key and default SteamID

Pick one:

- **Plugins → Configure** — `STEAM_WEB_API_KEY` and optional `STEAM_ID`
- **Environment variables** — same names in the environment the host inherits
- **Config file** — copy `config.example.json` to the plugin data directory as `config.json`:

```json
{
  "STEAM_WEB_API_KEY": "your_key_here",
  "STEAM_ID": "7656119xxxxxxxxxxxxx"
}
```

## What you can ask

- **Profiles & social** — vanity `/id/` or group URL → SteamID; persona, avatar, status; friends; VAC / community / economy bans
- **Library & playtime** — owned games and lifetime playtime; recently played (times in minutes)
- **Level & badges** — Steam level, badges, Steam Community badge quest progress
- **Achievements & stats** — unlocks with names/descriptions, raw stats, schema, global unlock %
- **Live players & news** — who is in-game right now; official app news
- **Catalog** — official appids and names (`steam_get_app_list` is a name list, not prices)
- **Store details & prices** — name, price, platforms, and genres for **one** appid (`steam_get_app_details`, keyless storefront; optional country `cc` and language `l`)
- **Tags** — full store tag catalog (with version hash), most popular tags, localized names for tag ids
- **Followed games** — appids a profile follows, and the follow count
- **Servers** — dedicated servers at an IP; or omit the IP when that player is in a multiplayer session and Steam reports a server address
- **Version check** — whether an installed depot `version` is current (you must supply the real installed version)
- **Trades** — history and offers for the **API key owner** only
- **Economy items** — in-game item class metadata (name, tags, descriptions) — **not** store game prices
- **Workshop** — item details, collections, UGC files, search

Private profiles and private friend lists come back as `private_or_unavailable` instead of a raw HTTP error.

### Example prompts

- “How many hours have I played Factorio?”
- “What’s on sale: store details for appid 427520 in the US?”
- “What are the most popular Steam store tags?”
- “Which games does this profile follow?”
- “Look up TF2 item class 195.”
- “Is anyone in Team Fortress 2 right now, and what’s the latest official news?”

## Tools

35 tools. **Key** = needs `STEAM_WEB_API_KEY`. Default `steamid` is `STEAM_ID` when configured.

### Profiles & social

| Tool | Key | Returns |
| --- | --- | --- |
| `steam_resolve_vanity` | yes | SteamID for a vanity `/id/` or group URL |
| `steam_get_profile` | yes | Persona, avatar, visibility, current game (up to 100 ids) |
| `steam_get_player_bans` | yes | VAC, community, and economy bans |
| `steam_get_friends` | yes | Friend list |

### Library, level & badges

| Tool | Key | Returns |
| --- | --- | --- |
| `steam_get_owned_games` | yes | Library and lifetime playtime |
| `steam_get_recently_played` | yes | Recent games and two-week playtime |
| `steam_get_steam_level` | yes | Steam XP level |
| `steam_get_badges` | yes | Badges and XP |
| `steam_get_community_badge_progress` | yes | Quests for one community badge |

### Achievements, stats, players & news

| Tool | Key | Returns |
| --- | --- | --- |
| `steam_get_achievements` | yes | Unlocks with schema names/descriptions |
| `steam_get_user_stats` | yes | Per-user stats for one app |
| `steam_get_schema_for_game` | yes | Achievement/stat schema |
| `steam_get_global_achievement_percentages` | no | Global unlock % |
| `steam_get_number_of_current_players` | no | Current in-app players |
| `steam_get_news` | no | Official app news |

### Catalog, store, tags & follows

| Tool | Key | Returns |
| --- | --- | --- |
| `steam_get_app_list` | yes | Catalog appids and names (not prices) |
| `steam_get_app_details` | no | Store name, price, platforms, genres for **one** appid |
| `steam_get_tag_list` | yes | Store tag catalog and version hash |
| `steam_get_most_popular_tags` | yes | Popularity-ordered store tags |
| `steam_get_localized_name_for_tags` | yes | Localized names for store tag ids |
| `steam_get_games_followed` | yes | Appids a profile follows |
| `steam_get_games_followed_count` | yes | How many games a profile follows |

### Servers & API util

| Tool | Key | Returns |
| --- | --- | --- |
| `steam_get_servers_at_address` | no* | Servers at an IP (or session server when `addr` omitted) |
| `steam_up_to_date_check` | no | Depot up-to-date check (`version` required) |
| `steam_get_server_info` | no | Web API server time |
| `steam_get_supported_api_list` | optional | Official method list |

\*Needs a key only when `addr` is omitted and the player summary must be loaded.

### Trades & economy (key owner / item class)

| Tool | Key | Returns |
| --- | --- | --- |
| `steam_get_trade_history` | yes | Key owner’s trade history |
| `steam_get_trade_offers` | yes | Key owner’s trade offers |
| `steam_get_trade_offer` | yes | One offer by id |
| `steam_get_trade_offers_summary` | yes | Pending offer counts |
| `steam_get_asset_class_info` | yes | In-game item class metadata (not store prices) |

### Workshop

| Tool | Key | Returns |
| --- | --- | --- |
| `steam_get_published_file_details` | no† | Workshop item details |
| `steam_get_collection_details` | no† | Collection children |
| `steam_get_ugc_file_details` | yes | One UGC file |
| `steam_query_files` | yes | Workshop search |

†Keyless when you already have published-file ids.

## Notes

- **One store app at a time.** `steam_get_app_details` takes a single `appid` (optional `cc` country code, `l` language). It is read-only catalog/price data from the public storefront, not checkout. Free apps such as TF2 (`440`) have no `price_overview`. Results are cached briefly.
- **Catalog ≠ prices.** `steam_get_app_list` returns official names and appids. Prices and platforms come from `steam_get_app_details`.
- **Tags.** `steam_get_tag_list` can take a previous `have_version_hash`; an unchanged catalog comes back empty with the same hash (not an error). Popular tags and localized names are separate calls.
- **Followed games** are store follows on a profile, not the owned library and not a wishlist.
- **Economy class info** is item metadata for an `appid` + `classids` (for example TF2 classid `195`). It is not a store price list.
- **Not available** through this plugin: wishlists, carts, checkout, discovery-queue writes, or `GetAssetPrices`.
- **Trades** only work for the Web API key owner.
- **Up-to-date checks** need the real installed depot `version`. Do not invent one.
- Missing or empty payloads are `not_found` / empty lists. `private_or_unavailable` is reserved for private profiles and HTTP 401/403.

## Help

- Issues: https://github.com/TheAbsentTourist/steam-web/issues
- Email: chucktastictime@gmail.com

Community project — best-effort support, no SLA.
