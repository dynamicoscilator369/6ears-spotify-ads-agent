/**
 * Copilot Cockpit command router (slash + free text).
 * Pure async handlers; no Ink dependency.
 */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { searchKnowledge, knowledgeRoot } from "../knowledge.js";
import {
  AgentClientError,
  agentRequest,
  artistPath,
  formatExecutionPacket,
  getClientContext,
  resolveArtistSlug,
  withActor,
} from "../client.js";
import { loadApiKey, loadConfig } from "../config.js";
import { askLlm } from "../llm/ask.js";
import {
  clearLlmKey,
  getLlmSettings,
  listProviders,
  llmStatus,
  saveLlmKey,
  saveLlmSettings,
} from "../llm/config.js";
import { pushLog, pushBlock } from "./state.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_EXAMPLES = path.resolve(__dirname, "../../../../examples/actions");

export function helpText() {
  return [
    "6EARS Spotify Ads Manager · Copilot Cockpit",
    "",
    "Scroll: PgUp / PgDn · ↑/↓ (empty input) · Ctrl+U / Ctrl+D · Ctrl+E = latest",
    "",
    "Commands:",
    "  /help              this sheet",
    "  /status            refresh agent + mode",
    "  /search <query>    knowledge pack only",
    "  /ask <question>    LLM copilot (one answer block)",
    "  /chat on|off       free text uses LLM when on",
    "  /llm               show LLM connector status",
    "  /llm provider <id> openrouter|openai|xai|anthropic|custom",
    "  /llm model <name>  e.g. openai/gpt-4o-mini",
    "  /llm key <secret>  store API key (not printed back)",
    "  /llm clear-key     remove key for current provider",
    "  /plan /prepare /packet /actions /approve …",
    "  /doctor            local + knowledge checks",
    "  /clear             clear mission log",
    "  quit / exit / q    leave cockpit",
    "",
    "Free text → knowledge search (or LLM if /chat on).",
    "Default mode is COPILOT — no auto-spend. Keys stay local (0600).",
  ].join("\n");
}

async function refreshStatus(state) {
  const cfg = loadConfig();
  let next = pushLog(state, "Refreshing status…");
  try {
    await agentRequest("GET", "/health", { auth: false });
    next = { ...next, agentOnline: true };
    next = pushLog(next, "Agent health: OK", "ok");
  } catch {
    next = { ...next, agentOnline: false, mode: "COPILOT" };
    next = pushLog(next, "Agent offline — knowledge still works. Start wrangler dev for live status.", "warn");
    next = {
      ...next,
      statusLine: `artist ${cfg.defaultArtist || "—"} · agent OFFLINE · key ${loadApiKey() ? "set" : "missing"}`,
      counts: null,
    };
    return next;
  }

  try {
    const slug = resolveArtistSlug(null);
    const st = await agentRequest("GET", artistPath(slug, "status"));
    const mode = st.mode || "COPILOT";
    const counts = st.counts || null;
    const writes = st.liveWritesEnvironmentEnabled ? "ON" : "OFF";
    next = {
      ...next,
      mode,
      artist: st.state?.artist || { artistId: slug },
      counts,
      statusLine: `artist ${slug} · agent ONLINE · mode ${mode} · writes ${writes}`,
    };
    next = pushLog(
      next,
      `status · mode=${mode} · writes=${writes} · plans=${counts?.artifacts ?? "?"} proposals=${counts?.proposals ?? "?"}`,
      "ok"
    );
  } catch (e) {
    next = pushLog(next, `status error: ${e.message}`, "err");
    next = {
      ...next,
      statusLine: `agent ONLINE · artist status failed · ${e.message.slice(0, 60)}`,
    };
  }
  return next;
}

async function runDoctor(state) {
  let next = state;
  const cfg = loadConfig();
  next = pushLog(next, `Node ${process.versions.node}`);
  next = pushLog(next, `Config ${cfg.baseUrl} · actor ${cfg.operatorActor || "(unset)"} · default ${cfg.defaultArtist || "(unset)"}`);
  next = pushLog(next, `Operator key ${loadApiKey() ? "set" : "not set"}`);
  const llm = llmStatus();
  next = pushLog(
    next,
    `LLM ${llm.enabled ? "ready" : "off"} · provider ${llm.provider} · model ${llm.model || "—"} · key ${llm.keySet ? "set" : "missing"}`
  );
  try {
    const root = knowledgeRoot();
    let n = 0;
    const walk = (d) => {
      for (const name of fs.readdirSync(d)) {
        const f = path.join(d, name);
        if (fs.statSync(f).isDirectory()) walk(f);
        else if (name.endsWith(".md")) n++;
      }
    };
    walk(root);
    next = pushLog(next, `Knowledge pack: ${n} markdown files`, "ok");
  } catch (e) {
    next = pushLog(next, `Knowledge: ${e.message}`, "err");
  }
  return refreshStatus(next);
}

