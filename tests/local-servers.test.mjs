import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { once } from "node:events";
import { describe, test } from "node:test";

import { startLocalServers, terminate } from "../scripts/local-servers.mjs";

const posixOnly = process.platform === "win32" && "process groups are POSIX-only; Windows uses taskkill /T";

/** Spawns a Node script as its own process group, the way the launcher starts servers. */
function spawnServerLike(source) {
  return spawn(process.execPath, ["-e", source], { detached: true, stdio: ["ignore", "pipe", "inherit"] });
}

/** Reads the first line the child prints, which these fixtures use to report a PID or readiness. */
async function firstLine(child) {
  let output = "";
  for await (const chunk of child.stdout) {
    output += chunk;
    if (output.includes("\n")) return output.split("\n")[0];
  }
  throw new Error("The child exited before printing a line");
}

/** True while the process runs; a killed orphan can linger as a zombie if PID 1 does not reap it, so Linux checks its state too. */
function isAlive(pid) {
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  try {
    return readFileSync(`/proc/${pid}/stat`, "utf8").split(") ")[1]?.[0] !== "Z";
  } catch {
    return true;
  }
}

describe("terminate", () => {
  test("stops processes the server started, not just the server", { skip: posixOnly }, async () => {
    // Stands in for the agent server running a long shell command.
    const child = spawnServerLike(`
      const shell = require("node:child_process").spawn("sleep", ["60"], { stdio: "ignore" });
      console.log(shell.pid);
      setInterval(() => {}, 1000);
    `);
    const grandchildPid = Number(await firstLine(child));
    assert.ok(isAlive(grandchildPid));

    await terminate(child);

    // Delivery of the group signal is asynchronous; give the kernel a moment.
    for (let i = 0; i < 20 && isAlive(grandchildPid); i++) await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(isAlive(grandchildPid), false);
  });

  test("force-kills a server that ignores SIGTERM", { skip: posixOnly, timeout: 15_000 }, async () => {
    const child = spawnServerLike(`
      process.on("SIGTERM", () => {});
      console.log("ready");
      setInterval(() => {}, 1000);
    `);
    await firstLine(child);
    const started = Date.now();

    await terminate(child);

    assert.equal(child.signalCode, "SIGKILL");
    assert.ok(Date.now() - started >= 4_000, "the server first gets time to shut down cleanly");
  });

  test("still stops a child that does not lead its own process group", async () => {
    const child = spawn(process.execPath, ["-e", "console.log('ready'); setInterval(() => {}, 1000)"], { stdio: ["ignore", "pipe", "inherit"] });
    await firstLine(child);
    await terminate(child);
    assert.ok(child.exitCode !== null || child.signalCode !== null);
  });

  test("resolves at once for a process that already exited", async () => {
    const child = spawn(process.execPath, ["-e", ""], { stdio: "ignore" });
    await once(child, "exit");
    await terminate(child);
  });
});

describe("startLocalServers", () => {
  test("explains how to fix a checkout without installed dependencies", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "beeblio-empty-checkout-"));
    try {
      await assert.rejects(startLocalServers({ root, onOutput: () => {} }), /Run pnpm install/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
