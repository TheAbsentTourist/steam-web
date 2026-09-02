# steam-web

Unofficial Agent Plugin over the official Steam Web API (`https://api.steampowered.com`): library, playtime, level, badges, achievements, friends, bans, profiles, news, catalog appids, servers, trades, and Workshop.

**Not affiliated with Valve.** Steam® and the Steam logo are trademarks and/or registered trademarks of Valve Corporation in the U.S. and/or other countries. This plugin does not use Valve’s official logo.

See [PRIVACY.md](PRIVACY.md) and [TERMS.md](TERMS.md).

©2026 Valve Corporation. Steam and the Steam logo are trademarks and/or registered trademarks of Valve Corporation in the U.S. and/or other countries.

## Requirements

- Node.js 18+
- A **user** Steam Web API key for keyed tools

Get a key at [https://steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey) (sign in with Steam). Valve’s terms cap usage at 100,000 calls per day: [https://steamcommunity.com/dev/apiterms](https://steamcommunity.com/dev/apiterms).

## Credentials

The MCP server reads, in order:

1. Host environment: `STEAM_WEB_API_KEY` (required for keyed tools) and optional `STEAM_ID` (default 64-bit SteamID)
2. If a value is still missing: `$PLUGIN_DATA/config.json`

Copy `config.example.json` to `$PLUGIN_DATA/config.json` and fill in strings. Cursor Configure maps `${STEAM_WEB_API_KEY}` and `${STEAM_ID}` from the installer — placeholders only, no values in this repo.

```json
{
  "STEAM_WEB_API_KEY": "",
  "STEAM_ID": ""
}
```

Public methods (news, current players, global achievement %, servers, up-to-date check, server info, published-file/collection details) work without a key.

## Install locally in Cursor

Copy this directory to a **real folder** (not a symlink out of the tree):

```text
~/.cursor/plugins/local/steam-web
```

Restart Cursor or run **Developer: Reload Window**. Open **Customize** and confirm the `steam-web` skill and MCP server. Set `STEAM_WEB_API_KEY` (and optional `STEAM_ID`) in the host environment, or write `config.json` under the client-managed `PLUGIN_DATA` directory for this plugin.

On Teams/Enterprise, local plugin imports may be disabled by admin policy.

## What you can do

Official **user-key** and **no-key** methods on `api.steampowered.com` only. Service interfaces send `input_json` as Valve documents.

Playtime maps `playtime_forever` → `playtime_forever_min` and `playtime_2weeks` → `playtime_2weeks_min`.

**Vanity** is the custom `/id/` slug or a full `steamcommunity.com` URL (`/id/NAME`, `/groups/NAME`, `/gid/…`, `/profiles/STEAMID64`). It is not the persona name from a profile.

**Trades** (`steam_get_trade_history`, `steam_get_trade_offers`, `steam_get_trade_offer`, `steam_get_trade_offers_summary`) return the **Web API key owner's** trades.

**Workshop** tools need a workshop `appid` or a real `publishedfileid` / `ugcid`. They do not invent dummy ids.

`steam_get_servers_at_address` needs a real `addr` (IP or IP:queryport). `steam_up_to_date_check` needs the caller's installed depot `version` — not `GetSchemaForGame` `gameVersion`.

## Errors

| Error | When |
| --- | --- |
| `private_or_unavailable` | HTTP 401/403 (private profile or key not allowed). Friends-list 401 is this. |
| `not_found` | Missing trade offer (HTTP 200, no `offer`), no active offers when `tradeofferid` was omitted, or UGC HTTP 404. |
| `file_not_found` | Valve EResult 9 on a published file / collection item, or GetUGCFileDetails status 9. |
| `need_tradeofferid` | Several active offers when `tradeofferid` was omitted; includes `offer_ids`. |
| `invalid_arguments` | Required argument missing (including `version` on up-to-date, `addr` on servers). |
| `missing_key` | Keyed tool and `STEAM_WEB_API_KEY` is unset. |
| `http_error` | Other non-401/403 HTTP failures. |

HTTP 200 with empty community-badge `quests` is `{ quests: [] }`, not private. An app with no workshop items is `{ files: [] }` / `{ collections: [] }` (and a short message), not an error.

## When an id is omitted

The tool calls another documented method. It does not invent dummy `publishedfileid`, `ugcid`, `tradeofferid`, or IPs.

- `steam_resolve_vanity` — strip a full community URL to the slug; `/profiles/STEAMID64` is returned as that steamid without ResolveVanityURL.
- `steam_get_community_badge_progress` — omit `badgeid` to load the Steam Community badge (`2`), not games-collector `13`.
- `steam_get_published_file_details` / `steam_get_collection_details` — omit `publishedfileids` and pass `appid` to QueryFiles then details.
- `steam_get_ugc_file_details` — omit `ugcid` and pass a real `publishedfileid` to read `hcontent_file` from GetPublishedFileDetails.
- `steam_get_trade_offer` — omit `tradeofferid` to list active sent+received offers (one / `need_tradeofferid` / `not_found`).

## Tools

| Tool | Official method | Key | Notes |
| --- | --- | --- | --- |
| `steam_resolve_vanity` | ISteamUser/ResolveVanityURL/v1 | user | `/id/` slug or full community URL, not persona |
| `steam_get_profile` | ISteamUser/GetPlayerSummaries/v2 | user | |
| `steam_get_player_bans` | ISteamUser/GetPlayerBans/v1 | user | |
| `steam_get_friends` | ISteamUser/GetFriendList/v1 | user | 401 → `private_or_unavailable` |
| `steam_get_owned_games` | IPlayerService/GetOwnedGames/v1 | user | |
| `steam_get_recently_played` | IPlayerService/GetRecentlyPlayedGames/v1 | user | |
| `steam_get_steam_level` | IPlayerService/GetSteamLevel/v1 | user | |
| `steam_get_badges` | IPlayerService/GetBadges/v1 | user | |
| `steam_get_community_badge_progress` | IPlayerService/GetCommunityBadgeProgress/v1 | user | Optional `badgeid` (default community `2`) |
| `steam_get_achievements` | GetPlayerAchievements/v1 + GetSchemaForGame/v2 | user | |
| `steam_get_user_stats` | ISteamUserStats/GetUserStatsForGame/v2 | user | |
| `steam_get_schema_for_game` | ISteamUserStats/GetSchemaForGame/v2 | user | |
| `steam_get_global_achievement_percentages` | GetGlobalAchievementPercentagesForApp/v2 | none | |
| `steam_get_number_of_current_players` | GetNumberOfCurrentPlayers/v1 | none | |
| `steam_get_news` | ISteamNews/GetNewsForApp/v2 | none | |
| `steam_get_app_list` | IStoreService/GetAppList/v1 | any key | Catalog dump, not prices |
| `steam_get_servers_at_address` | ISteamApps/GetServersAtAddress/v1 | none | Requires real `addr` |
| `steam_up_to_date_check` | ISteamApps/UpToDateCheck/v1 | none | Requires caller `version` |
| `steam_get_server_info` | ISteamWebAPIUtil/GetServerInfo/v1 | none | |
| `steam_get_supported_api_list` | ISteamWebAPIUtil/GetSupportedAPIList/v1 | optional | |
| `steam_get_trade_history` | IEconService/GetTradeHistory/v1 | user (owner) | Key owner only |
| `steam_get_trade_offers` | IEconService/GetTradeOffers/v1 | user (owner) | Key owner only |
| `steam_get_trade_offer` | IEconService/GetTradeOffer/v1 | user (owner) | Optional `tradeofferid` |
| `steam_get_trade_offers_summary` | IEconService/GetTradeOffersSummary/v1 | user (owner) | Key owner only |
| `steam_get_published_file_details` | ISteamRemoteStorage/GetPublishedFileDetails/v1 | none | Real ids or workshop `appid` |
| `steam_get_collection_details` | ISteamRemoteStorage/GetCollectionDetails/v1 | none | Real ids or workshop `appid` |
| `steam_get_ugc_file_details` | ISteamRemoteStorage/GetUGCFileDetails/v1 | user | Real `ugcid` or `publishedfileid` |
| `steam_query_files` | IPublishedFileService/QueryFiles/v1 | user | Requires workshop `appid` |

## Configure (Cursor)

On a catalog/Marketplace install, open **Plugins → Configure** and set:

- `STEAM_WEB_API_KEY` (required)
- `STEAM_ID` (optional default SteamID64)

## Contact and support

- Author: [TheAbsentTourist](https://github.com/TheAbsentTourist)
- Email: chucktastictime@gmail.com
- Issues: https://github.com/TheAbsentTourist/steam-web/issues

This is a community plugin. Best-effort GitHub issues; no SLA.

## Security

See [SECURITY.md](SECURITY.md). Never paste a Steam Web API key or SteamID into an issue.
