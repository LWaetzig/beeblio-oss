import { execFile, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

const HOST = "127.0.0.1";
/** How long a server gets to shut down cleanly before it is killed. */
const STOP_TIMEOUT_MS = 5000;
/** After a forced kill, stop waiting for the exit event so quitting can never hang. */
const KILL_GRACE_MS = 2000;
const IS_WINDOWS = process.platform === "win32";

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
  // On macOS and Linux each long-running server leads its own process group, so
  // stopping it also reaches its workers and the agent's shell commands (see
  // terminate). The short migration stays in our group so Ctrl+C still stops it.
  function start(name, args, { ownProcessGroup = false } = {}) {
    const child = spawn(nodePath, [binEntry(root, name), ...args], { cwd: root, env, detached: ownProcessGroup && !IS_WINDOWS, stdio: onOutput ? ["ignore", "pipe", "pipe"] : "inherit", windowsHide: true });
    if (onOutput) for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => onOutput(name, chunk));
    return child;
  }

  await new Promise((resolve, reject) => {
    const child = start("drizzle-kit", ["migrate"]);
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve() : reject(new Error(`drizzle-kit exited with ${code}`)));
  });

  const children = new Map([
    ["next", start("next", [mode, "--hostname", HOST, "--port", String(uiPort)], { ownProcessGroup: true })],
    ["eve", start("eve", mode === "dev" ? ["dev", "--no-ui", "--host", HOST, "--port", String(agentPort)] : ["start", "--host", HOST, "--port", String(agentPort)], { ownProcessGroup: true })],
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

/** Resolves a CLI's JavaScript entry; fails with a fix, not an ENOENT, when dependencies are missing. */
function binEntry(root, name) {
  const dir = path.join(root, "node_modules", name);
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
  } catch (error) {
    throw new Error(`Could not find ${name} in ${path.join(root, "node_modules")}. Run pnpm install in ${root}.`, { cause: error });
  }
  const { bin } = manifest;
  return path.join(dir, typeof bin === "string" ? bin : bin[name]);
}

/**
 * Stops a server and everything it spawned, such as Next.js workers and the
 * agent's shell commands, which would otherwise outlive the app and keep its
 * ports busy. Always settles, even if the process never reports its exit.
 */
export function terminate(child) {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    let forceTimer;
    let giveUpTimer;
    const done = () => {
      clearTimeout(forceTimer);
      clearTimeout(giveUpTimer);
      // The leader can exit while members of its group ignored SIGTERM; clean them up too.
      signalTree(child, "SIGKILL");
      resolve();
    };
    child.once("exit", done);
    forceTimer = setTimeout(() => {
      signalTree(child, "SIGKILL");
      giveUpTimer = setTimeout(done, KILL_GRACE_MS);
    }, STOP_TIMEOUT_MS);
    signalTree(child, "SIGTERM");
  });
}

/**
 * Signals the child's whole process tree. Windows has no SIGTERM for console
 * programs, so taskkill /T force-stops the tree at once. Elsewhere the child
 * leads its own process group (spawned detached), so a negative PID reaches
 * every member; the group ID stays reserved while any member is alive, so this
 * cannot hit an unrelated process.
 */
function signalTree(child, signal) {
  if (IS_WINDOWS) {
    if (child.exitCode === null && child.signalCode === null) execFile("taskkill", ["/pid", String(child.pid), "/T", "/F"], () => {});
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
    // No such group: either it is already gone, or the child was not spawned
    // detached and only the child itself can be reached.
    if (child.exitCode === null && child.signalCode === null) child.kill(signal);
  }
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
