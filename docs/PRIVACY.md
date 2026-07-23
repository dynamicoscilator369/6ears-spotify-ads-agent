# Privacy

This product is **self-hosted**. 6EARS does not receive your client data from the CLI or Worker unless you deliberately send it.

## What ships

- Public/paraphrased Spotify Ads knowledge corpus
- Empty profile templates
- Approval-gated agent source code

## What never ships

- Client emails, ad account IDs, track IDs, campaign IDs, tokens, creatives

## Local data

- Config and profiles: `~/.config/6ears-spotify-ads/` (mode 0600/0700)
- Operator key: `~/.config/6ears-spotify-ads/operator.key`

## Before publish

```bash
npm run privacy-audit
```
