import { z } from "zod";
import { DomainError } from "../domain/errors";
import type { ActionRequest, JsonValue } from "../domain/schemas";
import type { PerformanceObservation } from "../domain/pacing";
import { microAmountToMinor } from "../domain/approval";

const SPOTIFY_API_BASE = "https://api-partner.spotify.com/ads/v3";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const MAX_RESPONSE_BYTES = 5_000_000;
const SDK_HEADER_VALUE = "cloudflare-agent/0.1.0";

const TokenResponseSchema = z
  .object({
    access_token: z.string().min(1),
    token_type: z.string().optional(),
    expires_in: z.number().optional(),
  })
  .passthrough();

const AdAccountSchema = z
  .object({
    id: z.string().optional(),
    currency_code: z.string().regex(/^[A-Z]{3}$/).optional(),
    status: z.string().optional(),
  })
  .passthrough();

const AdSetSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    start_time: z.string().datetime({ offset: true }),
    end_time: z.string().datetime({ offset: true }),
    budget: z.object({
      micro_amount: z.number().int().nonnegative().safe(),
      type: z.enum(["DAILY", "LIFETIME"]),
    }),
  })
  .passthrough();

const AdSetListSchema = z
  .object({
    paging: z.object({
      total_results: z.number().int().nonnegative(),
      offset: z.number().int().nonnegative(),
      page_size: z.number().int().positive(),
    }),
    ad_sets: z.array(AdSetSchema),
  })
  .passthrough();

const ReportRowSchema = z
  .object({
    entity_id: z.string().min(1),
    entity_name: z.string().min(1),
    stats: z.array(
      z.object({
        field_type: z.string().min(1),
        field_value: z.number().finite(),
      }),
    ),
  })
  .passthrough();

const AggregateReportSchema = z
  .object({
    continuation_token: z.string().nullable().optional(),
    rows: z.array(ReportRowSchema),
  })
  .passthrough();

const DraftCampaignVersionSchema = z
  .object({
    id: z.string().min(1),
    draft_hierarchy_version: z.number().int().nonnegative().safe(),
  })
  .passthrough();

export interface SpotifyCapabilityResult {
  verifiedAt: string;
  currencyCode: string | null;
  accountStatus: string | null;
  traceId: string | null;
}

export interface SpotifySyncResult {
  observations: PerformanceObservation[];
  traceIds: string[];
  adSetsExamined: number;
}

export interface SpotifyMutationResult {
  status: number;
  traceId: string | null;
  summary: string;
}

export class SpotifyApiError extends Error {
  readonly status: number;
  readonly traceId: string | null;
  readonly uncertain: boolean;

  constructor(message: string, status: number, traceId: string | null, uncertain: boolean) {
    super(message);
    this.name = "SpotifyApiError";
    this.status = status;
    this.traceId = traceId;
    this.uncertain = uncertain;
  }
}

function configuredValue(value: string | undefined): value is string {
  return value !== undefined && value.trim() !== "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function spotifyCredentialsConfigured(env: CloudflareEnv): boolean {
  return (
    configuredValue(env.SPOTIFY_CLIENT_ID) &&
    configuredValue(env.SPOTIFY_CLIENT_SECRET) &&
    configuredValue(env.SPOTIFY_REFRESH_TOKEN) &&
    configuredValue(env.SPOTIFY_AD_ACCOUNT_ID)
  );
}

function requireSpotifyConfig(env: CloudflareEnv): {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  adAccountId: string;
} {
  const clientId = env.SPOTIFY_CLIENT_ID;
  const clientSecret = env.SPOTIFY_CLIENT_SECRET;
  const refreshToken = env.SPOTIFY_REFRESH_TOKEN;
  const adAccountId = env.SPOTIFY_AD_ACCOUNT_ID;
  if (
    !configuredValue(clientId) ||
    !configuredValue(clientSecret) ||
    !configuredValue(refreshToken) ||
    !configuredValue(adAccountId)
  ) {
    throw new DomainError(
      "SPOTIFY_NOT_CONFIGURED",
      "Spotify OAuth and ad-account secrets are not fully configured.",
      409,
    );
  }
  return {
    clientId,
    clientSecret,
    refreshToken,
    adAccountId,
  };
}

