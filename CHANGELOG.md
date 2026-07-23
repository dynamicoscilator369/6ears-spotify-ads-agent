# Changelog

## 0.2.0 — 2026-07-23

### Copilot Cockpit

- Interactive TUI: **6EARS Spotify Ads Manager · Copilot Cockpit**
- Default entry: `6ears-spotify-ads` (no args) or `cockpit`
- Mission log, status strip (ONLINE/OFFLINE · COPILOT), command deck
- Slash commands: `/help` `/status` `/search` `/plan` `/prepare` `/packet` `/actions` `/approve` `/doctor`
- Free text → knowledge search
- Headless subcommands unchanged for scripts/CI

### LLM connectors (bring your own key)

- Plugin-style providers: **OpenRouter**, OpenAI, xAI, Anthropic, custom OpenAI-compatible URL
- Local keys only (`~/.config/6ears-spotify-ads/llm-*.key`, mode 0600)
- CLI: `llm status|providers|provider|model|set-key|clear-key` · `ask <question>`
- Cockpit: `/llm` `/ask` `/chat on|off`
- Answers grounded on local knowledge pack + COPILOT safety rules
- Docs: `docs/LLM_CONNECTORS.md`

## 0.1.0 — 2026-07-23

### Ship readiness (Phase 6)

- GitHub Actions CI (privacy, tests, pack) + optional binary matrix
- Release workflow on tags (assets only; no auto npm publish)
- `docs/RELEASE.md`, `docs/CONTRIBUTING.md`, `SECURITY.md`

### Binary (Phase 5)

- `npm run build:binary` → Bun compile + knowledge sidecar
- `dist/6ears-spotify-ads-v0.1.0-darwin-arm64.tar.gz` + SHA-256
- `scripts/install.sh` → `~/.local/share/6ears-spotify-ads`
- Knowledge path resolution for binary layouts (`SIXEARS_KNOWLEDGE`)

### npm CLI

### CLI (`6ears-spotify-ads`)

- Offline knowledge pack (playbook, system prompt, ads.spotify.com corpus)
- `knowledge search` / `knowledge tip launch`
- Local artist profiles (`artist init|show|push`)
- Agent client: `health`, `status`, `plan`, `review`, `audit`, `action *`, `spotify verify`, `metrics ingest`
- COPILOT execution packets; distinct-approver support via `--actor`
- Config under `~/.config/6ears-spotify-ads/`

### Agent (`packages/agent`)

- Approval-gated Durable Object agent (prepare → approve → execute)
- Default COPILOT; `SPOTIFY_WRITE_ENABLED=false`
- Domain tests + worker integration tests

### Safety

- Privacy audit script (blocks known private client markers)
- npm pack ships only `bin`, `src`, `knowledge`, README, LICENSE
