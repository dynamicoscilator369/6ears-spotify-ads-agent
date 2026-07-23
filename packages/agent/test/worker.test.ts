import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const key = "test-operator-key-00000000000000000000000000000000";

async function api(
  path: string,
  init: RequestInit = {},
): Promise<{ response: Response; body: unknown }> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${key}`);
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  const response = await exports.default.fetch(`https://example.test${path}`, { ...init, headers });
  return { response, body: await response.json() };
}

function profile() {
  return {
    artistId: "demo-artist",
    displayName: "Demo Artist Fixture",
    genres: [],
    priorityMarkets: [],
    brandNotes: [],
    defaultCurrency: "CAD",
    currencyMinorUnit: 2,
    approvalPolicy: {
      maxDailyBudgetMinor: 10_000,
      maxLifetimeBudgetMinor: 50_000,
      requireDistinctApprover: true,
    },
  };
}

describe("worker API", () => {
  it("keeps health public but protects artist state", async () => {
    const health = await exports.default.fetch("https://example.test/health");
    expect(health.status).toBe(200);

    const protectedResponse = await exports.default.fetch("https://example.test/v1/artists/demo-artist/status");
    expect(protectedResponse.status).toBe(401);
  });

  it("persists artist context, plans, manual metrics, and reviews", async () => {
    const configured = await api("/v1/artists/demo-artist/profile", {
      method: "PUT",
      body: JSON.stringify({ actor: "owner@example.com", profile: profile() }),
    });
    expect(configured.response.status).toBe(200);

    const plan = await api("/v1/artists/demo-artist/plans", {
      method: "POST",
      body: JSON.stringify({
        actor: "owner@example.com",
        name: "Release awareness test",
        goal: "AWARENESS",
        promotedWork: "A verified future release",
        hypothesis: "A focused audio cell will produce measurable qualified engagement.",
        startTime: "2026-08-01T00:00:00.000Z",
        endTime: "2026-08-08T00:00:00.000Z",
        countries: ["CA"],
        formats: ["AUDIO"],
        currency: "CAD",
        currencyMinorUnit: 2,
        dailyBudgetMinor: 5_000,
        lifetimeBudgetMinor: null,
        successMetrics: ["IMPRESSIONS", "CLICKS"],
        knownFacts: [],
        assumptions: ["The selected hook is relevant to the target listener."],
        constraints: [],
      }),
    });
    expect(plan.response.status).toBe(201);

    const metrics = await api("/v1/artists/demo-artist/metrics/manual", {
      method: "POST",
      body: JSON.stringify({
        actor: "analyst@example.com",
        source: "ADS_MANAGER_EXPORT",
        sourceNote: "Export captured from Ads Manager",
        capturedAt: "2026-07-21T12:00:00.000Z",
        entityId: "ad-set-1",
        entityName: "CA audio",
        budgetType: "DAILY",
        budgetMinor: 5_000,
        currency: "CAD",
        currencyMinorUnit: 2,
        flightStart: "2026-07-20T00:00:00.000Z",
        flightEnd: "2026-07-30T00:00:00.000Z",
        spendMinorToday: 2_500,
        spendMinorLifetime: 7_500,
        impressionsToday: 500,
        impressionsLifetime: 1_500,
      }),
    });
    expect(metrics.response.status).toBe(201);

    const status = await api("/v1/artists/demo-artist/status");
    expect(status.response.status).toBe(200);
    expect(status.body).toMatchObject({
      mode: "COPILOT",
      liveWritesEnvironmentEnabled: false,
      counts: { artifacts: 1, observations: 1, reviews: 1 },
    });
  });

  it("requires a distinct approval and still blocks execution while live writes are disabled", async () => {
    await api("/v1/artists/demo-artist/profile", {
      method: "PUT",
      body: JSON.stringify({ actor: "planner@example.com", profile: profile() }),
    });
    const prepared = await api("/v1/artists/demo-artist/actions", {
      method: "POST",
      body: JSON.stringify({
        kind: "SET_AD_SET_DELIVERY",
        actor: "planner@example.com",
        reason: "Pause delivery while a creative issue is investigated and documented.",
        currency: "CAD",
        maxAdditionalSpendMinor: 0,
        adSetId: "ad-set-1",
        delivery: "OFF",
      }),
    });
    expect(prepared.response.status).toBe(201);
    const proposal = prepared.body as { id: string; digest: string; policyDecision: { status: string } };
    expect(proposal.policyDecision.status).toBe("PASS");

    const selfApproval = await api(`/v1/artists/demo-artist/actions/${proposal.id}/approve`, {
      method: "POST",
      body: JSON.stringify({ actor: "planner@example.com", digest: proposal.digest, note: "" }),
    });
    expect(selfApproval.response.status).toBe(409);

    const approved = await api(`/v1/artists/demo-artist/actions/${proposal.id}/approve`, {
      method: "POST",
      body: JSON.stringify({ actor: "owner@example.com", digest: proposal.digest, note: "Reviewed" }),
    });
    expect(approved.response.status).toBe(200);
    expect(approved.body).toMatchObject({ status: "APPROVED", approvedBy: "owner@example.com" });

    const execution = await api(`/v1/artists/demo-artist/actions/${proposal.id}/execute`, {
      method: "POST",
      body: JSON.stringify({ actor: "owner@example.com", digest: proposal.digest, note: "Execute" }),
    });
    expect(execution.response.status).toBe(409);
    expect(execution.body).toMatchObject({ error: { code: "LIVE_WRITES_DISABLED" } });

    const actions = await api("/v1/artists/demo-artist/actions");
    expect(actions.body).toEqual(expect.arrayContaining([expect.objectContaining({ status: "APPROVED" })]));
  });
});
