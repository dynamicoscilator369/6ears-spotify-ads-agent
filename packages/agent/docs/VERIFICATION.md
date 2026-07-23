# Capability verification

Research date: **2026-07-21**. Only official Spotify, Cloudflare, and upstream Spotify-owned repository sources were used for platform claims.

## Spotify Ads

| Question | Directly established | Account-specific status |
|---|---|---|
| Is there a public Ads API? | Yes. Spotify documents Ads API v3 for campaign management and reporting. | Example Artist access unverified. |
| Can campaigns be mutated? | Yes. Current reference/guides include draft campaign, ad-set, and ad creation; draft validation/publication; and live entity updates. | No mutation was attempted. Actual role, terms, payload eligibility, and account state remain unverified. |
| Is reporting supported? | Yes. Aggregate reports and entity lists are documented. | No Example Artist report was requested. |
| Is self-serve setup automatic? | No assumption. Spotify requires a Spotify account, Ads Manager account, ads-enabled developer app, API terms acceptance, and OAuth setup; allowlisting may take time. | All credentials and acceptance state unknown. |
| Does API parity with Ads Manager exist? | Not guaranteed. Spotify's guides explicitly call out API/UI differences. | Use Ads Manager for unsupported or UI-only actions. |
| Are agent workflows officially contemplated? | Yes. Spotify publishes agent tooling and a draft-first workflow. | This repository remains independent and adds Cloudflare state plus approval controls. |

Primary sources:

- [Spotify Ads API documentation](https://developer.spotify.com/documentation/ads-api)
- [Spotify Ads API quick start](https://developer.spotify.com/documentation/ads-api/quick-start)
- [Spotify Ads API guides](https://developer.spotify.com/documentation/ads-api/guides)
- [Spotify Ads API reference](https://developer.spotify.com/documentation/ads-api/reference)
- [Update an ad set](https://developer.spotify.com/documentation/ads-api/reference/v3.0/updateAdSet)
- [Get ad sets by account](https://developer.spotify.com/documentation/ads-api/reference/v3.0/getAdSetsByAdAccountId)
- [Aggregate report](https://developer.spotify.com/documentation/ads-api/reference/v3.0/getAggregateReport)
- [Building with AI](https://developer.spotify.com/documentation/ads-api/agents)
- [Spotify-owned ads-agentic-tools repository](https://github.com/spotify/ads-agentic-tools)

The upstream Spotify operator guidance was checked at tag `v1.6.1`. Its documented safety-critical details were independently reflected here: draft → validate → publish, fresh hierarchy versions, micro-unit entity budgets, major-unit report spend, an SDK tracking header, and no blind retry of POST/PATCH requests.

## Cloudflare Agents SDK

| Need | Verified pattern used here |
|---|---|
| Durable per-artist memory | One named Agent/Durable Object per artist with persisted Agent state and SQLite tables. |
| Recurring work | Agent `schedule()` with a five-field UTC cron expression and a named callback. |
| Approval gate | Durable proposal state and separate prepare/approve/execute calls. Cloudflare Workflows also supports human approval for longer multi-step workflows, but it is not required by this implementation. |
| Testing | Current Cloudflare Vitest plugin with `cloudflareTest()` and Worker service entrypoint calls through `cloudflare:workers`. |
| Production operation | Current compatibility date, generated binding types, structured JSON logs, Workers observability, bounded input/output. |

Primary sources:

- [Agents SDK overview](https://developers.cloudflare.com/agents/)
- [Agent state](https://developers.cloudflare.com/agents/runtime/lifecycle/state/)
- [Scheduled tasks](https://developers.cloudflare.com/agents/runtime/execution/schedule-tasks/)
- [Human in the loop](https://developers.cloudflare.com/agents/concepts/agentic-patterns/human-in-the-loop/)
- [Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)
- [Vitest configuration](https://developers.cloudflare.com/workers/testing/vitest-integration/configuration/)
- [Writing Worker tests](https://developers.cloudflare.com/workers/testing/vitest-integration/write-your-first-test/)

## Directly known, inferred, and unknown

Directly known:

- The checked official documents expose Spotify Ads API v3 management and reporting surfaces.
- The local repository compiles and its mocked connector/Worker tests pass.
- Runtime writes default to disabled.

Inferred design choice:

- A stateful, approval-gated copilot is safer than either a stateless script or unrestricted agent because account access and business authority are separate facts.

Unknown until an authorized operator performs setup:

- the artist's exact Spotify artist record, Ads Manager/ad-account access, OAuth state, account currency, existing entities, available targets, billing readiness, and approved limits.
- Whether a particular future payload will pass Spotify validation, creative review, or current account policy.

The decisive next test is a read-only `POST /v1/artists/demo-artist/spotify/verify` after authorized secrets are configured. Keep live writes disabled during that test.
