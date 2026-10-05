import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * API keys entered in Settings. Like the agent secret, they live in .beeblio/
 * so both local server processes read the same values, and they take
 * precedence over .env.local. Never send a key to the browser.
 */
type Credentials = { openRouterApiKey?: string };

export type ApiKeyStatus = { source: "settings" | "env" | null; last4?: string };

const credentialsFile = () => path.resolve(process.cwd(), ".beeblio/credentials.json");

function readCredentials(): Credentials {
  try {
    const parsed: unknown = JSON.parse(readFileSync(credentialsFile(), "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Credentials : {};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

function savedOpenRouterApiKey(): string | undefined {
  const value = readCredentials().openRouterApiKey;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Read on every call so a key saved in Settings applies without a restart. */
export function openRouterApiKey(): string | undefined {
  return savedOpenRouterApiKey() ?? (process.env.OPENROUTER_API_KEY?.trim() || undefined);
}

export function openRouterKeyStatus(): ApiKeyStatus {
  const saved = savedOpenRouterApiKey();
  if (saved) return { source: "settings", last4: saved.slice(-4) };
  const env = process.env.OPENROUTER_API_KEY?.trim();
  return env ? { source: "env", last4: env.slice(-4) } : { source: null };
}

/** Saves the key, or removes it with null so .env.local applies again. */
export function saveOpenRouterApiKey(key: string | null) {
  const file = credentialsFile();
  const { openRouterApiKey: _previous, ...rest } = readCredentials();
  const next: Credentials = key ? { ...rest, openRouterApiKey: key } : rest;
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, file);
}
