#!/usr/bin/env node
/**
 * Offline mcp.json launcher checks. No Steam, no secrets.
 * Proves Cursor spawn() uses ${PLUGIN_ROOT}/bin/steam-web-mcp (empty args),
 * not node / /bin/sh / ./scripts/run-mcp / ${NODE}. The bundled linux-x64
 * binary must initialize without Node on PATH. scripts/run-mcp remains an
 * optional terminal helper.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { accessSync, constants, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mcp = JSON.parse(readFileSync(join(root, "mcp.json"), "utf8"));
const plugin = JSON.parse(readFileSync(join(root, ".cursor-plugin/plugin.json"), "utf8"));
const server = mcp.mcpServers?.["steam-web"];
assert.ok(server, "steam-web server missing from mcp.json");

assert.equal(server.command, "${PLUGIN_ROOT}/bin/steam-web-mcp");
assert.notEqual(server.command, "/bin/sh");
assert.notEqual(server.command, "node");
assert.notEqual(server.command, "node.exe");
assert.notEqual(server.command, "cmd.exe");
assert.notEqual(server.command, "./scripts/run-mcp");
assert.notEqual(server.command, "${NODE}");
assert.doesNotMatch(server.command, /linuxbrew|Program Files/i);
assert.doesNotMatch(server.command, /^\$\{NODE\}/);
assert.deepEqual(server.args, []);
assert.equal(server.cwd, "${PLUGIN_ROOT}");
assert.equal(server.env?.STEAM_WEB_API_KEY, "${STEAM_WEB_API_KEY}");
assert.equal(server.env?.STEAM_ID, "${STEAM_ID}");
assert.equal(server.env?.PATH, undefined);
assert.equal(server.env?.NODE, undefined);

assert.equal(plugin.variables?.properties?.NODE, undefined);
assert.ok(!plugin.variables?.required?.includes("NODE"));
assert.ok(plugin.variables.required.includes("STEAM_WEB_API_KEY"));

const bundled = join(root, "bin/steam-web-mcp");
accessSync(bundled, constants.X_OK);
assert.ok(statSync(bundled).mode & 0o111, "bin/steam-web-mcp must be executable");
const magic = readFileSync(bundled).subarray(0, 4);
assert.deepEqual([...magic], [0x7f, 0x45, 0x4c, 0x46], "bin/steam-web-mcp must be an ELF executable, not a script");
assert.ok(statSync(bundled).size > 1_000_000, "bin/steam-web-mcp is too small to be a bun --compile binary");

const posix = join(root, "scripts/run-mcp");
const win = join(root, "scripts/run-mcp.cmd");
accessSync(posix, constants.X_OK);
assert.ok(statSync(posix).mode & 0o111, "scripts/run-mcp must be executable");
const posixText = readFileSync(posix, "utf8");
assert.ok(posixText.startsWith("#!/bin/sh"));
assert.match(posixText, /Optional terminal helper/);
assert.match(posixText, /\$\{PLUGIN_ROOT\}\/bin\/steam-web-mcp/);
assert.match(posixText, /bin\/steam-web-mcp/);
assert.doesNotMatch(posixText, /windowsworst|dummy/i);

const cmdText = readFileSync(win, "utf8");
assert.match(cmdText, /Optional terminal helper/);
assert.match(cmdText, /steam-web-mcp\.exe/);
assert.doesNotMatch(cmdText, /windowsworst|dummy/i);

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
  const noNode = {
    ...process.env,
    PATH: "/usr/sbin:/sbin",
    HOME: "/tmp/steam-web-no-node-home",
    NVM_DIR: "",
    XDG_DATA_HOME: "/tmp/steam-web-no-node-home",
    FNM_MULTISHELL_PATH: "",
    VOLTA_HOME: "",
  };
  // Cursor spawn shape after ${PLUGIN_ROOT} substitution: absolute bundled binary, no args.
  await spawnMcp(bundled, [], noNode, { cwd: root });
  // Optional terminal helper still prefers the bundled binary (not host Node).
  await spawnMcp("/bin/sh", ["./scripts/run-mcp"], noNode, { cwd: root });
} finally {
  process.chdir(prevCwd);
}

console.log("mcp-path-test: PASS");
