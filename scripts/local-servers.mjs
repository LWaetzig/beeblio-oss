import { execFile, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

const HOST = "127.0.0.1";
const STOP_TIMEOUT_MS = 5000;

/**
 * Applies SQLite migrations, then starts the Next.js UI and the Eve agent.
 * Shared by `pnpm dev` and the desktop app so both launch the same way.
 */
export async function startLocalServers({ root, mode = "dev", uiPort = 3000, agentPort = 2000, nodePath = process.execPath, onOutput, onExit }) {
  const env = { ...process.env };
  dotenv.config({ path: path.join(root, ".env.local"), processEnv: env, quiet: true });
  dotenv.config({ path: path.join(root, ".env"), processEnv: env, quiet: true });
  const dataDir = path.join(root, ".beeblio");
  mkdirSync(dataDir, { recursive: true });
  env.LOCAL_DB_PATH ||= path.join(dataDir, "beeblio.sqlite");
  env.AGENT_URL = `http://${HOST}:${agentPort}`;

  const warnings = [];
  if (process.platform === "win32" && !env.BEEBLIO_BASH) {
    const bash = findGitBash(env);
    if (bash) env.BEEBLIO_BASH = bash;
    else warnings.push("Git Bash was not found, so agent shell commands will fail. Install Git for Windows or set BEEBLIO_BASH to bash.exe.");
  }

  // Run each CLI's JavaScript entry with Node directly: the node_modules/.bin
  // shims are .cmd files on Windows, which spawn cannot start without a shell.
  function start(name, args) {
    const child = spawn(nodePath, [binEntry(root, name), ...args], { cwd: root, env, stdio: onOutput ? ["ignore", "pipe", "pipe"] : "inherit", windowsHide: true });
    if (onOutput) for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => onOutput(name, chunk));
    return child;
  }

  await new Promise((resolve, reject) => {
    const child = start("drizzle-kit", ["migrate"]);
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve() : reject(new Error(`drizzle-kit exited with ${code}`)));
  });

  const children = new Map([
    ["next", start("next", [mode, "--hostname", HOST, "--port", String(uiPort)])],
    ["eve", start("eve", mode === "dev" ? ["dev", "--no-ui", "--host", HOST, "--port", String(agentPort)] : ["start", "--host", HOST, "--port", String(agentPort)])],
  ]);

  let stopping;
  const stop = () => (stopping ??= Promise.all([...children.values()].map(terminate)).then(() => {}));
  for (const [name, child] of children) {
    child.once("error", (error) => { if (!stopping) onExit?.(name, null, error); });
    child.once("exit", (code, signal) => { if (!stopping) onExit?.(name, code ?? signal); });
  }

  const uiUrl = `http://${HOST}:${uiPort}`;
  /** Resolves once the UI answers and its /eve proxy reaches the agent. */
  async function waitUntilReady({ timeoutMs = 180000 } = {}) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (stopping) throw new Error("The local servers stopped before they were ready");
      try {
        const response = await fetch(`${uiUrl}/eve/v1/health`, { signal: AbortSignal.timeout(30000) });
        if (response.ok) return;
      } catch {
        // Not listening yet, or still compiling the route in dev mode.
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`The local servers did not become ready within ${Math.round(timeoutMs / 1000)} seconds`);
  }

  return { uiUrl, agentUrl: env.AGENT_URL, dataDir, warnings, waitUntilReady, stop };
}

/** Production builds that `mode: "start"` needs but that are missing. */
export function missingProductionBuilds(root) {
  const missing = [];
  if (!existsSync(path.join(root, ".next", "BUILD_ID"))) missing.push("pnpm build");
  if (!existsSync(path.join(root, ".output", "server", "index.mjs"))) missing.push("pnpm build:eve");
  return missing;
}

function binEntry(root, name) {
  const dir = path.join(root, "node_modules", name);
  const { bin } = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
  return path.join(dir, typeof bin === "string" ? bin : bin[name]);
}

/** Kills the server and everything it spawned, such as the agent's shell commands. */
function terminate(child) {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const kill = (force) => {
      if (process.platform === "win32") execFile("taskkill", ["/pid", String(child.pid), "/T", "/F"], () => {});
      else child.kill(force ? "SIGKILL" : "SIGTERM");
    };
    const timer = setTimeout(() => kill(true), STOP_TIMEOUT_MS);
    child.once("exit", () => { clearTimeout(timer); resolve(); });
    kill(false);
  });
}

/** Git for Windows' bash.exe; never System32\bash.exe, which starts WSL with different paths. */
function findGitBash(env) {
  const value = (key) => Object.entries(env).find(([name]) => name.toLowerCase() === key.toLowerCase())?.[1];
  const installRoots = [value("ProgramFiles"), value("ProgramW6432"), value("ProgramFiles(x86)"), value("LOCALAPPDATA") && path.win32.join(value("LOCALAPPDATA"), "Programs")]
    .filter(Boolean)
    .map((base) => path.win32.join(base, "Git", "bin", "bash.exe"));
  const fromGitOnPath = (value("PATH") || "").split(";")
    .filter((dir) => dir && existsSync(path.win32.join(dir, "git.exe")))
    .map((dir) => path.win32.resolve(dir, "..", "bin", "bash.exe"));
  return [...installRoots, ...fromGitOnPath].find((candidate) => existsSync(candidate));
}
