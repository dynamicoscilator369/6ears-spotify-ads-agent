# 6EARS Spotify Ads Manager · Copilot Cockpit

Interactive terminal **Copilot Cockpit** for Spotify Ads — plus headless CLI and an approval-gated Cloudflare agent.

- **Copilot Cockpit** — live mission log, status strip, command deck (`/status` `/search` `/plan` `/prepare` `/packet`)
- **Knowledge pack** — offline Spotify Ads guidance
- **Cloudflare Agent** — digests, distinct approve, COPILOT packets (no auto-spend by default)
- **Your data only** — empty profiles; no client accounts in the package

Default mode: **COPILOT**.

## Open the cockpit

```bash
cd 6ears-spotify-ads-agent
npm install
npm install -g ./packages/cli   # optional; ensure /opt/homebrew/bin is on PATH

6ears-spotify-ads               # interactive Copilot Cockpit
# or:
node packages/cli/bin/6ears-spotify-ads.js cockpit
```

Inside the cockpit:

| Input | Action |
|-------|--------|
| free text | knowledge search (or LLM if `/chat on`) |
| `/help` | command sheet |
| `/status` | agent mode + counts |
| `/ask …` | LLM copilot (BYO API key / OpenRouter) |
| `/llm` | connector status · provider · key |
| `/plan` `/prepare` `/packet` | plan & COPILOT action flow |
| `q` | quit |

LLM setup (headless or cockpit): see [docs/LLM_CONNECTORS.md](docs/LLM_CONNECTORS.md).

## Headless CLI (scripts / CI)

```bash
6ears-spotify-ads doctor
6ears-spotify-ads knowledge tip launch
6ears-spotify-ads knowledge search "audio ad script"
6ears-spotify-ads artist init my-artist
```

## Privacy

- Client IDs, tokens, and creatives stay **local** (`~/.config/6ears-spotify-ads/`).
- Run `npm run privacy-audit` before any publish.
- Example profile: `examples/artist.profile.example.json` (all nulls).

## Agent (Cloudflare)

See `packages/agent/README.md` and `packages/agent/docs/SETUP.md`. Deploy to **your** Cloudflare account; do not put secrets in git.

## Repo map

| Path | Purpose |
|------|---------|
| `packages/cli` | Downloadable CLI + knowledge pack |
| `packages/agent` | Durable Object agent (from approval-gated design) |
| `packages/shared` | Small shared helpers |
| `scripts/privacy-audit.sh` | Block known private markers |

## License

MIT — see package licenses. Spotify and Cloudflare are trademarks of their owners.


## Local agent (Phase 2)

```bash
cd packages/agent && npm install
# set OPERATOR_API_KEY in .dev.vars (>= 32 chars)
npx wrangler dev --ip 127.0.0.1 --port 8787
# other terminal:
node packages/cli/bin/6ears-spotify-ads.js doctor
node packages/cli/bin/6ears-spotify-ads.js artist push
node packages/cli/bin/6ears-spotify-ads.js status
```


## Actions (Phase 3)

```bash
node packages/cli/bin/6ears-spotify-ads.js action prepare examples/actions/create-draft-campaign.json
node packages/cli/bin/6ears-spotify-ads.js action packet <PROPOSAL_ID>
node packages/cli/bin/6ears-spotify-ads.js action approve <ID> --digest <hex> --actor owner@example.com
# execute stays blocked until SPOTIFY_WRITE_ENABLED=true
```

See `docs/PHASE3_ACTIONS.md`.


## Binary release (Phase 5)

```bash
# needs Bun: curl -fsSL https://bun.sh/install | bash
npm run build:binary
bash scripts/install.sh dist/6ears-spotify-ads-v0.1.0-darwin-arm64.tar.gz
export PATH="$HOME/.local/bin:$PATH"
6ears-spotify-ads doctor
```

See `docs/PHASE5_BINARY.md`.

## Ship readiness (Phase 6)

| Doc | Purpose |
|-----|---------|
| [docs/RELEASE.md](docs/RELEASE.md) | Version bump, tag, npm publish (human) |
| [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) | Dev setup + PR checklist |
| [SECURITY.md](SECURITY.md) | Secrets + defaults |
| [docs/PRIVACY.md](docs/PRIVACY.md) | What ships vs local-only |

```bash
npm run release:dry   # privacy + tests + pack audit
```

CI: `.github/workflows/ci.yml` (push/PR). Release assets: tag `v*` → `.github/workflows/release.yml` (does **not** auto-publish to npm).

### Push to GitHub (when ready)

```bash
# create empty repo on GitHub, then:
git remote add origin git@github.com:YOUR_ORG/6ears-spotify-ads-agent.git
git push -u origin main
```
