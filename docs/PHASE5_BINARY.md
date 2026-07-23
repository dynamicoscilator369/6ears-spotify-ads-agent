# Phase 5 — Binary distribution

## What you get

A **self-contained release folder** for your OS/arch:

```text
6ears-spotify-ads-v0.1.0-darwin-arm64/
  6ears-spotify-ads     # compiled binary (Bun)
  knowledge/            # offline pack (must stay beside the binary)
  README.md
  LICENSE
  INSTALL.txt
```

Plus:

- `6ears-spotify-ads-v0.1.0-darwin-arm64.tar.gz`
- `6ears-spotify-ads-v0.1.0-darwin-arm64.sha256`

## Build (on the target OS)

Requires [Bun](https://bun.sh):

```bash
curl -fsSL https://bun.sh/install | bash
export PATH="$HOME/.bun/bin:$PATH"

cd 6ears-spotify-ads-agent
npm run build:binary
# or full gates + binary:
npm run release:binary
```

Artifacts land in `dist/`.

## Install from archive

```bash
bash scripts/install.sh dist/6ears-spotify-ads-v0.1.0-darwin-arm64.tar.gz
# default: ~/.local/share/6ears-spotify-ads + symlink in ~/.local/bin
export PATH="$HOME/.local/bin:$PATH"
6ears-spotify-ads doctor
```

## Knowledge path

The binary looks for `knowledge/PLAYBOOK.md` next to the executable, then env:

```bash
export SIXEARS_KNOWLEDGE=/path/to/knowledge
```

## Verify checksum

```bash
cd dist
shasum -a 256 -c 6ears-spotify-ads-v0.1.0-darwin-arm64.sha256
```

## GitHub Releases (manual)

1. `npm run release:binary` on each target (darwin-arm64, darwin-x64, linux-x64).
2. Upload `dist/*.tar.gz` + `*.sha256`.
3. Paste install commands from this doc into the release notes.

CI matrix (optional later): GitHub Actions with `oven-sh/setup-bun` per OS.

## Limits

- Binary is built **per platform** (this Mac = darwin-arm64).
- Agent Worker is still separate (`packages/agent` + Wrangler).
- Compiling does not embed the full knowledge tree; the sidecar folder is intentional (easy pack updates).
