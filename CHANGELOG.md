# Changelog

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