async function runAsk(state, question) {
  let next = pushLog(
    state,
    `ask: ${question.slice(0, 120)}${question.length > 120 ? "…" : ""}`
  );
  next = pushLog(next, "… calling LLM (grounded on knowledge pack)", "warn");
  try {
    const result = await askLlm(question, {
      session: {
        mode: state.mode,
        statusLine: state.statusLine,
        artistId: state.artist?.artistId || loadConfig().defaultArtist,
      },
    });
    // One question → one answer block (not a new log line per sentence)
    const title = `LLM ${result.provider} · ${result.model} · hits ${result.knowledgeHits}`;
    next = pushBlock(next, result.content, "ok", title);
  } catch (e) {
    next = pushLog(next, e.message || String(e), "err");
  }
  return next;
}

function runLlmStatus(state) {
  const s = llmStatus();
  let next = pushLog(state, "LLM connector", "ok");
  next = pushLog(next, `  enabled: ${s.enabled} · key: ${s.keySet ? "set" : "missing"}`);
  next = pushLog(next, `  provider: ${s.provider} (${s.providerLabel})`);
  next = pushLog(next, `  model: ${s.model || "—"}`);
  next = pushLog(next, `  baseUrl: ${s.baseUrl || "—"}`);
  next = pushLog(next, `  chatModeDefault: ${s.chatModeDefault}`);
  next = pushLog(next, `  providers: ${s.providers.join(", ")}`);
  next = pushLog(next, "Set key: /llm key sk-or-…   provider: /llm provider openrouter");
  return next;
}

function runLlmCommand(state, rest) {
  const parts = rest.trim().split(/\s+/).filter(Boolean);
  const sub = (parts[0] || "").toLowerCase();
  if (!sub || sub === "status") return { state: runLlmStatus(state) };

  if (sub === "provider" && parts[1]) {
    const id = parts[1].toLowerCase();
    if (!listProviders().find((p) => p.id === id)) {
      return {
        state: pushLog(state, `Unknown provider. Use: ${listProviders().map((p) => p.id).join(", ")}`, "err"),
      };
    }
    saveLlmSettings({ provider: id, enabled: true });
    return { state: pushLog(state, `LLM provider → ${id}`, "ok") };
  }

  if (sub === "model" && parts[1]) {
    const model = parts.slice(1).join(" ");
    saveLlmSettings({ model, enabled: true });
    return { state: pushLog(state, `LLM model → ${model}`, "ok") };
  }

  if (sub === "base" && parts[1]) {
    saveLlmSettings({ baseUrl: parts[1], provider: "custom", enabled: true });
    return { state: pushLog(state, `LLM baseUrl → ${parts[1]} (provider custom)`, "ok") };
  }

  if (sub === "key" && parts[1]) {
    const key = parts.slice(1).join(" ").trim();
    const provider = getLlmSettings().provider || "openrouter";
    saveLlmKey(provider, key);
    return {
      state: pushLog(
        state,
        `LLM key saved for ${provider} (not displayed). Try: /ask how should I structure a 30s audio ad?`,
        "ok"
      ),
    };
  }

  if (sub === "clear-key" || sub === "clearkey") {
    const provider = getLlmSettings().provider || "openrouter";
    clearLlmKey(provider);
    saveLlmSettings({ enabled: false });
    return { state: pushLog(state, `LLM key cleared for ${provider}`, "ok") };
  }

  return {
    state: pushLog(
      state,
      "Usage: /llm | /llm provider <id> | /llm model <name> | /llm key <secret> | /llm clear-key",
      "warn"
    ),
  };
}

function runSearch(state, query) {
  let next = pushLog(state, `search: ${query}`);
  const hits = searchKnowledge(query, { limit: 6 });
  if (!hits.length) {
    return pushLog(next, "No knowledge hits.", "warn");
  }
  for (const h of hits) {
    next = pushLog(next, `[${h.score}] ${h.path}`);
    next = pushLog(next, `    ${h.snippet}`);
  }
  next = pushLog(
    next,
    "COPILOT: treat pack hits as guidance; verify live specs before spend.",
    "ok"
  );
  return next;
}

