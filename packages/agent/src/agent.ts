import { Agent } from "agents";
import { z } from "zod";
import {
  ActionProposalSchema,
  createActionProposal,
  evaluateActionPolicy,
  isProposalExpired,
  type ActionProposal,
} from "./domain/approval";
import { DomainError, errorMessage } from "./domain/errors";
import {
  createAudienceBrief,
  createCampaignPlan,
  createCreativeBrief,
} from "./domain/planning";
import {
  createPerformanceReview,
  PerformanceObservationSchema,
  type PerformanceObservation,
  type PerformanceReview,
} from "./domain/pacing";
import {
  ActionRequestSchema,
  ActorSchema,
  ApprovalDecisionSchema,
  ArtistProfileSchema,
  AudienceBriefInputSchema,
  CampaignPlanInputSchema,
  CreativeBriefInputSchema,
  JsonValueSchema,
  LearningInputSchema,
  ManualPerformanceInputSchema,
  ReviewScheduleInputSchema,
  type ArtistProfile,
  type JsonValue,
} from "./domain/schemas";
import {
  SpotifyAdsClient,
  SpotifyApiError,
  spotifyCredentialsConfigured,
} from "./spotify/client";

type AccessStatus = "UNVERIFIED" | "VERIFIED" | "FAILED";

interface AgentState {
  schemaVersion: 1;
  artist: ArtistProfile | null;
  spotifyCapability: {
    readAccess: AccessStatus;
    writeAccess: AccessStatus;
    checkedAt: string | null;
    currencyCode: string | null;
    accountStatus: string | null;
    lastError: string | null;
  };
  reviewSchedule: {
    id: string;
    cronUtc: string;
    configuredAt: string;
    configuredBy: string;
  } | null;
  lastSyncAt: string | null;
  lastReviewAt: string | null;
}

interface AuditRow {
  id: string;
  created_at: string;
  actor: string;
  event: string;
  object_type: string;
  object_id: string | null;
  summary: string;
}

interface JsonRow {
  json: string;
}

function parseLimit(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new DomainError("INVALID_LIMIT", "Limit must be an integer from 1 to 100.");
  }
  return value;
}

function parseJsonValue(text: string): JsonValue {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new DomainError("CORRUPT_STORAGE", "Stored JSON could not be parsed.", 500);
  }
  const result = JsonValueSchema.safeParse(parsed);
  if (!result.success) throw new DomainError("CORRUPT_STORAGE", "Stored JSON is invalid.", 500);
  return result.data;
}

function parseProposal(text: string): ActionProposal {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new DomainError("CORRUPT_PROPOSAL", "Stored proposal could not be parsed.", 500);
  }
  const result = ActionProposalSchema.safeParse(parsed);
  if (!result.success) throw new DomainError("CORRUPT_PROPOSAL", "Stored proposal is invalid.", 500);
  return result.data;
}

function parseObservation(text: string): PerformanceObservation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new DomainError("CORRUPT_OBSERVATION", "Stored observation could not be parsed.", 500);
  }
  const result = PerformanceObservationSchema.safeParse(parsed);
  if (!result.success) throw new DomainError("CORRUPT_OBSERVATION", "Stored observation is invalid.", 500);
  return result.data;
}

function assertNoSecretLikeText(...values: string[]): void {
  if (values.some((value) => /(?:client[_ -]?secret|refresh[_ -]?token|authorization:\s*bearer)/i.test(value))) {
    throw new DomainError(
      "SENSITIVE_CONTENT_REJECTED",
      "Do not store credentials or bearer tokens in artist memory.",
    );
  }
}

async function equalDigest(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder();
  return crypto.subtle.timingSafeEqual(encoder.encode(left), encoder.encode(right));
}

export class SpotifyAdsAgent extends Agent<CloudflareEnv, AgentState> {
  override initialState: AgentState = {
    schemaVersion: 1,
    artist: null,
    spotifyCapability: {
      readAccess: "UNVERIFIED",
      writeAccess: "UNVERIFIED",
      checkedAt: null,
      currencyCode: null,
      accountStatus: null,
      lastError: null,
    },
    reviewSchedule: null,
    lastSyncAt: null,
    lastReviewAt: null,
  };

