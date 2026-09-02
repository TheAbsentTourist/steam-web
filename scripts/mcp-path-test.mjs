#!/usr/bin/env node
/**
 * Offline mcp.json spawn-PATH checks. No Steam, no secrets.
 * Proves command stays `node` (not /bin/sh, not ./scripts/run-mcp, not
 * ${NODE}), args use ${PLUGIN_ROOT}/server.mjs, and PATH prepends
 * well-known Node dirs without dropping ${PATH}. scripts/run-mcp remains
 * an optional terminal helper only.
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

assert.equal(server.command, "node");
assert.notEqual(server.command, "/bin/sh");
assert.notEqual(server.command, "${NODE}");
assert.notEqual(server.command, "node.exe");
assert.notEqual(server.command, "cmd.exe");
assert.notEqual(server.command, "./scripts/run-mcp");
assert.doesNotMatch(server.command, /linuxbrew|Program Files/i);
// Confirmed in Cursor logs: plugin variables in `command` are not interpolated
// (`spawn ${NODE} ENOENT`). Placeholders belong in args / env / cwd only.
assert.doesNotMatch(server.command, /\$\{/);
assert.deepEqual(server.args, ["${PLUGIN_ROOT}/server.mjs"]);
assert.equal(server.cwd, "${PLUGIN_ROOT}");
assert.equal(server.env?.STEAM_WEB_API_KEY, "${STEAM_WEB_API_KEY}");
assert.equal(server.env?.STEAM_ID, "${STEAM_ID}");

const pathTemplate = server.env?.PATH;
assert.equal(typeof pathTemplate, "string");
assert.match(pathTemplate, /\$\{PATH\}/);
assert.ok(pathTemplate.endsWith("${PATH}"), "PATH template must append ${PATH}, not replace it");
assert.match(pathTemplate, /\/home\/linuxbrew\/\.linuxbrew\/bin/);
assert.match(pathTemplate, /\$\{HOME\}\/\.linuxbrew\/bin/);
assert.match(pathTemplate, /\/opt\/homebrew\/bin/);
assert.match(pathTemplate, /\/usr\/local\/bin/);
assert.match(pathTemplate, /\$\{NVM_BIN\}/);
assert.match(pathTemplate, /\$\{HOME\}\/\.nvm\/current\/bin/);
assert.match(pathTemplate, /fnm\/aliases\/default\/bin/);
assert.match(pathTemplate, /\$\{FNM_MULTISHELL_PATH\}/);
assert.doesNotMatch(pathTemplate, /windowsworst|Users\\[^\\]+\\AppData|dummy/i);
assert.doesNotMatch(pathTemplate, /\/home\/(?!linuxbrew\b)[^/:]+\//);

const unixDirs = pathTemplate
  .replaceAll("${PATH}", "")
  .split(":")
  .map((d) => d.trim())
  .filter(Boolean);
for (const dir of [
  "/home/linuxbrew/.linuxbrew/bin",
  "${HOME}/.linuxbrew/bin",
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "${NVM_BIN}",
  "${HOME}/.nvm/current/bin",
  "${HOME}/.local/share/fnm/aliases/default/bin",
  "${HOME}/.fnm/aliases/default/bin",
  "${XDG_DATA_HOME}/fnm/aliases/default/bin",
  "${FNM_MULTISHELL_PATH}",
]) {
  assert.ok(unixDirs.includes(dir), `PATH split must keep standalone ${dir}`);
}

assert.equal(plugin.variables?.properties?.NODE, undefined);
assert.ok(!plugin.variables.required.includes("NODE"));
assert.ok(plugin.variables.required.includes("STEAM_WEB_API_KEY"));

const posix = join(root, "scripts/run-mcp");
const win = join(root, "scripts/run-mcp.cmd");
accessSync(posix, constants.X_OK);
assert.ok(statSync(posix).mode & 0o111, "scripts/run-mcp must be executable");
const posixText = readFileSync(posix, "utf8");
assert.ok(posixText.startsWith("#!/bin/sh"));
assert.match(posixText, /Optional terminal helper/);
assert.match(posixText, /\$\{PLUGIN_ROOT\}\/server\.mjs/);
assert.doesNotMatch(posixText, /\$\{NODE\}/);
assert.match(posixText, /command -v node/);
assert.match(posixText, /spawn node ENOENT/);
assert.match(posixText, /not a Steam API failure/);

const cmdText = readFileSync(win, "utf8");
assert.match(cmdText, /Optional terminal helper/);
assert.match(cmdText, /where node/i);
assert.match(cmdText, /C:\\Program Files\\nodejs\\node\.exe/);
assert.match(cmdText, /spawn node ENOENT/);
assert.doesNotMatch(posixText, /windowsworst|dummy/i);
assert.doesNotMatch(cmdText, /windowsworst|dummy/i);

function interpolatePath(template) {
  return template
    .replaceAll("${HOME}", process.env.HOME || "")
    .replaceAll("${NVM_BIN}", process.env.NVM_BIN || "")
    .replaceAll("${XDG_DATA_HOME}", process.env.XDG_DATA_HOME || "")
    .replaceAll("${FNM_MULTISHELL_PATH}", process.env.FNM_MULTISHELL_PATH || "")
    .replaceAll("${PATH}", process.env.PATH || "");
}

function frame(obj) {
  const json = JSON.stringify(obj);
  const payload = Buffer.from(json, "utf8");
  return Buffer.concat([Buffer.from(`Content-Length: ${payload.length}\r\n\r\n`, "utf8"), payload]);
}

function spawnMcp(command, args, env, { expectFail = false, cwd = root } = {}) {
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
      reject(new Error(`MCP initialize timed out: ${stderr}`));
    }, 10000);
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

function runNode(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", args, {
      cwd: root,
      env,
      stdio: "ignore",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`node ${args.join(" ")} exited ${code}`));
    });
  });
}

const pathValue = interpolatePath(pathTemplate);
const pathEnv = { ...process.env, PATH: pathValue };

await runNode(["-e", "process.exit(0)"], pathEnv);
await runNode(["--check", "server.mjs"], pathEnv);

const prevCwd = process.cwd();
process.chdir("/tmp");
try {
  const baseEnv = { ...process.env, PATH: pathValue };
  // Cursor spawn shape after interpolation: node + absolute server.mjs + cwd plugin root.
  await spawnMcp("node", [join(root, "server.mjs")], baseEnv, { cwd: root });
  // Optional terminal helper (not the Cursor spawn command).
  await spawnMcp("/bin/sh", ["./scripts/run-mcp"], { ...process.env }, { cwd: root });
} finally {
  process.chdir(prevCwd);
}

const stripped = { ...process.env, PATH: "/usr/sbin:/sbin" };
await spawnMcp("/bin/sh", ["./scripts/run-mcp"], stripped);

const missing = {
  ...process.env,
  PATH: "/usr/sbin:/sbin",
  HOME: "/tmp/steam-web-no-node-home",
  NVM_DIR: "",
  XDG_DATA_HOME: "/tmp/steam-web-no-node-home",
  FNM_MULTISHELL_PATH: "",
  VOLTA_HOME: "",
};
await spawnMcp("/bin/sh", ["./scripts/run-mcp"], missing, { expectFail: true });

console.log("mcp-path-test: PASS");
