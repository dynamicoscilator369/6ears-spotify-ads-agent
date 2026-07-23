import { describe, expect, it } from "vitest";
import { createActionProposal, evaluateActionPolicy } from "../src/domain/approval";
import { assessPacing, type PerformanceObservation } from "../src/domain/pacing";
import { ArtistProfileSchema, ActionRequestSchema } from "../src/domain/schemas";

const artist = ArtistProfileSchema.parse({
  artistId: "test-artist",
  displayName: "Test Artist",
  defaultCurrency: "CAD",
  currencyMinorUnit: 2,
  approvalPolicy: {
    maxDailyBudgetMinor: 10_000,
    maxLifetimeBudgetMinor: 50_000,
    requireDistinctApprover: true,
  },
});

function observation(overrides: Partial<PerformanceObservation> = {}): PerformanceObservation {
  return {
    id: "cfcdcb66-91ee-4d90-9cc2-43a8a7b95b87",
    artistId: "test-artist",
    source: "ADS_MANAGER_EXPORT",
    sourceNote: "Verified export",
    capturedAt: "2026-07-21T12:00:00.000Z",
    entityId: "ad-set-1",
    entityName: "Test ad set",
    budgetType: "DAILY",
    budgetMinor: 10_000,
    currency: "CAD",
    currencyMinorUnit: 2,
    flightStart: "2026-07-20T00:00:00.000Z",
    flightEnd: "2026-07-31T00:00:00.000Z",
    spendMinorToday: 5_000,
    spendMinorLifetime: 12_000,
    impressionsToday: 1_000,
    impressionsLifetime: 3_000,
    clicksToday: 10,
    clicksLifetime: 25,
    frequencyLifetime: 1.4,
    ingestedAt: "2026-07-21T12:00:01.000Z",
    provenance: "MANUAL",
    ...overrides,
  };
}

describe("pacing assessment", () => {
  it("marks a half-spent daily budget at UTC noon as on track", () => {
    const result = assessPacing(observation());
    expect(result.targetProgressPct).toBe(50);
    expect(result.spendProgressPct).toBe(50);
    expect(result.status).toBe("ON_TRACK");
  });

  it("prioritizes stalled delivery when an active flight has no impressions", () => {
    const result = assessPacing(observation({ spendMinorToday: 0, impressionsToday: 0 }));
    expect(result.status).toBe("STALLED");
    expect(result.recommendations[0]).toContain("Ads Manager");
  });
});

describe("approval policy", () => {
  it("blocks an ad-set budget above the configured daily ceiling", () => {
    const action = ActionRequestSchema.parse({
      kind: "UPDATE_AD_SET_BUDGET",
      actor: "planner@example.com",
      reason: "Increase the daily cap after reviewing verified pacing evidence.",
      currency: "CAD",
      maxAdditionalSpendMinor: 5_000,
      adSetId: "ad-set-1",
      currentBudget: { micro_amount: 100_000_000, type: "DAILY" },
      budget: { micro_amount: 150_000_000, type: "DAILY" },
    });
    const decision = evaluateActionPolicy(action, artist);
    expect(decision.status).toBe("BLOCKED");
    expect(decision.reasons.join(" ")).toContain("exceeds");
  });

  it("requires the declared budget increase to match the anchored delta", () => {
    const action = ActionRequestSchema.parse({
      kind: "UPDATE_AD_SET_BUDGET",
      actor: "planner@example.com",
      reason: "Increase a verified current daily budget after approval.",
      currency: "CAD",
      maxAdditionalSpendMinor: 0,
      adSetId: "ad-set-1",
      currentBudget: { micro_amount: 50_000_000, type: "DAILY" },
      budget: { micro_amount: 75_000_000, type: "DAILY" },
    });
    const decision = evaluateActionPolicy(action, artist);
    expect(decision.status).toBe("BLOCKED");
    expect(decision.reasons.join(" ")).toContain("must equal");
  });

  it("anchors delivery-on approval to the current budget and remaining flight", () => {
    const action = ActionRequestSchema.parse({
      kind: "SET_AD_SET_DELIVERY",
      actor: "planner@example.com",
      reason: "Resume a reviewed ad set for its remaining approved flight.",
      currency: "CAD",
      maxAdditionalSpendMinor: 4_000,
      adSetId: "ad-set-1",
      delivery: "ON",
      expectedState: {
        budget: { micro_amount: 10_000_000, type: "DAILY" },
        flightStart: "2026-07-20T00:00:00.000Z",
        flightEnd: "2026-07-26T00:00:00.000Z",
      },
    });
    const decision = evaluateActionPolicy(action, artist, new Date("2026-07-21T12:00:00.000Z"));
    expect(decision.status).toBe("BLOCKED");
    expect(decision.reasons.join(" ")).toContain("conservative exposure");
  });

  it("creates an immutable digest for a policy-compliant delivery-off proposal", async () => {
    const action = ActionRequestSchema.parse({
      kind: "SET_AD_SET_DELIVERY",
      actor: "planner@example.com",
      reason: "Pause delivery while the rejected creative is replaced and reviewed.",
      currency: "CAD",
      maxAdditionalSpendMinor: 0,
      adSetId: "ad-set-1",
      delivery: "OFF",
    });
    const proposal = await createActionProposal(
      artist.artistId,
      action,
      artist,
      new Date("2026-07-21T12:00:00.000Z"),
    );
    expect(proposal.policyDecision.status).toBe("PASS");
    expect(proposal.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(proposal.status).toBe("PENDING");
  });
});
