# 6EARS Spotify Ads Manager Agent

Terminal-first **Spotify Ads** operator for artists, managers, and labels.

- **CLI** (`6ears-spotify-ads`): offline knowledge, local artist profiles, agent client  
- **Cloudflare Agent** (`packages/agent`): approval-gated plans and spend actions  
- **Your data only**: empty profiles — no client accounts ship in the package  

Default mode: **COPILOT** (plan + Ads Manager packets). Live writes require explicit gates.

## Install (download-ready)

```bash
npm run release:dry          # privacy + tests + pack audit
npm install -g ./packages/cli
# or: npm install -g ./6ears-spotify-ads-0.1.0.tgz
6ears-spotify-ads doctor
```

## Quick start (CLI)

```bash
cd 6ears-spotify-ads-agent
npm install
node packages/cli/bin/6ears-spotify-ads.js doctor
node packages/cli/bin/6ears-spotify-ads.js knowledge tip launch
node packages/cli/bin/6ears-spotify-ads.js knowledge search "audio ad script"
node packages/cli/bin/6ears-spotify-ads.js artist init my-artist
```

Optional global link:

```bash
npm link -w 6ears-spotify-ads
6ears-spotify-ads doctor
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
