import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  configDir,
  configPath,
  ensureConfigDirs,
  loadConfig,
  loadApiKey,
  profilesDir,
  saveApiKey,
  saveConfig,
} from "./config.js";
import { knowledgeRoot, readKnowledgeFile, searchKnowledge } from "./knowledge.js";
import {
  AgentClientError,
  agentRequest,
  artistPath,
  formatExecutionPacket,
  getClientContext,
  resolveArtistSlug,
  withActor,
} from "./client.js";

function assertArtistSlug(slug) {
  if (typeof slug !== "string" || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug)) {
    throw new Error(
      "Artist slug must be lowercase letters, numbers, hyphens (2–63 chars), e.g. my-artist"
    );
  }
  return slug;
}

function printHelp() {
  console.log(`6ears-spotify-ads — 6EARS Spotify Ads Manager · Copilot Cockpit

Usage:
  6ears-spotify-ads              Open interactive Copilot Cockpit
  6ears-spotify-ads cockpit      Same
  6ears-spotify-ads <command>    Headless CLI (scripts / CI)

Local / knowledge:
  setup                   Interactive local config (actor, base URL, optional key)
  doctor                  Check Node, config, knowledge pack, optional agent health
  knowledge search <q>    Search offline Spotify Ads knowledge pack
  knowledge tip launch    Pre-flight / when-to-launch tips
  artist init <slug>      Create empty local artist profile (your data only)
  artist show [slug]      Show a local profile
  artist push [slug]      PUT local profile to the agent (empty/unverified fields OK)

Agent (requires wrangler dev / deploy + setup key):
  health                  GET /health (no auth if exposed) or agent ping
  status [slug]           GET artist status (mode, ceilings, counts)
  plan list [slug]        List campaign plans
  plan create [slug]      Create a DRAFT plan (JSON file or interactive)
  review list [slug]      List reviews
  review create [slug]    Create review from stored observations
  audit [slug]            List audit events
  action list [slug]      List action proposals
  action prepare <file>   Prepare one immutable proposal (JSON body)
  action packet <id>      Print Ads Manager COPILOT packet for a proposal
  action approve <id> --digest <hex> [--actor email]
  action reject <id> --digest <hex> [--actor email]
  action execute <id> --digest <hex> [--actor email]
                          (blocked when COPILOT / SPOTIFY_WRITE_ENABLED=false)
  spotify verify [slug]   Read-only ad-account verify (needs Spotify secrets)
  metrics ingest <file>   POST manual metrics observation JSON

Config: ${configDir()}
Knowledge: ${knowledgeRoot()}

Default mode is COPILOT: plan and packets; no auto-spend.
`);
}

function printJson(data) {
  console.log(JSON.stringify(data, null, 2));
}

function handleClientError(e) {
  if (e instanceof AgentClientError) {
    console.error(e.message);
    if (e.body) console.error(JSON.stringify(e.body, null, 2));
    process.exitCode = 1;
    return;
  }
  throw e;
}

async function prompt(rl, label, def) {
  const hint = def != null && def !== "" ? ` [${def}]` : "";
  const ans = (await rl.question(`${label}${hint}: `)).trim();
  return ans || def || "";
}

async function cmdSetup() {
  ensureConfigDirs();
  const rl = readline.createInterface({ input, output });
  try {
    const cfg = loadConfig();
    console.log("6EARS Spotify Ads — local setup (nothing is uploaded by default)\n");
    cfg.operatorActor = await prompt(
      rl,
      "Your operator identity (email or name)",
      cfg.operatorActor || ""
    );
    cfg.baseUrl = await prompt(rl, "Agent base URL", cfg.baseUrl || "http://localhost:8787");
    cfg.defaultArtist = await prompt(
      rl,
      "Default artist slug (optional)",
      cfg.defaultArtist || ""
    );
    const key = await prompt(rl, "Operator API key (leave blank to skip)", "");
    if (key) {
      if (key.length < 32) {
        console.error("Key must be at least 32 characters (agent rejects shorter).");
        process.exitCode = 1;
        return;
      }
      saveApiKey(key);
      cfg.operatorApiKeySet = true;
    }
    saveConfig(cfg);
    console.log(`\nSaved config → ${configPath()}`);
    if (key) console.log("API key stored with mode 0600 in operator.key (never printed again).");
  } finally {
    rl.close();
  }
}

