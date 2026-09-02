#!/usr/bin/env node
/**
 * Offline mcp.json launcher checks. No Steam, no secrets.
 * Proves Cursor spawn() looks up ./scripts/run-mcp (not bare `node`) and
 * that the posix launcher finds Node even when PATH has none.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { accessSync, constants, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mcp = JSON.parse(readFileSync(join(root, "mcp.json"), "utf8"));
const server = mcp.mcpServers?.["steam-web"];
assert.ok(server, "steam-web server missing from mcp.json");

assert.equal(server.command, "./scripts/run-mcp");
assert.notEqual(server.command, "node");
assert.notEqual(server.command, "cmd.exe");
assert.notEqual(server.command, "node.exe");
assert.ok(!server.args, "launcher execs server.mjs; do not pass ./server.mjs as spawn args");
assert.equal(server.cwd, "${PLUGIN_ROOT}");
assert.equal(server.env?.STEAM_WEB_API_KEY, "${STEAM_WEB_API_KEY}");
assert.equal(server.env?.STEAM_ID, "${STEAM_ID}");
assert.equal(server.env?.PATH, undefined);

const posix = join(root, "scripts/run-mcp");
const win = join(root, "scripts/run-mcp.cmd");
accessSync(posix, constants.X_OK);
assert.ok(statSync(posix).mode & 0o111, "scripts/run-mcp must be executable");
const posixText = readFileSync(posix, "utf8");
assert.ok(posixText.startsWith("#!/bin/sh"));
assert.match(posixText, /command -v node/);
assert.match(posixText, /\/usr\/bin\/node/);
assert.match(posixText, /linuxbrew/);
assert.match(posixText, /\/var\/home\/\*\//);
assert.match(posixText, /\.nvm\/versions\/node/);
assert.match(posixText, /fnm/);
assert.match(posixText, /volta/);
assert.match(posixText, /spawn node ENOENT/);
assert.match(posixText, /not a Steam API failure/);

const cmdText = readFileSync(win, "utf8");
assert.match(cmdText, /where node/i);
assert.match(cmdText, /C:\\Program Files\\nodejs\\node\.exe/);
assert.match(cmdText, /NVM_HOME|nvm/);
assert.match(cmdText, /spawn node ENOENT/);
assert.doesNotMatch(posixText, /windowsworst|dummy/i);
assert.doesNotMatch(cmdText, /windowsworst|dummy/i);

function frame(obj) {
  const json = JSON.stringify(obj);
  const payload = Buffer.from(json, "utf8");
  return Buffer.concat([Buffer.from(`Content-Length: ${payload.length}\r\n\r\n`, "utf8"), payload]);
}

function spawnLauncher(env, { expectFail = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(posix, [], {
      cwd: root,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (c) => {
      stderr += c.toString("utf8");
    });
    child.on("error", reject);
    if (expectFail) {
      child.on("exit", (code) => {
        if (code === 1 && /spawn node ENOENT/.test(stderr) && /not a Steam API failure/.test(stderr)) {
          resolve();
        } else {
          reject(new Error(`expected ENOENT exit 1, got ${code}: ${stderr}`));
        }
      });
      return;
    }
    let buf = Buffer.alloc(0);
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`launcher MCP initialize timed out: ${stderr}`));
    }, 10000);
    child.on("exit", (code) => {
      if (code && code !== null) {
        clearTimeout(timer);
        reject(new Error(`launcher exited ${code}: ${stderr}`));
      }
    });
    child.stdout.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      const sep = buf.indexOf("\r\n\r\n");
      if (sep === -1) return;
      const header = buf.subarray(0, sep).toString("utf8");
      const m = header.match(/Content-Length:\s*(\d+)/i);
      if (!m) return;
      const len = Number(m[1]);
      const start = sep + 4;
      if (buf.length < start + len) return;
      const body = JSON.parse(buf.subarray(start, start + len).toString("utf8"));
      clearTimeout(timer);
      child.kill();
      try {
        assert.equal(body.result?.serverInfo?.name, "steam-web");
        resolve();
      } catch (err) {
        reject(err);
      }
    });
    child.stdin.write(
      frame({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "mcp-launcher-test", version: "0" },
        },
      }),
    );
  });
}

const baseEnv = { ...process.env };
await spawnLauncher(baseEnv);

const stripped = { ...process.env, PATH: "/usr/sbin:/sbin" };
await spawnLauncher(stripped);

const missing = {
  ...process.env,
  PATH: "/usr/sbin:/sbin",
  HOME: "/tmp/steam-web-no-node-home",
  NVM_DIR: "",
  XDG_DATA_HOME: "/tmp/steam-web-no-node-home",
  FNM_MULTISHELL_PATH: "",
  VOLTA_HOME: "",
};
await spawnLauncher(missing, { expectFail: true });

console.log("mcp-path-test: PASS");
