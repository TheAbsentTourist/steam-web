#!/usr/bin/env node
/**
 * Live MCP smoke: initialize, tools/list, steam_get_news appid 440.
 * Spawns node ./server.mjs (Grok Bot / direct-run path).
 * Asserts a title that also appears on api.steampowered.com. Does not fake data.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const APPID = 440;
const NEWS_URL = `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${APPID}&count=5`;

function frame(obj) {
  const json = JSON.stringify(obj);
  const payload = Buffer.from(json, "utf8");
  return Buffer.concat([Buffer.from(`Content-Length: ${payload.length}\r\n\r\n`, "utf8"), payload]);
}

function readMessages(child, count, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0);
    const out = [];
    const timer = setTimeout(() => reject(new Error("MCP smoke timed out waiting for responses")), timeoutMs);
    const onData = (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (true) {
        const sep = buf.indexOf("\r\n\r\n");
        if (sep === -1) break;
        const header = buf.subarray(0, sep).toString("utf8");
        const m = header.match(/Content-Length:\s*(\d+)/i);
        if (!m) {
          buf = buf.subarray(sep + 4);
          continue;
        }
        const len = Number(m[1]);
        const start = sep + 4;
        if (buf.length < start + len) break;
        const body = JSON.parse(buf.subarray(start, start + len).toString("utf8"));
        buf = buf.subarray(start + len);
        out.push(body);
        if (out.length >= count) {
          clearTimeout(timer);
          child.stdout.off("data", onData);
          resolve(out);
          return;
        }
      }
    };
    child.stdout.on("data", onData);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("exit", (code) => {
      if (out.length < count) {
        clearTimeout(timer);
        reject(new Error(`server exited ${code} before ${count} MCP replies`));
      }
    });
  });
}

const live = await fetch(NEWS_URL, { signal: AbortSignal.timeout(15000) });
if (!live.ok) {
  console.error(`FAIL live Steam news HTTP ${live.status}`);
  process.exit(1);
}
const liveJson = await live.json();
const liveTitles = (liveJson?.appnews?.newsitems ?? []).map((n) => n.title).filter(Boolean);
if (liveTitles.length === 0) {
  console.error("FAIL api.steampowered.com returned no news titles for appid 440");
  process.exit(1);
}

const child = spawn("node", ["./server.mjs"], { cwd: root, stdio: ["pipe", "pipe", "inherit"] });
const repliesP = readMessages(child, 3);

child.stdin.write(
  frame({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "steam-web-smoke", version: "0.1.0" },
    },
  }),
);
child.stdin.write(frame({ jsonrpc: "2.0", method: "notifications/initialized" }));
child.stdin.write(frame({ jsonrpc: "2.0", id: 2, method: "tools/list" }));
child.stdin.write(
  frame({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "steam_get_news", arguments: { appid: APPID, count: 5 } },
  }),
);
child.stdin.end();

const replies = await repliesP;
child.kill("SIGTERM");

const init = replies.find((m) => m.id === 1);
const list = replies.find((m) => m.id === 2);
const call = replies.find((m) => m.id === 3);

if (init?.result?.serverInfo?.name !== "steam-web") {
  console.error("FAIL initialize serverInfo", init);
  process.exit(1);
}
const names = (list?.result?.tools ?? []).map((t) => t.name);
const NEW_TOOLS = [
  "steam_get_app_details",
  "steam_get_tag_list",
  "steam_get_most_popular_tags",
  "steam_get_localized_name_for_tags",
  "steam_get_games_followed",
  "steam_get_games_followed_count",
  "steam_get_asset_class_info",
];
if (!names.includes("steam_get_news") || names.length !== 35) {
  console.error("FAIL tools/list count", names.length, names);
  process.exit(1);
}
const missingNew = NEW_TOOLS.filter((n) => !names.includes(n));
if (missingNew.length) {
  console.error("FAIL tools/list missing", missingNew);
  process.exit(1);
}
if (call?.result?.isError) {
  console.error("FAIL steam_get_news isError", call);
  process.exit(1);
}
const payload = JSON.parse(call?.result?.content?.[0]?.text ?? "{}");
const mcpTitles = (payload.news ?? []).map((n) => n.title).filter(Boolean);
const overlap = mcpTitles.filter((t) => liveTitles.includes(t));
if (overlap.length === 0) {
  console.error("FAIL no overlapping news title between MCP and api.steampowered.com");
  console.error("live:", liveTitles);
  console.error("mcp:", mcpTitles);
  process.exit(1);
}

console.log("PASS steam_get_news");
console.log(`live_title: ${overlap[0]}`);
console.log(`tools: ${names.join(", ")}`);
console.log(`protocolVersion: ${init.result.protocolVersion}`);
