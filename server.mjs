#!/usr/bin/env node
/**
 * Zero-dep stdio MCP server for the official Steam Web API
 * (https://api.steampowered.com only). Credentials: process.env, then
 * $PLUGIN_DATA/config.json. Service interfaces use input_json.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { stdin, stdout } from "node:process";

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_INFO = { name: "steam-web", version: "0.1.0" };
const API_HOST = "https://api.steampowered.com";
const TIMEOUT_MS = 15_000;
const KEY_HELP =
  "Set STEAM_WEB_API_KEY in the host environment or $PLUGIN_DATA/config.json. Get a user key at https://steamcommunity.com/dev/apikey";
const STORE_MAX = 50_000;
const STORE_DEFAULT = 100;

function loadFileConfig() {
  const dir = process.env.PLUGIN_DATA;
  if (!dir) return {};
  try {
    const parsed = JSON.parse(readFileSync(join(dir, "config.json"), "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function cred(name) {
  if (process.env[name]) return String(process.env[name]);
  const fromFile = loadFileConfig()[name];
  return fromFile ? String(fromFile) : "";
}

function apiKey() {
  return cred("STEAM_WEB_API_KEY");
}

function defaultSteamId() {
  return cred("STEAM_ID");
}

function requireKey() {
  const key = apiKey();
  if (!key) return { error: true, message: `STEAM_WEB_API_KEY is missing. ${KEY_HELP}` };
  return { key };
}

function resolveSteamId(args, field = "steamid") {
  const id = args?.[field] ?? args?.steamids ?? defaultSteamId();
  if (!id) {
    return { error: true, message: "steamid is required (argument or STEAM_ID in env / $PLUGIN_DATA/config.json)" };
  }
  return { steamid: String(id) };
}

function privateResult(message) {
  return { error: "private_or_unavailable", message };
}

function missingKey() {
  return { isError: true, payload: { error: "missing_key", message: `STEAM_WEB_API_KEY is missing. ${KEY_HELP}` } };
}

function invalid(message) {
  return { isError: true, payload: { error: "invalid_arguments", message } };
}

function httpFail(r) {
  return { isError: true, payload: { error: "http_error", message: r.text || "Steam Web API request failed", status: r.status } };
}

function present(v) {
  return v !== undefined && v !== null && v !== "";
}

function asBool(v) {
  if (typeof v === "boolean") return v;
  if (v === "true" || v === 1 || v === "1") return true;
  if (v === "false" || v === 0 || v === "0") return false;
  return Boolean(v);
}

function asNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function asIdList(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (!present(value)) return [];
  return String(value)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) {
    if (present(obj?.[k])) out[k] = obj[k];
  }
  return out;
}

async function steamRequest({ iface, method, version, params = {}, http = "GET", inputJson = false }) {
  const url = new URL(`${API_HOST}/${iface}/${method}/v${version}/`);
  const form = new URLSearchParams();
  const body = { ...params };
  if (present(body.key)) {
    form.set("key", String(body.key));
    delete body.key;
  }
  if (inputJson) {
    const json = {};
    for (const [k, v] of Object.entries(body)) {
      if (v !== undefined && v !== null && v !== "") json[k] = v;
    }
    if (Object.keys(json).length) form.set("input_json", JSON.stringify(json));
  } else {
    for (const [k, v] of Object.entries(body)) {
      if (v === undefined || v === null || v === "") continue;
      if (Array.isArray(v)) {
        v.forEach((item, i) => form.set(`${k}[${i}]`, String(item)));
      } else {
        form.set(k, String(v));
      }
    }
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    let res;
    if (http === "POST") {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
        signal: ac.signal,
      });
    } else {
      url.search = form.toString();
      res = await fetch(url, { method: "GET", signal: ac.signal });
    }
    if (res.status === 401 || res.status === 403) return { private: true, status: res.status };
    const text = await res.text();
    if (!res.ok) return { fail: true, status: res.status, text };
    if (!text.trim()) return { private: true, status: res.status, empty: true };
    try {
      return { body: JSON.parse(text), status: res.status };
    } catch {
      return { fail: true, status: res.status, text: "invalid JSON from Steam Web API" };
    }
  } catch (err) {
    if (err?.name === "AbortError") {
      return { fail: true, text: `Steam Web API timed out after ${TIMEOUT_MS}ms` };
    }
    return { fail: true, text: err?.message || "Steam Web API request failed" };
  } finally {
    clearTimeout(timer);
  }
}

function steamGet(iface, method, version, params, inputJson = false) {
  return steamRequest({ iface, method, version, params, http: "GET", inputJson });
}

function steamPost(iface, method, version, params) {
  return steamRequest({ iface, method, version, params, http: "POST" });
}

function gameSummary(g) {
  const out = { appid: Number(g.appid) };
  if (g.name != null) out.name = g.name;
  if (g.playtime_forever != null) out.playtime_forever_min = g.playtime_forever;
  if (g.playtime_2weeks != null) out.playtime_2weeks_min = g.playtime_2weeks;
  const hash = g.img_icon_url ?? g.img_icon_hash;
  if (hash) out.img_icon_hash = hash;
  return out;
}

function playerSummary(p) {
  const out = {
    steamid: String(p.steamid),
    personaname: p.personaname ?? "",
    profileurl: p.profileurl ?? "",
    avatar: p.avatar ?? "",
    communityvisibilitystate: Number(p.communityvisibilitystate ?? 0),
  };
  if (p.gameid != null) out.gameid = String(p.gameid);
  if (p.gameextrainfo != null) out.gameextrainfo = p.gameextrainfo;
  return out;
}

function playerBan(p) {
  return {
    steamid: String(p.SteamId ?? p.steamid ?? ""),
    community_banned: Boolean(p.CommunityBanned),
    vac_banned: Boolean(p.VACBanned),
    number_of_vac_bans: Number(p.NumberOfVACBans ?? 0),
    days_since_last_ban: Number(p.DaysSinceLastBan ?? 0),
    number_of_game_bans: Number(p.NumberOfGameBans ?? 0),
    economy_ban: p.EconomyBan ?? "none",
  };
}

function storeAppHint(a) {
  const out = { appid: Number(a.appid) };
  if (a.last_modified != null) out.last_modified = a.last_modified;
  if (a.price_change_number != null) out.price_change_number = a.price_change_number;
  return out;
}

function slimAsset(a) {
  return pick(
    {
      appid: a.appid,
      contextid: a.contextid,
      assetid: a.assetid,
      classid: a.classid,
      instanceid: a.instanceid,
      amount: a.amount,
      missing: a.missing,
    },
    ["appid", "contextid", "assetid", "classid", "instanceid", "amount", "missing"],
  );
}

function slimTrade(t) {
  const out = pick(t, ["tradeid", "steamid_other", "time_init", "status"]);
  if (Array.isArray(t.assets_given)) out.assets_given = t.assets_given.map(slimAsset);
  if (Array.isArray(t.assets_received)) out.assets_received = t.assets_received.map(slimAsset);
  return out;
}

function slimOffer(o) {
  const out = pick(o, [
    "tradeofferid",
    "accountid_other",
    "message",
    "expiration_time",
    "trade_offer_state",
    "is_our_offer",
    "time_created",
    "time_updated",
    "from_real_time_trade",
    "escrow_end_date",
    "confirmation_method",
  ]);
  if (Array.isArray(o.items_to_give)) out.items_to_give = o.items_to_give.map(slimAsset);
  if (Array.isArray(o.items_to_receive)) out.items_to_receive = o.items_to_receive.map(slimAsset);
  return out;
}

function slimPublishedFile(f) {
  const out = pick(f, [
    "publishedfileid",
    "creator",
    "title",
    "file_description",
    "short_description",
    "creator_appid",
    "consumer_appid",
    "file_url",
    "preview_url",
    "filename",
    "file_size",
    "time_created",
    "time_updated",
    "subscriptions",
    "favorited",
    "views",
    "lifetime_subscriptions",
    "lifetime_favorited",
    "result",
  ]);
  if (f.publishedfileid != null) out.publishedfileid = String(f.publishedfileid);
  if (Array.isArray(f.tags)) out.tags = f.tags.map((t) => (typeof t === "string" ? t : t.tag)).filter(Boolean);
  return out;
}

const steamidProp = { type: "string", description: "64-bit SteamID. Defaults to STEAM_ID." };
const appidProp = { type: "number", description: "Steam appid (e.g. 440 for TF2)." };

const TOOLS = [
  {
    name: "steam_resolve_vanity",
    description:
      "ISteamUser/ResolveVanityURL/v1. Vanity URL → SteamID. url_type: 1 individual (default), 2 group, 3 official game group. User key.",
    inputSchema: {
      type: "object",
      properties: {
        vanityurl: { type: "string", description: "Custom URL name (path after /id/ or /groups/)." },
        url_type: { type: "number", description: "1 individual, 2 group, 3 official game group." },
      },
      required: ["vanityurl"],
    },
  },
  {
    name: "steam_get_profile",
    description: "ISteamUser/GetPlayerSummaries/v2. Persona, avatar, visibility, current game. Max 100 steamids. User key.",
    inputSchema: {
      type: "object",
      properties: {
        steamids: { type: "string", description: "Comma-separated 64-bit SteamIDs (max 100). Defaults to STEAM_ID." },
      },
    },
  },
  {
    name: "steam_get_player_bans",
    description: "ISteamUser/GetPlayerBans/v1. VAC / community / economy bans. User key.",
    inputSchema: {
      type: "object",
      properties: {
        steamids: { type: "string", description: "Comma-separated 64-bit SteamIDs. Defaults to STEAM_ID." },
      },
    },
  },
  {
    name: "steam_get_friends",
    description: "ISteamUser/GetFriendList/v1. Private lists → 401 / private_or_unavailable. Optional relationship. User key.",
    inputSchema: {
      type: "object",
      properties: {
        steamid: steamidProp,
        relationship: { type: "string", description: "Relationship filter (e.g. friend). Default friend." },
      },
    },
  },
  {
    name: "steam_get_owned_games",
    description:
      "IPlayerService/GetOwnedGames/v1 (input_json). include_appinfo and include_played_free_games default true. Optional appids_filter. User key.",
    inputSchema: {
      type: "object",
      properties: {
        steamid: steamidProp,
        include_appinfo: { type: "boolean" },
        include_played_free_games: { type: "boolean" },
        appids_filter: { type: "string", description: "Comma-separated appids to restrict the result set." },
      },
    },
  },
  {
    name: "steam_get_recently_played",
    description: "IPlayerService/GetRecentlyPlayedGames/v1 (input_json). User key.",
    inputSchema: {
      type: "object",
      properties: {
        steamid: steamidProp,
        count: { type: "number", description: "Max games (0/unset: all)." },
      },
    },
  },
  {
    name: "steam_get_steam_level",
    description: "IPlayerService/GetSteamLevel/v1 (input_json). User key.",
    inputSchema: { type: "object", properties: { steamid: steamidProp } },
  },
  {
    name: "steam_get_badges",
    description: "IPlayerService/GetBadges/v1 (input_json). Badge inventory and XP. User key.",
    inputSchema: { type: "object", properties: { steamid: steamidProp } },
  },
  {
    name: "steam_get_community_badge_progress",
    description: "IPlayerService/GetCommunityBadgeProgress/v1 (input_json). Quests for one badgeid. User key.",
    inputSchema: {
      type: "object",
      properties: {
        steamid: steamidProp,
        badgeid: { type: "number", description: "Badge id to inspect." },
      },
      required: ["badgeid"],
    },
  },
  {
    name: "steam_get_achievements",
    description:
      "ISteamUserStats/GetPlayerAchievements/v1 plus names/descriptions from GetSchemaForGame/v2. User key. Private or no-stats → private_or_unavailable.",
    inputSchema: {
      type: "object",
      properties: {
        appid: appidProp,
        steamid: steamidProp,
        l: { type: "string", description: "Language for schema strings (e.g. english)." },
      },
      required: ["appid"],
    },
  },
  {
    name: "steam_get_user_stats",
    description: "ISteamUserStats/GetUserStatsForGame/v2. Per-user stat values for one app. User key.",
    inputSchema: {
      type: "object",
      properties: { appid: appidProp, steamid: steamidProp },
      required: ["appid"],
    },
  },
  {
    name: "steam_get_schema_for_game",
    description: "ISteamUserStats/GetSchemaForGame/v2. Achievement/stat schema for an app. User key.",
    inputSchema: {
      type: "object",
      properties: {
        appid: appidProp,
        l: { type: "string", description: "Localized language (english, french, …)." },
      },
      required: ["appid"],
    },
  },
  {
    name: "steam_get_global_achievement_percentages",
    description: "ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2. No key. Parameter is gameid (usually the appid).",
    inputSchema: {
      type: "object",
      properties: { gameid: { type: "number", description: "GameID / appid to retrieve percentages for." } },
      required: ["gameid"],
    },
  },
  {
    name: "steam_get_number_of_current_players",
    description: "ISteamUserStats/GetNumberOfCurrentPlayers/v1. Players in-app on Steam right now (excludes offline). No key.",
    inputSchema: { type: "object", properties: { appid: appidProp }, required: ["appid"] },
  },
  {
    name: "steam_get_news",
    description: "ISteamNews/GetNewsForApp/v2. Official app news. Works without a key. Default count 5.",
    inputSchema: {
      type: "object",
      properties: {
        appid: appidProp,
        count: { type: "number", description: "Number of posts (default 5)." },
        maxlength: { type: "number", description: "Max content length; 0 = full." },
        enddate: { type: "number", description: "Unix time; posts earlier than this." },
        feeds: { type: "string", description: "Comma-separated feed names." },
      },
      required: ["appid"],
    },
  },
  {
    name: "steam_get_app_list",
    description:
      "IStoreService/GetAppList/v1 (input_json). Catalog dump of store appids — not prices or store search. Paginate with last_appid. Default max_results 100, cap 50000. Any web API key.",
    inputSchema: {
      type: "object",
      properties: {
        last_appid: { type: "number", description: "Continuation: last appid from the previous page." },
        max_results: { type: "number", description: "Page size (default 100, max 50000)." },
        if_modified_since: { type: "number", description: "Unix time; only items modified after this." },
        have_description_language: { type: "string" },
        include_games: { type: "boolean" },
        include_dlc: { type: "boolean" },
        include_software: { type: "boolean" },
        include_videos: { type: "boolean" },
        include_hardware: { type: "boolean" },
      },
    },
  },
  {
    name: "steam_get_servers_at_address",
    description: "ISteamApps/GetServersAtAddress/v1. Game servers at an IP or IP:queryport. No key.",
    inputSchema: {
      type: "object",
      properties: { addr: { type: "string", description: "IP or IP:queryport." } },
      required: ["addr"],
    },
  },
  {
    name: "steam_up_to_date_check",
    description: "ISteamApps/UpToDateCheck/v1. Whether an installed version is current. No key.",
    inputSchema: {
      type: "object",
      properties: {
        appid: appidProp,
        version: { type: "number", description: "Installed version to check." },
      },
      required: ["appid", "version"],
    },
  },
  {
    name: "steam_get_server_info",
    description: "ISteamWebAPIUtil/GetServerInfo/v1. Steam Web API server time. No key.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "steam_get_supported_api_list",
    description:
      "ISteamWebAPIUtil/GetSupportedAPIList/v1. Official method catalog. Optional user key reveals more. Optional interface filter is local only — do not treat extra names as callable unless they are in partner docs.",
    inputSchema: {
      type: "object",
      properties: {
        interface: { type: "string", description: "If set, return only this interface from the official list." },
      },
    },
  },
  {
    name: "steam_get_trade_history",
    description:
      "IEconService/GetTradeHistory/v1 (input_json). Usually only the key owner's trades. User key.",
    inputSchema: {
      type: "object",
      properties: {
        max_trades: { type: "number", description: "Page size (default 10)." },
        start_after_time: { type: "number" },
        start_after_tradeid: { type: "string" },
        navigating_back: { type: "boolean" },
        get_descriptions: { type: "boolean" },
        language: { type: "string" },
        include_failed: { type: "boolean" },
        include_total: { type: "boolean" },
      },
    },
  },
  {
    name: "steam_get_trade_offers",
    description:
      "IEconService/GetTradeOffers/v1 (input_json). Sent/received offers for the key owner. User key. Defaults to both sent and received.",
    inputSchema: {
      type: "object",
      properties: {
        get_sent_offers: { type: "boolean" },
        get_received_offers: { type: "boolean" },
        get_descriptions: { type: "boolean" },
        language: { type: "string" },
        active_only: { type: "boolean" },
        historical_only: { type: "boolean" },
        time_historical_cutoff: { type: "number" },
      },
    },
  },
  {
    name: "steam_get_trade_offer",
    description: "IEconService/GetTradeOffer/v1 (input_json). One offer by tradeofferid. Typically key owner. User key.",
    inputSchema: {
      type: "object",
      properties: {
        tradeofferid: { type: "string" },
        language: { type: "string" },
      },
      required: ["tradeofferid"],
    },
  },
  {
    name: "steam_get_trade_offers_summary",
    description: "IEconService/GetTradeOffersSummary/v1 (input_json). Counts of pending offers. Typically key owner. User key.",
    inputSchema: {
      type: "object",
      properties: { time_last_visit: { type: "number", description: "Unix time of last visit; optional." } },
    },
  },
  {
    name: "steam_get_published_file_details",
    description: "ISteamRemoteStorage/GetPublishedFileDetails/v1 (POST). Workshop item details. No key.",
    inputSchema: {
      type: "object",
      properties: {
        publishedfileids: { type: "string", description: "Comma-separated published file ids." },
      },
      required: ["publishedfileids"],
    },
  },
  {
    name: "steam_get_collection_details",
    description: "ISteamRemoteStorage/GetCollectionDetails/v1 (POST). Workshop collection children. No key.",
    inputSchema: {
      type: "object",
      properties: {
        publishedfileids: { type: "string", description: "Comma-separated collection published file ids." },
      },
      required: ["publishedfileids"],
    },
  },
  {
    name: "steam_get_ugc_file_details",
    description: "ISteamRemoteStorage/GetUGCFileDetails/v1. One UGC file. User key. Optional steamid limits to that owner.",
    inputSchema: {
      type: "object",
      properties: {
        ugcid: { type: "string" },
        appid: appidProp,
        steamid: { type: "string", description: "If set, only return details if this SteamID owns the file." },
      },
      required: ["ugcid", "appid"],
    },
  },
  {
    name: "steam_query_files",
    description:
      "IPublishedFileService/QueryFiles/v1 (input_json). Workshop search. User key. Practical args only — not Delete/ban/tag publisher methods.",
    inputSchema: {
      type: "object",
      properties: {
        appid: appidProp,
        search_text: { type: "string" },
        query_type: {
          type: "number",
          description: "EPublishedFileQueryType (default 12 if search_text else 1). 12 = RankedByTextSearch.",
        },
        cursor: { type: "string", description: "Pagination cursor; '*' for the first page (default)." },
        numperpage: { type: "number" },
        return_tags: { type: "boolean" },
        return_short_description: { type: "boolean" },
      },
      required: ["appid"],
    },
  },
];

function needAppid(args) {
  if (!present(args?.appid)) return invalid("appid is required");
  return null;
}

async function resolveVanity(args) {
  const keyed = requireKey();
  if (keyed.error) return missingKey();
  if (!present(args?.vanityurl)) return invalid("vanityurl is required");
  const params = { key: keyed.key, vanityurl: args.vanityurl };
  if (present(args.url_type)) params.url_type = asNum(args.url_type);
  const r = await steamGet("ISteamUser", "ResolveVanityURL", 1, params);
  if (r.private) return { payload: privateResult("Vanity URL resolution forbidden or unavailable") };
  if (r.fail) return httpFail(r);
  const resp = r.body?.response ?? {};
  if (resp.success !== 1 || !resp.steamid) {
    return { isError: true, payload: { error: "not_found", message: resp.message || "Vanity URL did not resolve" } };
  }
  return { payload: { steamid: String(resp.steamid) } };
}

async function getProfile(args) {
  const keyed = requireKey();
  if (keyed.error) return missingKey();
  const ids = resolveSteamId(args, "steamids");
  if (ids.error) return invalid(ids.message);
  const r = await steamGet("ISteamUser", "GetPlayerSummaries", 2, { key: keyed.key, steamids: ids.steamid });
  if (r.private) return { payload: privateResult("Player summaries forbidden or unavailable") };
  if (r.fail) return httpFail(r);
  const players = r.body?.response?.players;
  if (!Array.isArray(players) || players.length === 0) {
    return { payload: privateResult("No player summaries returned (private or unknown SteamID)") };
  }
  return { payload: { players: players.map(playerSummary) } };
}

async function getPlayerBans(args) {
  const keyed = requireKey();
  if (keyed.error) return missingKey();
  const ids = resolveSteamId(args, "steamids");
  if (ids.error) return invalid(ids.message);
  const r = await steamGet("ISteamUser", "GetPlayerBans", 1, { key: keyed.key, steamids: ids.steamid });
  if (r.private) return { payload: privateResult("Player bans forbidden or unavailable") };
  if (r.fail) return httpFail(r);
  const players = r.body?.players;
  if (!Array.isArray(players) || players.length === 0) {
    return { payload: privateResult("No ban records returned") };
  }
  return { payload: { players: players.map(playerBan) } };
}

async function getFriends(args) {
  const keyed = requireKey();
  if (keyed.error) return missingKey();
  const id = resolveSteamId(args);
  if (id.error) return invalid(id.message);
  const r = await steamGet("ISteamUser", "GetFriendList", 1, {
    key: keyed.key,
    steamid: id.steamid,
    relationship: present(args?.relationship) ? args.relationship : "friend",
  });
  if (r.private) return { payload: privateResult("Friend list forbidden or unavailable") };
  if (r.fail) return httpFail(r);
  const friends = r.body?.friendslist?.friends;
  if (!Array.isArray(friends) || friends.length === 0) {
    return { payload: privateResult("Friend list empty or private") };
  }
  return {
    payload: {
      friends: friends.map((f) => ({ steamid: String(f.steamid), relationship: f.relationship ?? "friend" })),
    },
  };
}

async function getOwnedGames(args) {
  const keyed = requireKey();
  if (keyed.error) return missingKey();
  const id = resolveSteamId(args);
  if (id.error) return invalid(id.message);
  const params = {
    key: keyed.key,
    steamid: id.steamid,
    include_appinfo: present(args?.include_appinfo) ? asBool(args.include_appinfo) : true,
    include_played_free_games: present(args?.include_played_free_games) ? asBool(args.include_played_free_games) : true,
  };
  const filter = asIdList(args?.appids_filter).map(Number).filter(Number.isFinite);
  if (filter.length) params.appids_filter = filter;
  const r = await steamGet("IPlayerService", "GetOwnedGames", 1, params, true);
  if (r.private) return { payload: privateResult("Owned games forbidden or unavailable") };
  if (r.fail) return httpFail(r);
  const games = r.body?.response?.games;
  if (!Array.isArray(games) || games.length === 0) {
    return { payload: privateResult("Owned games empty (private library or none owned)") };
  }
  return { payload: { game_count: r.body.response.game_count ?? games.length, games: games.map(gameSummary) } };
}

async function getRecentlyPlayed(args) {
  const keyed = requireKey();
  if (keyed.error) return missingKey();
  const id = resolveSteamId(args);
  if (id.error) return invalid(id.message);
  const params = { key: keyed.key, steamid: id.steamid };
  if (present(args?.count)) params.count = asNum(args.count);
  const r = await steamGet("IPlayerService", "GetRecentlyPlayedGames", 1, params, true);
  if (r.private) return { payload: privateResult("Recently played games forbidden or unavailable") };
  if (r.fail) return httpFail(r);
  const games = r.body?.response?.games;
  if (!Array.isArray(games)) {
    return { payload: privateResult("Recently played games unavailable (private or empty)") };
  }
  return { payload: { total_count: r.body.response.total_count ?? games.length, games: games.map(gameSummary) } };
}

async function getSteamLevel(args) {
  const keyed = requireKey();
  if (keyed.error) return missingKey();
  const id = resolveSteamId(args);
  if (id.error) return invalid(id.message);
  const r = await steamGet("IPlayerService", "GetSteamLevel", 1, { key: keyed.key, steamid: id.steamid }, true);
  if (r.private) return { payload: privateResult("Steam level forbidden or unavailable") };
  if (r.fail) return httpFail(r);
  const level = r.body?.response?.player_level;
  if (level == null) return { payload: privateResult("Steam level unavailable") };
  return { payload: { steamid: id.steamid, player_level: level } };
}

async function getBadges(args) {
  const keyed = requireKey();
  if (keyed.error) return missingKey();
  const id = resolveSteamId(args);
  if (id.error) return invalid(id.message);
  const r = await steamGet("IPlayerService", "GetBadges", 1, { key: keyed.key, steamid: id.steamid }, true);
  if (r.private) return { payload: privateResult("Badges forbidden or unavailable") };
  if (r.fail) return httpFail(r);
  const resp = r.body?.response;
  if (!resp || !Array.isArray(resp.badges)) return { payload: privateResult("Badges unavailable") };
  return {
    payload: {
      steamid: id.steamid,
      player_xp: resp.player_xp,
      player_level: resp.player_level,
      player_xp_needed_to_level_up: resp.player_xp_needed_to_level_up,
      player_xp_needed_current_level: resp.player_xp_needed_current_level,
      badges: resp.badges.map((b) =>
        pick(b, ["badgeid", "level", "completion_time", "xp", "scarcity", "appid", "communityitemid", "border_color"]),
      ),
    },
  };
}

async function getCommunityBadgeProgress(args) {
  const keyed = requireKey();
  if (keyed.error) return missingKey();
  if (!present(args?.badgeid)) return invalid("badgeid is required");
  const id = resolveSteamId(args);
  if (id.error) return invalid(id.message);
  const r = await steamGet(
    "IPlayerService",
    "GetCommunityBadgeProgress",
    1,
    { key: keyed.key, steamid: id.steamid, badgeid: asNum(args.badgeid) },
    true,
  );
  if (r.private) return { payload: privateResult("Community badge progress forbidden or unavailable") };
  if (r.fail) return httpFail(r);
  const quests = r.body?.response?.quests;
  if (!Array.isArray(quests)) return { payload: privateResult("Community badge progress unavailable") };
  return { payload: { steamid: id.steamid, badgeid: asNum(args.badgeid), quests } };
}

async function getAchievements(args) {
  const keyed = requireKey();
  if (keyed.error) return missingKey();
  const bad = needAppid(args);
  if (bad) return bad;
  const id = resolveSteamId(args);
  if (id.error) return invalid(id.message);
  const appid = asNum(args.appid);
  const params = { key: keyed.key, steamid: id.steamid, appid };
  if (present(args.l)) params.l = args.l;
  const r = await steamGet("ISteamUserStats", "GetPlayerAchievements", 1, params);
  if (r.private) return { payload: privateResult("Achievements forbidden or unavailable") };
  if (r.fail) return httpFail(r);
  const stats = r.body?.playerstats;
  if (!stats || stats.success === false) {
    return { payload: privateResult(stats?.error || "Achievements unavailable (private profile or no stats)") };
  }
  const raw = Array.isArray(stats.achievements) ? stats.achievements : [];
  if (raw.length === 0) return { payload: privateResult("No achievements returned") };
  const schemaParams = { key: keyed.key, appid };
  if (present(args.l)) schemaParams.l = args.l;
  const schema = await steamGet("ISteamUserStats", "GetSchemaForGame", 2, schemaParams);
  const listed = schema.body?.game?.availableGameStats?.achievements;
  const schemaByName = Array.isArray(listed) ? new Map(listed.map((a) => [a.name, a])) : new Map();
  const achievements = raw.map((a) => {
    const out = { apiname: a.apiname, achieved: a.achieved ? 1 : 0 };
    const meta = schemaByName.get(a.apiname);
    if (meta?.displayName) out.name = meta.displayName;
    if (meta?.description) out.description = meta.description;
    return out;
  });
  return { payload: { steamid: id.steamid, appid, gameName: stats.gameName, achievements } };
}

async function getUserStats(args) {
  const keyed = requireKey();
  if (keyed.error) return missingKey();
  const bad = needAppid(args);
  if (bad) return bad;
  const id = resolveSteamId(args);
  if (id.error) return invalid(id.message);
  const r = await steamGet("ISteamUserStats", "GetUserStatsForGame", 2, {
    key: keyed.key,
    steamid: id.steamid,
    appid: asNum(args.appid),
  });
  if (r.private) return { payload: privateResult("User stats forbidden or unavailable") };
  if (r.fail) return httpFail(r);
  const ps = r.body?.playerstats;
  if (!ps) return { payload: privateResult("User stats unavailable") };
  return {
    payload: {
      steamid: id.steamid,
      appid: asNum(args.appid),
      gameName: ps.gameName,
      stats: Array.isArray(ps.stats) ? ps.stats : [],
      achievements: Array.isArray(ps.achievements)
        ? ps.achievements.map((a) => ({ apiname: a.name ?? a.apiname, achieved: a.achieved ? 1 : 0 }))
        : [],
    },
  };
}

async function getSchemaForGame(args) {
  const keyed = requireKey();
  if (keyed.error) return missingKey();
  const bad = needAppid(args);
  if (bad) return bad;
  const params = { key: keyed.key, appid: asNum(args.appid) };
  if (present(args.l)) params.l = args.l;
  const r = await steamGet("ISteamUserStats", "GetSchemaForGame", 2, params);
  if (r.private) return { payload: privateResult("Game schema forbidden or unavailable") };
  if (r.fail) return httpFail(r);
  const game = r.body?.game;
  if (!game) return { payload: privateResult("Game schema unavailable") };
  const stats = game.availableGameStats ?? {};
  return {
    payload: {
      appid: asNum(args.appid),
      gameName: game.gameName,
      gameVersion: game.gameVersion,
      achievements: Array.isArray(stats.achievements)
        ? stats.achievements.map((a) => ({
            apiname: a.name,
            name: a.displayName,
            description: a.description,
            hidden: a.hidden,
          }))
        : [],
      stats: Array.isArray(stats.stats)
        ? stats.stats.map((s) => pick(s, ["name", "defaultvalue", "displayName"]))
        : [],
    },
  };
}

async function getGlobalAchievementPercentages(args) {
  if (!present(args?.gameid) && !present(args?.appid)) return invalid("gameid is required");
  const gameid = asNum(args.gameid ?? args.appid);
  const r = await steamGet("ISteamUserStats", "GetGlobalAchievementPercentagesForApp", 2, { gameid });
  if (r.private) return { payload: privateResult("Global achievement percentages forbidden or unavailable") };
  if (r.fail) return httpFail(r);
  const list = r.body?.achievementpercentages?.achievements;
  if (!Array.isArray(list)) return { payload: privateResult("No global achievement percentages returned") };
  return {
    payload: {
      gameid,
      achievements: list.map((a) => ({ apiname: a.name, percent: a.percent })),
    },
  };
}

async function getNumberOfCurrentPlayers(args) {
  const bad = needAppid(args);
  if (bad) return bad;
  const r = await steamGet("ISteamUserStats", "GetNumberOfCurrentPlayers", 1, { appid: asNum(args.appid) });
  if (r.private) return { payload: privateResult("Current player count forbidden or unavailable") };
  if (r.fail) return httpFail(r);
  const resp = r.body?.response;
  if (!resp || resp.result !== 1) return { payload: privateResult("Current player count unavailable") };
  return { payload: { appid: asNum(args.appid), player_count: resp.player_count } };
}

async function getNews(args) {
  const bad = needAppid(args);
  if (bad) return bad;
  const params = { appid: asNum(args.appid), count: present(args.count) ? asNum(args.count) : 5 };
  if (present(args.maxlength)) params.maxlength = asNum(args.maxlength);
  if (present(args.enddate)) params.enddate = asNum(args.enddate);
  if (present(args.feeds)) params.feeds = args.feeds;
  const key = apiKey();
  if (key) params.key = key;
  const r = await steamGet("ISteamNews", "GetNewsForApp", 2, params);
  if (r.private) return { payload: privateResult("News forbidden or unavailable") };
  if (r.fail) return httpFail(r);
  const items = r.body?.appnews?.newsitems;
  if (!Array.isArray(items)) return { payload: privateResult("No news items returned") };
  return {
    payload: {
      appid: r.body.appnews.appid ?? params.appid,
      news: items.map((n) => ({
        title: n.title ?? "",
        url: n.url ?? "",
        date: n.date,
        author: n.author ?? "",
        feedlabel: n.feedlabel ?? "",
      })),
    },
  };
}

async function getAppList(args) {
  const keyed = requireKey();
  if (keyed.error) return missingKey();
  let max = present(args?.max_results) ? asNum(args.max_results) : STORE_DEFAULT;
  if (max == null || max < 1) max = STORE_DEFAULT;
  if (max > STORE_MAX) max = STORE_MAX;
  const params = { key: keyed.key, max_results: max };
  if (present(args?.last_appid)) params.last_appid = asNum(args.last_appid);
  if (present(args?.if_modified_since)) params.if_modified_since = asNum(args.if_modified_since);
  if (present(args?.have_description_language)) params.have_description_language = args.have_description_language;
  for (const flag of ["include_games", "include_dlc", "include_software", "include_videos", "include_hardware"]) {
    if (present(args?.[flag])) params[flag] = asBool(args[flag]);
  }
  const r = await steamGet("IStoreService", "GetAppList", 1, params, true);
  if (r.private) return { payload: privateResult("Store app list forbidden or unavailable") };
  if (r.fail) return httpFail(r);
  const resp = r.body?.response ?? {};
  const apps = Array.isArray(resp.apps) ? resp.apps.map(storeAppHint) : [];
  return {
    payload: {
      apps,
      have_more_results: Boolean(resp.have_more_results),
      last_appid: resp.last_appid,
      max_results: max,
    },
  };
}

async function getServersAtAddress(args) {
  if (!present(args?.addr)) return invalid("addr is required");
  const r = await steamGet("ISteamApps", "GetServersAtAddress", 1, { addr: args.addr });
  if (r.private) return { payload: privateResult("Server list forbidden or unavailable") };
  if (r.fail) return httpFail(r);
  const resp = r.body?.response;
  if (!resp) return { payload: privateResult("No server list returned") };
  return { payload: { success: Boolean(resp.success), servers: resp.servers ?? [] } };
}

async function upToDateCheck(args) {
  const bad = needAppid(args);
  if (bad) return bad;
  if (!present(args?.version)) return invalid("version is required");
  const r = await steamGet("ISteamApps", "UpToDateCheck", 1, { appid: asNum(args.appid), version: asNum(args.version) });
  if (r.private) return { payload: privateResult("Up-to-date check forbidden or unavailable") };
  if (r.fail) return httpFail(r);
  const resp = r.body?.response;
  if (!resp) return { payload: privateResult("Up-to-date check unavailable") };
  return {
    payload: pick(resp, ["success", "up_to_date", "version_is_listable", "required_version", "message"]),
  };
}

async function getServerInfo() {
  const r = await steamGet("ISteamWebAPIUtil", "GetServerInfo", 1, {});
  if (r.private) return { payload: privateResult("Server info forbidden or unavailable") };
  if (r.fail) return httpFail(r);
  return { payload: { servertime: r.body?.servertime, servertimestring: r.body?.servertimestring } };
}

async function getSupportedAPIList(args) {
  const params = {};
  const key = apiKey();
  if (key) params.key = key;
  const r = await steamGet("ISteamWebAPIUtil", "GetSupportedAPIList", 1, params);
  if (r.private) return { payload: privateResult("Supported API list forbidden or unavailable") };
  if (r.fail) return httpFail(r);
  let interfaces = r.body?.apilist?.interfaces;
  if (!Array.isArray(interfaces)) return { payload: privateResult("Supported API list unavailable") };
  if (present(args?.interface)) {
    const want = String(args.interface);
    interfaces = interfaces.filter((i) => i.name === want);
  }
  return { payload: { interfaces } };
}

async function getTradeHistory(args) {
  const keyed = requireKey();
  if (keyed.error) return missingKey();
  const params = { key: keyed.key, max_trades: present(args?.max_trades) ? asNum(args.max_trades) : 10 };
  if (present(args?.start_after_time)) params.start_after_time = asNum(args.start_after_time);
  if (present(args?.start_after_tradeid)) params.start_after_tradeid = args.start_after_tradeid;
  if (present(args?.navigating_back)) params.navigating_back = asBool(args.navigating_back);
  if (present(args?.get_descriptions)) params.get_descriptions = asBool(args.get_descriptions);
  if (present(args?.language)) params.language = args.language;
  if (present(args?.include_failed)) params.include_failed = asBool(args.include_failed);
  if (present(args?.include_total)) params.include_total = asBool(args.include_total);
  const r = await steamGet("IEconService", "GetTradeHistory", 1, params, true);
  if (r.private) return { payload: privateResult("Trade history forbidden or unavailable (usually key owner only)") };
  if (r.fail) return httpFail(r);
  const resp = r.body?.response;
  if (!resp) return { payload: privateResult("Trade history unavailable") };
  return {
    payload: {
      more: resp.more,
      total_trades: resp.total_trades,
      trades: Array.isArray(resp.trades) ? resp.trades.map(slimTrade) : [],
    },
  };
}

async function getTradeOffers(args) {
  const keyed = requireKey();
  if (keyed.error) return missingKey();
  const sent = present(args?.get_sent_offers) ? asBool(args.get_sent_offers) : true;
  const received = present(args?.get_received_offers) ? asBool(args.get_received_offers) : true;
  const params = { key: keyed.key, get_sent_offers: sent, get_received_offers: received };
  if (present(args?.get_descriptions)) params.get_descriptions = asBool(args.get_descriptions);
  if (present(args?.language)) params.language = args.language;
  if (present(args?.active_only)) params.active_only = asBool(args.active_only);
  if (present(args?.historical_only)) params.historical_only = asBool(args.historical_only);
  if (present(args?.time_historical_cutoff)) params.time_historical_cutoff = asNum(args.time_historical_cutoff);
  const r = await steamGet("IEconService", "GetTradeOffers", 1, params, true);
  if (r.private) return { payload: privateResult("Trade offers forbidden or unavailable (usually key owner only)") };
  if (r.fail) return httpFail(r);
  const resp = r.body?.response;
  if (!resp) return { payload: privateResult("Trade offers unavailable") };
  return {
    payload: {
      trade_offers_sent: Array.isArray(resp.trade_offers_sent) ? resp.trade_offers_sent.map(slimOffer) : [],
      trade_offers_received: Array.isArray(resp.trade_offers_received) ? resp.trade_offers_received.map(slimOffer) : [],
    },
  };
}

async function getTradeOffer(args) {
  const keyed = requireKey();
  if (keyed.error) return missingKey();
  if (!present(args?.tradeofferid)) return invalid("tradeofferid is required");
  const params = { key: keyed.key, tradeofferid: args.tradeofferid };
  if (present(args?.language)) params.language = args.language;
  const r = await steamGet("IEconService", "GetTradeOffer", 1, params, true);
  if (r.private) return { payload: privateResult("Trade offer forbidden or unavailable (usually key owner only)") };
  if (r.fail) return httpFail(r);
  const offer = r.body?.response?.offer;
  if (!offer) return { payload: privateResult("Trade offer unavailable") };
  return { payload: { offer: slimOffer(offer) } };
}

async function getTradeOffersSummary(args) {
  const keyed = requireKey();
  if (keyed.error) return missingKey();
  const params = { key: keyed.key };
  if (present(args?.time_last_visit)) params.time_last_visit = asNum(args.time_last_visit);
  const r = await steamGet("IEconService", "GetTradeOffersSummary", 1, params, true);
  if (r.private) return { payload: privateResult("Trade offers summary forbidden or unavailable (usually key owner only)") };
  if (r.fail) return httpFail(r);
  const resp = r.body?.response;
  if (!resp) return { payload: privateResult("Trade offers summary unavailable") };
  return {
    payload: pick(resp, [
      "pending_received_count",
      "new_received_count",
      "updated_received_count",
      "historical_received_count",
      "pending_sent_count",
      "newly_accepted_sent_count",
      "updated_sent_count",
      "historical_sent_count",
    ]),
  };
}

async function getPublishedFileDetails(args) {
  const ids = asIdList(args?.publishedfileids);
  if (!ids.length) return invalid("publishedfileids is required");
  const params = { itemcount: ids.length, publishedfileids: ids };
  const r = await steamPost("ISteamRemoteStorage", "GetPublishedFileDetails", 1, params);
  if (r.private) return { payload: privateResult("Published file details forbidden or unavailable") };
  if (r.fail) return httpFail(r);
  const details = r.body?.response?.publishedfiledetails;
  if (!Array.isArray(details)) return { payload: privateResult("No published file details returned") };
  return { payload: { files: details.map(slimPublishedFile) } };
}

async function getCollectionDetails(args) {
  const ids = asIdList(args?.publishedfileids);
  if (!ids.length) return invalid("publishedfileids is required");
  const params = { collectioncount: ids.length, publishedfileids: ids };
  const r = await steamPost("ISteamRemoteStorage", "GetCollectionDetails", 1, params);
  if (r.private) return { payload: privateResult("Collection details forbidden or unavailable") };
  if (r.fail) return httpFail(r);
  const details = r.body?.response?.collectiondetails;
  if (!Array.isArray(details)) return { payload: privateResult("No collection details returned") };
  return {
    payload: {
      collections: details.map((c) => ({
        publishedfileid: c.publishedfileid != null ? String(c.publishedfileid) : undefined,
        result: c.result,
        children: Array.isArray(c.children)
          ? c.children.map((ch) => ({
              publishedfileid: String(ch.publishedfileid),
              sortorder: ch.sortorder,
              filetype: ch.filetype,
            }))
          : [],
      })),
    },
  };
}

async function getUgcFileDetails(args) {
  const keyed = requireKey();
  if (keyed.error) return missingKey();
  if (!present(args?.ugcid)) return invalid("ugcid is required");
  const bad = needAppid(args);
  if (bad) return bad;
  const params = { key: keyed.key, ugcid: args.ugcid, appid: asNum(args.appid) };
  if (present(args?.steamid)) params.steamid = args.steamid;
  const r = await steamGet("ISteamRemoteStorage", "GetUGCFileDetails", 1, params);
  if (r.private) return { payload: privateResult("UGC file details forbidden or unavailable") };
  if (r.fail) return httpFail(r);
  const data = r.body?.data;
  if (!data) return { payload: privateResult("UGC file details unavailable") };
  return { payload: data };
}

async function queryFiles(args) {
  const keyed = requireKey();
  if (keyed.error) return missingKey();
  const bad = needAppid(args);
  if (bad) return bad;
  const params = {
    key: keyed.key,
    appid: asNum(args.appid),
    cursor: present(args?.cursor) ? String(args.cursor) : "*",
    numperpage: present(args?.numperpage) ? asNum(args.numperpage) : 10,
    query_type: present(args?.query_type) ? asNum(args.query_type) : present(args?.search_text) ? 12 : 1,
  };
  if (present(args?.search_text)) params.search_text = args.search_text;
  if (present(args?.return_tags)) params.return_tags = asBool(args.return_tags);
  if (present(args?.return_short_description)) params.return_short_description = asBool(args.return_short_description);
  const r = await steamGet("IPublishedFileService", "QueryFiles", 1, params, true);
  if (r.private) return { payload: privateResult("Workshop query forbidden or unavailable") };
  if (r.fail) return httpFail(r);
  const resp = r.body?.response;
  if (!resp) return { payload: privateResult("Workshop query unavailable") };
  const files = Array.isArray(resp.publishedfiledetails) ? resp.publishedfiledetails.map(slimPublishedFile) : [];
  return {
    payload: {
      total: resp.total,
      next_cursor: resp.next_cursor,
      files,
    },
  };
}

const HANDLERS = {
  steam_resolve_vanity: resolveVanity,
  steam_get_profile: getProfile,
  steam_get_player_bans: getPlayerBans,
  steam_get_friends: getFriends,
  steam_get_owned_games: getOwnedGames,
  steam_get_recently_played: getRecentlyPlayed,
  steam_get_steam_level: getSteamLevel,
  steam_get_badges: getBadges,
  steam_get_community_badge_progress: getCommunityBadgeProgress,
  steam_get_achievements: getAchievements,
  steam_get_user_stats: getUserStats,
  steam_get_schema_for_game: getSchemaForGame,
  steam_get_global_achievement_percentages: getGlobalAchievementPercentages,
  steam_get_number_of_current_players: getNumberOfCurrentPlayers,
  steam_get_news: getNews,
  steam_get_app_list: getAppList,
  steam_get_servers_at_address: getServersAtAddress,
  steam_up_to_date_check: upToDateCheck,
  steam_get_server_info: getServerInfo,
  steam_get_supported_api_list: getSupportedAPIList,
  steam_get_trade_history: getTradeHistory,
  steam_get_trade_offers: getTradeOffers,
  steam_get_trade_offer: getTradeOffer,
  steam_get_trade_offers_summary: getTradeOffersSummary,
  steam_get_published_file_details: getPublishedFileDetails,
  steam_get_collection_details: getCollectionDetails,
  steam_get_ugc_file_details: getUgcFileDetails,
  steam_query_files: queryFiles,
};

async function callTool(name, args) {
  const fn = HANDLERS[name];
  if (!fn) return { isError: true, payload: { error: "unknown_tool", message: `Unknown tool: ${name}` } };
  return fn(args ?? {});
}

let framing = "content-length"; // "content-length" | "lf"

function send(msg) {
  const json = JSON.stringify(msg);
  const payload = Buffer.from(json, "utf8");
  if (framing === "lf") {
    stdout.write(payload);
    stdout.write("\n");
    return;
  }
  stdout.write(`Content-Length: ${payload.length}\r\n\r\n`);
  stdout.write(payload);
}

function ok(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function fail(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

function toolResult(id, { isError, payload }) {
  ok(id, {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    isError: Boolean(isError),
  });
}

async function handle(msg) {
  if (!msg || typeof msg !== "object") return;
  const { id, method } = msg;
  if (id === undefined || id === null) return;

  try {
    switch (method) {
      case "initialize": {
        const requested = msg.params?.protocolVersion;
        ok(id, {
          protocolVersion: requested || PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
        });
        return;
      }
      case "ping":
        ok(id, {});
        return;
      case "tools/list":
        ok(id, { tools: TOOLS });
        return;
      case "tools/call": {
        const name = msg.params?.name;
        const args = msg.params?.arguments ?? {};
        if (!name) {
          fail(id, -32602, "tools/call requires params.name");
          return;
        }
        toolResult(id, await callTool(name, args));
        return;
      }
      default:
        fail(id, -32601, `Method not found: ${method}`);
    }
  } catch (err) {
    fail(id, -32603, err?.message || "Internal error");
  }
}

let buf = Buffer.alloc(0);

function dispatch(body) {
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    return;
  }
  void handle(parsed);
}

function pump() {
  while (buf.length) {
    const asText = buf.toString("utf8");
    if (/^Content-Length\s*:/i.test(asText) || asText.includes("\r\n\r\n")) {
      const sep = buf.indexOf("\r\n\r\n");
      if (sep === -1) return;
      const header = buf.subarray(0, sep).toString("utf8");
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        buf = buf.subarray(sep + 4);
        continue;
      }
      framing = "content-length";
      const len = Number(match[1]);
      const start = sep + 4;
      if (buf.length < start + len) return;
      const body = buf.subarray(start, start + len).toString("utf8");
      buf = buf.subarray(start + len);
      dispatch(body);
      continue;
    }
    const nl = buf.indexOf("\n");
    if (nl === -1) return;
    framing = "lf";
    let line = buf.subarray(0, nl).toString("utf8");
    buf = buf.subarray(nl + 1);
    if (line.endsWith("\r")) line = line.slice(0, -1);
    if (!line.trim()) continue;
    dispatch(line);
  }
}

stdin.on("data", (chunk) => {
  buf = Buffer.concat([buf, chunk]);
  pump();
});
stdin.on("end", () => pump());
stdin.on("error", () => process.exit(1));
if (stdin.isTTY) process.stderr.write("steam-web MCP expects stdio JSON-RPC\n");
stdin.resume();
