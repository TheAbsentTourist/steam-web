#!/usr/bin/env node
/**
 * Offline mcp.json launcher checks. No Steam, no secrets.
 * Windows-first: Cursor spawn is cmd.exe with args that expand
 * ${PLUGIN_ROOT}\\scripts\\run-mcp.cmd (finds node.exe when PATH is broken).
 * Grok Bot still runs node ./server.mjs.
 *
 * ./scripts/run-mcp.cmd as command is unreliable on Windows Cursor today:
 * Cursor resolves ./ against the Cursor install dir
 * (e.g. %LOCALAPPDATA%\\Programs\\cursor\\scripts\\run-mcp.cmd) →
 * "The system cannot find the path specified."
 *
 * cwd is omitted (spec default = plugin root) or "./" — never ${PLUGIN_ROOT}.
 * Cursor expanding ${PLUGIN_ROOT} to an unusable cwd makes spawn() report
 * ENOENT for C:\WINDOWS\system32\cmd.exe even when that file exists.
 *
 * command must NOT use placeholders (no expansion there). Args do expand.
 */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { accessSync, constants, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mcpRaw = readFileSync(join(root, "mcp.json"), "utf8");
const mcp = JSON.parse(mcpRaw);
const plugin = JSON.parse(readFileSync(join(root, ".cursor-plugin/plugin.json"), "utf8"));
const server = mcp.mcpServers?.["steam-web"];
assert.ok(server, "steam-web server missing from mcp.json");

assert.equal(server.command, "cmd.exe");
assert.notEqual(server.command, "cmd");
assert.notEqual(server.command, "node");
assert.notEqual(server.command, "./scripts/run-mcp.cmd");
assert.notEqual(server.command, "/bin/sh");
assert.notEqual(server.command, "${NODE}");
assert.notEqual(server.command, "${STEAM_WEB_NODE}");
assert.notEqual(server.command, "${PLUGIN_ROOT}/bin/steam-web-mcp");
assert.doesNotMatch(server.command, /\$\{NODE\}|\$\{PLUGIN_ROOT\}|\$\{STEAM_WEB_NODE\}/);
assert.doesNotMatch(server.command, /Program Files/i);
assert.doesNotMatch(mcpRaw, /C:\\\\Program Files|C:\\Program Files/i);
assert.deepEqual(server.args, ["/d", "/c", "call", "${PLUGIN_ROOT}\\scripts\\run-mcp.cmd"]);
assert.match(mcpRaw, /"\$\{PLUGIN_ROOT\}\\\\scripts\\\\run-mcp\.cmd"/);
assert.ok(!server.args.some((a) => String(a).includes("steam-web-mcp")));
assert.ok(!server.args.some((a) => /[ ]/.test(String(a))), "args must stay separate tokens");
assert.ok(!server.args.some((a) => String(a).startsWith("/c ")));
assert.ok(
  !Object.hasOwn(server, "cwd") || server.cwd === "./",
  'cwd must be omitted or "./" — not ${PLUGIN_ROOT}',
);
assert.notEqual(server.cwd, "${PLUGIN_ROOT}");
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
const findNode = join(root, "scripts/find-node.cmd");
accessSync(posix, constants.X_OK);
assert.ok(statSync(posix).mode & 0o111, "scripts/run-mcp must be executable");
assert.ok(existsSync(win), "scripts/run-mcp.cmd missing");
assert.ok(existsSync(findNode), "scripts/find-node.cmd missing");

const posixText = readFileSync(posix, "utf8");
assert.ok(posixText.startsWith("#!/bin/sh"));
assert.match(posixText, /STEAM_WEB_NODE/);
assert.match(posixText, /command -v node/);
assert.match(posixText, /spawn node ENOENT/);
assert.match(posixText, /not a Steam API failure/);
assert.match(posixText, /nodejs\.org/);
assert.doesNotMatch(posixText, /steam-web-mcp|windowsworst|dummy/i);

const cmdText = readFileSync(win, "utf8");
assert.match(cmdText, /find-node\.cmd/);
assert.match(cmdText, /"%NODE%" "%~dp0\.\.\\server\.mjs" %\*/);
assert.match(cmdText, /spawn node ENOENT/);
assert.match(cmdText, /This is not a Steam API failure/);
assert.match(cmdText, /if defined NODE goto :run/);
assert.doesNotMatch(cmdText, /if not defined NODE\s*\(/i);
assert.doesNotMatch(cmdText, /steam-web-mcp|windowsworst|dummy/i);

const findText = readFileSync(findNode, "utf8");
const findCode = findText
  .split(/\r?\n/)
  .filter((line) => !/^\s*(?:@?REM\b|::)/i.test(line))
  .join("\n");
assert.doesNotMatch(findCode, /\bsetlocal\b/i, "setlocal in find-node.cmd hides NODE from `call`");
assert.doesNotMatch(findCode, /\bendlocal\b/i, "endlocal & set NODE= does not persist across `call find-node.cmd`");
assert.match(findText, /set "NODE=/);
assert.match(findText, /STEAM_WEB_NODE/);
assert.match(findText, /where\.exe|where node/i);
assert.match(findText, /%ProgramFiles%\\nodejs\\node\.exe/);
assert.match(findText, /ProgramFiles\(x86\)/);
assert.match(findText, /%LOCALAPPDATA%\\Programs\\nodejs\\node\.exe/);
assert.match(findText, /NVM_SYMLINK/);
assert.match(findText, /\\.volta\\bin\\node\.exe/);
assert.match(findText, /scoop\\apps\\nodejs\\current\\node\.exe/);
assert.match(findText, /fnm_multishells/);
assert.match(findText, /https:\/\/nodejs\.org/);
assert.match(findText, /fully quit/);
assert.match(findText, /This is not a Steam API failure/);
assert.doesNotMatch(findText, /windowsworst|dummy/i);

function echoLinesWithParens(text) {
  return text.split(/\r?\n/).filter((line) => /^\s*echo\b/i.test(line.replace(/^\s*@/, "")) && /[()]/.test(line));
}
assert.deepEqual(echoLinesWithParens(cmdText), [], "run-mcp.cmd echo must not contain parentheses (cmd IF parse)");
assert.deepEqual(echoLinesWithParens(findText), [], "find-node.cmd echo must not contain parentheses (cmd IF parse)");

function frame(obj) {
  const json = JSON.stringify(obj);
  const payload = Buffer.from(json, "utf8");
  return Buffer.concat([Buffer.from(`Content-Length: ${payload.length}\r\n\r\n`, "utf8"), payload]);
}

function spawnMcp(command, args, env, { cwd = root, shell = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      shell,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
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

function cmdExeAvailable() {
  if (process.platform === "win32") return true;
  const probe = spawnSync("cmd.exe", ["/c", "echo ok"], {
    encoding: "utf8",
    timeout: 3000,
    windowsHide: true,
  });
  return probe.status === 0 && /ok/.test(probe.stdout || "");
}

function programFilesNode() {
  const pf = process.env.ProgramFiles || "C:\\Program Files";
  const pf86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  return [join(pf, "nodejs", "node.exe"), join(pf86, "nodejs", "node.exe")].find((p) => existsSync(p));
}

function envWithoutNodeOnPath(base) {
  const env = { ...base };
  const systemRoot = env.SystemRoot || env.SYSTEMROOT || "C:\\Windows";
  if (process.platform === "win32") {
    env.PATH = join(systemRoot, "System32");
    env.Path = env.PATH;
  } else {
    env.PATH = "/usr/sbin:/sbin";
  }
  return env;
}

function envMissingNode(base) {
  const env = envWithoutNodeOnPath(base);
  const empty = join(tmpdir(), "steam-web-no-node-dirs");
  mkdirSync(empty, { recursive: true });
  env.ProgramFiles = empty;
  env["ProgramFiles(x86)"] = empty;
  env.LOCALAPPDATA = empty;
  env.USERPROFILE = empty;
  delete env.STEAM_WEB_NODE;
  delete env.NVM_SYMLINK;
  delete env.NODE;
  return env;
}

function runCmdC(commandLine, env = process.env) {
  return spawnSync("cmd.exe", ["/d", "/c", commandLine], {
    cwd: root,
    env,
    encoding: "utf8",
    timeout: 15000,
    windowsHide: true,
  });
}

const prevCwd = process.cwd();
process.chdir(tmpdir());
try {
  // Grok Bot / direct-run coverage
  await spawnMcp("node", ["./server.mjs"], process.env, { cwd: root });
  await spawnMcp("/bin/sh", ["./scripts/run-mcp"], process.env, { cwd: root });
  await spawnMcp("/bin/sh", ["./scripts/run-mcp"], envWithoutNodeOnPath(process.env), { cwd: root });
} finally {
  process.chdir(prevCwd);
}

if (!cmdExeAvailable()) {
  console.log("mcp-path-test: skip .cmd spawn (cmd.exe not available on this host)");
  console.log(
    'mcp-path-test: skip NODE persist proof. On Windows: cmd /c "call scripts\\find-node.cmd & if defined NODE (echo OK %NODE%) else (echo FAIL)"',
  );
  console.log("mcp-path-test: skip missing-node .cmd stderr check (no cmd.exe)");
  console.log("mcp-path-test: skip PATH-stripped cmd.exe /d /c call <abs run-mcp.cmd> (cmd.exe not available on this host)");
} else {
  const persist = runCmdC("call scripts\\find-node.cmd & if defined NODE (echo OK %NODE%) else (echo FAIL)");
  assert.equal(persist.status, 0, persist.stderr || "find-node.cmd exit");
  assert.match(persist.stdout || "", /\bOK\b/, "NODE must be defined after call find-node.cmd");
  assert.doesNotMatch(persist.stdout || "", /\bFAIL\b/);

  const persistPath = runCmdC("call scripts\\find-node.cmd & if defined NODE (call echo OK %NODE%) else (echo FAIL)");
  assert.match(persistPath.stdout || "", /OK /);
  assert.match(persistPath.stdout || "", /node(\.exe)?/i);

  const missing = spawnSync("cmd.exe", ["/d", "/c", "call", win], {
    cwd: root,
    env: envMissingNode(process.env),
    encoding: "utf8",
    timeout: 15000,
    windowsHide: true,
  });
  assert.equal(missing.status, 1, missing.stderr || "missing-node should exit 1");
  assert.match(missing.stderr || "", /spawn node ENOENT/);
  assert.doesNotMatch(missing.stderr || "", /was unexpected/);
  assert.doesNotMatch(missing.stdout || "", /was unexpected/);
  assert.equal((missing.stdout || "").trim(), "", "MCP launcher must stay silent on stdout");

  const stripped = envWithoutNodeOnPath(process.env);
  const pfNode = programFilesNode();
  if (pfNode) {
    await spawnMcp("cmd.exe", ["/d", "/c", "call", win], stripped, { cwd: root });
  } else {
    stripped.STEAM_WEB_NODE = process.execPath;
    await spawnMcp("cmd.exe", ["/d", "/c", "call", win], stripped, { cwd: root });
    console.log("mcp-path-test: PATH-stripped .cmd used STEAM_WEB_NODE (no Program Files node.exe)");
  }
}

console.log("mcp-path-test: PASS");