async function runPlanCreate(state) {
  let next = state;
  try {
    const s = resolveArtistSlug(null);
    const body = await withActor({
      name: "Cockpit draft plan",
      goal: "ENGAGEMENT_ON_SPOTIFY",
      promotedWork: "Replace with verified promoted work",
      hypothesis: "State a falsifiable creative/audience hypothesis.",
      startTime: new Date().toISOString(),
      endTime: new Date(Date.now() + 7 * 864e5).toISOString(),
      countries: ["CA"],
      formats: ["AUDIO"],
      currency: "CAD",
      currencyMinorUnit: 2,
      dailyBudgetMinor: 1000,
      lifetimeBudgetMinor: null,
      successMetrics: ["IMPRESSIONS", "CLICKS"],
      knownFacts: [],
      assumptions: ["Template from cockpit — not approved spend."],
      constraints: ["COPILOT; delivery off until approved creative."],
    });
    const plan = await agentRequest("POST", artistPath(s, "plans"), { body });
    next = pushLog(next, `plan created · id=${plan.id}`, "ok");
    next = pushLog(next, `  ${plan.name} · ${plan.goal}`);
  } catch (e) {
    next = pushLog(next, planErr(e), "err");
  }
  return next;
}

async function runPlans(state) {
  let next = state;
  try {
    const s = resolveArtistSlug(null);
    const list = await agentRequest("GET", artistPath(s, "plans"));
    const arr = Array.isArray(list) ? list : [];
    next = pushLog(next, `plans: ${arr.length}`);
    for (const p of arr.slice(0, 10)) {
      next = pushLog(next, `  ${p.id?.slice(0, 8)}… ${p.name || p.goal || ""}`);
    }
  } catch (e) {
    next = pushLog(next, planErr(e), "err");
  }
  return next;
}

function resolveActionFile(fileArg) {
  if (fileArg && fs.existsSync(fileArg)) return path.resolve(fileArg);
  const candidates = [
    fileArg && path.resolve(process.cwd(), fileArg),
    path.join(REPO_EXAMPLES, "create-draft-campaign.json"),
    path.join(process.cwd(), "examples/actions/create-draft-campaign.json"),
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

async function runPrepare(state, fileArg) {
  let next = state;
  const file = resolveActionFile(fileArg);
  if (!file) {
    return pushLog(
      next,
      "No action JSON found. Pass path or add examples/actions/create-draft-campaign.json",
      "err"
    );
  }
  try {
    const s = resolveArtistSlug(null);
    let body = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!body.actor) body = await withActor(body);
    const proposal = await agentRequest("POST", artistPath(s, "actions"), { body });
    next = {
      ...next,
      lastProposal: {
        id: proposal.id,
        digest: proposal.digest,
        kind: proposal.request?.kind,
        status: proposal.status,
      },
    };
    next = pushLog(next, `proposal PREPARED · ${proposal.request?.kind}`, "ok");
    next = pushLog(next, `  id ${proposal.id}`);
    next = pushLog(next, `  digest ${proposal.digest}`);
    next = pushLog(next, `  policy ${proposal.policyDecision?.status}`);
    next = pushLog(next, "Next: /packet   or   /approve <id> --digest <hex> --actor other@…");
  } catch (e) {
    next = pushLog(next, planErr(e), "err");
  }
  return next;
}

async function runPacket(state, idArg) {
  let next = state;
  const id = idArg || state.lastProposal?.id;
  if (!id) return pushLog(next, "No proposal id. /prepare first or /packet <id>", "warn");
  try {
    const s = resolveArtistSlug(null);
    const list = await agentRequest("GET", artistPath(s, "actions?limit=100"));
    const arr = Array.isArray(list) ? list : [];
    const proposal = arr.find((p) => p.id === id);
    if (!proposal) return pushLog(next, `Proposal not found: ${id}`, "err");
    const text = formatExecutionPacket(proposal);
    next = pushBlock(next, text, "ok", `packet ${id.slice(0, 8)}…`);
  } catch (e) {
    next = pushLog(next, planErr(e), "err");
  }
  return next;
}

async function runActions(state) {
  let next = state;
  try {
    const s = resolveArtistSlug(null);
    const list = await agentRequest("GET", artistPath(s, "actions?limit=20"));
    const arr = Array.isArray(list) ? list : [];
    next = pushLog(next, `actions: ${arr.length}`);
    for (const p of arr.slice(0, 12)) {
      next = pushLog(
        next,
        `  ${p.status?.padEnd?.(10) || p.status} ${p.id?.slice(0, 8)}… ${p.request?.kind || ""}`
      );
    }
  } catch (e) {
    next = pushLog(next, planErr(e), "err");
  }
  return next;
}

function parseApproveArgs(rest) {
  const out = { id: null, digest: null, actor: null };
  const parts = rest.trim().split(/\s+/).filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === "--digest") out.digest = parts[++i];
    else if (parts[i] === "--actor") out.actor = parts[++i];
    else if (!out.id) out.id = parts[i];
  }
  return out;
}

