#!/usr/bin/env node
/**
 * Unit checks for vanity parsing, EResult decode, and error mapping.
 * Mocks fetch — does not invent live Steam data.
 */
import { decodeEResult, parseVanityInput, callTool, SERVER_INFO } from "../server.mjs";

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

if (SERVER_INFO.version !== "0.2.8") {
  console.error("FAIL SERVER_INFO.version", SERVER_INFO);
  process.exit(1);
}

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

console.log("PASS mapping");
