/**
 * COPILOT-grounded LLM ask: system prompt + knowledge hits + optional status.
 */
import { searchKnowledge } from "../knowledge.js";
import { getLlmSettings, loadLlmKey, llmStatus } from "./config.js";
import { chatCompletion, getProviderDef } from "./providers.js";

const SYSTEM = `You are the 6EARS Spotify Ads Manager Copilot — a careful advertising operations assistant.

Rules:
- Prefer facts from the provided knowledge snippets and operator context.
- Separate verified facts from inference.
- Never invent Spotify ad-account IDs, budgets, approvals, or performance claims.
- Never promise approval, reach, streams, or revenue.
- Default posture is COPILOT: plan, recommend, prepare packets — do not claim a live write happened.
- For music/artist ads: product must be clear (VO/CTA); song-only creatives often fail review.
- If knowledge is missing or stale, say so and suggest verifying live Spotify Ads docs.
- Be concise and actionable. Use bullet steps when recommending ops.
`;

/**
 * @param {string} question
 * @param {object} [ctx]
 * @param {{ mode?: string, statusLine?: string, artistId?: string }} [ctx.session]
 */
export async function askLlm(question, ctx = {}) {
  const settings = getLlmSettings();
  const providerId = settings.provider || "openrouter";
  const apiKey = loadLlmKey(providerId);
  if (!apiKey) {
    throw new Error(
      "No LLM API key. Set one: 6ears-spotify-ads llm set-key --provider openrouter\n" +
        "Or in cockpit: /llm key <paste-key>"
    );
  }

  const def = getProviderDef(providerId);
  const hits = searchKnowledge(question, { limit: 6 });
  const knowledgeBlock = hits.length
    ? hits.map((h, i) => `[${i + 1}] ${h.path}\n${h.snippet}`).join("\n\n")
    : "(no local knowledge hits for this query)";

  const session = ctx.session || {};
  const sessionBlock = [
    `mode: ${session.mode || "COPILOT"}`,
    `status: ${session.statusLine || "—"}`,
    `artist: ${session.artistId || "—"}`,
  ].join("\n");

  const messages = [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: [
        "## Operator session",
        sessionBlock,
        "",
        "## Knowledge snippets (local pack — may be incomplete)",
        knowledgeBlock,
        "",
        "## Question",
        question,
      ].join("\n"),
    },
  ];

  const result = await chatCompletion({
    providerId,
    apiKey,
    model: settings.model || undefined,
    baseUrl: settings.baseUrl || def?.baseUrl || undefined,
    messages,
  });

  return {
    ...result,
    knowledgeHits: hits.length,
    status: llmStatus(),
  };
}
