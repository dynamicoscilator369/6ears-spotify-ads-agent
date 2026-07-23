import { getAgentByName } from "agents";
import { z } from "zod";
import { SpotifyAdsAgent } from "./agent";
import { DomainError } from "./domain/errors";
import {
  ActionRequestSchema,
  ApprovalDecisionSchema,
  ArtistIdSchema,
  ArtistProfileSchema,
  AudienceBriefInputSchema,
  CampaignPlanInputSchema,
  CreativeBriefInputSchema,
  LearningInputSchema,
  ManualPerformanceInputSchema,
  ReviewRequestSchema,
  ReviewScheduleInputSchema,
} from "./domain/schemas";
import { SpotifyApiError } from "./spotify/client";

export { SpotifyAdsAgent } from "./agent";

const MAX_REQUEST_BYTES = 256_000;
const ProfileUpdateSchema = z.object({
  actor: z.string().trim().min(2).max(120),
  profile: ArtistProfileSchema,
});

interface ErrorLike {
  name?: string;
  message?: string;
  code?: string;
  status?: number;
  details?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorLike(value: unknown): ErrorLike {
  if (!isRecord(value)) return {};
  return {
    ...(typeof value["name"] === "string" ? { name: value["name"] } : {}),
    ...(typeof value["message"] === "string" ? { message: value["message"] } : {}),
    ...(typeof value["code"] === "string" ? { code: value["code"] } : {}),
    ...(typeof value["status"] === "number" ? { status: value["status"] } : {}),
    ...(value["details"] === undefined ? {} : { details: value["details"] }),
  };
}

function json(data: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return Response.json(data, { status, headers });
}

async function readJsonLimited(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    throw new DomainError("REQUEST_TOO_LARGE", "JSON request body exceeds 256 KB.", 413);
  }
  if (request.body === null) throw new DomainError("MISSING_BODY", "A JSON request body is required.");
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_REQUEST_BYTES) {
        await reader.cancel("Request body exceeded configured limit");
        throw new DomainError("REQUEST_TOO_LARGE", "JSON request body exceeds 256 KB.", 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new DomainError("INVALID_JSON", "Request body is not valid JSON.");
  }
}

async function digest(value: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
}

async function authenticate(request: Request, env: CloudflareEnv): Promise<void> {
  const expected = env.OPERATOR_API_KEY;
  if (expected === undefined || expected.length < 32) {
    throw new DomainError(
      "AUTH_NOT_CONFIGURED",
      "OPERATOR_API_KEY must be configured with at least 32 characters.",
      503,
    );
  }
  const header = request.headers.get("authorization") ?? "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7) : "";
  const [expectedHash, suppliedHash] = await Promise.all([digest(expected), digest(supplied)]);
  if (!crypto.subtle.timingSafeEqual(expectedHash, suppliedHash)) {
    throw new DomainError("UNAUTHORIZED", "Authentication failed.", 401);
  }
  if (
    String(env.REQUIRE_CF_ACCESS) === "true" &&
    request.headers.get("cf-access-authenticated-user-email") === null
  ) {
    throw new DomainError("CF_ACCESS_REQUIRED", "A verified Cloudflare Access identity is required.", 401);
  }
}

function enforceAccessActor(request: Request, actor: string): void {
  const identity = request.headers.get("cf-access-authenticated-user-email");
  if (identity !== null && identity.toLowerCase() !== actor.toLowerCase()) {
    throw new DomainError(
      "ACTOR_IDENTITY_MISMATCH",
      "The audit actor must match the Cloudflare Access identity.",
      403,
    );
  }
}

function limitFrom(url: URL, fallback: number): number {
  const raw = url.searchParams.get("limit");
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new DomainError("INVALID_LIMIT", "limit must be an integer from 1 to 100.");
  }
  return value;
}

function methodNotAllowed(...allowed: string[]): Response {
  return json(
    { error: { code: "METHOD_NOT_ALLOWED", message: `Allowed methods: ${allowed.join(", ")}` } },
    405,
    { Allow: allowed.join(", ") },
  );
}