  override async onStart(): Promise<void> {
    this.sql`
      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        created_at TEXT NOT NULL,
        json TEXT NOT NULL
      )
    `;
    this.sql`
      CREATE INDEX IF NOT EXISTS idx_artifacts_kind_created
      ON artifacts(kind, created_at DESC)
    `;
    this.sql`
      CREATE TABLE IF NOT EXISTS observations (
        id TEXT PRIMARY KEY,
        entity_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        json TEXT NOT NULL
      )
    `;
    this.sql`
      CREATE INDEX IF NOT EXISTS idx_observations_entity_created
      ON observations(entity_id, created_at DESC)
    `;
    this.sql`
      CREATE TABLE IF NOT EXISTS reviews (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        json TEXT NOT NULL
      )
    `;
    this.sql`
      CREATE TABLE IF NOT EXISTS proposals (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        json TEXT NOT NULL
      )
    `;
    this.sql`
      CREATE INDEX IF NOT EXISTS idx_proposals_status_created
      ON proposals(status, created_at DESC)
    `;
    this.sql`
      CREATE TABLE IF NOT EXISTS learnings (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        json TEXT NOT NULL
      )
    `;
    this.sql`
      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        actor TEXT NOT NULL,
        event TEXT NOT NULL,
        object_type TEXT NOT NULL,
        object_id TEXT,
        summary TEXT NOT NULL
      )
    `;
    this.sql`
      CREATE INDEX IF NOT EXISTS idx_audit_created
      ON audit_events(created_at DESC)
    `;

    const executing = this.sql<JsonRow>`SELECT json FROM proposals WHERE status = 'EXECUTING'`;
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const row of executing) {
      const proposal = parseProposal(row.json);
      const started = proposal.executionStartedAt === null ? 0 : new Date(proposal.executionStartedAt).getTime();
      if (started < cutoff) {
        proposal.status = "RECONCILIATION_REQUIRED";
        proposal.outcome = "Execution was interrupted; reconcile the resource in Spotify Ads Manager before retrying.";
        this.saveProposal(proposal);
      }
    }
  }

  private requireArtist(): ArtistProfile {
    if (this.state.artist === null) {
      throw new DomainError("ARTIST_NOT_CONFIGURED", "Configure the artist profile first.", 409);
    }
    return this.state.artist;
  }

  private audit(
    actor: string,
    event: string,
    objectType: string,
    objectId: string | null,
    summary: string,
    now = new Date(),
  ): void {
    const id = crypto.randomUUID();
    const createdAt = now.toISOString();
    const safeSummary = summary.slice(0, 600);
    this.sql`
      INSERT INTO audit_events (id, created_at, actor, event, object_type, object_id, summary)
      VALUES (${id}, ${createdAt}, ${actor}, ${event}, ${objectType}, ${objectId}, ${safeSummary})
    `;
    this.sql`
      DELETE FROM audit_events WHERE id NOT IN (
        SELECT id FROM audit_events ORDER BY created_at DESC LIMIT 1000
      )
    `;
    console.log(
      JSON.stringify({
        level: "info",
        message: "spotify_ads_agent_audit",
        event,
        objectType,
        objectId,
        artistId: this.state.artist?.artistId ?? null,
        timestamp: createdAt,
      }),
    );
  }

  private saveProposal(proposal: ActionProposal): void {
    const json = JSON.stringify(proposal);
    this.sql`
      INSERT INTO proposals (id, status, created_at, json)
      VALUES (${proposal.id}, ${proposal.status}, ${proposal.createdAt}, ${json})
      ON CONFLICT(id) DO UPDATE SET status = excluded.status, json = excluded.json
    `;
    this.sql`
      DELETE FROM proposals WHERE id NOT IN (
        SELECT id FROM proposals ORDER BY created_at DESC LIMIT 200
      )
    `;
  }

  private proposalById(id: string): ActionProposal {
    const row = this.sql<JsonRow>`SELECT json FROM proposals WHERE id = ${id}`[0];
    if (row === undefined) throw new DomainError("PROPOSAL_NOT_FOUND", "Action proposal was not found.", 404);
    return parseProposal(row.json);
  }

  private storeObservation(observation: PerformanceObservation): void {
    const json = JSON.stringify(observation);
    this.sql`
      INSERT INTO observations (id, entity_id, created_at, json)
      VALUES (${observation.id}, ${observation.entityId}, ${observation.capturedAt}, ${json})
    `;
    this.sql`
      DELETE FROM observations WHERE id NOT IN (
        SELECT id FROM observations ORDER BY created_at DESC LIMIT 500
      )
    `;
  }

  private latestObservations(limit = 100): PerformanceObservation[] {
    const rows = this.sql<JsonRow>`
      SELECT json FROM observations ORDER BY created_at DESC LIMIT ${parseLimit(limit)}
    `;
    const seen = new Set<string>();
    const latest: PerformanceObservation[] = [];
    for (const row of rows) {
      const observation = parseObservation(row.json);
      if (seen.has(observation.entityId)) continue;
      seen.add(observation.entityId);
      latest.push(observation);
    }
    return latest;
  }

  private storeReview(review: PerformanceReview): void {
    const json = JSON.stringify(review);
    this.sql`
      INSERT INTO reviews (id, created_at, json)
      VALUES (${review.id}, ${review.generatedAt}, ${json})
    `;
    this.sql`
      DELETE FROM reviews WHERE id NOT IN (
        SELECT id FROM reviews ORDER BY created_at DESC LIMIT 100
      )
    `;
    this.setState({ ...this.state, lastReviewAt: review.generatedAt });
  }

  private listJsonRows(queryRows: JsonRow[]): JsonValue[] {
    return queryRows.map((row) => parseJsonValue(row.json));
  }

  getStatus(): unknown {
    const counts = {
      artifacts: this.sql<{ count: number }>`SELECT COUNT(*) AS count FROM artifacts`[0]?.count ?? 0,
      observations: this.sql<{ count: number }>`SELECT COUNT(*) AS count FROM observations`[0]?.count ?? 0,
      reviews: this.sql<{ count: number }>`SELECT COUNT(*) AS count FROM reviews`[0]?.count ?? 0,
      proposals: this.sql<{ count: number }>`SELECT COUNT(*) AS count FROM proposals`[0]?.count ?? 0,
      learnings: this.sql<{ count: number }>`SELECT COUNT(*) AS count FROM learnings`[0]?.count ?? 0,
    };
    return JsonValueSchema.parse({
      state: this.state,
      mode: String(this.env.SPOTIFY_WRITE_ENABLED) === "true" ? "API_WRITE_GATED" : "COPILOT",
      spotifyCredentialsConfigured: spotifyCredentialsConfigured(this.env),
      liveWritesEnvironmentEnabled: String(this.env.SPOTIFY_WRITE_ENABLED) === "true",
      counts,
    });
  }

  upsertArtist(input: unknown, actorInput: unknown): ArtistProfile {
    const artist = ArtistProfileSchema.parse(input);
    const actor = ActorSchema.parse(actorInput);
    this.setState({
      ...this.state,
      artist,
      spotifyCapability: {
        ...this.state.spotifyCapability,
        writeAccess: "UNVERIFIED",
      },
    });
    this.audit(actor, "artist.profile.updated", "artist", artist.artistId, "Artist profile and approval policy updated.");
    return artist;
  }

  createPlan(input: unknown): unknown {
    const artist = this.requireArtist();
    const parsed = CampaignPlanInputSchema.parse(input);
    const plan = createCampaignPlan(parsed, artist);
    const json = JSON.stringify(plan);
    this.sql`
      INSERT INTO artifacts (id, kind, created_at, json)
      VALUES (${plan.id}, ${"CAMPAIGN_PLAN"}, ${plan.createdAt}, ${json})
    `;
    this.audit(parsed.actor, "campaign.plan.created", "campaign_plan", plan.id, "Campaign plan stored as a non-executable draft.");
    return JsonValueSchema.parse(plan);
  }

  createAudienceBrief(input: unknown): unknown {
    const artist = this.requireArtist();
    const parsed = AudienceBriefInputSchema.parse(input);
    const brief = createAudienceBrief(parsed, artist);
    const json = JSON.stringify(brief);
    this.sql`
      INSERT INTO artifacts (id, kind, created_at, json)
      VALUES (${brief.id}, ${"AUDIENCE_BRIEF"}, ${brief.createdAt}, ${json})
    `;
    this.audit(parsed.actor, "audience.brief.created", "audience_brief", brief.id, "Audience hypotheses stored for validation.");
    return JsonValueSchema.parse(brief);
  }

  createCreativeBrief(input: unknown): unknown {
    const artist = this.requireArtist();
    const parsed = CreativeBriefInputSchema.parse(input);
    const brief = createCreativeBrief(parsed, artist);
    const json = JSON.stringify(brief);
    this.sql`
      INSERT INTO artifacts (id, kind, created_at, json)
      VALUES (${brief.id}, ${"CREATIVE_BRIEF"}, ${brief.createdAt}, ${json})
    `;
    this.audit(parsed.actor, "creative.brief.created", "creative_brief", brief.id, "Creative test brief stored for validation.");
    return JsonValueSchema.parse(brief);
  }

  listArtifacts(kindInput: unknown, limitInput = 20): unknown[] {
    const kind = z.enum(["CAMPAIGN_PLAN", "AUDIENCE_BRIEF", "CREATIVE_BRIEF"]).parse(kindInput);
    const limit = parseLimit(limitInput);
    return this.listJsonRows(
      this.sql<JsonRow>`SELECT json FROM artifacts WHERE kind = ${kind} ORDER BY created_at DESC LIMIT ${limit}`,
    );
  }

  ingestManualPerformance(input: unknown): unknown {
    const artist = this.requireArtist();
    const parsed = ManualPerformanceInputSchema.parse(input);
    const { actor, ...metrics } = parsed;
    const now = new Date();
    const observation: PerformanceObservation = {
      ...metrics,
      id: crypto.randomUUID(),
      artistId: artist.artistId,
      ingestedAt: now.toISOString(),
      provenance: "MANUAL",
    };
    this.storeObservation(observation);
    const review = createPerformanceReview(artist.artistId, [observation], actor, "MANUAL", now);
    this.storeReview(review);
    this.audit(actor, "performance.manual.ingested", "observation", observation.id, `Manual metrics ingested from ${parsed.source}.`);
    return { observation: JsonValueSchema.parse(observation), review: JsonValueSchema.parse(review) };
  }

  async verifySpotifyAccess(actorInput: unknown): Promise<unknown> {
    const actor = ActorSchema.parse(actorInput);
    this.requireArtist();
    try {
      const capability = await new SpotifyAdsClient(this.env).verifyAccess();
      this.setState({
        ...this.state,
        spotifyCapability: {
          ...this.state.spotifyCapability,
          readAccess: "VERIFIED",
          checkedAt: capability.verifiedAt,
          currencyCode: capability.currencyCode,
          accountStatus: capability.accountStatus,
          lastError: null,
        },
      });
      this.audit(actor, "spotify.access.verified", "spotify_account", null, "Official Ads API read access verified.");
      return JsonValueSchema.parse(capability);
    } catch (error) {
      this.setState({
        ...this.state,
        spotifyCapability: {
          ...this.state.spotifyCapability,
          readAccess: "FAILED",
          checkedAt: new Date().toISOString(),
          lastError: errorMessage(error).slice(0, 300),
        },
      });
      this.audit(actor, "spotify.access.failed", "spotify_account", null, "Official Ads API access verification failed.");
      throw error;
    }
  }

  async syncSpotifyPerformance(actorInput: unknown): Promise<unknown> {
    const actor = ActorSchema.parse(actorInput);
    const artist = this.requireArtist();
    if (this.state.spotifyCapability.readAccess !== "VERIFIED") {
      throw new DomainError("SPOTIFY_ACCESS_UNVERIFIED", "Verify official Spotify Ads API access before syncing.", 409);
    }
    const now = new Date();
    const result = await new SpotifyAdsClient(this.env).syncPerformance(
      artist.artistId,
      artist.currencyMinorUnit,
      now,
    );
    result.observations.forEach((observation) => this.storeObservation(observation));
    const review = createPerformanceReview(
      artist.artistId,
      result.observations,
      actor,
      "SPOTIFY_ADS_API_V3",
      now,
    );
    this.storeReview(review);
    this.setState({ ...this.state, lastSyncAt: now.toISOString() });
    this.audit(
      actor,
      "performance.spotify.synced",
      "spotify_report",
      null,
      `${result.adSetsExamined} active ad sets examined through the official Ads API.`,
    );
    return {
      adSetsExamined: result.adSetsExamined,
      observationsStored: result.observations.length,
      review: JsonValueSchema.parse(review),
      traceIds: result.traceIds,
    };
  }

  createReview(actorInput: unknown): unknown {
    const actor = ActorSchema.parse(actorInput);
    const artist = this.requireArtist();
    const review = createPerformanceReview(
      artist.artistId,
      this.latestObservations(),
      actor,
      "SCHEDULED_WITH_EXISTING_DATA",
    );
    this.storeReview(review);
    this.audit(actor, "performance.review.created", "review", review.id, "Review created from latest stored observations; no changes executed.");
    return JsonValueSchema.parse(review);
  }

  listReviews(limitInput = 20): unknown[] {
    const limit = parseLimit(limitInput);
    return this.listJsonRows(
      this.sql<JsonRow>`SELECT json FROM reviews ORDER BY created_at DESC LIMIT ${limit}`,
    );
  }

  async configureReviewSchedule(input: unknown): Promise<unknown> {
    const parsed = ReviewScheduleInputSchema.parse(input);
    if (this.state.reviewSchedule !== null) {
      await this.cancelSchedule(this.state.reviewSchedule.id);
    }
    const schedule = await this.schedule(
      parsed.cronUtc,
      "scheduledReview",
      { source: "configured-recurring-review" },
      { idempotent: true, retry: { maxAttempts: 2 } },
    );
    const reviewSchedule = {
      id: schedule.id,
      cronUtc: parsed.cronUtc,
      configuredAt: new Date().toISOString(),
      configuredBy: parsed.actor,
    };
    this.setState({ ...this.state, reviewSchedule });
    this.audit(parsed.actor, "review.schedule.configured", "schedule", schedule.id, `Recurring review configured in UTC: ${parsed.cronUtc}.`);
    return reviewSchedule;
  }

  async scheduledReview(_payload: { source: string }): Promise<void> {
    if (this.state.artist === null) return;
    const actor = "scheduled-review";
    if (spotifyCredentialsConfigured(this.env) && this.state.spotifyCapability.readAccess === "VERIFIED") {
      try {
        await this.syncSpotifyPerformance(actor);
        return;
      } catch (error) {
        this.audit(actor, "review.schedule.sync_failed", "schedule", this.state.reviewSchedule?.id ?? null, errorMessage(error));
      }
    }
    this.createReview(actor);
  }

  async prepareAction(input: unknown): Promise<unknown> {
    const action = ActionRequestSchema.parse(input);
    const artist = this.requireArtist();
    const proposal = await createActionProposal(artist.artistId, action, artist);
    this.saveProposal(proposal);
    this.audit(
      action.actor,
      "action.proposal.prepared",
      "action_proposal",
      proposal.id,
      `${action.kind} prepared with policy status ${proposal.policyDecision.status}; no Spotify call made.`,
    );
    return JsonValueSchema.parse(proposal);
  }

  async approveAction(proposalId: string, decisionInput: unknown): Promise<unknown> {
    const decision = ApprovalDecisionSchema.parse(decisionInput);
    const artist = this.requireArtist();
    const proposal = this.proposalById(proposalId);
    if (!(await equalDigest(proposal.digest, decision.digest))) {
      throw new DomainError("DIGEST_MISMATCH", "Approval digest does not match the immutable proposal.", 409);
    }
    if (proposal.status === "APPROVED" && proposal.approvedBy === decision.actor) {
      return JsonValueSchema.parse(proposal);
    }
    if (proposal.status !== "PENDING") {
      throw new DomainError("INVALID_PROPOSAL_STATE", `Cannot approve a proposal in ${proposal.status} state.`, 409);
    }
    if (isProposalExpired(proposal)) {
      proposal.status = "EXPIRED";
      this.saveProposal(proposal);
      throw new DomainError("PROPOSAL_EXPIRED", "Proposal expired; prepare a new action.", 409);
    }
    const currentPolicy = evaluateActionPolicy(proposal.request, artist);
    if (currentPolicy.status === "BLOCKED") {
      throw new DomainError("POLICY_BLOCKED", currentPolicy.reasons.join(" "), 409);
    }
    if (artist.approvalPolicy.requireDistinctApprover && proposal.createdBy === decision.actor) {
      throw new DomainError("DISTINCT_APPROVER_REQUIRED", "The proposal creator cannot approve this action.", 409);
    }
    proposal.policyDecision = currentPolicy;
    proposal.status = "APPROVED";
    proposal.approvedAt = new Date().toISOString();
    proposal.approvedBy = decision.actor;
    this.saveProposal(proposal);
    this.audit(decision.actor, "action.proposal.approved", "action_proposal", proposal.id, `${proposal.request.kind} approved; not yet executed.`);
    return JsonValueSchema.parse(proposal);
  }

  async rejectAction(proposalId: string, decisionInput: unknown): Promise<unknown> {
    const decision = ApprovalDecisionSchema.parse(decisionInput);
    const proposal = this.proposalById(proposalId);
    if (!(await equalDigest(proposal.digest, decision.digest))) {
      throw new DomainError("DIGEST_MISMATCH", "Rejection digest does not match the immutable proposal.", 409);
    }
    if (proposal.status !== "PENDING" && proposal.status !== "APPROVED") {
      throw new DomainError("INVALID_PROPOSAL_STATE", `Cannot reject a proposal in ${proposal.status} state.`, 409);
    }
    proposal.status = "REJECTED";
    proposal.rejectedAt = new Date().toISOString();
    proposal.rejectedBy = decision.actor;
    proposal.outcome = decision.note === "" ? "Rejected by operator." : decision.note;
    this.saveProposal(proposal);
    this.audit(decision.actor, "action.proposal.rejected", "action_proposal", proposal.id, `${proposal.request.kind} rejected; no Spotify call made.`);
    return JsonValueSchema.parse(proposal);
  }

  async executeAction(proposalId: string, decisionInput: unknown): Promise<unknown> {
    const decision = ApprovalDecisionSchema.parse(decisionInput);
    const artist = this.requireArtist();
    const proposal = this.proposalById(proposalId);
    if (!(await equalDigest(proposal.digest, decision.digest))) {
      throw new DomainError("DIGEST_MISMATCH", "Execution digest does not match the immutable proposal.", 409);
    }
    if (proposal.status !== "APPROVED") {
      throw new DomainError("INVALID_PROPOSAL_STATE", `Cannot execute a proposal in ${proposal.status} state.`, 409);
    }
    if (isProposalExpired(proposal)) {
      proposal.status = "EXPIRED";
      this.saveProposal(proposal);
      throw new DomainError("PROPOSAL_EXPIRED", "Proposal expired; prepare and approve a new action.", 409);
    }
    const currentPolicy = evaluateActionPolicy(proposal.request, artist);
    if (currentPolicy.status === "BLOCKED") {
      throw new DomainError("POLICY_BLOCKED", currentPolicy.reasons.join(" "), 409);
    }
    if (String(this.env.SPOTIFY_WRITE_ENABLED) !== "true") {
      throw new DomainError(
        "LIVE_WRITES_DISABLED",
        "Live Spotify writes are disabled. Keep using the execution packet in Ads Manager or explicitly enable the deployment setting.",
        409,
      );
    }
    if (this.state.spotifyCapability.readAccess !== "VERIFIED") {
      throw new DomainError("SPOTIFY_ACCESS_UNVERIFIED", "Verify official Spotify Ads API access before execution.", 409);
    }

    proposal.status = "EXECUTING";
    proposal.executionStartedAt = new Date().toISOString();
    proposal.executedBy = decision.actor;
    this.saveProposal(proposal);
    this.audit(decision.actor, "action.execution.started", "action_proposal", proposal.id, `${proposal.request.kind} execution started; automatic retries disabled.`);

    try {
      const result = await new SpotifyAdsClient(this.env).execute(proposal.request);
      proposal.status = "EXECUTED";
      proposal.executedAt = new Date().toISOString();
      proposal.outcome = result.summary;
      proposal.spotifyTraceId = result.traceId;
      this.saveProposal(proposal);
      this.setState({
        ...this.state,
        spotifyCapability: {
          ...this.state.spotifyCapability,
          writeAccess: "VERIFIED",
          checkedAt: proposal.executedAt,
          lastError: null,
        },
      });
      this.audit(decision.actor, "action.execution.succeeded", "action_proposal", proposal.id, result.summary);
      return JsonValueSchema.parse(proposal);
    } catch (error) {
      const uncertain = error instanceof SpotifyApiError && error.uncertain;
      proposal.status = uncertain ? "RECONCILIATION_REQUIRED" : "FAILED";
      proposal.executedAt = new Date().toISOString();
      proposal.outcome = uncertain
        ? "Spotify may have received the mutation. Reconcile in Ads Manager before creating any replacement action."
        : errorMessage(error).slice(0, 500);
      proposal.spotifyTraceId = error instanceof SpotifyApiError ? error.traceId : null;
      this.saveProposal(proposal);
      this.audit(
        decision.actor,
        uncertain ? "action.execution.reconciliation_required" : "action.execution.failed",
        "action_proposal",
        proposal.id,
        proposal.outcome,
      );
      throw error;
    }
  }

  listActions(limitInput = 20): unknown[] {
    const limit = parseLimit(limitInput);
    return this.listJsonRows(
      this.sql<JsonRow>`SELECT json FROM proposals ORDER BY created_at DESC LIMIT ${limit}`,
    );
  }

  addLearning(input: unknown): unknown {
    const artist = this.requireArtist();
    const parsed = LearningInputSchema.parse(input);
    assertNoSecretLikeText(parsed.observation, parsed.evidence);
    const learning = {
      id: crypto.randomUUID(),
      artistId: artist.artistId,
      createdAt: new Date().toISOString(),
      ...parsed,
    };
    const json = JSON.stringify(learning);
    this.sql`
      INSERT INTO learnings (id, created_at, json)
      VALUES (${learning.id}, ${learning.createdAt}, ${json})
    `;
    this.sql`
      DELETE FROM learnings WHERE id NOT IN (
        SELECT id FROM learnings ORDER BY created_at DESC LIMIT 200
      )
    `;
    this.audit(parsed.actor, "artist.learning.added", "learning", learning.id, `${parsed.category} observation stored with ${parsed.confidence} confidence.`);
    return JsonValueSchema.parse(learning);
  }

  listLearnings(limitInput = 20): unknown[] {
    const limit = parseLimit(limitInput);
    return this.listJsonRows(
      this.sql<JsonRow>`SELECT json FROM learnings ORDER BY created_at DESC LIMIT ${limit}`,
    );
  }

  listAudit(limitInput = 50): unknown[] {
    const limit = parseLimit(limitInput);
    const rows = this.sql<AuditRow>`
      SELECT id, created_at, actor, event, object_type, object_id, summary
      FROM audit_events ORDER BY created_at DESC LIMIT ${limit}
    `;
    return rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      actor: row.actor,
      event: row.event,
      objectType: row.object_type,
      objectId: row.object_id,
      summary: row.summary,
    }));
  }
}
