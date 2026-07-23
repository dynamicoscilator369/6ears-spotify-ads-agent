# Operator API quick reference

The complete route table is in the repository's `docs/API.md`.

## Client environment

```bash
export AGENT_BASE_URL=http://localhost:8787
export OPERATOR_API_KEY='a-local-key-of-at-least-32-characters'
export OPERATOR_ACTOR='the-current-verified-operator-identity'
```

Never include the operator key in a JSON file or command argument.

## Client form

```bash
node scripts/operator.mjs ARTIST_ID METHOD RESOURCE [JSON_FILE]
```

Examples:

```bash
node scripts/operator.mjs my-artist GET status
node scripts/operator.mjs my-artist PUT profile ../../examples/artist.profile.example.json
node scripts/operator.mjs my-artist POST spotify/verify
node scripts/operator.mjs my-artist POST reviews
node scripts/operator.mjs my-artist GET audit
```

The profile command wraps the profile document in `{ actor, profile }`. For other JSON objects, the client injects `actor` unless it is already present. A POST with no file sends `{ actor }`.

## Action sequence

```text
POST actions
POST actions/{proposal-id}/approve
POST actions/{proposal-id}/execute
```

The approval and execution files must contain the exact `digest` returned by `POST actions`. Execution remains blocked in copilot mode.
