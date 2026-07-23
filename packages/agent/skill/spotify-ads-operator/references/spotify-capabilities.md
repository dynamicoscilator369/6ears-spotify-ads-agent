# Spotify Ads capability boundary

Verified on 2026-07-21. Re-check official documentation before relying on this reference after Spotify changes versions or terms.

## Officially documented

Spotify Ads API v3 currently documents:

- ad-account access and account metadata;
- campaign, ad-set, and ad management;
- draft campaign hierarchies with validate-then-publish actions;
- live ad-set updates, including delivery and budget fields supported by the endpoint;
- target lookup, estimates, creative assets, and reporting endpoints;
- aggregate reporting where entity budgets are micro-amounts while `SPEND` report fields are major currency units.

Primary sources:

- [Ads API overview](https://developer.spotify.com/documentation/ads-api)
- [Quick start and account/app access](https://developer.spotify.com/documentation/ads-api/quick-start)
- [Guides](https://developer.spotify.com/documentation/ads-api/guides)
- [Ads API reference](https://developer.spotify.com/documentation/ads-api/reference)
- [Official agent tooling](https://developer.spotify.com/documentation/ads-api/agents)
- [Official open-source agent tools](https://github.com/spotify/ads-agentic-tools)

## Not established for an artist account by public documentation alone

Do not treat official platform capability as proof that a particular account can use it. For Example Artist, all of these remain unverified until tested with authorized credentials:

- the Spotify artist ID and URI;
- Ads Manager account ownership or role;
- the ad-account ID, currency, status, and market eligibility;
- OAuth/API terms acceptance and access;
- available targets, formats, assets, estimates, review status, or billing readiness;
- any existing campaigns, spend, results, or approved budget.

The Agent's `spotify/verify` route tests a read-only ad-account call and stores the observed status. It does not prove that every write shape is accepted.

## Human-in-the-loop fallback

Use Ads Manager when API access is unavailable, a UI-only feature is required, or the account rejects a documented operation. Prepare and approve the action in the Agent, reproduce it manually, verify the saved Ads Manager state, and ingest the observed metrics with provenance. Label the outcome `manual` rather than `API executed`.

## Change-sensitive facts

Creative specifications, target availability, policy restrictions, minimum budgets, countries, placements, objectives, and UI/API parity can change. Resolve them from the current official endpoints or Ads Manager before preparing a publish action.
