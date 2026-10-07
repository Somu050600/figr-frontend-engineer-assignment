// One command: install deps if needed, build the page agent, then run
// backend (:4000/:4001), agent watcher and the Vite dev server (:5173) together.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shell = process.platform === "win32";
const run = (cmd, args) => spawnSync(cmd, args, { cwd: root, stdio: "inherit", shell });

// Fail fast with a readable message if something (often a previous run) holds a port.
const busy = [];
for (const port of [4000, 4001, 5173]) {
  const free = await new Promise((resolve) => {
    const srv = net.createServer().once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true))).listen(port);
  });
  if (!free) busy.push(port);
}
if (busy.length) {
  console.error(`[start] port${busy.length > 1 ? "s" : ""} ${busy.join(", ")} already in use — is another \`npm start\` still running? Stop it and try again.`);
  process.exit(1);
}

if (!existsSync(path.join(root, "node_modules"))) {
  console.log("[start] installing dependencies…");
  if (run("npm", ["install"]).status !== 0) process.exit(1);
}
if (run("npm", ["run", "build:agent", "-w", "frontend"]).status !== 0) process.exit(1);

const procs = [
  ["backend", "node", ["backend/server.js"]],
  ["agent", "npm", ["run", "watch:agent", "-w", "frontend"]],
  ["app", "npm", ["run", "dev", "-w", "frontend"]],
].map(([name, cmd, args]) => {
  const p = spawn(cmd, args, { cwd: root, shell, stdio: ["ignore", "pipe", "pipe"] });
  const prefix = (chunk) =>
    chunk.toString().split("\n").filter(Boolean).map((l) => `[${name}] ${l}`).join("\n") + "\n";
  p.stdout.on("data", (c) => process.stdout.write(prefix(c)));
  p.stderr.on("data", (c) => process.stderr.write(prefix(c)));
  p.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[start] ${name} exited with ${code}; stopping`);
      shutdown(code);
    }
  });
  return p;
});

console.log("[start] open http://localhost:5173");

function shutdown(code = 0) {
  for (const p of procs) if (!p.killed) p.kill();
  process.exit(code);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