async function cmdDoctor() {
  const issues = [];
  const node = process.versions.node;
  const major = Number(node.split(".")[0]);
  if (major < 20) issues.push(`Node ${node} — need >= 20`);
  else console.log(`✓ Node ${node}`);

  ensureConfigDirs();
  console.log(`✓ Config dir ${configDir()}`);

  const cfg = loadConfig();
  console.log(`  baseUrl: ${cfg.baseUrl}`);
  console.log(`  actor: ${cfg.operatorActor || "(not set)"}`);
  console.log(`  defaultArtist: ${cfg.defaultArtist || "(not set)"}`);
  console.log(`  apiKey: ${loadApiKey() ? "set" : "not set"}`);

  const kr = knowledgeRoot();
  if (fs.existsSync(path.join(kr, "PLAYBOOK.md"))) console.log(`✓ Knowledge pack at ${kr}`);
  else issues.push(`Missing knowledge pack at ${kr}`);
  console.log(`  markdown files: ${countMd(kr)}`);

  // Optional agent health
  try {
    const data = await agentRequest("GET", "/health", { auth: false });
    console.log(`✓ Agent health: ${JSON.stringify(data)}`);
  } catch (e) {
    if (e instanceof AgentClientError) {
      console.log(`· Agent offline or no /health (${e.message.split("\n")[0]})`);
    } else throw e;
  }

  if (issues.length) {
    console.log("\nIssues:");
    for (const i of issues) console.log(`  ✗ ${i}`);
    process.exitCode = 1;
  } else {
    console.log("\ndoctor: OK");
  }
}

function countMd(dir) {
  let n = 0;
  if (!fs.existsSync(dir)) return 0;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) n += countMd(full);
    else if (name.endsWith(".md")) n += 1;
  }
  return n;
}

function cmdKnowledgeSearch(args) {
  const q = args.join(" ").trim();
  if (!q) {
    console.error("Usage: knowledge search <query>");
    process.exitCode = 1;
    return;
  }
  const hits = searchKnowledge(q);
  if (!hits.length) {
    console.log("No hits.");
    return;
  }
  for (const h of hits) {
    console.log(`[${h.score}] ${h.path}`);
    console.log(`    ${h.snippet}`);
  }
}

function cmdKnowledgeTip(topic) {
  if (topic === "launch") {
    console.log(readKnowledgeFile("LAUNCH_TIPS.md"));
    return;
  }
  console.error("Usage: knowledge tip launch");
  process.exitCode = 1;
}

