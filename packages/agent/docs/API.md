# Operator API

Base path: `/v1/artists/{artistId}`. Artist IDs are lowercase slugs. Every route except `/health` requires `Authorization: Bearer <OPERATOR_API_KEY>`.

Mutating request bodies include an `actor`. When Cloudflare Access enforcement is on, that actor must match the verified Access email identity.

## Routes

| Method | Resource | Effect |
|---|---|---|
| `GET` | `status` | Current profile/capability/mode/schedule summary and record counts |
| `PUT` | `profile` | Configure artist facts and approval limits |
| `GET/POST` | `plans` | List or create non-executable campaign plans |
| `GET/POST` | `briefs/audience` | List or create audience hypothesis briefs |
| `GET/POST` | `briefs/creative` | List or create creative test briefs |
| `POST` | `metrics/manual` | Ingest a provenanced Ads Manager observation and create a review |
| `POST` | `spotify/verify` | Make a read-only official ad-account verification call |
| `POST` | `spotify/sync` | Ingest current active ad sets and aggregate reports after verification |
| `GET/POST` | `reviews` | List or create reviews from latest stored observations |
| `POST` | `schedules/reviews` | Replace the recurring UTC review schedule |
| `GET/POST` | `actions` | List or prepare immutable action proposals |
| `POST` | `actions/{id}/approve` | Approve the exact digest; does not execute |
| `POST` | `actions/{id}/reject` | Reject or revoke the exact digest |
| `POST` | `actions/{id}/execute` | Execute only after every gate passes |
| `GET/POST` | `learnings` | List or store evidence-backed artist learnings |
| `GET` | `audit` | List durable audit events |

GET list routes accept `?limit=1..100`.

## Profile

The starter file intentionally leaves all unverified values empty. Currency amounts use integer minor units: CAD 25.00 is `2500` with `currencyMinorUnit: 2`.

```json
{
  "actor": "operator@example.com",
  "profile": {
    "artistId": "demo-artist",
    "displayName": "Example Artist",
    "spotifyArtistId": null,
    "spotifyArtistUri": null,
    "genres": [],
    "priorityMarkets": [],
    "brandNotes": [],
    "defaultCurrency": null,
    "currencyMinorUnit": 2,
    "approvalPolicy": {
      "maxDailyBudgetMinor": null,
      "maxLifetimeBudgetMinor": null,
      "requireDistinctApprover": true
    }
  }
}
```

Null limits intentionally block spend-bearing actions. Set them only after the business owner approves exact ceilings.

## Campaign plan

Exactly one of `dailyBudgetMinor` or `lifetimeBudgetMinor` must be non-null.

```json
{
  "actor": "planner@example.com",
  "name": "Verified release test",
  "goal": "ENGAGEMENT_ON_SPOTIFY",
  "promotedWork": "Replace with the verified promoted work",
  "hypothesis": "State a falsifiable listener and creative hypothesis here.",
  "startTime": "2026-08-01T00:00:00.000Z",
  "endTime": "2026-08-08T00:00:00.000Z",
  "countries": ["CA"],
  "formats": ["AUDIO"],
  "currency": "CAD",
  "currencyMinorUnit": 2,
  "dailyBudgetMinor": 1000,
  "lifetimeBudgetMinor": null,
  "successMetrics": ["IMPRESSIONS", "CLICKS"],
  "knownFacts": [],
  "assumptions": ["Replace this with the actual test assumption."],
  "constraints": []
}
```

This is illustrative input, not an approved Example Artist campaign or budget.

## Manual metrics

Use an exact capture time and provenance. Never silently combine currencies or snapshots from different dates.

```json
{
  "actor": "analyst@example.com",
  "source": "ADS_MANAGER_EXPORT",
  "sourceNote": "Filename or redacted export identifier",
  "capturedAt": "2026-07-21T12:00:00.000Z",
  "entityId": "verified-ad-set-id",
  "entityName": "Observed Ads Manager name",
  "budgetType": "DAILY",
  "budgetMinor": 1000,
  "currency": "CAD",
  "currencyMinorUnit": 2,
  "flightStart": "2026-07-20T00:00:00.000Z",
  "flightEnd": "2026-07-30T00:00:00.000Z",
  "spendMinorToday": 400,
  "spendMinorLifetime": 1200,
  "impressionsToday": 100,
  "impressionsLifetime": 300,
  "clicksToday": 2,
  "clicksLifetime": 8,
  "frequencyLifetime": null
}
```

## Recurring review

```json
{
  "actor": "operator@example.com",
  "cronUtc": "0 14 * * 1,4"
}
```

This example means 14:00 UTC on Monday and Thursday. Always calculate and state the corresponding local time, including daylight-saving behavior.

## Action proposal

Supported action kinds:

- `CREATE_DRAFT_CAMPAIGN`
- `CREATE_DRAFT_AD_SET`
- `CREATE_DRAFT_AD`
- `VALIDATE_DRAFT_CAMPAIGN`
- `PUBLISH_DRAFT_CAMPAIGN`
- `UPDATE_AD_SET_BUDGET`
- `SET_AD_SET_DELIVERY`

Example pause proposal:

```json
{
  "kind": "SET_AD_SET_DELIVERY",
  "actor": "planner@example.com",
  "reason": "Pause delivery while a verified creative issue is investigated.",
  "currency": "CAD",
  "maxAdditionalSpendMinor": 0,
  "expiresInHours": 24,
  "adSetId": "verified-ad-set-id",
  "delivery": "OFF"
}
```

Budget updates must anchor both the observed current budget and the proposed budget. The declared additional spend must equal the increase after converting micro-units to currency minor units:

```json
{
  "kind": "UPDATE_AD_SET_BUDGET",
  "actor": "planner@example.com",
  "reason": "Apply the exact independently reviewed daily budget increase.",
  "currency": "CAD",
  "maxAdditionalSpendMinor": 2500,
  "expiresInHours": 24,
  "adSetId": "verified-ad-set-id",
  "currentBudget": { "micro_amount": 50000000, "type": "DAILY" },
  "budget": { "micro_amount": 75000000, "type": "DAILY" }
}
```

Turning delivery `ON` additionally requires `expectedState` with the exact current budget plus flight start/end. The declared exposure must cover the conservative remaining flight, and execution re-reads Spotify to ensure that state has not changed. Turning delivery `OFF` may leave `expectedState` null because it declares zero additional spend.

Approval, rejection, and execution use:

```json
{
  "actor": "approver@example.com",
  "digest": "the-64-character-digest-returned-by-the-proposal",
  "note": "What was independently checked"
}
```

## Errors

Errors use a stable JSON envelope:

```json
{
  "error": {
    "code": "LIVE_WRITES_DISABLED",
    "message": "Live Spotify writes are disabled...",
    "requestId": "..."
  }
}
```

Use `requestId` to correlate structured Worker logs. Validation errors also include redacted field paths and messages.