async function readTextLimited(response: Response, maxBytes = MAX_RESPONSE_BYTES): Promise<string> {
  if (response.body === null) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("Response exceeded configured limit");
        throw new SpotifyApiError("Spotify response exceeded the 5 MB safety limit.", 502, null, false);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}

function parseJson(text: string): unknown {
  if (text.trim() === "") return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new SpotifyApiError("Spotify returned malformed JSON.", 502, null, false);
  }
}

function traceIdFrom(response: Response): string | null {
  return (
    response.headers.get("sp_trace_id") ??
    response.headers.get("x-spotify-trace-id") ??
    response.headers.get("spotify-trace-id")
  );
}

function safeErrorMessage(data: unknown, status: number): string {
  if (isRecord(data)) {
    const direct = data["message"];
    if (typeof direct === "string") return direct.slice(0, 500);
    const nested = data["error"];
    if (isRecord(nested)) {
      const message = nested["message"];
      if (typeof message === "string") return message.slice(0, 500);
    }
  }
  return `Spotify Ads API request failed with HTTP ${status}.`;
}

function statValue(row: z.infer<typeof ReportRowSchema> | undefined, field: string): number {
  return row?.stats.find((stat) => stat.field_type === field)?.field_value ?? 0;
}

function utcMidnight(value: Date): string {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())).toISOString();
}

function encodeSegment(value: string): string {
  return encodeURIComponent(value);
}

export class SpotifyAdsClient {
  private accessToken: string | null = null;
  private tokenPromise: Promise<string> | null = null;
  private readonly config: ReturnType<typeof requireSpotifyConfig>;

  constructor(private readonly env: CloudflareEnv) {
    this.config = requireSpotifyConfig(env);
  }

  private async token(): Promise<string> {
    if (this.accessToken !== null) return this.accessToken;
    if (this.tokenPromise !== null) return this.tokenPromise;

    this.tokenPromise = this.refreshToken();
    try {
      return await this.tokenPromise;
    } finally {
      this.tokenPromise = null;
    }
  }