function cmdArtistInit(slug) {
  if (!slug) {
    console.error("Usage: artist init <slug>");
    process.exitCode = 1;
    return;
  }
  assertArtistSlug(slug);
  ensureConfigDirs();
  const file = path.join(profilesDir(), `${slug}.json`);
  if (fs.existsSync(file)) {
    console.error(`Profile already exists: ${file}`);
    process.exitCode = 1;
    return;
  }
  const profile = {
    artistId: slug,
    slug,
    displayName: null,
    spotifyArtistId: null,
    spotifyArtistUri: null,
    genres: [],
    priorityMarkets: [],
    brandNotes: [],
    defaultCurrency: null,
    currencyMinorUnit: 2,
    adAccountId: null,
    markets: [],
    dailyBudgetCeilingMinor: null,
    lifetimeBudgetCeilingMinor: null,
    goals: [],
    notes: null,
    approvalPolicy: {
      maxDailyBudgetMinor: null,
      maxLifetimeBudgetMinor: null,
      requireDistinctApprover: true,
    },
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(file, JSON.stringify(profile, null, 2) + "\n", { mode: 0o600 });
  const cfg = loadConfig();
  if (!cfg.defaultArtist) {
    cfg.defaultArtist = slug;
    saveConfig(cfg);
  }
  console.log(`Created empty profile → ${file}`);
  console.log("Fill IDs and ceilings yourself. Push with: artist push " + slug);
}

function loadLocalProfile(slug) {
  const file = path.join(profilesDir(), `${slug}.json`);
  if (!fs.existsSync(file)) throw new Error(`No local profile: ${file}`);
  return { file, profile: JSON.parse(fs.readFileSync(file, "utf8")) };
}

function cmdArtistShow(slug) {
  try {
    const s = resolveArtistSlug(slug);
    const { file, profile } = loadLocalProfile(s);
    console.log(`# ${file}`);
    printJson(profile);
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}

async function cmdArtistPush(slug) {
  try {
    const s = resolveArtistSlug(slug);
    const { profile } = loadLocalProfile(s);
    const artistId = profile.artistId || profile.slug || s;
    // Agent schema requires displayName min 2 chars; keep IDs null until verified.
    const displayName =
      (profile.displayName && String(profile.displayName).trim()) ||
      `Artist ${artistId}`;
    const body = await withActor({
      profile: {
        artistId,
        displayName,
        spotifyArtistId: profile.spotifyArtistId ?? null,
        spotifyArtistUri: profile.spotifyArtistUri ?? null,
        genres: profile.genres ?? [],
        priorityMarkets: profile.priorityMarkets ?? profile.markets ?? [],
        brandNotes: profile.brandNotes ?? [],
        defaultCurrency: profile.defaultCurrency ?? profile.currency ?? null,
        currencyMinorUnit: profile.currencyMinorUnit ?? 2,
        approvalPolicy: profile.approvalPolicy ?? {
          maxDailyBudgetMinor: profile.dailyBudgetCeilingMinor ?? null,
          maxLifetimeBudgetMinor: profile.lifetimeBudgetCeilingMinor ?? null,
          requireDistinctApprover: true,
        },
      },
    });
    const data = await agentRequest("PUT", artistPath(artistId, "profile"), { body });
    printJson(data);
  } catch (e) {
    handleClientError(e);
  }
}

async function cmdHealth() {
  try {
    try {
      const data = await agentRequest("GET", "/health", { auth: false });
      printJson(data);
      return;
    } catch {
      /* try authenticated status-less path */
    }
    const slug = getClientContext().defaultArtist;
    if (!slug) {
      console.log("No /health and no defaultArtist. Start agent or set artist.");
      process.exitCode = 1;
      return;
    }
    const data = await agentRequest("GET", artistPath(slug, "status"));
    printJson({ ok: true, via: "status", mode: data?.mode ?? data });
  } catch (e) {
    handleClientError(e);
  }
}

async function cmdStatus(slug) {
  try {
    const s = resolveArtistSlug(slug);
    const data = await agentRequest("GET", artistPath(s, "status"));
    printJson(data);
  } catch (e) {
    handleClientError(e);
  }
}

async function cmdPlanList(slug) {
  try {
    const s = resolveArtistSlug(slug);
    printJson(await agentRequest("GET", artistPath(s, "plans")));
  } catch (e) {
    handleClientError(e);
  }
}

async function cmdPlanCreate(args) {
  try {
    let slug;
    let file;
    if (args[0] && args[0].endsWith(".json")) {
      file = args[0];
      slug = args[1];
    } else {
      slug = args[0];
      file = args[1];
    }
    const s = resolveArtistSlug(slug);
    let body;
    if (file && fs.existsSync(file)) {
      body = JSON.parse(fs.readFileSync(file, "utf8"));
      if (!body.actor) body = await withActor(body);
    } else {
      // Minimal DRAFT plan template — operator edits assumptions later
      body = await withActor({
        name: "Draft plan",
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
        assumptions: ["Template plan — not approved spend."],
        constraints: ["COPILOT default; delivery off until approved creative."],
      });
      console.error("(created from template; pass a JSON file to customize)");
    }
    printJson(await agentRequest("POST", artistPath(s, "plans"), { body }));
  } catch (e) {
    handleClientError(e);
  }
}

async function cmdReviewList(slug) {
  try {
    const s = resolveArtistSlug(slug);
    printJson(await agentRequest("GET", artistPath(s, "reviews")));
  } catch (e) {
    handleClientError(e);
  }
}

async function cmdReviewCreate(slug) {
  try {
    const s = resolveArtistSlug(slug);
    const body = await withActor({});
    printJson(await agentRequest("POST", artistPath(s, "reviews"), { body }));
  } catch (e) {
    handleClientError(e);
  }
}

async function cmdAudit(slug) {
  try {
    const s = resolveArtistSlug(slug);
    printJson(await agentRequest("GET", artistPath(s, "audit")));
  } catch (e) {
    handleClientError(e);
  }
}

async function cmdActionList(slug) {
  try {
    const s = resolveArtistSlug(slug);
    printJson(await agentRequest("GET", artistPath(s, "actions")));
  } catch (e) {
    handleClientError(e);
  }
}

function parseDigestFlags(args) {
  const out = { id: null, digest: null, actor: null, rest: [] };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--digest") {
      out.digest = args[++i];
    } else if (args[i] === "--actor") {
      out.actor = args[++i];
    } else if (!out.id) {
      out.id = args[i];
    } else {
      out.rest.push(args[i]);
    }
  }
  return out;
}