async function routeArtistRequest(request: Request, env: CloudflareEnv, url: URL): Promise<Response> {
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length < 4 || segments[0] !== "v1" || segments[1] !== "artists") {
    return json({ error: { code: "NOT_FOUND", message: "Route not found." } }, 404);
  }
  const artistId = ArtistIdSchema.parse(segments[2]);
  const resource = segments[3];
  const subresource = segments[4] ?? null;
  const operation = segments[5] ?? null;
  const agent = await getAgentByName<CloudflareEnv, SpotifyAdsAgent>(env.SpotifyAdsAgent, artistId);

  if (resource === "status" && subresource === null) {
    if (request.method !== "GET") return methodNotAllowed("GET");
    return json(await agent.getStatus());
  }

  if (resource === "profile" && subresource === null) {
    if (request.method !== "PUT") return methodNotAllowed("PUT");
    const body = ProfileUpdateSchema.parse(await readJsonLimited(request));
    if (body.profile.artistId !== artistId) {
      throw new DomainError("ARTIST_ID_MISMATCH", "Profile artistId must match the URL.");
    }
    enforceAccessActor(request, body.actor);
    return json(await agent.upsertArtist(body.profile, body.actor));
  }

  if (resource === "plans" && subresource === null) {
    if (request.method === "GET") return json(await agent.listArtifacts("CAMPAIGN_PLAN", limitFrom(url, 20)));
    if (request.method === "POST") {
      const body = CampaignPlanInputSchema.parse(await readJsonLimited(request));
      enforceAccessActor(request, body.actor);
      return json(await agent.createPlan(body), 201);
    }
    return methodNotAllowed("GET", "POST");
  }

  if (resource === "briefs" && (subresource === "audience" || subresource === "creative")) {
    const kind = subresource === "audience" ? "AUDIENCE_BRIEF" : "CREATIVE_BRIEF";
    if (request.method === "GET") return json(await agent.listArtifacts(kind, limitFrom(url, 20)));
    if (request.method === "POST") {
      if (subresource === "audience") {
        const body = AudienceBriefInputSchema.parse(await readJsonLimited(request));
        enforceAccessActor(request, body.actor);
        return json(await agent.createAudienceBrief(body), 201);
      }
      const body = CreativeBriefInputSchema.parse(await readJsonLimited(request));
      enforceAccessActor(request, body.actor);
      return json(await agent.createCreativeBrief(body), 201);
    }
    return methodNotAllowed("GET", "POST");
  }

  if (resource === "metrics" && subresource === "manual") {
    if (request.method !== "POST") return methodNotAllowed("POST");
    const body = ManualPerformanceInputSchema.parse(await readJsonLimited(request));
    enforceAccessActor(request, body.actor);
    return json(await agent.ingestManualPerformance(body), 201);
  }

  if (resource === "spotify" && (subresource === "verify" || subresource === "sync")) {
    if (request.method !== "POST") return methodNotAllowed("POST");
    const body = ReviewRequestSchema.parse(await readJsonLimited(request));
    enforceAccessActor(request, body.actor);
    return json(
      subresource === "verify"
        ? await agent.verifySpotifyAccess(body.actor)
        : await agent.syncSpotifyPerformance(body.actor),
    );
  }

  if (resource === "reviews" && subresource === null) {
    if (request.method === "GET") return json(await agent.listReviews(limitFrom(url, 20)));
    if (request.method === "POST") {
      const body = ReviewRequestSchema.parse(await readJsonLimited(request));
      enforceAccessActor(request, body.actor);
      return json(await agent.createReview(body.actor), 201);
    }
    return methodNotAllowed("GET", "POST");
  }

  if (resource === "schedules" && subresource === "reviews") {
    if (request.method !== "POST") return methodNotAllowed("POST");
    const body = ReviewScheduleInputSchema.parse(await readJsonLimited(request));
    enforceAccessActor(request, body.actor);
    return json(await agent.configureReviewSchedule(body), 201);
  }

  if (resource === "actions" && subresource === null) {
    if (request.method === "GET") return json(await agent.listActions(limitFrom(url, 20)));
    if (request.method === "POST") {
      const body = ActionRequestSchema.parse(await readJsonLimited(request));
      enforceAccessActor(request, body.actor);
      return json(await agent.prepareAction(body), 201);
    }
    return methodNotAllowed("GET", "POST");
  }

  if (
    resource === "actions" &&
    subresource !== null &&
    (operation === "approve" || operation === "reject" || operation === "execute")
  ) {
    if (request.method !== "POST") return methodNotAllowed("POST");
    const body = ApprovalDecisionSchema.parse(await readJsonLimited(request));
    enforceAccessActor(request, body.actor);
    const result =
      operation === "approve"
        ? await agent.approveAction(subresource, body)
        : operation === "reject"
          ? await agent.rejectAction(subresource, body)
          : await agent.executeAction(subresource, body);
    return json(result);
  }

  if (resource === "learnings" && subresource === null) {
    if (request.method === "GET") return json(await agent.listLearnings(limitFrom(url, 20)));
    if (request.method === "POST") {
      const body = LearningInputSchema.parse(await readJsonLimited(request));
      enforceAccessActor(request, body.actor);
      return json(await agent.addLearning(body), 201);
    }
    return methodNotAllowed("GET", "POST");
  }

  if (resource === "audit" && subresource === null) {
    if (request.method !== "GET") return methodNotAllowed("GET");
    return json(await agent.listAudit(limitFrom(url, 50)));
  }

  return json({ error: { code: "NOT_FOUND", message: "Route not found." } }, 404);
}

