# Approval policy

## Proposal states

`PENDING` → `APPROVED` → `EXECUTING` → `EXECUTED`

Terminal or intervention states are `REJECTED`, `EXPIRED`, `FAILED`, and `RECONCILIATION_REQUIRED`.

## Invariants

- A proposal contains one validated action and an immutable SHA-256 digest.
- The digest covers the proposal ID, artist ID, creation and expiry times, and complete action request.
- The submitted digest must match during approval, rejection, and execution.
- Approval re-evaluates the current artist policy.
- Execution re-evaluates the policy again.
- Proposals expire in 1–168 hours; the default is 24.
- Distinct approval is on by default.
- Missing budget ceilings block activation, publication, or applicable budget changes.
- An artist currency mismatch blocks when a default currency is configured.
- Draft creation and validation declare zero immediate spend.
- Enabling delivery declares a positive maximum additional spend.
- Enabling delivery anchors the current budget and flight; the declaration must cover a conservative remaining-flight exposure.
- Disabling delivery declares zero additional spend.
- A budget update anchors the observed current budget, preserves its budget type, and declares the exact increase in minor units.
- Live writes require deployment enablement and previously verified official read access.
- Execution re-reads anchored ad-set state and blocks if the budget or flight changed after approval.

## Approval is not execution

Keep proposal, approval, and execution as separate calls. Approval records intent for the exact digest. Execution is the only operation that may call Spotify.

## Identity

Cloudflare Access identity enforcement is required for reliable multi-person separation. The shared operator key protects local endpoints but does not independently prove who used it. When Access is required, the request actor must equal the verified Access email header.

## Mutation failures

POST and PATCH requests are attempted once. A network interruption or Spotify 5xx can leave the actual outcome unknown; mark the proposal `RECONCILIATION_REQUIRED`. Do not retry until the resource has been checked in Ads Manager and by a safe read endpoint where possible.
