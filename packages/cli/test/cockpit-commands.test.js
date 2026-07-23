import test from "node:test";
import assert from "node:assert/strict";
import { createState } from "../src/cockpit/state.js";
import { handleCommand, helpText } from "../src/cockpit/commands.js";

test("helpText mentions Copilot Cockpit", () => {
  assert.match(helpText(), /Copilot Cockpit/);
  assert.match(helpText(), /\/prepare/);
});

test("free text knowledge search returns hits", async () => {
  const state = createState();
  const { state: next } = await handleCommand(state, "audio companion");
  assert.ok(next.log.length > 0);
  const text = next.log.map((l) => l.text).join("\n");
  assert.match(text, /search: audio companion|companion|audio/i);
});

test("quit flag", async () => {
  const { quit } = await handleCommand(createState(), "q");
  assert.equal(quit, true);
});
