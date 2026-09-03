#!/usr/bin/env node
/**
 * Unit checks for vanity parsing, EResult decode, and error mapping.
 * Mocks fetch — does not invent live Steam data.
 */
import { decodeEResult, parseVanityInput, callTool, SERVER_INFO, TOOLS, HANDLERS, storeAppHint } from "../server.mjs";

function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    console.error(`FAIL ${label}`);
    console.error(" expected", expected);
    console.error(" actual  ", actual);
    process.exit(1);
  }
}

if (SERVER_INFO.version !== "0.2.9") {
  console.error("FAIL SERVER_INFO.version", SERVER_INFO);
  process.exit(1);
}

const NEW_TOOLS = [
  "steam_get_app_details",
  "steam_get_tag_list",
  "steam_get_most_popular_tags",
  "steam_get_localized_name_for_tags",
  "steam_get_games_followed",
  "steam_get_games_followed_count",
  "steam_get_asset_class_info",
];
const toolNames = TOOLS.map((t) => t.name);
const handlerNames = Object.keys(HANDLERS);
if (toolNames.length !== handlerNames.length || toolNames.some((n) => !HANDLERS[n])) {
  console.error("FAIL TOOLS/HANDLERS mismatch", { toolNames, handlerNames });
  process.exit(1);
}
for (const n of NEW_TOOLS) {
  if (!toolNames.includes(n) || !HANDLERS[n]) {
    console.error("FAIL missing new tool", n);
    process.exit(1);
  }
}
eq(storeAppHint({ appid: 440, name: "Team Fortress 2", last_modified: 1 }).name, "Team Fortress 2", "storeAppHint keeps name");

eq(parseVanityInput("gaben"), { vanityurl: "gaben" }, "bare vanity slug");
eq(parseVanityInput("https://steamcommunity.com/id/gaben/"), { vanityurl: "gaben", url_type: 1 }, "full /id/ URL");
eq(parseVanityInput("steamcommunity.com/groups/Valve"), { vanityurl: "Valve", url_type: 2 }, "host /groups/");
eq(
  parseVanityInput("https://steamcommunity.com/profiles/76561198000000000"),
  { steamid: "76561198000000000" },
  "/profiles/ steamid without ResolveVanityURL",
);
eq(decodeEResult(1), "ok", "EResult 1");
eq(decodeEResult(9), "file_not_found", "EResult 9");
eq(decodeEResult(2), 2, "unknown EResult stays numeric");

const calls = [];
const scripted = [];
globalThis.fetch = async (url, init = {}) => {
  const href = String(url);
  calls.push({ href, method: init.method || "GET" });
  const next = scripted.shift();
  if (!next) throw new Error(`unexpected fetch ${href}`);
  return {
    ok: next.status >= 200 && next.status < 300,
    status: next.status,
    headers: new Headers(next.headers || {}),
    text: async () => (typeof next.body === "string" ? next.body : JSON.stringify(next.body ?? {})),
  };
};

async function run(name, args) {
  return callTool(name, args);
}

process.env.STEAM_WEB_API_KEY = "test-key-not-secret";
delete process.env.STEAM_ID;

scripted.push({ status: 200, body: { response: {} } });
const missingOffer = await run("steam_get_trade_offer", { tradeofferid: "99" });
eq(missingOffer.isError, true, "missing offer isError");
eq(missingOffer.payload.error, "not_found", "missing offer not_found not private");

scripted.push({
  status: 200,
  body: { response: { trade_offers_sent: [], trade_offers_received: [] } },
});
const noOffers = await run("steam_get_trade_offer", {});
eq(noOffers.payload.error, "not_found", "no offers not_found");
eq(noOffers.payload.message, "no trade offers", "no offers message");

