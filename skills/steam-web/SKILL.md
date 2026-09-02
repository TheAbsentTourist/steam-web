---
name: steam-web
description: >
  Use when the user asks about a Steam library, playtime, Steam level,
  badges, achievements, user stats, friends, VAC/community bans, player profiles,
  vanity URLs, official app news, current player counts, global achievement
  rarity, store catalog appids, dedicated servers at an IP, version up-to-date
  checks, Web API server time, the official supported method list, the key
  owner's Steam trades/offers, or Workshop items/collections/search. Call the
  steam_* MCP tools. Never invent API data. Official Steam Web API only — do not
  scrape store.steampowered.com. Private profiles yield empty results or 401/403
  (private_or_unavailable).
---

# Steam Web API

Call the `steam-web` MCP tools. Return only data those tools return. Host is `api.steampowered.com`. Do not invent endpoints from `steam_get_supported_api_list` unless they are in this skill. Do not invent dummy `publishedfileid`, `ugcid`, `tradeofferid`, IPs, or an installed version.

## When an id is omitted

Use these documented fallbacks only. If the caller did not omit the id, pass it through.

- Vanity is the `/id/` slug **or** a full `steamcommunity.com` URL (`/id/NAME`, `/groups/NAME`, `/gid/…`). `/profiles/STEAMID64` is that steamid (no ResolveVanityURL). Vanity is **not** the persona name.
- Community badge quests: omit `badgeid` on `steam_get_community_badge_progress` to load the **Steam Community** badge (`2`). That is not games-collector badge `13`. HTTP 200 with no quests → `{ quests: [] }`, not private.
- Workshop details: `steam_get_published_file_details` / `steam_get_collection_details` can take a workshop `appid` instead of `publishedfileids` (QueryFiles, then details). No items → empty `files` / `collections`, not dummy id `1`.
- UGC: omit `ugcid` and pass a real `publishedfileid` so GetPublishedFileDetails can supply `hcontent_file`.
- One trade offer: omit `tradeofferid` to list active sent+received offers. One offer is returned; several yield `need_tradeofferid` + `offer_ids`; none is `not_found`. A missing offer on HTTP 200 is `not_found`, not private.
- Servers: omit `addr` on `steam_get_servers_at_address` to load GetPlayerSummaries `gameserverip` for `STEAM_ID`. If that field is set (in a multiplayer session), it is used as `addr`. Not in-game or missing/empty `gameserverip` → `invalid_arguments`. Do not invent `127.0.0.1` or a WAN IP. Do not call partner GetServerList. Up-to-date still needs the caller's installed depot `version` (not schema `gameVersion`).

When an id is unknown, prefer the optional gathering below. Do not invent dummy ids (tradeofferid `0`, publishedfileid `1`, a guessed server IP, or a persona as a vanity slug).

`private_or_unavailable` is only for real HTTP 401/403 (or a genuinely private profile). Missing, empty, or not-found payloads use `not_found`, `file_not_found`, `need_tradeofferid`, or an empty list.

## Profiles and social

- Vanity `/id/` slug **or** a full `steamcommunity.com` URL (`/id/NAME`, `/groups/NAME`, `/gid/`, `/profiles/STEAMID64`) → `steam_resolve_vanity` (`url_type`: 1 profile, 2 group, 3 official game group). The persona display name is **not** a vanity slug. `/profiles/STEAMID64` returns that SteamID without ResolveVanityURL.
- Persona, avatar, current game → `steam_get_profile`
- VAC / community / economy bans → `steam_get_player_bans`
- Friend list → `steam_get_friends` (optional `relationship`). A private friend list is `private_or_unavailable` (401).

## Library and player service

- Full library and lifetime playtime → `steam_get_owned_games` (optional `appids_filter`)
- Last two weeks → `steam_get_recently_played`
- Steam XP level → `steam_get_steam_level`
- Badge inventory → `steam_get_badges`
- Community badge quests → `steam_get_community_badge_progress`. This is the Steam Community badge (typically `badgeid` 2), **not** Games Collector (`13`) or Years of Service. Omit `badgeid` to call GetBadges then GetCommunityBadgeProgress for badge 2 and other inventory badges that have no appid. HTTP 200 with no quests → `{ quests: [] }`, not private.

## Stats and news

- Achievement unlocks (with schema names) → `steam_get_achievements` (`appid`)
- Raw user stats → `steam_get_user_stats` (`appid`)
- Game achievement/stat schema only → `steam_get_schema_for_game`
- Global unlock percentages → `steam_get_global_achievement_percentages` (no key; `gameid`)
- How many people are in-app now → `steam_get_number_of_current_players` (no key)
- Official game news → `steam_get_news` (no key; `appid`; default count 5)

## Catalog, servers, API util

- Store catalog appids (not prices, not search) → `steam_get_app_list` (`last_appid` to page)
- Game servers at an IP → `steam_get_servers_at_address`. Omit `addr` to use GetPlayerSummaries `gameserverip` when in a multiplayer session; else `invalid_arguments`. Do not invent an IP.
- Is this install current? → `steam_up_to_date_check` (`appid` and numeric installed depot `version` required). Do not invent `version` from GetSchemaForGame. Missing, empty, or non-numeric `version` → `invalid_arguments`. Valve `success: false` for a real version is passed through, not private.
- Web API clock → `steam_get_server_info` (no key)
- Official method catalog → `steam_get_supported_api_list` (optional key shows more)

## Trades (key owner)

These IEconService calls typically only return the **Web API key owner's** trades. Empty history/offers/summary is success when the key owner has none.

- History → `steam_get_trade_history`
- Open/historical offers → `steam_get_trade_offers`
- One offer → `steam_get_trade_offer`. Omit `tradeofferid` to load active sent+received offers: exactly one is returned; several → `need_tradeofferid` plus `offer_ids`; none → `not_found`. A missing offer on HTTP 200 is `not_found`, not private.
- Counts → `steam_get_trade_offers_summary`

## Workshop

- Item details → `steam_get_published_file_details` (POST). Pass `publishedfileids`, or omit them and pass `appid` to QueryFiles a small page and fetch those ids. No workshop items → `{ files: [] }` with a short message, not an error. Per-item EResult `1` = ok, `9` = `file_not_found`.
- Collection children → `steam_get_collection_details` (POST). Same optional `appid` gathering; empty workshop → `{ collections: [] }`.
- One UGC file → `steam_get_ugc_file_details` (user key). Pass `ugcid`, or omit it and pass `publishedfileid` to read `hcontent_file` / `ugcid` from GetPublishedFileDetails first. HTTP 404 / EResult 9 → `not_found` / `file_not_found`.
- Search → `steam_query_files` (`appid` required). Optional `creator_id` (64-bit SteamID, typically `STEAM_ID`) is passed as QueryFiles `creatorid` for that user's workshop. Empty `files` for a game with no Workshop is success.

## Rules

- Official Web API only (`api.steampowered.com`). Never scrape `store.steampowered.com` or call undocumented storefront / wishlist endpoints.
- Never invent titles, playtime, achievements, friends, trades, profiles, workshop ids, or server IPs.
- Private or hidden profiles: report `private_or_unavailable` only for 401/403 (or a truly private list). Missing/empty/not-found is not private.
- Playtime fields are already minutes (`playtime_forever_min`, `playtime_2weeks_min`).
- Tools that need a key error if `STEAM_WEB_API_KEY` is missing (point at https://steamcommunity.com/dev/apikey).
