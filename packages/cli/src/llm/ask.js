/**
 * Operator LLM: drives Spotify Ads work through this product.
 * COPILOT = human gates on spend — NOT "refuse to help with Ads Manager".
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { searchKnowledge, knowledgeRoot } from "../knowledge.js";
import { loadConfig } from "../config.js";
import { agentRequest, artistPath, resolveArtistSlug } from "../client.js";
import { getLlmSettings, loadLlmKey, llmStatus } from "./config.js";
import { chatCompletion, getProviderDef } from "./providers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SYSTEM = `You are the **6EARS Spotify Ads Manager Copilot** — an expert operator for running Spotify Ads campaigns for artists, managers, and labels.

## Why this product exists
Operators use YOU + this cockpit to **plan, build, review, and run Spotify ads** (audio/VO, companions, targeting, budgets, kill rules, rejections). You are not a generic chatbot that declines Ads Manager work.

## What COPILOT mode means (critical)
- **COPILOT** = you fully help with strategy and ops; **live spend mutations** need human confirm / digest approve / write gates.
- **writes OFF** does NOT mean "I cannot help with Spotify Ads." It means: prepare drafts, packets, checklists, API-ready steps; when the agent is online, use draft→validate→publish and approval digests; Ads Manager manual steps when API is unavailable.
- **NEVER** lead with "I can't connect to Ads Manager" or "I can't log into your account" as the main answer. Lead with **what we can do next** in this tool.

## What you CAN and SHOULD do
1. **Campaign strategy** — objective, A/B structure, geo, audience hypotheses, budget bands, flight, success metrics, kill rules.
2. **Creative / review** — VO+CTA structure, companions, why song-only fails, scripts, pre-submit checklists.
3. **Ops packets** — step-by-step Ads Manager or API actions the operator can run now.
4. **Cockpit routing** — tell the operator exact commands:
   - \`/status\` \`/plan\` \`/plans\` \`/prepare\` \`/packet\` \`/actions\` \`/approve\`
   - \`/search <topic>\` for local Spotify Ads knowledge
   - Headless: \`artist push\`, \`spotify verify\` (when secrets configured)
5. **Agent-online path** — if session says agent ONLINE: profile, plans, proposals, digests exist; drive them through prepare → distinct approve → execute only when writes enabled.
6. **Agent-offline path** — still deliver full Ads Manager playbooks and copy-paste settings; never invent account IDs.
7. **Music marketing** — product clarity in audio, LISTEN_NOW, track/landing URLs only when provided by operator.

## What you must NOT do
- Invent ad account IDs, artist IDs, campaign IDs, budgets, or "already live" status.
- Promise approval, reach, streams, or revenue.
- Ask for passwords or browser cookies.
- Dump a long "I cannot" list. At most one short boundary line, then **actionable help**.

## Answer style
- Direct, operator-to-operator, scannable bullets.
- Prefer: **Goal → Recommended structure → Exact next steps (cockpit or Ads Manager) → Risks/review**.
- If something needs a real ID/URL/budget from them, ask for **only** that missing field — still give the rest of the plan.
- When they ask to "connect", "log in", "run ads", "use Ads Manager": explain the **real path** (API agent + verify, or Ads Manager packet via this copilot), then execute the planning/build steps.

You are the reason this tool was built. Act like a senior Spotify Ads operator sitting next to them.
`;

function readPlaybookExcerpt(maxChars = 3500) {
  try {
    const p = path.join(knowledgeRoot(), "PLAYBOOK.md");
    if (!fs.existsSync(p)) return "";
    return fs.readFileSync(p, "utf8").slice(0, maxChars);
  } catch {
    return "";
  }
}

function readLaunchTips(maxChars = 2000) {
  try {
    const p = path.join(knowledgeRoot(), "LAUNCH_TIPS.md");
    if (!fs.existsSync(p)) return "";
    return fs.readFileSync(p, "utf8").slice(0, maxChars);
  } catch {
    return "";
  }
}

async function fetchLiveAgentContext(session = {}) {
  const parts = [];
  const cfg = loadConfig();
  parts.push(`config.baseUrl: ${cfg.baseUrl || "—"}`);
  parts.push(`config.defaultArtist: ${cfg.defaultArtist || "—"}`);
  parts.push(`config.operatorActor: ${cfg.operatorActor || "—"}`);

  // health
  let online = false;
  try {
    await agentRequest("GET", "/health", { auth: false });
    online = true;
    parts.push("agent.health: OK (ONLINE)");
  } catch (e) {
    parts.push(`agent.health: OFFLINE (${e.message || "unreachable"})`);
  }

  if (online) {
    try {
      const slug = session.artistId || resolveArtistSlug(null);
      const st = await agentRequest("GET", artistPath(slug, "status"));
      parts.push(`agent.mode: ${st.mode || "—"}`);
      parts.push(`agent.liveWritesEnvironmentEnabled: ${st.liveWritesEnvironmentEnabled}`);
      parts.push(`agent.spotifyCredentialsConfigured: ${st.spotifyCredentialsConfigured}`);
      parts.push(`agent.counts: ${JSON.stringify(st.counts || {})}`);
      const art = st.state?.artist;
      if (art) {
        parts.push(`agent.artistId: ${art.artistId}`);
        parts.push(`agent.displayName: ${art.displayName}`);
        parts.push(`agent.defaultCurrency: ${art.defaultCurrency}`);
        parts.push(
          `agent.ceilings: daily=${art.approvalPolicy?.maxDailyBudgetMinor ?? "null"} lifetime=${art.approvalPolicy?.maxLifetimeBudgetMinor ?? "null"}`
        );
      }
      const cap = st.state?.spotifyCapability;
      if (cap) {
        parts.push(`spotify.readAccess: ${cap.readAccess}`);
        parts.push(`spotify.writeAccess: ${cap.writeAccess}`);
        parts.push(`spotify.lastError: ${cap.lastError || "null"}`);
      }
      // recent plans / actions summary
      try {
        const plans = await agentRequest("GET", artistPath(slug, "plans"));
        const arr = Array.isArray(plans) ? plans : [];
        parts.push(`plans.count: ${arr.length}`);
        for (const p of arr.slice(0, 3)) {
          parts.push(`plan: ${p.id} · ${p.name || p.goal || ""}`);
        }
      } catch {
        /* ignore */
      }
      try {
        const actions = await agentRequest("GET", artistPath(slug, "actions?limit=5"));
        const arr = Array.isArray(actions) ? actions : [];
        parts.push(`proposals.count_recent: ${arr.length}`);
        for (const a of arr.slice(0, 3)) {
          parts.push(`proposal: ${a.status} ${a.request?.kind || ""} ${a.id}`);
        }
      } catch {
        /* ignore */
      }
    } catch (e) {
      parts.push(`agent.status_error: ${e.message || e}`);
    }
  } else {
    parts.push(
      "note: Agent offline — still deliver full strategy + Ads Manager step packets; when they start wrangler, /status unlocks live IDs."
    );
  }

  return parts.join("\n");
}

