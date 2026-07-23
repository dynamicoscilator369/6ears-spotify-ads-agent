# Contributing

## Setup

```bash
git clone <this-repo>
cd 6ears-spotify-ads-agent
npm install
npm run test -w 6ears-spotify-ads
```

Optional agent:

```bash
cd packages/agent
cp .dev.vars.example .dev.vars
# OPERATOR_API_KEY >= 32 chars
npm install
npx wrangler dev --ip 127.0.0.1 --port 8787
```

## Privacy (non-negotiable)

- Do not commit client ad-account IDs, emails, track IDs, tokens, creatives, or `.dev.vars`.
- Run `npm run privacy-audit` before opening a PR.
- Artist examples stay empty templates only.

## PR checklist

- [ ] `npm run privacy-audit`
- [ ] `npm run test -w 6ears-spotify-ads`
- [ ] Agent tests if you touched `packages/agent`
- [ ] `npm run check-pack` if you touched CLI packaging or knowledge
- [ ] Docs updated if behavior changed

## Layout

| Path | Own |
|------|-----|
| `packages/cli` | Downloadable CLI + knowledge |
| `packages/agent` | Cloudflare approval-gated agent |
| `packages/shared` | Tiny shared helpers |
| `examples/` | Safe empty/action templates |
| `docs/` | Human docs |

## Code style

- CLI is plain ESM JS (no build step).
- Agent is TypeScript + Vitest + Wrangler.
- Prefer COPILOT-safe defaults; never enable live writes by default.
