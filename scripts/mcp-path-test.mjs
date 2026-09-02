#!/usr/bin/env node
/**
 * Offline mcp.json spawn checks. No Steam, no secrets.
 * Proves Cursor spawn is bare `node` + ./server.mjs (Windows/Grok Bot).
 * Not /bin/sh, ${NODE}, ${PLUGIN_ROOT}/bin/steam-web-mcp, or a linuxbrew PATH hack.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { accessSync, constants, existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mcp = JSON.parse(readFileSync(join(root, "mcp.json"), "utf8"));
const plugin = JSON.parse(readFileSync(join(root, ".cursor-plugin/plugin.json"), "utf8"));
const server = mcp.mcpServers?.["steam-web"];
assert.ok(server, "steam-web server missing from mcp.json");

assert.equal(server.command, "node");
assert.notEqual(server.command, "/bin/sh");
assert.notEqual(server.command, "node.exe");
assert.notEqual(server.command, "cmd.exe");
assert.notEqual(server.command, "./scripts/run-mcp");
assert.notEqual(server.command, "${NODE}");
assert.notEqual(server.command, "${PLUGIN_ROOT}/bin/steam-web-mcp");
assert.doesNotMatch(server.command, /linuxbrew|Program Files|steam-web-mcp/i);
assert.doesNotMatch(server.command, /\$\{NODE\}|\$\{PLUGIN_ROOT\}/);
assert.deepEqual(server.args, ["./server.mjs"]);
assert.ok(!server.args?.some((a) => String(a).includes("steam-web-mcp")));
assert.equal(server.cwd, "${PLUGIN_ROOT}");
assert.equal(server.env?.STEAM_WEB_API_KEY, "${STEAM_WEB_API_KEY}");
assert.equal(server.env?.STEAM_ID, "${STEAM_ID}");
assert.equal(server.env?.PATH, undefined);
assert.equal(server.env?.NODE, undefined);

assert.equal(plugin.variables?.properties?.NODE, undefined);
assert.ok(!plugin.variables?.required?.includes("NODE"));
assert.ok(plugin.variables.required.includes("STEAM_WEB_API_KEY"));

assert.equal(existsSync(join(root, "bin/steam-web-mcp")), false, "dead linux bun binary must not be in the repo");
assert.equal(existsSync(join(root, "scripts/build-mcp")), false, "build-mcp existed only for the bun binary");
assert.equal(existsSync(join(root, ".gitattributes")), false, ".gitattributes existed only for the bun binary");

const posix = join(root, "scripts/run-mcp");
const win = join(root, "scripts/run-mcp.cmd");
accessSync(posix, constants.X_OK);
assert.ok(statSync(posix).mode & 0o111, "scripts/run-mcp must be executable");
const posixText = readFileSync(posix, "utf8");
assert.ok(posixText.startsWith("#!/bin/sh"));
assert.match(posixText, /exec node/);
assert.doesNotMatch(posixText, /steam-web-mcp|linuxbrew|\$\{NODE\}/i);

const cmdText = readFileSync(win, "utf8");
assert.match(cmdText, /node "%SERVER%"/);
assert.doesNotMatch(cmdText, /steam-web-mcp/i);

function frame(obj) {
  const json = JSON.stringify(obj);
  const payload = Buffer.from(json, "utf8");
  return Buffer.concat([Buffer.from(`Content-Length: ${payload.length}\r\n\r\n`, "utf8"), payload]);
}

function spawnMcp(command, args, env, { cwd = root } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (c) => {
      stderr += c.toString("utf8");
    });
    child.on("error", reject);
    let buf = Buffer.alloc(0);
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`MCP initialize timed out: ${stderr}`));
    }, 15000);
    child.on("exit", (code) => {
      if (code && code !== null) {
        clearTimeout(timer);
        reject(new Error(`process exited ${code}: ${stderr}`));
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

const prevCwd = process.cwd();
process.chdir("/tmp");
try {
  await spawnMcp("node", ["./server.mjs"], process.env, { cwd: root });
  await spawnMcp("/bin/sh", ["./scripts/run-mcp"], process.env, { cwd: root });
} finally {
  process.chdir(prevCwd);
}

console.log("mcp-path-test: PASS");