/**
 * @param {string} question
 * @param {object} [ctx]
 */
export async function askLlm(question, ctx = {}) {
  const settings = getLlmSettings();
  const providerId = settings.provider || "openrouter";
  const apiKey = loadLlmKey(providerId);
  if (!apiKey) {
    throw new Error(
      "No LLM API key. Set one: 6ears-spotify-ads llm set-key\n" +
        "Or in cockpit: /llm key <paste-key>"
    );
  }

  const def = getProviderDef(providerId);
  const hits = searchKnowledge(question, { limit: 10 });
  const knowledgeBlock = hits.length
    ? hits.map((h, i) => `[${i + 1}] ${h.path}\n${h.snippet}`).join("\n\n")
    : "(no keyword hits — use PLAYBOOK / LAUNCH_TIPS below and operator session)";

  const session = ctx.session || {};
  const live = await fetchLiveAgentContext(session);
  const playbook = readPlaybookExcerpt();
  const launch = readLaunchTips();

  const messages = [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: [
        "## Live product session (truth for this operator)",
        live,
        "",
        `UI statusLine: ${session.statusLine || "—"}`,
        `UI mode badge: ${session.mode || "COPILOT"}`,
        "",
        "## Cockpit commands you can prescribe (operator runs these here)",
        "/status /plan /plans /prepare /packet /actions /approve /search /ask /doctor",
        "llm: /llm provider|model|key · headless: artist push, spotify verify, action prepare",
        "",
        "## Working playbook excerpt",
        playbook || "(missing PLAYBOOK.md)",
        "",
        "## Launch tips excerpt",
        launch || "(missing LAUNCH_TIPS.md)",
        "",
        "## Retrieved knowledge snippets",
        knowledgeBlock,
        "",
        "## Operator question — answer as the ads operator copilot (do the job)",
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
    temperature: 0.35,
    maxTokens: 3500,
  });

  return {
    ...result,
    knowledgeHits: hits.length,
    status: llmStatus(),
  };
}
