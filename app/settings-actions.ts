"use server";

import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { openRouterKeyStatus, saveOpenRouterApiKey, type ApiKeyStatus } from "@/lib/local-credentials";

type Result = { success: true; status: ApiKeyStatus } | { success: false; error: string };

/** OpenRouter answers within a second normally; this keeps a stalled proxy from freezing the dialog. */
const KEY_CHECK_TIMEOUT_MS = 10_000;

const openRouterKeySchema = z
  .string()
  .trim()
  .min(20, "That doesn't look like an OpenRouter API key.")
  .max(200, "That doesn't look like an OpenRouter API key.")
  .regex(/^\S+$/, "API keys cannot contain spaces.");

/** Where the OpenRouter key comes from; only its last four characters reach the browser. */
export async function getApiKeyStatus(): Promise<ApiKeyStatus> {
  await requireUser();
  return openRouterKeyStatus();
}

/** Checks the key with OpenRouter, then saves it so it overrides .env.local. */
export async function saveOpenRouterKey(key: unknown): Promise<Result> {
  await requireUser();
  const parsed = openRouterKeySchema.safeParse(key);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid API key." };

  let response: Response;
  try {
    response = await fetch("https://openrouter.ai/api/v1/key", {
      headers: { Authorization: `Bearer ${parsed.data}` },
      signal: AbortSignal.timeout(KEY_CHECK_TIMEOUT_MS),
    });
  } catch {
    return { success: false, error: "Couldn't reach OpenRouter to check the key. Check your connection and try again." };
  }
  if (response.status === 401) return { success: false, error: "OpenRouter rejected this key." };
  // Anything else may come from a proxy or firewall rather than OpenRouter, so show what it said.
  if (!response.ok) return { success: false, error: `Couldn't check the key with OpenRouter (HTTP ${response.status}): ${await failureDetail(response)}` };

  return storeKey(parsed.data);
}

/** A short, human-readable reason from an error response, whether OpenRouter's JSON or a proxy's page. */
async function failureDetail(response: Response): Promise<string> {
  const text = (await response.text().catch(() => "")).trim();
  try {
    const message = (JSON.parse(text) as { error?: { message?: unknown } }).error?.message;
    if (typeof message === "string" && message) return message.slice(0, 200);
  } catch {
    // Not JSON: a proxy's plain-text page.
  }
  return text.slice(0, 200) || response.statusText || "no details";
}

/** Removes the saved key; OPENROUTER_API_KEY from .env.local applies again if set. */
export async function removeOpenRouterKey(): Promise<Result> {
  await requireUser();
  return storeKey(null);
}

/**
 * Turns disk errors (a read-only checkout, a full disk) into a message the
 * dialog can show, instead of an opaque server action failure.
 */
function storeKey(key: string | null): Result {
  try {
    saveOpenRouterApiKey(key);
    return { success: true, status: openRouterKeyStatus() };
  } catch (error) {
    console.error("Could not update .beeblio/credentials.json", error);
    const reason = (error as NodeJS.ErrnoException).code ?? "unknown error";
    return { success: false, error: `The key could not be written to .beeblio/credentials.json (${reason}).` };
  }
}
