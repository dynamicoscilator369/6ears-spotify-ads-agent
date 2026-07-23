# Phase 4 — npm packaging

## Package

| Field | Value |
|--------|--------|
| Name | `6ears-spotify-ads` |
| Version | `0.1.0` |
| Binary | `6ears-spotify-ads` |
| Engines | Node `>=20` |
| Ship | `bin/`, `src/`, `knowledge/`, README, LICENSE |

## Commands

```bash
npm run privacy-audit   # no private client IDs in tree
npm test                # CLI + agent tests
npm run check-pack      # pack + audit tarball
npm run release:dry     # all of the above
```

## Install from monorepo

```bash
npm install -g ./packages/cli
6ears-spotify-ads doctor
```

## Install from tarball

```bash
npm run check-pack
npm install -g ./6ears-spotify-ads-0.1.0.tgz
```

## What does not ship

- `packages/agent` Worker (deploy separately)
- `.dev.vars`, tokens, client profiles
- Creative media, campaign IDs

## Publish (when ready)

1. `npm run release:dry`
2. Confirm package name available on npm
3. `npm publish -w 6ears-spotify-ads --access public`
4. Tag `v0.1.0`

Not done automatically in this phase.

## Phase 5 (later)

- Single-file binary via Bun compile
- GitHub Releases + checksums
