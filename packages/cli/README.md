# 6ears-spotify-ads

Terminal CLI for the **6EARS Spotify Ads Manager Agent**.

- Offline Spotify Ads **knowledge** (specs, help, launch tips)
- Local **artist profiles** (your data only — nothing client-specific ships)
- Client for the **approval-gated** Cloudflare agent (optional)

Default mode: **COPILOT** (plan + Ads Manager packets). No auto-spend.

## Install

Requires **Node.js 20+**.

```bash
# from the monorepo
npm install -g ./packages/cli

# or from a packed tarball
npm pack -w 6ears-spotify-ads
npm install -g ./6ears-spotify-ads-0.1.0.tgz
```

When published:

```bash
npm install -g 6ears-spotify-ads
# or
npx 6ears-spotify-ads doctor
```

## Quick start

```bash
6ears-spotify-ads doctor
6ears-spotify-ads knowledge tip launch
6ears-spotify-ads knowledge search "audio ad approval"
6ears-spotify-ads artist init my-artist
6ears-spotify-ads setup   # optional: agent base URL + operator key
```

Config and profiles: `~/.config/6ears-spotify-ads/` (mode 0600/0700).

## Agent (optional)

Deploy or run `packages/agent` with Wrangler, then:

```bash
6ears-spotify-ads status
6ears-spotify-ads action prepare ./create-draft-campaign.json
6ears-spotify-ads action packet <PROPOSAL_ID>
```

See monorepo docs: `docs/PHASE3_ACTIONS.md`, `docs/GETTING_STARTED.md`.

## Privacy

This package does **not** include client ad-account IDs, tokens, or creatives.
You enter your own data after install.

## License

MIT
