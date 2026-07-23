# Phase 3 — Actions, approvals, Spotify verify

## Safety model

```text
prepare (digest) → approve (different actor by default) → execute
```

- **COPILOT** (default): execute is blocked; use `action packet` and do the work in Ads Manager.
- **API_WRITE_GATED**: requires `SPOTIFY_WRITE_ENABLED=true`, verified read, policy pass, matching digest.
- Draft create/validate must declare **`maxAdditionalSpendMinor: 0`**.
- Delivery ON requires positive spend declaration + flight/budget anchors.
- Never auto-retry a failed POST/PATCH; reconcile first.

## CLI flow

```bash
# 1) Profile on agent
node packages/cli/bin/6ears-spotify-ads.js artist push

# 2) Prepare zero-spend draft campaign proposal
node packages/cli/bin/6ears-spotify-ads.js action prepare \
  examples/actions/create-draft-campaign.json

# 3) Human-readable packet (COPILOT)
node packages/cli/bin/6ears-spotify-ads.js action packet <PROPOSAL_ID>

# 4) Distinct approver (required when requireDistinctApprover=true)
node packages/cli/bin/6ears-spotify-ads.js action approve <ID> \
  --digest <hex> --actor owner@example.com

# 5) Execute still blocked until writes enabled
node packages/cli/bin/6ears-spotify-ads.js action execute <ID> \
  --digest <hex> --actor owner@example.com
# → LIVE_WRITES_DISABLED or COPILOT gate
```

## Spotify verify

Needs secrets in `packages/agent/.dev.vars`:

- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `SPOTIFY_REFRESH_TOKEN`
- `SPOTIFY_AD_ACCOUNT_ID`

```bash
node packages/cli/bin/6ears-spotify-ads.js spotify verify
```

Without secrets, the agent returns a clear failure; that is expected. Mode stays COPILOT until verify succeeds and write gates are intentionally enabled.

## Manual metrics

```bash
# copy example, fill IDs, then:
node packages/cli/bin/6ears-spotify-ads.js metrics ingest \
  examples/metrics/manual-observation.example.json
```

## Example action kinds

| kind | Notes |
|------|--------|
| `CREATE_DRAFT_CAMPAIGN` | Zero spend; draft only |
| `CREATE_DRAFT_AD_SET` / `CREATE_DRAFT_AD` | Zero spend |
| `VALIDATE_DRAFT_CAMPAIGN` | Zero spend; needs hierarchy version |
| `PUBLISH_DRAFT_CAMPAIGN` | Spend ceiling required |
| `SET_AD_SET_DELIVERY` | OFF = zero spend; ON = exposure declaration |
| `UPDATE_AD_SET_BUDGET` | Increase must match declared spend |
