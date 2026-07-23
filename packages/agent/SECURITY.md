# Security policy

## Secrets

Keep `OPERATOR_API_KEY`, Spotify client credentials, refresh tokens, and ad-account IDs in `.dev.vars` locally or Cloudflare Worker secrets in production. Never place real values in examples, Git history, request bodies, audit notes, learnings, or logs.

Rotate a credential immediately if it appears in a proposal, log, terminal capture, issue, or commit. Replace both the exposed secret and any token derived from it.

## Production identity

Place the Worker behind Cloudflare Access and set `REQUIRE_CF_ACCESS` to `true`. The API compares each mutating request's `actor` with the verified `cf-access-authenticated-user-email` identity. Local shared-key mode is suitable for one trusted operator, not independent approval proof.

## Spend changes

Keep `SPOTIFY_WRITE_ENABLED` at `false` until the staged deployment checklist is complete. A true value only unlocks the last gate; proposals, ceilings, expiry, digest matching, official API verification, and approval still apply.

No Spotify POST or PATCH is retried automatically. If a network break or server error leaves a mutation outcome uncertain, the proposal enters `RECONCILIATION_REQUIRED`. Verify the actual resource in Ads Manager before any replacement action.

## Dependency override

The current Agents SDK dependency tree declares an older major range of `@hono/node-server` affected by a Windows static-file path advisory. This Worker does not use that Node static server, and `package.json` overrides it to patched `2.0.11`. The full Worker test suite and deployment dry run cover the used Agent paths. Re-test this override whenever the Agents SDK or MCP SDK changes, and remove it once upstream declares a patched compatible version.

## Reporting a vulnerability

Do not include credentials, tokens, artist-private data, or live campaign identifiers in a report. Describe the affected route, expected boundary, observed behavior, and a minimal redacted reproduction.
