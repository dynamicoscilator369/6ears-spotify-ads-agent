/**
 * HTTP client for the 6EARS / Spotify Ads Cloudflare agent.
 * Never logs the operator API key.
 */

import { loadApiKey, loadConfig } from "./config.js";

export class AgentClientError extends Error {
  constructor(message, { status = null, body = null } = {}) {
    super(message);
    this.name = "AgentClientError";
    this.status = status;
    this.body = body;
  }
}

export function getClientContext() {
  const cfg = loadConfig();
  const key = loadApiKey();
  return {
    baseUrl: (cfg.baseUrl || "http://localhost:8787").replace(/\/$/, ""),
    actor: cfg.operatorActor || null,
    defaultArtist: cfg.defaultArtist || null,
    key,
  };
}

/**
 * @param {string} method
 * @param {string} path - e.g. /v1/artists/my-artist/status or /health
 * @param {object} [opts]
 * @param {object|null} [opts.body]
 * @param {boolean} [opts.auth=true]
 */
export async function agentRequest(method, path, opts = {}) {
  const { auth = true, body = null } = opts;
  const { baseUrl, actor, key } = getClientContext();
  const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  const headers = {
    Accept: "application/json",
  };
  if (auth) {
    if (!key || key.length < 32) {
      throw new AgentClientError(
        "Operator API key missing or too short (need >= 32 chars). Run: 6ears-spotify-ads setup"
      );
    }
    headers.Authorization = `Bearer ${key}`;
  }
  if (actor) headers["X-Operator-Actor"] = actor;
  if (body != null) headers["Content-Type"] = "application/json";

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body == null ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    throw new AgentClientError(
      `Agent unreachable at ${baseUrl}: ${e.message}. Start packages/agent with wrangler dev.`
    );
  }

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const msg =
      data?.error?.message ||
      data?.message ||
      `HTTP ${res.status} from agent`;
    throw new AgentClientError(msg, { status: res.status, body: data });
  }
  return data;
}

export function artistPath(slug, resource = "") {
  const base = `/v1/artists/${encodeURIComponent(slug)}`;
  if (!resource) return base;
  return `${base}/${resource.replace(/^\//, "")}`;
}

export function resolveArtistSlug(explicit) {
  const { defaultArtist } = getClientContext();
  const slug = explicit || defaultArtist;
  if (!slug) {
    throw new AgentClientError(
      "No artist slug. Pass one or set defaultArtist via setup / artist init."
    );
  }
  return slug;
}

export async function withActor(body = {}, actorOverride = null) {
  const { actor } = getClientContext();
  const resolved = actorOverride || actor;
  if (!resolved) {
    throw new AgentClientError("operatorActor not set. Run: 6ears-spotify-ads setup");
  }
  return { ...body, actor: resolved };
}

/**
 * Build a human COPILOT packet from a proposal (never claims Spotify was mutated).
 */
export function formatExecutionPacket(proposal) {
  const lines = [];
  lines.push("# Ads Manager execution packet (COPILOT)");
  lines.push("");
  lines.push("This is **not** proof that Spotify was changed. Reproduce manually, then record outcome.");
  lines.push("");
  lines.push(`- Proposal ID: ${proposal.id ?? "?"}`);
  lines.push(`- Status: ${proposal.status ?? "?"}`);
  lines.push(`- Digest: ${proposal.digest ?? "?"}`);
  lines.push(`- Policy: ${proposal.policyDecision?.status ?? "?"} ${(proposal.policyDecision?.reasons || []).join("; ")}`);
  lines.push(`- Created by: ${proposal.createdBy ?? "?"}`);
  lines.push(`- Expires: ${proposal.expiresAt ?? "?"}`);
  const req = proposal.request || {};
  lines.push(`- Kind: ${req.kind ?? "?"}`);
  lines.push(`- Currency: ${req.currency ?? "?"}`);
  lines.push(`- Max additional spend (minor units): ${req.maxAdditionalSpendMinor ?? "?"}`);
  lines.push(`- Reason: ${req.reason ?? "?"}`);
  if (req.kind === "CREATE_DRAFT_CAMPAIGN") {
    lines.push("");
    lines.push("## Manual steps");
    lines.push("1. Open Ads Manager → create **draft** campaign named:");
    lines.push(`   ${(req.payload && req.payload.name) || "(see payload)"}`);
    lines.push("2. Do **not** publish until a separate PUBLISH proposal is approved.");
    lines.push("3. Save draft IDs and hierarchy version for validate/publish actions.");
  } else if (req.kind === "SET_AD_SET_DELIVERY") {
    lines.push("");
    lines.push("## Manual steps");
    lines.push(`1. Open ad set \`${req.adSetId}\`.`);
    lines.push(`2. Set delivery **${req.delivery}**.`);
    lines.push("3. Confirm spend/flight match the approved anchors if delivery is ON.");
  } else if (req.kind === "VALIDATE_DRAFT_CAMPAIGN" || req.kind === "PUBLISH_DRAFT_CAMPAIGN") {
    lines.push("");
    lines.push("## Manual steps");
    lines.push(`1. Draft campaign: \`${req.draftCampaignId}\``);
    lines.push(`2. Hierarchy version: \`${req.draftHierarchyVersion}\``);
    lines.push(`3. Action: **${req.kind === "PUBLISH_DRAFT_CAMPAIGN" ? "PUBLISH" : "VALIDATE"}**`);
  } else {
    lines.push("");
    lines.push("## Payload");
    lines.push("```json");
    lines.push(JSON.stringify(req, null, 2));
    lines.push("```");
  }
  lines.push("");
  lines.push("## After you act");
  lines.push("- Ingest metrics or note outcome in audit/learnings.");
  lines.push("- Do **not** retry an interrupted write blindly; reconcile first.");
  return lines.join("\n");
}