async function handle(request: Request, env: CloudflareEnv): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/health") {
    return json({ ok: true, service: "spotify-ads-agent", version: "0.1.0" });
  }
  await authenticate(request, env);
  return routeArtistRequest(request, env, url);
}

export default {
  async fetch(request, env): Promise<Response> {
    const requestId = crypto.randomUUID();
    const startedAt = Date.now();
    const url = new URL(request.url);
    try {
      const response = await handle(request, env);
      console.log(
        JSON.stringify({
          level: "info",
          message: "request.completed",
          requestId,
          method: request.method,
          path: url.pathname,
          status: response.status,
          durationMs: Date.now() - startedAt,
        }),
      );
      response.headers.set("X-Request-Id", requestId);
      return response;
    } catch (error) {
      const details = errorLike(error);
      let status = 500;
      let code = "INTERNAL_ERROR";
      let message = "Request failed. Use the request ID to inspect structured logs.";
      let validationDetails: unknown;
      if (error instanceof z.ZodError) {
        status = 400;
        code = "VALIDATION_ERROR";
        message = "Request validation failed.";
        validationDetails = error.issues.map((issue) => ({ path: issue.path, message: issue.message }));
      } else if (error instanceof DomainError || details.name === "DomainError") {
        status = error instanceof DomainError ? error.status : (details.status ?? 400);
        code = error instanceof DomainError ? error.code : (details.code ?? "DOMAIN_ERROR");
        message = error instanceof DomainError ? error.message : (details.message ?? message);
        validationDetails = error instanceof DomainError ? error.details : details.details;
      } else if (error instanceof SpotifyApiError || details.name === "SpotifyApiError") {
        status = error instanceof SpotifyApiError ? error.status : (details.status ?? 502);
        code = "SPOTIFY_API_ERROR";
        message = error instanceof SpotifyApiError ? error.message : (details.message ?? "Spotify Ads API request failed.");
      }
      console.error(
        JSON.stringify({
          level: "error",
          message: "request.failed",
          requestId,
          method: request.method,
          path: url.pathname,
          status,
          code,
          errorName: details.name ?? (error instanceof Error ? error.name : "unknown"),
          errorMessage: details.message ?? (error instanceof Error ? error.message : "unknown"),
          durationMs: Date.now() - startedAt,
        }),
      );
      return json(
        {
          error: {
            code,
            message,
            requestId,
            ...(validationDetails === undefined ? {} : { details: validationDetails }),
          },
        },
        status,
        { "X-Request-Id": requestId },
      );
    }
  },
} satisfies ExportedHandler<CloudflareEnv>;