async function runApprove(state, rest) {
  let next = state;
  const { id, digest, actor } = parseApproveArgs(rest);
  const pid = id || state.lastProposal?.id;
  const dig = digest || state.lastProposal?.digest;
  if (!pid || !dig) {
    return pushLog(
      next,
      "Usage: /approve <id> --digest <hex> --actor owner@example.com",
      "warn"
    );
  }
  try {
    const s = resolveArtistSlug(null);
    const body = await withActor({ digest: dig, note: "cockpit" }, actor);
    const res = await agentRequest("POST", artistPath(s, `actions/${pid}/approve`), {
      body,
    });
    next = pushLog(next, `APPROVED by ${res.approvedBy || actor}`, "ok");
    next = pushLog(next, `  status ${res.status} · execute still gated until writes enabled`);
    if (next.lastProposal?.id === pid) {
      next = {
        ...next,
        lastProposal: { ...next.lastProposal, status: res.status },
      };
    }
  } catch (e) {
    next = pushLog(next, planErr(e), "err");
  }
  return next;
}

function planErr(e) {
  if (e instanceof AgentClientError) {
    const extra = e.body?.error?.message || e.body?.error?.code;
    return extra ? `${e.message} (${extra})` : e.message;
  }
  return e.message || String(e);
}

/**
 * @returns {Promise<{ state: object, quit?: boolean }>}
 */
export async function handleCommand(state, raw) {
  const line = raw.trim();
  if (!line) {
    return { state: await refreshStatus(state) };
  }

  const lower = line.toLowerCase();
  if (lower === "q" || lower === "quit" || lower === "exit") {
    return { state: pushLog(state, "Leaving cockpit."), quit: true };
  }

  if (line === "?" || lower === "help" || lower === "/help") {
    return { state: pushBlock(state, helpText(), "info", "help") };
  }

  if (lower === "/clear") {
    return { state: { ...state, log: [] } };
  }

  if (lower === "/status" || lower === "status") {
    return { state: await refreshStatus(state) };
  }

  if (lower === "/doctor" || lower === "doctor") {
    return { state: await runDoctor(state) };
  }

  if (lower.startsWith("/search ")) {
    return { state: runSearch(state, line.slice(8).trim()) };
  }

  if (lower === "/plan") {
    return { state: await runPlanCreate(state) };
  }

  if (lower === "/plans") {
    return { state: await runPlans(state) };
  }

  if (lower === "/prepare" || lower.startsWith("/prepare ")) {
    const arg = line.slice("/prepare".length).trim();
    return { state: await runPrepare(state, arg || null) };
  }

  if (lower === "/packet" || lower.startsWith("/packet ")) {
    const arg = line.slice("/packet".length).trim();
    return { state: await runPacket(state, arg || null) };
  }

  if (lower === "/actions") {
    return { state: await runActions(state) };
  }

  if (lower.startsWith("/approve")) {
    return { state: await runApprove(state, line.slice("/approve".length)) };
  }

  if (lower === "/llm" || lower.startsWith("/llm ")) {
    return runLlmCommand(state, line.slice(4));
  }

  if (lower === "/ask" || lower.startsWith("/ask ")) {
    const q = line.slice(4).trim();
    if (!q) return { state: pushLog(state, "Usage: /ask <question>", "warn") };
    return { state: await runAsk(state, q) };
  }

  if (lower === "/chat on" || lower === "/chat off") {
    const on = lower.endsWith("on");
    saveLlmSettings({ chatModeDefault: on, enabled: on ? true : getLlmSettings().enabled });
    return {
      state: pushLog(
        state,
        on
          ? "Chat mode ON — free text goes to LLM (grounded). /search for pack-only."
          : "Chat mode OFF — free text is knowledge search. /ask for LLM.",
        "ok"
      ),
    };
  }

  // free text → LLM if chat mode + key, else knowledge search
  const llm = getLlmSettings();
  if (llm.chatModeDefault && llmStatus().keySet) {
    return { state: await runAsk(state, line) };
  }
  return { state: runSearch(state, line) };
}

export async function bootstrap(state) {
  let next = pushLog(state, "6EARS Spotify Ads Manager · Copilot Cockpit", "ok");
  next = pushLog(next, "Default mode COPILOT — plan & packets; no auto-spend.");
  next = pushLog(next, "Type /help · free text searches knowledge · q to quit");
  const ctx = getClientContext();
  next = pushLog(
    next,
    `config baseUrl=${ctx.baseUrl} artist=${ctx.defaultArtist || "—"} key=${ctx.key ? "set" : "missing"}`
  );
  next = await runDoctor(next);
  return next;
}
