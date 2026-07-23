import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SpotifyAdsClient } from "../src/spotify/client";

const json = (body: unknown, init: ResponseInit = {}): Response =>
  Response.json(body, { status: 200, ...init });

function requestUrl(input: RequestInfo | URL): URL {
  if (input instanceof Request) return new URL(input.url);
  return new URL(input.toString());
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Spotify Ads API client", () => {
  it("coalesces OAuth refreshes and converts official API units", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = requestUrl(input);
      if (url.hostname === "accounts.spotify.com") {
        return json({ access_token: "access-token", token_type: "Bearer", expires_in: 3600 });
      }
      if (url.pathname.endsWith("/ad_accounts/test-ad-account")) {
        return json({ id: "test-ad-account", currency_code: "CAD", status: "ACTIVE" }, {
          headers: { sp_trace_id: "trace-account" },
        });
      }
      if (url.pathname.endsWith("/ad_sets")) {
        return json({
          paging: { total_results: 1, offset: 0, page_size: 50 },
          ad_sets: [{
            id: "ad-set-1",
            name: "CA audio",
            start_time: "2026-07-20T00:00:00.000Z",
            end_time: "2026-07-30T00:00:00.000Z",
            budget: { micro_amount: 50_000_000, type: "DAILY" },
          }],
        });
      }
      if (url.pathname.endsWith("/aggregate_reports")) {
        const lifetime = url.searchParams.get("granularity") === "LIFETIME";
        return json({
          continuation_token: null,
          rows: [{
            entity_id: "ad-set-1",
            entity_name: "CA audio",
            stats: lifetime
              ? [
                  { field_type: "SPEND", field_value: 12.34 },
                  { field_type: "IMPRESSIONS", field_value: 1_234 },
                  { field_type: "CLICKS", field_value: 17 },
                  { field_type: "FREQUENCY", field_value: 1.8 },
                ]
              : [
                  { field_type: "SPEND", field_value: 2.5 },
                  { field_type: "IMPRESSIONS", field_value: 250 },
                  { field_type: "CLICKS", field_value: 4 },
                ],
          }],
        }, { headers: { sp_trace_id: lifetime ? "trace-life" : "trace-day" } });
      }
      return new Response("not found", { status: 404 });
    });

    const client = new SpotifyAdsClient(env);
    const result = await client.syncPerformance("demo-artist", 2, new Date("2026-07-21T12:00:00.000Z"));

    expect(result.adSetsExamined).toBe(1);
    expect(result.observations[0]).toMatchObject({
      budgetMinor: 5_000,
      currency: "CAD",
      spendMinorToday: 250,
      spendMinorLifetime: 1_234,
      impressionsLifetime: 1_234,
      clicksLifetime: 17,
      frequencyLifetime: 1.8,
      provenance: "SPOTIFY_ADS_API_V3",
    });
    expect(fetchSpy.mock.calls.filter(([input]) => requestUrl(input).hostname === "accounts.spotify.com")).toHaveLength(1);
  });

  it("does not retry a mutation whose outcome could be uncertain", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = requestUrl(input);
      if (url.hostname === "accounts.spotify.com") {
        return json({ access_token: "access-token" });
      }
      return json({ message: "upstream failure" }, { status: 500, headers: { sp_trace_id: "trace-write" } });
    });

    const client = new SpotifyAdsClient(env);
    await expect(client.execute({
      kind: "SET_AD_SET_DELIVERY",
      actor: "approved-operator@example.com",
      reason: "Pause delivery after an approved review.",
      currency: "CAD",
      maxAdditionalSpendMinor: 0,
      expiresInHours: 24,
      adSetId: "ad-set-1",
      delivery: "OFF",
      expectedState: null,
    })).rejects.toMatchObject({
      status: 500,
      traceId: "trace-write",
      uncertain: true,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("blocks publish when the approved draft hierarchy version is stale", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = requestUrl(input);
      if (url.hostname === "accounts.spotify.com") {
        return json({ access_token: "access-token" });
      }
      return json({ id: "draft-1", draft_hierarchy_version: 8 });
    });

    const client = new SpotifyAdsClient(env);
    await expect(client.execute({
      kind: "PUBLISH_DRAFT_CAMPAIGN",
      actor: "approved-operator@example.com",
      reason: "Publish the independently reviewed and validated draft hierarchy.",
      currency: "CAD",
      maxAdditionalSpendMinor: 10_000,
      expiresInHours: 24,
      draftCampaignId: "draft-1",
      draftHierarchyVersion: 7,
    })).rejects.toMatchObject({
      code: "DRAFT_VERSION_CHANGED",
      status: 409,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("blocks a budget update when the live ad-set budget changed after approval", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = requestUrl(input);
      if (url.hostname === "accounts.spotify.com") {
        return json({ access_token: "access-token" });
      }
      return json({
        id: "ad-set-1",
        name: "CA audio",
        start_time: "2026-07-20T00:00:00.000Z",
        end_time: "2026-07-30T00:00:00.000Z",
        budget: { micro_amount: 60_000_000, type: "DAILY" },
      });
    });

    const client = new SpotifyAdsClient(env);
    await expect(client.execute({
      kind: "UPDATE_AD_SET_BUDGET",
      actor: "approved-operator@example.com",
      reason: "Apply the exact independently approved daily budget increase.",
      currency: "CAD",
      maxAdditionalSpendMinor: 2_500,
      expiresInHours: 24,
      adSetId: "ad-set-1",
      currentBudget: { micro_amount: 50_000_000, type: "DAILY" },
      budget: { micro_amount: 75_000_000, type: "DAILY" },
    })).rejects.toMatchObject({
      code: "AD_SET_STATE_CHANGED",
      status: 409,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
