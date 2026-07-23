import test from "node:test";
import assert from "node:assert/strict";
import { searchKnowledge, knowledgeRoot } from "../src/knowledge.js";
import fs from "node:fs";

test("knowledge root has playbook", () => {
  assert.ok(fs.existsSync(`${knowledgeRoot()}/PLAYBOOK.md`));
});

test("search finds audio-related material", () => {
  const hits = searchKnowledge("audio creative companion");
  assert.ok(hits.length > 0, "expected at least one hit");
  assert.ok(hits[0].path.endsWith(".md"));
});
