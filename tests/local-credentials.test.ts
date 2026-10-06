import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";

import { openRouterApiKey, openRouterKeyStatus, saveOpenRouterApiKey } from "../lib/local-credentials.ts";

const SAVED_KEY = "sk-or-v1-saved-key-0000000000abcd";
const ENV_KEY = "sk-or-v1-env-key-00000000000wxyz";

// The store resolves .beeblio/ from the working directory, like the servers do.
describe("local credentials", () => {
  const originalCwd = process.cwd();
  const originalEnvKey = process.env.OPENROUTER_API_KEY;
  let dir: string;

  const file = () => path.join(dir, ".beeblio", "credentials.json");

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "beeblio-credentials-"));
    process.chdir(dir);
    delete process.env.OPENROUTER_API_KEY;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(dir, { recursive: true, force: true });
    if (originalEnvKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalEnvKey;
  });

  test("reports no key when neither Settings nor the environment has one", () => {
    assert.equal(openRouterApiKey(), undefined);
    assert.deepEqual(openRouterKeyStatus(), { source: null });
  });

  test("falls back to OPENROUTER_API_KEY", () => {
    process.env.OPENROUTER_API_KEY = `  ${ENV_KEY}\n`;
    assert.equal(openRouterApiKey(), ENV_KEY);
    assert.deepEqual(openRouterKeyStatus(), { source: "env", last4: "wxyz" });
  });

  test("a saved key overrides the environment and takes effect immediately", () => {
    process.env.OPENROUTER_API_KEY = ENV_KEY;
    saveOpenRouterApiKey(SAVED_KEY);
    assert.equal(openRouterApiKey(), SAVED_KEY);
    assert.deepEqual(openRouterKeyStatus(), { source: "settings", last4: "abcd" });
  });

  test("the file is private to the user and no temporary files are left behind", { skip: process.platform === "win32" && "POSIX modes only" }, () => {
    saveOpenRouterApiKey(SAVED_KEY);
    assert.equal(statSync(file()).mode & 0o777, 0o600);
    assert.deepEqual(readdirSync(path.dirname(file())), ["credentials.json"]);
  });

  test("removing the key restores the environment value and keeps unrelated entries", () => {
    process.env.OPENROUTER_API_KEY = ENV_KEY;
    mkdirSync(path.dirname(file()), { recursive: true });
    writeFileSync(file(), JSON.stringify({ openRouterApiKey: SAVED_KEY, otherProvider: "kept" }));
    saveOpenRouterApiKey(null);
    assert.equal(openRouterApiKey(), ENV_KEY);
    assert.deepEqual(JSON.parse(readFileSync(file(), "utf8")), { otherProvider: "kept" });
  });

  for (const [name, contents] of [["malformed JSON", "{ not json"], ["a JSON array", "[]"]] as const) {
    test(`a file containing ${name} is ignored rather than breaking model calls, and saving repairs it`, (t) => {
      const warn = t.mock.method(console, "warn", () => {});
      process.env.OPENROUTER_API_KEY = ENV_KEY;
      mkdirSync(path.dirname(file()), { recursive: true });
      writeFileSync(file(), contents);

      assert.equal(openRouterApiKey(), ENV_KEY);
      assert.equal(warn.mock.callCount(), 1);

      saveOpenRouterApiKey(SAVED_KEY);
      assert.equal(openRouterApiKey(), SAVED_KEY);
    });
  }
});