  private async refreshToken(): Promise<string> {
    const credentials = btoa(`${this.config.clientId}:${this.config.clientSecret}`);
    const response = await fetch(SPOTIFY_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: this.config.refreshToken,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const text = await readTextLimited(response, 100_000);
    const data = parseJson(text);
    if (!response.ok) {
      throw new SpotifyApiError(safeErrorMessage(data, response.status), response.status, traceIdFrom(response), false);
    }
    const parsed = TokenResponseSchema.safeParse(data);
    if (!parsed.success) {
      throw new SpotifyApiError("Spotify token response did not match the documented shape.", 502, null, false);
    }
    this.accessToken = parsed.data.access_token;
    return this.accessToken;
  }

  private async request(
    method: "GET" | "POST" | "PATCH",
    path: string,
    body?: JsonValue,
  ): Promise<{ data: unknown; status: number; traceId: string | null }> {
    if (!path.startsWith("/") || path.startsWith("//")) {
      throw new DomainError("INVALID_SPOTIFY_PATH", "Spotify path must be relative to the fixed Ads API base.");
    }
    const token = await this.token();
    const maxAttempts = method === "GET" ? 3 : 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      let response: Response;
      try {
        response = await fetch(`${SPOTIFY_API_BASE}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            "Content-Type": "application/json",
            "X-Spotify-Ads-Sdk": SDK_HEADER_VALUE,
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          signal: AbortSignal.timeout(20_000),
        });
      } catch (error) {
        if (method === "GET" && attempt < maxAttempts) {
          await scheduler.wait(250 * 2 ** (attempt - 1));
          continue;
        }
        const message = error instanceof Error ? error.message : "Network failure";
        throw new SpotifyApiError(`Spotify request did not complete: ${message}`, 503, null, method !== "GET");
      }

      const traceId = traceIdFrom(response);
      const text = await readTextLimited(response);
      const data = parseJson(text);
      if (response.ok) return { data, status: response.status, traceId };

      const retryableRead = method === "GET" && (response.status === 429 || response.status >= 500);
      if (retryableRead && attempt < maxAttempts) {
        const retryAfterSeconds = Number(response.headers.get("retry-after") ?? "0");
        const delay = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? Math.min(retryAfterSeconds * 1000, 2_000)
          : 250 * 2 ** (attempt - 1);
        await scheduler.wait(delay);
        continue;
      }
      throw new SpotifyApiError(
        safeErrorMessage(data, response.status),
        response.status,
        traceId,
        method !== "GET" && response.status >= 500,
      );
    }
    throw new SpotifyApiError("Spotify read retry budget was exhausted.", 503, null, false);
  }

  async verifyAccess(now = new Date()): Promise<SpotifyCapabilityResult> {
    const result = await this.request(
      "GET",
      `/ad_accounts/${encodeSegment(this.config.adAccountId)}`,
    );
    const parsed = AdAccountSchema.safeParse(result.data);
    if (!parsed.success) {
      throw new SpotifyApiError("Spotify ad-account response did not match the documented shape.", 502, result.traceId, false);
    }
    return {
      verifiedAt: now.toISOString(),
      currencyCode: parsed.data.currency_code ?? null,
      accountStatus: parsed.data.status ?? null,
      traceId: result.traceId,
    };
  }

  private async listActiveAdSets(): Promise<z.infer<typeof AdSetSchema>[]> {
    const all: z.infer<typeof AdSetSchema>[] = [];
    for (let offset = 0; offset < 500; offset += 50) {
      const query = new URLSearchParams({ statuses: "ACTIVE", limit: "50", offset: String(offset) });
      const result = await this.request(
        "GET",
        `/ad_accounts/${encodeSegment(this.config.adAccountId)}/ad_sets?${query.toString()}`,
      );
      const parsed = AdSetListSchema.safeParse(result.data);
      if (!parsed.success) {
        throw new SpotifyApiError("Spotify ad-set list did not match the documented shape.", 502, result.traceId, false);
      }
      all.push(...parsed.data.ad_sets);
      if (all.length >= parsed.data.paging.total_results || parsed.data.ad_sets.length === 0) break;
    }
    return all;
  }

  private async aggregateRows(granularity: "DAY" | "LIFETIME", now: Date): Promise<{
    rows: z.infer<typeof ReportRowSchema>[];
    traceIds: string[];
  }> {
    const rows: z.infer<typeof ReportRowSchema>[] = [];
    const traceIds: string[] = [];
    let continuationToken: string | null = null;
    for (let page = 0; page < 10; page += 1) {
      const query = new URLSearchParams();
      if (continuationToken !== null) {
        query.set("continuation_token", continuationToken);
      } else {
        query.set("entity_type", "AD_SET");
        for (const field of ["IMPRESSIONS", "SPEND", "CLICKS", "FREQUENCY"]) query.append("fields", field);
        query.set("granularity", granularity);
        query.set("entity_status_type", "AD_SET");
        query.append("statuses", "ACTIVE");
        query.set("limit", "50");
        if (granularity === "DAY") {
          const midnight = utcMidnight(now);
          query.set("report_start", midnight);
          query.set("report_end", midnight);
        }
      }
      const result = await this.request(
        "GET",
        `/ad_accounts/${encodeSegment(this.config.adAccountId)}/aggregate_reports?${query.toString()}`,
      );
      if (result.traceId !== null) traceIds.push(result.traceId);
      const parsed = AggregateReportSchema.safeParse(result.data);
      if (!parsed.success) {
        throw new SpotifyApiError("Spotify aggregate report did not match the documented shape.", 502, result.traceId, false);
      }
      rows.push(...parsed.data.rows);
      continuationToken = parsed.data.continuation_token ?? null;
      if (continuationToken === null || continuationToken === "") break;
    }
    return { rows, traceIds };
  }

  async syncPerformance(
    artistId: string,
    currencyMinorUnit: number,
    now = new Date(),
  ): Promise<SpotifySyncResult> {
    const [capability, adSets, daily, lifetime] = await Promise.all([
      this.verifyAccess(now),
      this.listActiveAdSets(),
      this.aggregateRows("DAY", now),
      this.aggregateRows("LIFETIME", now),
    ]);
    const dailyById = new Map(daily.rows.map((row) => [row.entity_id, row]));
    const lifetimeById = new Map(lifetime.rows.map((row) => [row.entity_id, row]));
    const currency = capability.currencyCode ?? "XXX";
    const capturedAt = now.toISOString();
    const observations = adSets.map<PerformanceObservation>((adSet) => {
      const dailyRow = dailyById.get(adSet.id);
      const lifetimeRow = lifetimeById.get(adSet.id);
      return {
        id: crypto.randomUUID(),
        artistId,
        source: "OTHER_VERIFIED_SOURCE",
        sourceNote: "Official Spotify Ads API v3 ad-set metadata and aggregate reports.",
        capturedAt,
        entityId: adSet.id,
        entityName: adSet.name,
        budgetType: adSet.budget.type,
        budgetMinor: microAmountToMinor(adSet.budget.micro_amount, currencyMinorUnit),
        currency,
        currencyMinorUnit,
        flightStart: adSet.start_time,
        flightEnd: adSet.end_time,
        spendMinorToday: Math.round(statValue(dailyRow, "SPEND") * 10 ** currencyMinorUnit),
        spendMinorLifetime: Math.round(statValue(lifetimeRow, "SPEND") * 10 ** currencyMinorUnit),
        impressionsToday: Math.round(statValue(dailyRow, "IMPRESSIONS")),
        impressionsLifetime: Math.round(statValue(lifetimeRow, "IMPRESSIONS")),
        clicksToday: Math.round(statValue(dailyRow, "CLICKS")),
        clicksLifetime: Math.round(statValue(lifetimeRow, "CLICKS")),
        frequencyLifetime: lifetimeRow === undefined ? null : statValue(lifetimeRow, "FREQUENCY"),
        ingestedAt: capturedAt,
        provenance: "SPOTIFY_ADS_API_V3",
      };
    });
    return {
      observations,
      traceIds: [capability.traceId, ...daily.traceIds, ...lifetime.traceIds].filter(
        (value): value is string => value !== null,
      ),
      adSetsExamined: adSets.length,
    };
  }

  async execute(action: ActionRequest): Promise<SpotifyMutationResult> {
    const account = encodeSegment(this.config.adAccountId);
    if (action.kind === "VALIDATE_DRAFT_CAMPAIGN" || action.kind === "PUBLISH_DRAFT_CAMPAIGN") {
      const current = await this.request(
        "GET",
        `/ad_accounts/${account}/drafts/campaigns/${encodeSegment(action.draftCampaignId)}`,
      );
      const parsed = DraftCampaignVersionSchema.safeParse(current.data);
      if (!parsed.success) {
        throw new SpotifyApiError(
          "Spotify draft campaign response did not contain a valid hierarchy version.",
          502,
          current.traceId,
          false,
        );
      }
      if (parsed.data.draft_hierarchy_version !== action.draftHierarchyVersion) {
        throw new DomainError(
          "DRAFT_VERSION_CHANGED",
          "The draft hierarchy changed after approval. Prepare and approve a new action using the current version.",
          409,
          {
            approvedVersion: action.draftHierarchyVersion,
            currentVersion: parsed.data.draft_hierarchy_version,
          },
        );
      }
    }
    if (action.kind === "UPDATE_AD_SET_BUDGET" || (action.kind === "SET_AD_SET_DELIVERY" && action.delivery === "ON")) {
      const current = await this.request(
        "GET",
        `/ad_accounts/${account}/ad_sets/${encodeSegment(action.adSetId)}`,
      );
      const parsed = AdSetSchema.safeParse(current.data);
      if (!parsed.success) {
        throw new SpotifyApiError(
          "Spotify ad-set response did not match the documented shape.",
          502,
          current.traceId,
          false,
        );
      }
      const expectedBudget = action.kind === "UPDATE_AD_SET_BUDGET"
        ? action.currentBudget
        : action.expectedState?.budget;
      const budgetChanged = expectedBudget === undefined ||
        parsed.data.budget.type !== expectedBudget.type ||
        parsed.data.budget.micro_amount !== expectedBudget.micro_amount;
      const flightChanged = action.kind === "SET_AD_SET_DELIVERY" && action.delivery === "ON" && (
        action.expectedState === null ||
        parsed.data.start_time !== action.expectedState.flightStart ||
        parsed.data.end_time !== action.expectedState.flightEnd
      );
      if (budgetChanged || flightChanged) {
        throw new DomainError(
          "AD_SET_STATE_CHANGED",
          "The ad-set budget or flight changed after approval. Prepare and approve a fresh action.",
          409,
        );
      }
    }
    let method: "POST" | "PATCH";
    let path: string;
    let body: JsonValue;
    switch (action.kind) {
      case "CREATE_DRAFT_CAMPAIGN":
        method = "POST";
        path = `/ad_accounts/${account}/drafts/campaigns`;
        body = action.payload;
        break;
      case "CREATE_DRAFT_AD_SET":
        method = "POST";
        path = `/ad_accounts/${account}/drafts/ad_sets`;
        body = action.payload;
        break;
      case "CREATE_DRAFT_AD":
        method = "POST";
        path = `/ad_accounts/${account}/drafts/ads`;
        body = action.payload;
        break;
      case "VALIDATE_DRAFT_CAMPAIGN":
        method = "POST";
        path = `/ad_accounts/${account}/drafts/campaigns/${encodeSegment(action.draftCampaignId)}`;
        body = { action: "VALIDATE", draft_hierarchy_version: action.draftHierarchyVersion };
        break;
      case "PUBLISH_DRAFT_CAMPAIGN":
        method = "POST";
        path = `/ad_accounts/${account}/drafts/campaigns/${encodeSegment(action.draftCampaignId)}`;
        body = { action: "PUBLISH", draft_hierarchy_version: action.draftHierarchyVersion };
        break;
      case "UPDATE_AD_SET_BUDGET":
        method = "PATCH";
        path = `/ad_accounts/${account}/ad_sets/${encodeSegment(action.adSetId)}`;
        body = { budget: action.budget };
        break;
      case "SET_AD_SET_DELIVERY":
        method = "PATCH";
        path = `/ad_accounts/${account}/ad_sets/${encodeSegment(action.adSetId)}`;
        body = { delivery: action.delivery };
        break;
    }

    const result = await this.request(method, path, body);
    const record = isRecord(result.data) ? result.data : {};
    const resourceId = typeof record["id"] === "string" ? record["id"] : null;
    const status = typeof record["status"] === "string" ? record["status"] : null;
    const details = [resourceId === null ? null : `resource ${resourceId}`, status === null ? null : `status ${status}`]
      .filter((value): value is string => value !== null)
      .join(", ");
    return {
      status: result.status,
      traceId: result.traceId,
      summary: details === "" ? `Spotify accepted ${action.kind}.` : `Spotify accepted ${action.kind}: ${details}.`,
    };
  }
}