scripted.push({
  status: 200,
  body: {
    response: {
      trade_offers_sent: [{ tradeofferid: "10" }, { tradeofferid: "11" }],
      trade_offers_received: [],
    },
  },
});
const several = await run("steam_get_trade_offer", {});
eq(several.payload.error, "need_tradeofferid", "several offers need id");
eq(several.payload.offer_ids, ["10", "11"], "offer_ids listed");

scripted.push({ status: 200, body: { response: {} } });
const badge = await run("steam_get_community_badge_progress", { steamid: "1", badgeid: 2 });
eq(badge.isError, undefined, "empty quests not error");
eq(badge.payload.quests, [], "empty quests array");
eq(badge.payload.error, undefined, "empty quests not private");

scripted.push({
  status: 200,
  body: { response: { result: 1, publishedfiledetails: [{ publishedfileid: "9", result: 9 }] } },
});
const pub = await run("steam_get_published_file_details", { publishedfileids: "9" });
eq(pub.payload.files?.[0]?.result, 9, "published file eresult 9");
eq(pub.payload.files?.[0]?.result_name, "file_not_found", "published file eresult 9 name");
eq(pub.payload.error, undefined, "item 9 is not whole-payload private");

scripted.push({ status: 200, body: { response: { total: 0, publishedfiledetails: [] } } });
const emptyWs = await run("steam_get_published_file_details", { appid: 70 });
eq(emptyWs.payload.files, [], "no workshop items is empty files");
eq(emptyWs.payload.error, undefined, "empty workshop is not an error");
if (calls.some((c) => /publishedfileids/.test(c.href) && /[=[]1\b/.test(c.href))) {
  console.error("FAIL must not invent publishedfileid 1");
  process.exit(1);
}

scripted.push({ status: 200, body: { response: { badges: [{ badgeid: 2 }] } } });
scripted.push({ status: 200, body: { response: {} } });
const badgeOmit = await run("steam_get_community_badge_progress", { steamid: "2" });
eq(badgeOmit.payload.badges, [{ badgeid: 2, quests: [] }], "omit badgeid uses community badge 2");

scripted.push({ status: 404, body: { status: { code: 9 } } });
const ugc404 = await run("steam_get_ugc_file_details", { ugcid: "abc", appid: 440 });
eq(ugc404.payload.error, "file_not_found", "UGC status 9 is file_not_found");

scripted.push({ status: 404, body: "not found" });
const ugcHttp = await run("steam_get_ugc_file_details", { ugcid: "abc", appid: 440 });
eq(ugcHttp.payload.error, "not_found", "UGC HTTP 404 is not_found");

scripted.push({ status: 401, body: "{}" });
const friends = await run("steam_get_friends", { steamid: "1" });
eq(friends.payload.error, "private_or_unavailable", "friends 401 stays private");
eq(friends.payload.message, "Friend list forbidden or unavailable", "friends 401 message");
eq(friends.payload.status, undefined, "friends 401 is not raw http_error status");

const noVersion = await run("steam_up_to_date_check", { appid: 440 });
eq(noVersion.payload.error, "invalid_arguments", "up-to-date requires caller version");

const noAddr = await run("steam_get_servers_at_address", {});
eq(noAddr.payload.error, "invalid_arguments", "servers require addr or in-session gameserverip");
eq(
  noAddr.payload.message,
  "addr is required (or be in a multiplayer session so profile gameserverip is set)",
  "servers omit-addr message",
);
if (calls.some((c) => /GetServersAtAddress|GetServerList/.test(c.href))) {
  console.error("FAIL omit addr without STEAM_ID must not call GetServersAtAddress or GetServerList");
  process.exit(1);
}

process.env.STEAM_ID = "76561198000000000";
scripted.push({
  status: 200,
  body: { response: { players: [{ steamid: "76561198000000000", personaname: "x", gameid: "440" }] } },
});
const noGameServerIp = await run("steam_get_servers_at_address", {});
eq(noGameServerIp.payload.error, "invalid_arguments", "in-game without gameserverip is invalid_arguments");
if (calls.some((c) => /GetServersAtAddress|GetServerList|127\.0\.0\.1/.test(c.href))) {
  console.error("FAIL missing gameserverip must not call GetServersAtAddress, GetServerList, or invent 127.0.0.1");
  process.exit(1);
}
if (!calls.some((c) => /GetPlayerSummaries/.test(c.href))) {
  console.error("FAIL omit addr with STEAM_ID must call GetPlayerSummaries");
  process.exit(1);
}

scripted.push({
  status: 200,
  body: {
    response: {
      players: [{ steamid: "76561198000000000", personaname: "x", gameserverip: "0.0.0.0:0" }],
    },
  },
});
const zeroIp = await run("steam_get_servers_at_address", {});
eq(zeroIp.payload.error, "invalid_arguments", "0.0.0.0:0 gameserverip is not a session addr");
if (calls.filter((c) => /GetServersAtAddress/.test(c.href)).length) {
  console.error("FAIL dummy 0.0.0.0:0 must not call GetServersAtAddress");
  process.exit(1);
}

scripted.push({
  status: 200,
  body: {
    response: {
      players: [{ steamid: "76561198000000000", gameserverip: "[203.0.113.10]:27015" }],
    },
  },
});
scripted.push({
  status: 200,
  body: { response: { success: true, servers: [{ addr: "203.0.113.10:27015", appid: 440 }] } },
});
const gathered = await run("steam_get_servers_at_address", {});
eq(gathered.payload.success, true, "gathered gameserverip GetServersAtAddress success");
eq(gathered.payload.servers?.[0]?.appid, 440, "gathered servers payload");
const gatheredCall = [...calls].reverse().find((c) => /GetServersAtAddress/.test(c.href));
if (!gatheredCall || !/addr=203\.0\.113\.10%3A27015|addr=203\.0\.113\.10:27015/.test(gatheredCall.href)) {
  console.error("FAIL gathered addr must be gameserverip with brackets stripped", gatheredCall?.href);
  process.exit(1);
}
if (calls.some((c) => /GetServerList/.test(c.href))) {
  console.error("FAIL must not call partner GetServerList");
  process.exit(1);
}

const beforeProvided = calls.length;
scripted.push({
  status: 200,
  body: { response: { success: true, servers: [] } },
});
const provided = await run("steam_get_servers_at_address", { addr: "198.51.100.20:27015" });
eq(provided.payload.success, true, "provided addr success");
const providedCalls = calls.slice(beforeProvided);
if (providedCalls.some((c) => /GetPlayerSummaries/.test(c.href))) {
  console.error("FAIL provided addr must not call GetPlayerSummaries");
  process.exit(1);
}
if (!providedCalls.some((c) => /GetServersAtAddress/.test(c.href) && /198\.51\.100\.20/.test(c.href))) {
  console.error("FAIL provided addr must call GetServersAtAddress with that addr");
  process.exit(1);
}
delete process.env.STEAM_ID;

scripted.push({ status: 200, body: { response: { success: false, error: "Couldn't get app info for the app specified." } } });
const outdated = await run("steam_up_to_date_check", { appid: 1, version: 1 });
eq(outdated.payload.success, false, "Valve success:false passed through");
eq(outdated.payload.error, undefined, "success:false not private");

if (calls.some((c) => /GetSchemaForGame/.test(c.href))) {
  console.error("FAIL up-to-date must not call GetSchemaForGame");
  process.exit(1);
}

scripted.push({
  status: 200,
  body: {
    response: {
      apps: [{ appid: 440, name: "Team Fortress 2", last_modified: 1, price_change_number: 2 }],
      have_more_results: false,
      last_appid: 440,
    },
  },
});
const listed = await run("steam_get_app_list", { max_results: 1 });
eq(listed.payload.apps?.[0]?.name, "Team Fortress 2", "GetAppList storeAppHint includes name");
eq(listed.payload.apps?.[0]?.appid, 440, "GetAppList appid");

const commaApp = await run("steam_get_app_details", { appid: "427520,440" });
eq(commaApp.payload.error, "invalid_arguments", "comma appids rejected");
if (calls.some((c) => /store\.steampowered\.com/.test(c.href))) {
  console.error("FAIL comma appids must not hit storefront");
  process.exit(1);
}

scripted.push({ status: 400, body: null });
const zeroApp = await run("steam_get_app_details", { appid: 0 });
eq(zeroApp.isError, true, "appid 0 isError");
eq(zeroApp.payload.error, "http_error", "appid 0 http_error");
eq(zeroApp.payload.status, 400, "appid 0 status 400");

scripted.push({ status: 200, body: { "1": { success: false } } });
const missingApp = await run("steam_get_app_details", { appid: 1 });
eq(missingApp.payload.error, "not_found", "success:false is not_found");
eq(missingApp.isError, true, "success:false isError");
eq(missingApp.payload.error === "private_or_unavailable", false, "success:false is not private");

const factorioBody = {
  "427520": {
    success: true,
    data: {
      steam_appid: 427520,
      name: "Factorio",
      type: "game",
      is_free: false,
      short_description: "Factory game",
      developers: ["Wube Software"],
      publishers: ["Wube Software"],
      website: "https://www.factorio.com",
      header_image: "https://example.com/header.jpg",
      platforms: { windows: true, mac: true, linux: true },
      release_date: { coming_soon: false, date: "Aug 14, 2020" },
      categories: [{ id: 2, description: "Single-player" }],
      genres: [{ id: "70", description: "Early Access" }],
      price_overview: {
        currency: "USD",
        initial: 3500,
        final: 3500,
        discount_percent: 0,
        initial_formatted: "",
        final_formatted: "$35.00",
      },
      detailed_description: "<p>huge html</p>",
      about_the_game: "<p>huge html</p>",
      pc_requirements: { minimum: "huge" },
    },
  },
};
scripted.push({ status: 200, body: factorioBody });
const factorio = await run("steam_get_app_details", { appid: 427520, cc: "us" });
eq(factorio.payload.name, "Factorio", "Factorio name");
eq(factorio.payload.is_free, false, "Factorio not free");
eq(factorio.payload.price_overview?.final_formatted, "$35.00", "Factorio price");
eq(factorio.payload.detailed_description, undefined, "omit huge HTML");
eq(factorio.payload.pc_requirements, undefined, "omit pc_requirements");
const storeCalls = calls.filter((c) => /store\.steampowered\.com\/api\/appdetails/.test(c.href));
if (!storeCalls.some((c) => /appids=427520/.test(c.href) && /cc=us/.test(c.href))) {
  console.error("FAIL Factorio storefront query", storeCalls);
  process.exit(1);
}
if (storeCalls.some((c) => /[?&]key=/.test(c.href))) {
  console.error("FAIL storefront must not send key=", storeCalls);
  process.exit(1);
}

const cached = await run("steam_get_app_details", { appid: 427520, cc: "us" });
eq(cached.payload.name, "Factorio", "cached Factorio");
if (calls.filter((c) => /store\.steampowered\.com\/api\/appdetails/.test(c.href)).length !== storeCalls.length) {
  console.error("FAIL successful appdetails should be cached");
  process.exit(1);
}

scripted.push({
  status: 200,
  body: {
    "440": {
      success: true,
      data: {
        steam_appid: 440,
        name: "Team Fortress 2",
        type: "game",
        is_free: true,
        short_description: "Hats",
        developers: ["Valve"],
        publishers: ["Valve"],
        platforms: { windows: true, mac: true, linux: true },
        release_date: { coming_soon: false, date: "Oct 10, 2007" },
        categories: [],
        genres: [],
      },
    },
  },
});
const tf2 = await run("steam_get_app_details", { appid: 440 });
eq(tf2.payload.is_free, true, "TF2 free");
eq(tf2.payload.price_overview, undefined, "TF2 omits price_overview");

scripted.push({
  status: 200,
  headers: { "x-eresult": "29" },
  body: { response: {} },
});
const notModified = await run("steam_get_tag_list", { have_version_hash: "abc" });
eq(notModified.payload.tags, [], "eresult 29 empty tags");
eq(notModified.payload.version_hash, "abc", "eresult 29 keeps hash");
eq(notModified.payload.error, undefined, "eresult 29 is not an error");

scripted.push({
  status: 200,
  headers: { "x-eresult": "1" },
  body: { response: { version_hash: "v1", tags: [{ tagid: 19, name: "Action" }] } },
});
const tags = await run("steam_get_tag_list", {});
eq(tags.payload.tags, [{ tagid: 19, name: "Action" }], "tag list shape");
eq(tags.payload.version_hash, "v1", "tag list hash");
const tagCall = [...calls].reverse().find((c) => /GetTagList/.test(c.href));
if (!tagCall || !/input_json=/.test(tagCall.href) || /input_json=.*key/.test(decodeURIComponent(tagCall.href))) {
  console.error("FAIL GetTagList must use input_json without key inside it", tagCall?.href);
  process.exit(1);
}

scripted.push({
  status: 200,
  body: {
    result: {
      success: true,
      "195": {
        classid: "195",
        name: "Gloves of Running Urgently",
        market_name: "Gloves of Running Urgently",
        type: "Level 10 Gloves",
        tradable: "1",
        marketable: "0",
        icon_url: "abc",
        tags: { "0": { name: "Unique" }, "1": { name: "Gloves" } },
        descriptions: { "0": { value: "desc" } },
        app_data: { def_index: "239" },
      },
    },
  },
});
const gru = await run("steam_get_asset_class_info", { appid: 440, classids: [195] });
eq(gru.payload.items?.[0]?.name, "Gloves of Running Urgently", "GRU name");
eq(gru.payload.items?.[0]?.tradable, true, "GRU tradable normalized");
eq(gru.payload.items?.[0]?.marketable, false, "GRU marketable normalized");
eq(gru.payload.items?.[0]?.tags?.length, 2, "GRU tags array");
eq(gru.payload.items?.[0]?.descriptions?.length, 1, "GRU descriptions array");
const classCall = [...calls].reverse().find((c) => /GetAssetClassInfo/.test(c.href));
if (!classCall || !/classid0=195/.test(classCall.href) || !/class_count=1/.test(classCall.href) || /input_json=/.test(classCall.href)) {
  console.error("FAIL GetAssetClassInfo must be keyed classid0 GET, not input_json", classCall?.href);
  process.exit(1);
}

scripted.push({ status: 200, body: { result: { success: false, error: "Invalid or missing classid" } } });
const badClass = await run("steam_get_asset_class_info", { appid: 440, classids: [1] });
eq(badClass.payload.error, "not_found", "bogus classid not_found");
eq(badClass.payload.error === "private_or_unavailable", false, "bogus classid is not private");

scripted.push({ status: 401, body: {} });
const followed401 = await run("steam_get_games_followed", { steamid: "1" });
eq(followed401.payload.error, "private_or_unavailable", "IStore GET 401 is private");
eq(followed401.isError, undefined, "IStore 401 has no isError");

const noFollowId = await run("steam_get_games_followed", {});
eq(noFollowId.payload.error, "invalid_arguments", "followed requires steamid");
const noCountId = await run("steam_get_games_followed_count", {});
eq(noCountId.payload.error, "invalid_arguments", "followed count requires steamid");
const noTags = await run("steam_get_localized_name_for_tags", {});
eq(noTags.payload.error, "invalid_arguments", "localized tags require tagids");
const noClassids = await run("steam_get_asset_class_info", { appid: 440 });
eq(noClassids.payload.error, "invalid_arguments", "asset class info requires classids");

console.log("PASS mapping");
