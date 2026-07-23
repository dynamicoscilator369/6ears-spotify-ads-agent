# Security

## Report issues

If you find a vulnerability, email the maintainers privately rather than opening a public issue with exploit details.

## Secrets

| Secret | Where it lives |
|--------|----------------|
| Operator API key | `~/.config/6ears-spotify-ads/operator.key` (local) or Worker secrets |
| Spotify OAuth / refresh | `packages/agent/.dev.vars` or Cloudflare secrets — never git |
| Client ad accounts / creatives | Operator profiles and Ads Manager — never ship in npm/binary |

## Defaults

- Runtime mode **COPILOT**: no automatic Spotify mutations.
- `SPOTIFY_WRITE_ENABLED=false` in wrangler vars.
- Distinct approver recommended for spend-bearing actions.
- POST/PATCH mutations are not auto-retried.

## Dependency / supply chain

- Run `npm ci` from the lockfile in CI.
- Review `npm audit` before major releases.

## What this project is not

- Not a multi-tenant SaaS that stores your clients’ data for 6EARS by default.
- Self-host the agent on **your** Cloudflare account for production.
