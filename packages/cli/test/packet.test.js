import test from "node:test";
import assert from "node:assert/strict";
import { formatExecutionPacket } from "../src/client.js";

test("formatExecutionPacket includes digest and draft steps", () => {
  const text = formatExecutionPacket({
    id: "abc",
    status: "PENDING",
    digest: "d".repeat(64),
    policyDecision: { status: "PASS", reasons: [] },
    createdBy: "planner@example.com",
    expiresAt: "2026-07-24T00:00:00.000Z",
    request: {
      kind: "CREATE_DRAFT_CAMPAIGN",
      currency: "CAD",
      maxAdditionalSpendMinor: 0,
      reason: "Create draft only for review before publish.",
      payload: { name: "Draft A" },
    },
  });
  assert.match(text, /COPILOT/);
  assert.match(text, /Draft A/);
  assert.match(text, /do \*\*not\*\* publish/i);
  assert.ok(text.includes("d".repeat(64)));
});
