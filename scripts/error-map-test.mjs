#!/usr/bin/env node
/**
 * Offline error-mapping and optional-gathering checks. Mocks fetch.
 * Does not call api.steampowered.com and does not use secrets.
 */
import assert from "node:assert/strict";
import {
  parseVanityInput,
  eresultName,
  slimPublishedFile,
  slimCollection,
  callTool,
  SERVER_INFO,
} from "../server.mjs";

assert.equal(SERVER_INFO.version, "0.2.5");

const vanityUrl = parseVanityInput("https://steamcommunity.com/id/ExampleUser/");
assert.equal(vanityUrl.vanityurl, "ExampleUser");
assert.equal(vanityUrl.url_type, 1);

const vanityGroup = parseVanityInput("https://steamcommunity.com/groups/ExampleGroup");
assert.equal(vanityGroup.vanityurl, "ExampleGroup");
assert.equal(vanityGroup.url_type, 2);

const vanityGid = parseVanityInput("steamcommunity.com/gid/103582791429521412");
assert.equal(vanityGid.steamid, "103582791429521412");

const vanityProfile = parseVanityInput("https://steamcommunity.com/profiles/76561198000000000/");
assert.equal(vanityProfile.steamid, "76561198000000000");

const vanitySlug = parseVanityInput("ExampleUser");
assert.equal(vanitySlug.vanityurl, "ExampleUser");

assert.equal(eresultName(1), "ok");
assert.equal(eresultName(9), "file_not_found");
assert.equal(eresultName(2), undefined);

const fileOk = slimPublishedFile({ publishedfileid: "10", result: 1, title: "ok" });
assert.equal(fileOk.result, 1);
assert.equal(fileOk.result_name, "ok");
const fileMissing = slimPublishedFile({ publishedfileid: "1", result: 9 });
assert.equal(fileMissing.result, 9);
assert.equal(fileMissing.result_name, "file_not_found");

const col = slimCollection({ publishedfileid: "2", result: 9, children: [] });
assert.equal(col.result_name, "file_not_found");

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function routeOf(url) {
  const u = new URL(url);
  return `${u.pathname}`;
}

const calls = [];
const origFetch = globalThis.fetch;
process.env.STEAM_WEB_API_KEY = "test-key-not-real";
process.env.STEAM_ID = "76561198000000000";

globalThis.fetch = async (url, init = {}) => {
  const href = String(url);
  calls.push({ href, method: init.method || "GET" });
  const path = routeOf(href);

  if (path.includes("/IEconService/GetTradeOffer/")) {
    return jsonResponse({ response: {} });
  }
  if (path.includes("/IEconService/GetTradeOffers/")) {
    const q = decodeURIComponent(new URL(href).searchParams.get("input_json") || "{}");
    const parsed = JSON.parse(q || "{}");
    if (parsed.active_only && !globalThis.__offers) return jsonResponse({ response: {} });
    return jsonResponse({
      response: {
        trade_offers_sent: globalThis.__offers?.sent ?? [],
        trade_offers_received: globalThis.__offers?.received ?? [],
      },
    });
  }
  if (path.includes("/IPlayerService/GetCommunityBadgeProgress/")) {
    const q = JSON.parse(decodeURIComponent(new URL(href).searchParams.get("input_json") || "{}"));
    if (q.badgeid === 13 || q.badgeid === 1) return jsonResponse({ response: {} });
    if (q.badgeid === 2) return jsonResponse({ response: { quests: [{ questid: 1, completed: true }] } });
    return jsonResponse({ response: { quests: [] } });
  }
  if (path.includes("/IPlayerService/GetBadges/")) {
    return jsonResponse({
      response: {
        badges: [
          { badgeid: 2, level: 1 },
          { badgeid: 13, level: 1 },
          { badgeid: 1, level: 1 },
          { badgeid: 99, appid: 440, level: 1 },
        ],
      },
    });
  }
  if (path.includes("/ISteamRemoteStorage/GetPublishedFileDetails/")) {
    return jsonResponse({
      response: {
        result: 1,
        publishedfiledetails: [{ publishedfileid: "1", result: 9 }],
      },
    });
  }
  if (path.includes("/ISteamRemoteStorage/GetCollectionDetails/")) {
    return jsonResponse({
      response: {
        collectiondetails: [{ publishedfileid: "1", result: 9, children: [] }],
      },
    });
  }
  if (path.includes("/ISteamRemoteStorage/GetUGCFileDetails/")) {
    return new Response(JSON.stringify({ status: { code: 9 } }), { status: 404 });
  }
  if (path.includes("/IPublishedFileService/QueryFiles/")) {
    return jsonResponse({ response: { total: 0, publishedfiledetails: [] } });
  }
  if (path.includes("/ISteamUser/GetFriendList/")) {
    return new Response("{}", { status: 401, headers: { "Content-Type": "application/json" } });
  }
  if (path.includes("/IPlayerService/GetOwnedGames/")) {
    return new Response("{}", { status: 403, headers: { "Content-Type": "application/json" } });
  }
  if (path.includes("/ISteamUserStats/GetSchemaForGame/")) {
    return jsonResponse({ game: { gameName: "Test", gameVersion: "123" } });
  }
  if (path.includes("/ISteamApps/UpToDateCheck/")) {
    const u = new URL(href);
    const version = u.searchParams.get("version");
    const appid = u.searchParams.get("appid");
    if (appid === "1") {
      return jsonResponse({
        response: { success: false, message: "Couldn't get app info for the app specified." },
      });
    }
    return jsonResponse({
      response: { success: true, up_to_date: version === "123", required_version: 123 },
    });
  }
  if (path.includes("/ISteamUser/GetPlayerSummaries/")) {
    const players = globalThis.__summaries ?? [{ steamid: "76561198000000000", personaname: "x" }];
    return jsonResponse({ response: { players } });
  }
  if (path.includes("/ISteamApps/GetServersAtAddress/")) {
    const addr = new URL(href).searchParams.get("addr") || "";
    return jsonResponse({
      response: { success: true, servers: addr ? [{ addr, appid: 440 }] : [] },
    });
  }
  if (path.includes("/IGameServersService/GetServerList/") || path.includes("/GetServerList/")) {
    throw new Error(`must not call GetServerList ${href}`);
  }
  if (path.includes("/ISteamUser/ResolveVanityURL/")) {
    return jsonResponse({ response: { success: 42, message: "No match" } });
  }
  throw new Error(`unexpected fetch ${href}`);
};

