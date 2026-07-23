# Getting started — 6EARS Spotify Ads Manager

## Requirements

- Node.js **20+** (22 recommended for the agent Worker)
- Optional: Cloudflare account + Wrangler (for the approval-gated agent)

## 1. Install the CLI (no Spotify account needed)

### From this monorepo

```bash
cd 6ears-spotify-ads-agent
npm install -g ./packages/cli
6ears-spotify-ads doctor
```

### From a packed tarball

```bash
npm run check-pack          # privacy + pack audit
npm install -g ./6ears-spotify-ads-0.1.0.tgz
6ears-spotify-ads doctor
```

### After npm publish (future)

```bash
npm install -g 6ears-spotify-ads
# or one-shot:
npx 6ears-spotify-ads knowledge tip launch
```

## 2. Knowledge (offline)

```bash
6ears-spotify-ads knowledge tip launch
6ears-spotify-ads knowledge search "audio ad companion"
```

## 3. Your first artist (your data only)

```bash
6ears-spotify-ads artist init my-artist
# edit ~/.config/6ears-spotify-ads/profiles/my-artist.json if needed
6ears-spotify-ads artist show
```

No client IDs ship in the package. You enter markets, currency, and ceilings yourself.

## 4. Optional: local agent

```bash
cd packages/agent
cp .dev.vars.example .dev.vars
# set OPERATOR_API_KEY to >= 32 random characters
npm install
npx wrangler dev --ip 127.0.0.1 --port 8787
```

Other terminal:

```bash
6ears-spotify-ads setup     # baseUrl http://127.0.0.1:8787 + same key + actor email
6ears-spotify-ads doctor
6ears-spotify-ads artist push
6ears-spotify-ads status
6ears-spotify-ads plan create
6ears-spotify-ads action prepare examples/actions/create-draft-campaign.json
```

See [PHASE3_ACTIONS.md](./PHASE3_ACTIONS.md) for approve/execute gates.

## 5. Modes

| Mode | Meaning |
|------|---------|
| **COPILOT** (default) | Plan, prepare digests, Ads Manager packets. No live Spotify writes. |
| **API_WRITE_GATED** | Only after verify + `SPOTIFY_WRITE_ENABLED=true` + policy + digest approve. |

## Privacy

- Config: `~/.config/6ears-spotify-ads/`
- Run `npm run privacy-audit` and `npm run check-pack` before any publish.
- [PRIVACY.md](./PRIVACY.md)

## Binary install (Phase 5 — later)

Single-file binaries (Bun/Deno compile) are planned after npm 0.1.0 stabilizes. Same config paths.
