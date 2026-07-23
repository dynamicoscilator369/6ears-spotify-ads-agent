# Setup

Keep the first run local and read-only. Do not enable Spotify writes during account discovery.

## 1. Install and verify locally

```bash
npm ci
cp .dev.vars.example .dev.vars
```

Generate a unique operator key with at least 32 random characters and place it only in `.dev.vars`:

```bash
openssl rand -base64 48
```

Run the complete local checks:

```bash
npm run check
```

Start the Worker:

```bash
npm run dev
```

`SPOTIFY_WRITE_ENABLED` is fixed to `false` in `wrangler.jsonc` by default.

## 2. Create the artist record

Set shell-only client values. Use the same operator key from `.dev.vars`:

```bash
export AGENT_BASE_URL=http://localhost:8787
export OPERATOR_API_KEY='your-local-operator-key'
export OPERATOR_ACTOR='your-operator-identity'
```

Load the intentionally incomplete Example Artist profile:

```bash
node skill/spotify-ads-operator/scripts/operator.mjs \
  my-artist PUT profile examples/artist.profile.example.json
```

Then inspect it:

```bash
node skill/spotify-ads-operator/scripts/operator.mjs my-artist GET status
```

Before adding values, establish their source:

- Spotify artist ID/URI: verified artist profile or an authorized Spotify surface
- default currency: actual Ads Manager ad account
- priority markets and genre/brand notes: artist/team-approved context
- daily and lifetime limits: explicit business-owner approval

Null budget ceilings are a safety feature and should remain null until approved.

## 3. Establish Spotify Ads API access

Follow Spotify's current [Ads API quick start](https://developer.spotify.com/documentation/ads-api/quick-start). At the time this repository was verified, the prerequisites included:

1. a Spotify account;
2. a Spotify Ads Manager account with the necessary role;
3. an ads-enabled app in the Spotify developer dashboard;
4. acceptance of the Spotify Ads API terms for the app client ID;
5. completion of Spotify OAuth and an authorized refresh token;
6. the actual ad-account ID.

Spotify notes that app access changes may take time to propagate. Do not copy access tokens into `.dev.vars`; store the longer-lived authorized refresh token and let the connector obtain short-lived access tokens.

Fill these only in `.dev.vars`:

```dotenv
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
SPOTIFY_REFRESH_TOKEN=...
SPOTIFY_AD_ACCOUNT_ID=...
```

Restart local development, then make the decisive read-only test:

```bash
node skill/spotify-ads-operator/scripts/operator.mjs my-artist POST spotify/verify
```

Expected evidence is a successful API response plus `state.spotifyCapability.readAccess: VERIFIED` in status. A configured secret set without this call is not verified access.

## 4. Choose the operating lane

### Copilot lane

Leave writes disabled. Create plans, briefs, reports, reviews, proposals, and approvals. Reproduce approved packets in Ads Manager and verify the saved state there. This lane works even without official API access if performance data is manually ingested with provenance.

### API write lane

Do not enable this locally or in production until all of these are true:

- the authorized owner has approved exact budget ceilings;
- Cloudflare Access identity enforcement is configured for multiple operators;
- the official read verification succeeds;
- an Ads Manager sandbox, inactive draft, or lowest-risk test has been selected;
- rollback/reconciliation ownership is assigned;
- the proposal/approval/execute flow has been tested while writes are disabled.

Then follow [DEPLOYMENT.md](DEPLOYMENT.md). Enabling writes never authorizes a specific spend; each action still needs its own proposal and approval.

## 5. Configure recurring reviews

Create a JSON file such as:

```json
{
  "cronUtc": "0 14 * * 1,4"
}
```

Apply it with the client, which injects the actor:

```bash
node skill/spotify-ads-operator/scripts/operator.mjs \
  my-artist POST schedules/reviews review-schedule.json
```

Confirm the returned schedule ID and UTC cron in status. Scheduled reviews make no automatic account changes.

## 6. Add another artist

Copy the example to a new filename, assign a different lowercase `artistId`, and clear all artist-specific fields. Each slug gets isolated state automatically. Never reuse the artist's evidence, limits, targets, or Spotify identifiers.
