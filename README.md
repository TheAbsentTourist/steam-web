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

Copy `config.example.json` to `$PLUGIN_DATA/config.json` and fill in strings. Never commit `config.json` or `.env`. Cursor Configure maps `${STEAM_WEB_API_KEY}` and `${STEAM_ID}` from the installer — placeholders only, no values in this repo.

```json
{
  "STEAM_WEB_API_KEY": "",
  "STEAM_ID": ""
}
```

Public methods (`steam_get_news`, current players, global achievement %, servers, up-to-date check, server info, published-file/collection details) work without a key. `steam_get_news` appid `440` is the live smoke test.

## Install locally in Cursor

Copy this directory to a **real folder** (not a symlink out of the tree):

```text
~/.cursor/plugins/local/steam-web
```

Restart Cursor or run **Developer: Reload Window**. Open **Customize** and confirm the `steam-web` skill and MCP server. Set `STEAM_WEB_API_KEY` (and optional `STEAM_ID`) in the host environment, or write `config.json` under the client-managed `PLUGIN_DATA` directory for this plugin.

On Teams/Enterprise, local plugin imports may be disabled by admin policy.

## Include vs skip

Documented **user-key** or **no-key** methods on `api.steampowered.com` only. Service interfaces send `input_json` as Valve documents.

| Include (this plugin) | Skip (ToS / publisher / undocumented) |
| --- | --- |
| IPlayerService: GetOwnedGames, GetRecentlyPlayedGames, GetSteamLevel, GetBadges, GetCommunityBadgeProgress | GetSingleGamePlaytime (key must be associated with that appID) |
| ISteamUser: GetPlayerSummaries, GetFriendList, GetPlayerBans, ResolveVanityURL | CheckAppOwnership, GetAppPriceInfo, GetDeletedSteamIDs, GetPublisherAppOwnership, GetUserGroupList |
| ISteamUserStats: GetPlayerAchievements, GetUserStatsForGame, GetSchemaForGame, GetGlobalAchievementPercentagesForApp, GetNumberOfCurrentPlayers | GetGlobalStatsForGame, SetUserStatsForGame |
| ISteamNews: GetNewsForApp | GetNewsForAppAuthed |
| IStoreService: GetAppList (catalog dump, not prices) | store search, prices, wishlists |
| ISteamApps: GetServersAtAddress, UpToDateCheck | GetAppList/v2 (deprecated 404), all publisher ISteamApps methods |
| ISteamWebAPIUtil: GetServerInfo, GetSupportedAPIList | Inventing extra endpoints from the list |
| IEconService: GetTradeHistory, GetTradeOffers, GetTradeOffer, GetTradeOffersSummary (typically **key owner** only) | FlushInventoryCache, FlushAssetAppearanceCache, FlushContextCache |
| ISteamRemoteStorage: GetPublishedFileDetails, GetCollectionDetails, GetUGCFileDetails | Subscribe/Unsubscribe, EnumerateUserSubscribedFiles, SetUGCUsedByGC |
| IPublishedFileService: QueryFiles (workshop search) | Delete, SetDeveloperMetadata, Update* ban/tag methods |

Also skipped: `store.steampowered.com/api/*`, IWishlistService, SteamKit, `partner.steam-api.com`, Cursor Marketplace publish.

## Tools

Playtime maps `playtime_forever` → `playtime_forever_min` and `playtime_2weeks` → `playtime_2weeks_min`. Private profiles return `{ "error": "private_or_unavailable", "message" }` or a tool error.

| Tool | Official method | Key |
| --- | --- | --- |
| `steam_resolve_vanity` | ISteamUser/ResolveVanityURL/v1 | user |
| `steam_get_profile` | ISteamUser/GetPlayerSummaries/v2 | user |
| `steam_get_player_bans` | ISteamUser/GetPlayerBans/v1 | user |
| `steam_get_friends` | ISteamUser/GetFriendList/v1 | user |
| `steam_get_owned_games` | IPlayerService/GetOwnedGames/v1 | user |
| `steam_get_recently_played` | IPlayerService/GetRecentlyPlayedGames/v1 | user |
| `steam_get_steam_level` | IPlayerService/GetSteamLevel/v1 | user |
| `steam_get_badges` | IPlayerService/GetBadges/v1 | user |
| `steam_get_community_badge_progress` | IPlayerService/GetCommunityBadgeProgress/v1 | user |
| `steam_get_achievements` | GetPlayerAchievements/v1 + GetSchemaForGame/v2 | user |
| `steam_get_user_stats` | ISteamUserStats/GetUserStatsForGame/v2 | user |
| `steam_get_schema_for_game` | ISteamUserStats/GetSchemaForGame/v2 | user |
| `steam_get_global_achievement_percentages` | GetGlobalAchievementPercentagesForApp/v2 | none |
| `steam_get_number_of_current_players` | GetNumberOfCurrentPlayers/v1 | none |
| `steam_get_news` | ISteamNews/GetNewsForApp/v2 | none |
| `steam_get_app_list` | IStoreService/GetAppList/v1 | any key |
| `steam_get_servers_at_address` | ISteamApps/GetServersAtAddress/v1 | none |
| `steam_up_to_date_check` | ISteamApps/UpToDateCheck/v1 | none |
| `steam_get_server_info` | ISteamWebAPIUtil/GetServerInfo/v1 | none |
| `steam_get_supported_api_list` | ISteamWebAPIUtil/GetSupportedAPIList/v1 | optional |
| `steam_get_trade_history` | IEconService/GetTradeHistory/v1 | user (owner) |
| `steam_get_trade_offers` | IEconService/GetTradeOffers/v1 | user (owner) |
| `steam_get_trade_offer` | IEconService/GetTradeOffer/v1 | user (owner) |
| `steam_get_trade_offers_summary` | IEconService/GetTradeOffersSummary/v1 | user (owner) |
| `steam_get_published_file_details` | ISteamRemoteStorage/GetPublishedFileDetails/v1 | none |
| `steam_get_collection_details` | ISteamRemoteStorage/GetCollectionDetails/v1 | none |
| `steam_get_ugc_file_details` | ISteamRemoteStorage/GetUGCFileDetails/v1 | user |
| `steam_query_files` | IPublishedFileService/QueryFiles/v1 | user |


## Configure (Cursor)

On a catalog/Marketplace install, open **Plugins → Configure** and set:

- `STEAM_WEB_API_KEY` (required)
- `STEAM_ID` (optional default SteamID64)

Do not put those values in the git repo.

## Contact and support

- Issues: https://github.com/TheAbsentTourist/steam-web/issues
- Author: [TheAbsentTourist](https://github.com/TheAbsentTourist)

This is a community plugin. Best-effort GitHub issues; no SLA.

## Security

See [SECURITY.md](SECURITY.md). Never paste a Steam Web API key or SteamID into an issue.

## Verify

See [VERIFY.md](VERIFY.md). Live news smoke (no key):

```bash
node --check server.mjs
node scripts/smoke.mjs
```
