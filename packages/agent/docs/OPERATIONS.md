# Operations

## Routine review

1. Read artist `status` and confirm mode, capability, and schedule.
2. Sync through the official API if access is verified; otherwise ingest a dated Ads Manager export.
3. Read the latest review and inspect every evidence gap.
4. Compare API observations with Ads Manager for material discrepancies.
5. Store only evidence-backed learnings with a calibrated confidence level.
6. If a change is warranted, create a new proposal. Reviews never mutate campaigns automatically.

## Pacing interpretation

- `ON_TRACK` means spend progress is within 20 percentage points of time progress under this repository's simple deterministic rule. It is not proof of effectiveness.
- `UNDERPACING` or `STALLED` prompts checks of review status, schedule, targeting, asset state, audience size, and other delivery constraints.
- `OVERPACING` prompts a burn-rate and cap review.
- `EXHAUSTED` prompts confirmation of billed spend and delivery state.
- Frequency above 3 is surfaced as a fatigue question, not a universal threshold or automatic conclusion.

Change these rules only with explicit product requirements and tests.

## Proposal review checklist

Before approving, compare the complete returned action with the intended Spotify resource:

- correct artist and ad account;
- exact campaign/ad-set/ad or draft ID;
- action kind and delivery state;
- currency and currency minor unit;
- entity budget micro-amount and its human-readable equivalent;
- declared maximum additional spend;
- current budget ceilings;
- creative and targeting evidence;
- draft hierarchy version for validate/publish;
- expiry, creator, approver, and digest.

Approval records the exact packet. It is not permission to change adjacent fields.

## Reconciliation procedure

Use this when a proposal is `RECONCILIATION_REQUIRED` or when the operator cannot prove the result of a manual Ads Manager action.

1. Stop. Do not execute or recreate the action.
2. Record the proposal ID, Spotify trace ID if available, request ID, UTC time, actor, and expected resource.
3. Inspect the resource in Ads Manager without editing it.
4. Use a safe API GET if access exists and compare IDs, budgets, delivery, and draft/live status.
5. Determine one of: definitely applied, definitely not applied, partially applied, or still unknown.
6. Add an audit-friendly learning or external incident record without secrets.
7. Create a replacement proposal only after the state is known and the desired delta has been recalculated.

The connector deliberately does not offer a retry button for an uncertain mutation.

## Credential failure

If verification or sync begins returning authentication errors:

1. keep writes disabled;
2. inspect the request ID and redacted Spotify error/trace ID;
3. confirm the app is still ads-enabled and terms/access remain valid;
4. renew OAuth authorization according to Spotify's current flow;
5. rotate the Worker secret, never the example file;
6. repeat `spotify/verify` before resuming sync or execution.

## Audit and logs

The durable `audit` route records attributed business events. Workers observability records structured request completion/failure logs with request IDs, paths, status codes, and durations. Neither is designed to store raw request bodies or secrets.

Retention in the Agent is intentionally bounded for observations, reviews, proposals, learnings, and audit events. If legal or business record retention is required, export redacted records to an approved system before the cap is reached. That archival integration is outside this repository.

## Rollback

Application rollback and campaign rollback are different:

- Application: redeploy a previously verified source revision. Durable Object migration `v1` is additive and should not be removed from configuration.
- Campaign: create and approve an explicit Spotify proposal such as delivery `OFF`; never assume redeploying the Worker reverses a Spotify change.

Turning `SPOTIFY_WRITE_ENABLED` back to `false` is an immediate control-plane containment step. It does not pause already-running Spotify delivery.