async function cmdActionPrepare(file, slug) {
  try {
    if (!file || !fs.existsSync(file)) {
      console.error("Usage: action prepare <action.json> [slug]");
      console.error("Examples: examples/actions/create-draft-campaign.json");
      process.exitCode = 1;
      return;
    }
    const s = resolveArtistSlug(slug);
    let body = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!body.actor) body = await withActor(body);
    const proposal = await agentRequest("POST", artistPath(s, "actions"), { body });
    printJson(proposal);
    if (proposal?.id && proposal?.digest) {
      console.error("\n# next:");
      console.error(`#   action packet ${proposal.id}`);
      console.error(
        `#   action approve ${proposal.id} --digest ${proposal.digest} --actor other@example.com`
      );
    }
  } catch (e) {
    handleClientError(e);
  }
}

async function cmdActionPacket(id, slug) {
  try {
    if (!id) {
      console.error("Usage: action packet <proposal-id> [slug]");
      process.exitCode = 1;
      return;
    }
    const s = resolveArtistSlug(slug);
    const list = await agentRequest("GET", artistPath(s, "actions?limit=100"));
    const arr = Array.isArray(list) ? list : list?.items || list?.proposals || [];
    const proposal = arr.find((p) => p.id === id);
    if (!proposal) {
      console.error(`Proposal ${id} not found in recent actions list.`);
      process.exitCode = 1;
      return;
    }
    console.log(formatExecutionPacket(proposal));
  } catch (e) {
    handleClientError(e);
  }
}

async function cmdActionOp(op, args) {
  try {
    const { id, digest, actor } = parseDigestFlags(args);
    if (!id || !digest) {
      console.error(
        `Usage: action ${op} <proposal-id> --digest <sha256> [--actor email]`
      );
      process.exitCode = 1;
      return;
    }
    const s = resolveArtistSlug(null);
    const body = await withActor({ digest, note: "" }, actor);
    printJson(
      await agentRequest("POST", artistPath(s, `actions/${id}/${op}`), { body })
    );
  } catch (e) {
    handleClientError(e);
  }
}

async function cmdSpotifyVerify(slug) {
  try {
    const s = resolveArtistSlug(slug);
    const body = await withActor({});
    printJson(await agentRequest("POST", artistPath(s, "spotify/verify"), { body }));
  } catch (e) {
    handleClientError(e);
  }
}