function payloadOf(result) {
  return result.payload;
}

{
  const r = await callTool("steam_get_trade_offer", { tradeofferid: "0" });
  assert.equal(r.isError, true);
  assert.equal(payloadOf(r).error, "not_found");
}

{
  globalThis.__offers = { sent: [], received: [] };
  const r = await callTool("steam_get_trade_offer", {});
  assert.equal(r.isError, true);
  assert.equal(payloadOf(r).error, "not_found");
  assert.match(payloadOf(r).message, /no trade offers/i);
}

{
  globalThis.__offers = {
    sent: [{ tradeofferid: "11" }, { tradeofferid: "12" }],
    received: [],
  };
  const r = await callTool("steam_get_trade_offer", {});
  assert.equal(r.isError, true);
  assert.equal(payloadOf(r).error, "need_tradeofferid");
  assert.deepEqual(payloadOf(r).offer_ids, ["11", "12"]);
}

{
  globalThis.__offers = { sent: [{ tradeofferid: "99", is_our_offer: true }], received: [] };
  const r = await callTool("steam_get_trade_offer", {});
  assert.equal(r.isError, undefined);
  assert.equal(r.payload.offer.tradeofferid, "99");
}

{
  const r = await callTool("steam_get_community_badge_progress", { badgeid: 13 });
  assert.equal(r.isError, undefined);
  assert.deepEqual(r.payload.quests, []);
  assert.equal(r.payload.badgeid, 13);
  assert.notEqual(r.payload.error, "private_or_unavailable");
}

{
  const r = await callTool("steam_get_community_badge_progress", {});
  assert.equal(r.isError, undefined);
  assert.ok(Array.isArray(r.payload.badges));
  assert.equal(r.payload.badges.some((b) => b.badgeid === 2), true);
  assert.equal(r.payload.badges.some((b) => b.badgeid === 13), false);
  assert.equal(r.payload.badges.some((b) => b.badgeid === 99), false);
}

{
  const r = await callTool("steam_get_published_file_details", { publishedfileids: "1" });
  assert.equal(r.payload.files[0].result, 9);
  assert.equal(r.payload.files[0].result_name, "file_not_found");
  assert.notEqual(r.payload.error, "private_or_unavailable");
}

{
  const r = await callTool("steam_get_published_file_details", { appid: 1174180 });
  assert.deepEqual(r.payload.files, []);
  assert.match(r.payload.message, /no workshop/i);
}

{
  const r = await callTool("steam_get_collection_details", { publishedfileids: "1" });
  assert.equal(r.payload.collections[0].result_name, "file_not_found");
}

{
  const r = await callTool("steam_get_ugc_file_details", { ugcid: "1", appid: 440 });
  assert.equal(r.isError, true);
  assert.ok(r.payload.error === "file_not_found" || r.payload.error === "not_found");
  assert.notEqual(r.payload.error, "http_error");
  assert.notEqual(r.payload.error, "private_or_unavailable");
}

{
  const r = await callTool("steam_get_ugc_file_details", { appid: 440 });
  assert.equal(r.isError, true);
  assert.equal(r.payload.error, "invalid_arguments");
}

{
  const before = calls.length;
  const r = await callTool("steam_get_friends", { steamid: "76561198000000000" });
  assert.equal(r.payload.error, "private_or_unavailable");
  assert.match(r.payload.message, /Friend list forbidden or unavailable/i);
  assert.notEqual(r.payload.error, "http_error");
  assert.notEqual(r.payload.message, "{}");
  assert.ok(
    calls.slice(before).some((c) => c.href.includes("GetFriendList")),
    "friends 401 should still call GetFriendList",
  );
}

