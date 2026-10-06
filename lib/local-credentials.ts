import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { dataDir } from "./app-paths";

/**
 * API keys entered in Settings. Like the agent secret, they live in .beeblio/
 * so both local server processes read the same values, and they take
 * precedence over .env.local. Never send a key to the browser.
 */
type Credentials = { openRouterApiKey?: string };

export type ApiKeyStatus = { source: "settings" | "env" | null; last4?: string };

/** Resolved per call because tests and the servers choose the working directory. */
const credentialsFile = () => path.join(dataDir(), "credentials.json");

/** Windows reports these while antivirus or an indexer briefly holds the target open. */
const TRANSIENT_RENAME_ERRORS = new Set(["EPERM", "EACCES", "EBUSY"]);
const RENAME_ATTEMPTS = 5;

/**
 * Reads the stored credentials. A damaged file is reported and treated as
 * empty, so a bad hand edit falls back to .env.local instead of breaking every
 * model call; the next save in Settings rewrites it cleanly.
 */
function readCredentials(): Credentials {
  let text: string;
  try {
    text = readFileSync(credentialsFile(), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Credentials;
  } catch {
    // Reported below together with valid JSON of the wrong shape.
  }
  console.warn(`Ignoring ${credentialsFile()}: it is not a JSON object. Save the key in Settings again to repair it.`);
  return {};
}

function savedOpenRouterApiKey(): string | undefined {
  const value = readCredentials().openRouterApiKey;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Read on every call so a key saved in Settings applies without a restart. */
export function openRouterApiKey(): string | undefined {
  return savedOpenRouterApiKey() ?? (process.env.OPENROUTER_API_KEY?.trim() || undefined);
}

/** Where the active key comes from, with only enough of it to recognise it. */
export function openRouterKeyStatus(): ApiKeyStatus {
  const saved = savedOpenRouterApiKey();
  if (saved) return { source: "settings", last4: saved.slice(-4) };
  const env = process.env.OPENROUTER_API_KEY?.trim();
  return env ? { source: "env", last4: env.slice(-4) } : { source: null };
}

/** Saves the key, or removes it with null so .env.local applies again. */
export function saveOpenRouterApiKey(key: string | null): void {
  const { openRouterApiKey: _previous, ...rest } = readCredentials();
  writeAtomically(credentialsFile(), `${JSON.stringify(key ? { ...rest, openRouterApiKey: key } : rest, null, 2)}\n`);
}

/**
 * Writes through a uniquely named temporary file and renames it into place, so
 * the agent server never reads a half-written file and two concurrent saves
 * cannot clobber each other's temporary file.
 */
function writeAtomically(file: string, contents: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, contents, { mode: 0o600 });
    renameWithRetry(temporary, file);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}

function renameWithRetry(from: string, to: string): void {
  for (let attempt = 1; ; attempt++) {
    try {
      return renameSync(from, to);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (process.platform !== "win32" || attempt >= RENAME_ATTEMPTS || !code || !TRANSIENT_RENAME_ERRORS.has(code)) throw error;
      // Synchronous on purpose: callers rely on the file being in place when this returns.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20 * attempt);
    }
  }
}