async function cmdMetricsIngest(file, slug) {
  try {
    if (!file || !fs.existsSync(file)) {
      console.error("Usage: metrics ingest <observation.json> [slug]");
      console.error("See examples/metrics/manual-observation.example.json");
      process.exitCode = 1;
      return;
    }
    const s = resolveArtistSlug(slug);
    let body = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!body.actor) body = await withActor(body);
    printJson(await agentRequest("POST", artistPath(s, "metrics/manual"), { body }));
  } catch (e) {
    handleClientError(e);
  }
}

export async function main(argv) {
  const [cmd, sub, ...rest] = argv;

  // Interactive Copilot Cockpit (default)
  if (
    !cmd ||
    cmd === "cockpit" ||
    cmd === "ui" ||
    cmd === "tui" ||
    cmd === "--cockpit"
  ) {
    const { runCockpit } = await import("./cockpit/app.js");
    await runCockpit();
    return;
  }

  if (cmd === "help" || cmd === "-h" || cmd === "--help") {
    printHelp();
    return;
  }

  // Force headless even with no other args: 6ears-spotify-ads --cli doctor
  const args = cmd === "--cli" ? [sub, ...rest] : [cmd, sub, ...rest];
  const [c2, s2, ...r2] = args;
  return runCli(c2, s2, r2);
}

async function runCli(cmd, sub, rest) {
  if (!cmd || cmd === "help" || cmd === "-h" || cmd === "--help") {
    printHelp();
    return;
  }
  switch (cmd) {
    case "setup":
      await cmdSetup();
      break;
    case "doctor":
      await cmdDoctor();
      break;
    case "health":
      await cmdHealth();
      break;
    case "knowledge":
      if (sub === "search") cmdKnowledgeSearch(rest);
      else if (sub === "tip") cmdKnowledgeTip(rest[0]);
      else {
        console.error("Usage: knowledge search <q> | knowledge tip launch");
        process.exitCode = 1;
      }
      break;
    case "artist":
      if (sub === "init") cmdArtistInit(rest[0]);
      else if (sub === "show") cmdArtistShow(rest[0]);
      else if (sub === "push") await cmdArtistPush(rest[0]);
      else {
        console.error("Usage: artist init|show|push [slug]");
        process.exitCode = 1;
      }
      break;
    case "status":
      await cmdStatus(sub);
      break;
    case "plan":
      if (sub === "list") await cmdPlanList(rest[0]);
      else if (sub === "create") await cmdPlanCreate(rest);
      else {
        console.error("Usage: plan list|create [slug] [file.json]");
        process.exitCode = 1;
      }
      break;
    case "review":
      if (sub === "list") await cmdReviewList(rest[0]);
      else if (sub === "create") await cmdReviewCreate(rest[0]);
      else {
        console.error("Usage: review list|create [slug]");
        process.exitCode = 1;
      }
      break;
    case "audit":
      await cmdAudit(sub);
      break;
    case "action":
      if (sub === "list") await cmdActionList(rest[0]);
      else if (sub === "prepare") await cmdActionPrepare(rest[0], rest[1]);
      else if (sub === "packet") await cmdActionPacket(rest[0], rest[1]);
      else if (sub === "approve" || sub === "reject" || sub === "execute")
        await cmdActionOp(sub, rest);
      else {
        console.error(
          "Usage: action list|prepare|packet|approve|reject|execute …"
        );
        process.exitCode = 1;
      }
      break;
    case "spotify":
      if (sub === "verify") await cmdSpotifyVerify(rest[0]);
      else {
        console.error("Usage: spotify verify [slug]");
        process.exitCode = 1;
      }
      break;
    case "metrics":
      if (sub === "ingest") await cmdMetricsIngest(rest[0], rest[1]);
      else {
        console.error("Usage: metrics ingest <file.json> [slug]");
        process.exitCode = 1;
      }
      break;
    default:
      console.error(`Unknown command: ${cmd}`);
      printHelp();
      process.exitCode = 1;
  }
}