{
  const r = await callTool("steam_get_owned_games", { steamid: "76561198000000000" });
  assert.equal(r.payload.error, "private_or_unavailable");
  assert.notEqual(r.payload.error, "http_error");
  assert.notEqual(r.payload.message, "{}");
}

{
  const before = calls.length;
  const r = await callTool("steam_up_to_date_check", { appid: 440 });
  assert.equal(r.isError, true);
  assert.equal(r.payload.error, "invalid_arguments");
  assert.match(r.payload.message, /installed depot version/i);
  assert.equal(
    calls.slice(before).some((c) => c.href.includes("UpToDateCheck") || c.href.includes("GetSchemaForGame")),
    false,
    "must not call Valve without a numeric installed version",
  );
}

{
  const before = calls.length;
  const empty = await callTool("steam_up_to_date_check", { appid: 440, version: "" });
  assert.equal(empty.payload.error, "invalid_arguments");
  const bogus = await callTool("steam_up_to_date_check", { appid: 440, version: "latest" });
  assert.equal(bogus.payload.error, "invalid_arguments");
  assert.equal(
    calls.slice(before).some((c) => c.href.includes("UpToDateCheck") || c.href.includes("GetSchemaForGame")),
    false,
    "empty/non-numeric version must not hit Valve",
  );
}

{
  const r = await callTool("steam_up_to_date_check", { appid: 440, version: 1 });
  assert.equal(r.payload.success, true);
  assert.equal(r.payload.up_to_date, false);
  assert.equal(r.payload.required_version, 123);
}

{
  const r = await callTool("steam_up_to_date_check", { appid: 1, version: 1 });
  assert.equal(r.payload.success, false);
  assert.notEqual(r.payload.error, "private_or_unavailable");
}

{
  const r = await callTool("steam_resolve_vanity", {
    vanityurl: "https://steamcommunity.com/profiles/76561198000000000",
  });
  assert.equal(r.payload.steamid, "76561198000000000");
  assert.equal(
    calls.some((c) => c.href.includes("ResolveVanityURL")),
    false,
    "must not call ResolveVanityURL for /profiles/",
  );
}

{
  globalThis.__summaries = [{ steamid: "76561198000000000", personaname: "offline" }];
  const before = calls.length;
  const r = await callTool("steam_get_servers_at_address", {});
  assert.equal(r.isError, true);
  assert.equal(r.payload.error, "invalid_arguments");
  assert.match(r.payload.message, /gameserverip/i);
  assert.equal(
    calls.slice(before).some((c) => c.href.includes("GetServersAtAddress") || c.href.includes("GetServerList") || c.href.includes("127.0.0.1")),
    false,
    "missing gameserverip must not call GetServersAtAddress, GetServerList, or invent 127.0.0.1",
  );
  assert.equal(
    calls.slice(before).some((c) => c.href.includes("GetPlayerSummaries")),
    true,
    "omit addr should gather via GetPlayerSummaries",
  );
}

{
  globalThis.__summaries = [
    { steamid: "76561198000000000", gameserverip: "[203.0.113.50]:27015", gameextrainfo: "Team Fortress 2" },
  ];
  const before = calls.length;
  const r = await callTool("steam_get_servers_at_address", {});
  assert.equal(r.payload.success, true);
  assert.equal(r.payload.servers[0].addr, "203.0.113.50:27015");
  const slice = calls.slice(before);
  assert.equal(
    slice.some((c) => c.href.includes("GetPlayerSummaries")),
    true,
  );
  const addrCall = slice.find((c) => c.href.includes("GetServersAtAddress"));
  assert.ok(addrCall);
  assert.match(addrCall.href, /203\.0\.113\.50/);
  assert.equal(slice.some((c) => c.href.includes("GetServerList")), false);
}

{
  const before = calls.length;
  const r = await callTool("steam_get_servers_at_address", { addr: "198.51.100.8:27015" });
  assert.equal(r.payload.success, true);
  const slice = calls.slice(before);
  assert.equal(
    slice.some((c) => c.href.includes("GetPlayerSummaries")),
    false,
    "provided addr must not gather summaries",
  );
  assert.equal(
    slice.some((c) => c.href.includes("GetServersAtAddress") && c.href.includes("198.51.100.8")),
    true,
  );
}

{
  const r = await callTool("steam_query_files", { appid: 1174180, creator_id: "76561198000000000" });
  assert.deepEqual(r.payload.files, []);
  const q = [...calls].reverse().find((c) => c.href.includes("QueryFiles"));
  assert.ok(q);
  const input = JSON.parse(decodeURIComponent(new URL(q.href).searchParams.get("input_json")));
  assert.equal(input.creatorid, "76561198000000000");
}

globalThis.fetch = origFetch;
delete process.env.STEAM_WEB_API_KEY;
delete process.env.STEAM_ID;
console.log("PASS error-map-test");
