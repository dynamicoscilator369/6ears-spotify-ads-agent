# Phase 2 — Agent + CLI wiring

## Local agent

```bash
cd packages/agent
cp .dev.vars.example .dev.vars   # set OPERATOR_API_KEY (>= 32 chars)
npm install
npx wrangler dev --ip 127.0.0.1 --port 8787
```

## CLI

```bash
node packages/cli/bin/6ears-spotify-ads.js setup   # baseUrl + actor + same key
node packages/cli/bin/6ears-spotify-ads.js doctor
node packages/cli/bin/6ears-spotify-ads.js artist init my-artist
node packages/cli/bin/6ears-spotify-ads.js artist push my-artist
node packages/cli/bin/6ears-spotify-ads.js status
node packages/cli/bin/6ears-spotify-ads.js plan create
```

## Verified

- `GET /health` public
- Auth required on artist routes
- Profile push, plans, status, audit via CLI
- Agent vitest: 13/13 pass
- Mode stays **COPILOT** until write gate enabled
