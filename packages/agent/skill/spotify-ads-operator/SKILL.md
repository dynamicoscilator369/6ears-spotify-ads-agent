---
name: spotify-ads-operator
description: Operate approval-gated Spotify advertising workflows through the local-first Cloudflare Spotify Ads Agent. Use when asked to plan a Spotify campaign, develop audience or creative briefs, ingest or review Ads Manager performance, assess pacing, store evidence-backed artist learnings, schedule reviews, prepare an Ads API or Ads Manager action, or approve, reject, reconcile, or execute a spend-affecting proposal for a configured artist.
---

# Spotify Ads Operator

Treat the Cloudflare Agent as the durable system of record and Spotify Ads Manager as the final account truth. Start in copilot mode unless the deployed status proves every write gate is enabled.

## Operating contract

1. Separate verified artist/account facts from hypotheses, defaults, and missing information.
2. Never invent Spotify artist IDs, ad-account IDs, target IDs, supported formats, markets, currency, budgets, results, or approvals.
3. Never put tokens, secrets, authorization headers, or private credentials into requests, files, learnings, logs, or chat.
4. Do not equate an Ads Manager screen, plan, draft, or prepared action with a published campaign.
5. Never call Spotify mutation endpoints directly from this skill. Prepare, approve, and execute through the Agent so policy and audit gates apply.
6. Treat reporting metrics as observations. Do not claim causal lift, listener quality, or revenue impact without independent evidence.
7. Do not retry a failed or interrupted mutation. Reconcile it in Ads Manager first.

Read [references/spotify-capabilities.md](references/spotify-capabilities.md) before making a claim about current API support. Read [references/approval-policy.md](references/approval-policy.md) before any proposed account change. Read [references/operator-api.md](references/operator-api.md) when invoking the local client or API.

## Begin every workflow

1. Identify the artist slug. Use a unique slug per artist; keep other artists in separate slugs and Durable Objects.
2. Fetch `GET status` with `scripts/operator.mjs`.
3. Report these states explicitly:
   - artist profile configured or missing;
   - Spotify credentials configured or missing;
   - official read access verified, failed, or unverified;
   - runtime mode `COPILOT` or `API_WRITE_GATED`;
   - live writes enabled or disabled;
   - configured budget ceilings and whether identity enforcement is present.
4. If profile facts are missing, preserve `null` or empty arrays. Ask for or verify only what the requested workflow actually needs.

## Select the lane

### Plan or brief

- Create a campaign plan before an executable action.
- Record known facts, assumptions, constraints, success measures, and decisive evidence gaps.
- Use one major audience or creative variable per test cell where practical.
- Put unresolved target IDs, current format rules, bid estimates, and audience estimates into platform checks.
- Keep every plan and brief in `DRAFT` status.

### Review performance

- Prefer official Ads API ingestion only after `spotify/verify` succeeds.
- Otherwise ingest a dated, attributable Ads Manager export or copy through `metrics/manual`.
- Preserve currency units and provenance. Budget values use minor units internally; Spotify entity budgets use micro-units; aggregate-report spend is returned in major currency units.
- Generate pacing reviews from the latest observation per ad set.
- Present anomalies as investigation prompts, not automatic optimization commands.

### Store a learning

- Store a learning only when it has an observation, evidence, and calibrated confidence.
- Use `LOW` for a single weak observation, `MEDIUM` for repeated or reasonably controlled evidence, and `HIGH` only for strong, repeatable evidence.
- Never train model weights from account data. In this system, “training” means durable, reviewable artist learnings that inform later briefs.
- Do not store secrets or private identity/payment details.

### Schedule reviews

- Configure the cron expression in UTC and state its local-time equivalent.
- Scheduled runs may sync official metrics if access was already verified; otherwise they review stored observations.
- Scheduled runs never create or execute spend changes.

### Prepare an action

1. Read the current artist profile and policy.
2. Prepare only one concrete action per proposal.
3. Declare the maximum additional spend in minor currency units. Draft creation and validation must declare zero.
4. For budgets, convert the approved amount to Spotify micro-units exactly.
5. Anchor budget updates to the observed current budget. Anchor delivery-on actions to the observed budget and flight; cover the conservative remaining-flight exposure.
6. For validation or publication, fetch the current draft campaign hierarchy version before preparing the proposal.
7. Present the returned action kind, material fields, currency, maximum spend, expiry, policy result, and SHA-256 digest.
8. Stop if policy is blocked. Do not weaken limits to make a proposal pass.

### Approve or reject

- Approval must include the exact returned digest.
- When distinct approval is configured, the proposal creator cannot approve it.
- Re-read material fields; do not approve from a description alone.
- Approval does not execute the action.
- Reject stale, ambiguous, incomplete, or no-longer-desired proposals.

### Execute

- Execute only after explicit user authorization for the already-approved proposal.
- Confirm `SPOTIFY_WRITE_ENABLED=true`, official read access remains verified, policy still passes, and the digest matches.
- Draft validation/publication re-checks the hierarchy version immediately before the write.
- Make one execution call. If status becomes `RECONCILIATION_REQUIRED`, stop and inspect Ads Manager before any replacement proposal.
- In `COPILOT` mode, give the operator the approved packet to reproduce in Ads Manager, then ingest or record the observed outcome. Never claim the action happened automatically.

## Reuse for another artist

Create a new profile with a distinct lowercase slug. Do not copy the artist's IDs, markets, audience hypotheses, brand notes, currency, limits, schedules, or learnings. Shared code and workflow are reusable; artist evidence is not.

## Local client

Set `AGENT_BASE_URL`, `OPERATOR_API_KEY`, and `OPERATOR_ACTOR`, then use:

```bash
node scripts/operator.mjs ARTIST_ID METHOD RESOURCE [JSON_FILE]
```

Use `node scripts/operator.mjs --help` for examples. The client injects the actor, never prints the key, and returns a non-zero exit status for rejected requests.
