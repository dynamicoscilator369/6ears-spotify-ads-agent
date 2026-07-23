# Deployment

No deployment was performed while creating this repository. Use a staged rollout and keep writes disabled through the first production verification.

## 1. Preflight

```bash
npm ci
npm run check
npx wrangler deploy --dry-run --outdir dist
```

Review the generated bundle for the expected Agent binding and confirm the repository contains no `.dev.vars`, access tokens, real client secrets, payment data, or private artist records.

## 2. Authenticate Cloudflare

Use your approved Cloudflare account workflow, then confirm the target account before deploying. Do not deploy this Worker into an unrelated account or zone.

## 3. Store secrets

Create a unique production operator key and configure each value interactively:

```bash
npx wrangler secret put OPERATOR_API_KEY
npx wrangler secret put SPOTIFY_CLIENT_ID
npx wrangler secret put SPOTIFY_CLIENT_SECRET
npx wrangler secret put SPOTIFY_REFRESH_TOKEN
npx wrangler secret put SPOTIFY_AD_ACCOUNT_ID
```

Spotify secrets may be omitted for a manual-only copilot deployment. Do not add real values to `wrangler.jsonc`.

## 4. Deploy in copilot mode

Keep these settings in `wrangler.jsonc`:

```json
"SPOTIFY_WRITE_ENABLED": "false",
"REQUIRE_CF_ACCESS": "false"
```

Deploy:

```bash
npm run deploy
```

Check `/health`, then configure Cloudflare Access before loading private artist data.

## 5. Enforce Cloudflare Access

Create an Access self-hosted application for the Worker hostname and restrict it to approved operators. Confirm Access provides an authenticated user email header, then change:

```json
"REQUIRE_CF_ACCESS": "true"
```

Redeploy and verify:

- unauthenticated requests are denied by Access;
- requests without the Access identity header are denied by the Worker;
- an `actor` different from the Access identity is denied;
- the intended planner and approver identities can each operate independently.

For stronger service-to-service operation, extend the gateway to validate Access JWTs or service tokens rather than relying on a shared human operator key alone.

## 6. Verify read-only Spotify access

With writes still disabled:

1. initialize the artist profile with null limits;
2. call `spotify/verify`;
3. compare returned account currency/status with Ads Manager;
4. call `spotify/sync` only after the read verification passes;
5. compare at least one active ad set and report snapshot against Ads Manager;
6. exercise prepare → separate approval → blocked execute and verify the expected `LIVE_WRITES_DISABLED` result.

## 7. Optional write enablement

This is a separate owner decision. Record exact ceilings in the artist profile and select a controlled first action. Prefer a draft creation or validation with zero immediate spend over activation/publication.

Only then change:

```json
"SPOTIFY_WRITE_ENABLED": "true"
```

Redeploy, confirm status shows `API_WRITE_GATED`, prepare a fresh proposal, have a distinct authorized person verify and approve the digest, and execute once. Verify the resulting state in Ads Manager.

Do not leave broad or placeholder ceilings in production. To contain the control plane, set writes back to false and redeploy.

## 8. Observe

Workers observability is enabled with full log ingestion and sampled traces in `wrangler.jsonc`. Monitor:

- 401/403 authentication failures;
- 409 policy or state conflicts;
- Spotify 429/5xx responses and trace IDs;
- any `RECONCILIATION_REQUIRED` proposal;
- scheduled review sync failures;
- unexpected Durable Object growth or recurring alarm failures.

Never paste secrets or unredacted campaign payloads into monitoring annotations.
