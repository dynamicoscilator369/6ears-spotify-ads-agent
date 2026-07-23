# Release process

## Preflight (always)

```bash
npm run release:dry    # privacy-audit + tests + check-pack
npm run build:binary   # optional; needs Bun
```

Confirm:

- [ ] `CHANGELOG.md` updated for the version
- [ ] `packages/cli/package.json` version matches tag intent
- [ ] No `.dev.vars` or client secrets in the tree
- [ ] `npm run privacy-audit` clean

## Version bump

1. Bump `packages/cli/package.json` `version` (and root if you mirror it).
2. Update `CHANGELOG.md`.
3. Commit: `chore: release vX.Y.Z`

## GitHub

```bash
git tag vX.Y.Z
git push origin main
git push origin vX.Y.Z
```

Tag push runs `.github/workflows/release.yml` (assets + GitHub Release).  
CI on push runs tests + pack; binary matrix runs on tags / manual dispatch.

## npm publish (human only)

```bash
npm login
npm view 6ears-spotify-ads   # expect 404 if free
npm run release:dry
npm publish -w 6ears-spotify-ads --access public
```

Verify on a clean machine:

```bash
npx 6ears-spotify-ads@X.Y.Z doctor
```

Never put `NPM_TOKEN` in the repo.

## Release notes template

```markdown
## 6ears-spotify-ads vX.Y.Z

### Install (npm)
npm install -g 6ears-spotify-ads

### Install (binary)
Download the tarball for your OS from Assets.
bash scripts/install.sh 6ears-spotify-ads-vX.Y.Z-<os-arch>.tar.gz

### Agent
Self-host packages/agent with Wrangler. Default COPILOT; writes off.

### Changes
- …
```
