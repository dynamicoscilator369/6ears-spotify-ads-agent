import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultLlmConfig,
  getLlmSettings,
  listProviders,
  llmStatus,
} from "../src/llm/config.js";
import { getProviderDef } from "../src/llm/providers.js";

test("builtin providers include openrouter and openai", () => {
  const ids = listProviders().map((p) => p.id);
  assert.ok(ids.includes("openrouter"));
  assert.ok(ids.includes("openai"));
  assert.ok(ids.includes("xai"));
  assert.ok(ids.includes("custom"));
});

test("openrouter has base URL", () => {
  const d = getProviderDef("openrouter");
  assert.match(d.baseUrl, /openrouter/);
});

test("default llm config is safe", () => {
  const d = defaultLlmConfig();
  assert.equal(d.enabled, false);
  assert.equal(d.provider, "openrouter");
  assert.equal(d.chatModeDefault, false);
});

test("llmStatus does not throw without key", () => {
  const s = llmStatus();
  assert.equal(typeof s.keySet, "boolean");
  assert.ok(s.provider);
});

test("getLlmSettings merges defaults", () => {
  const s = getLlmSettings();
  assert.ok(s.provider);
});
