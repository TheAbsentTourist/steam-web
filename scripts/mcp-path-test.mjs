#!/usr/bin/env node
/**
 * Offline mcp.json spawn-PATH checks. No Steam, no secrets.
 * Proves command stays `node` (Linux/mac) and PATH prepends well-known Node
 * dirs without dropping ${PATH}.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mcp = JSON.parse(readFileSync(join(root, "mcp.json"), "utf8"));
const server = mcp.mcpServers?.["steam-web"];
assert.ok(server, "steam-web server missing from mcp.json");

assert.equal(server.command, "node");
assert.notEqual(server.command, "cmd.exe");
assert.notEqual(server.command, "node.exe");
assert.deepEqual(server.args, ["./server.mjs"]);
assert.equal(server.cwd, "${PLUGIN_ROOT}");

const pathTemplate = server.env?.PATH;
assert.equal(typeof pathTemplate, "string");
assert.match(pathTemplate, /\$\{PATH\}/);
assert.ok(pathTemplate.endsWith("${PATH}"), "PATH template must append ${PATH}, not replace it");
assert.match(pathTemplate, /C:\\Program Files\\nodejs/);
assert.match(pathTemplate, /\/usr\/local\/bin/);
assert.match(pathTemplate, /\/opt\/homebrew\/bin/);
assert.match(pathTemplate, /\/usr\/bin/);
assert.doesNotMatch(pathTemplate, /windowsworst|Users\\[^\\]+\\AppData|dummy/i);

const unixDirs = pathTemplate
  .replaceAll("${PATH}", "")
  .split(":")
  .map((d) => d.trim())
  .filter((d) => d.startsWith("/"));
for (const dir of ["/usr/local/bin", "/opt/homebrew/bin", "/usr/bin", "/bin"]) {
  assert.ok(unixDirs.includes(dir), `unix PATH split must keep standalone ${dir}`);
}

const winDirs = pathTemplate.replaceAll("${PATH}", "").split(";");
assert.equal(winDirs[0], "C:\\Program Files\\nodejs");

function runNode(args) {
  const pathValue = pathTemplate.replaceAll("${PATH}", process.env.PATH || "");
  return new Promise((resolve, reject) => {
    const child = spawn("node", args, {
      cwd: root,
      env: { ...process.env, PATH: pathValue },
      stdio: "ignore",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`node ${args.join(" ")} exited ${code}`));
    });
  });
}

await runNode(["-e", "process.exit(0)"]);
await runNode(["--check", "server.mjs"]);

console.log("mcp-path-test: PASS");
