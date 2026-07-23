import { z } from "zod";
import { ArtistIdSchema, ManualPerformanceInputSchema } from "./schemas";
import type { ManualPerformanceInput } from "./schemas";

export type PacingStatus =
  | "NOT_STARTED"
  | "COMPLETED"
  | "ON_TRACK"
  | "UNDERPACING"
  | "OVERPACING"
  | "EXHAUSTED"
  | "STALLED";

export interface PerformanceObservation extends Omit<ManualPerformanceInput, "actor"> {
  id: string;
  artistId: string;
  ingestedAt: string;
  provenance: "MANUAL" | "SPOTIFY_ADS_API_V3";
}

export const PerformanceObservationSchema = ManualPerformanceInputSchema.omit({ actor: true }).extend({
  id: z.uuid(),
  artistId: ArtistIdSchema,
  ingestedAt: z.string().datetime({ offset: true }),
  provenance: z.enum(["MANUAL", "SPOTIFY_ADS_API_V3"]),
});

export interface PacingAssessment {
  entityId: string;
  entityName: string;
  assessedAt: string;
  budgetType: "DAILY" | "LIFETIME";
  targetProgressPct: number;
  spendProgressPct: number;
  variancePoints: number;
  status: PacingStatus;
  evidence: string[];
  recommendations: string[];
}

function clampPercentage(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function rounded(value: number): number {
  return Math.round(value * 10) / 10;
}

export function assessPacing(observation: PerformanceObservation): PacingAssessment {
  const assessed = new Date(observation.capturedAt);
  const flightStart = new Date(observation.flightStart);
  const flightEnd = new Date(observation.flightEnd);
  const nowMs = assessed.getTime();
  const startMs = flightStart.getTime();
  const endMs = flightEnd.getTime();
  const evidence: string[] = [];
  const recommendations: string[] = [];

  let targetProgressPct: number;
  let spendProgressPct: number;
  const spendMinor =
    observation.budgetType === "DAILY" ? observation.spendMinorToday : observation.spendMinorLifetime;

  if (observation.budgetType === "DAILY") {
    const dayStart = Date.UTC(
      assessed.getUTCFullYear(),
      assessed.getUTCMonth(),
      assessed.getUTCDate(),
    );
    targetProgressPct = clampPercentage(((nowMs - dayStart) / 86_400_000) * 100);
    spendProgressPct = (spendMinor / observation.budgetMinor) * 100;
    evidence.push(
      `Daily spend is ${spendMinor} minor units against a ${observation.budgetMinor} minor-unit budget.`,
    );
  } else {
    targetProgressPct = clampPercentage(((nowMs - startMs) / Math.max(1, endMs - startMs)) * 100);
    spendProgressPct = (spendMinor / observation.budgetMinor) * 100;
    evidence.push(
      `Lifetime spend is ${spendMinor} minor units against a ${observation.budgetMinor} minor-unit budget.`,
    );
  }

  const variancePoints = spendProgressPct - targetProgressPct;
  let status: PacingStatus;
  if (nowMs < startMs) {
    status = "NOT_STARTED";
  } else if (nowMs > endMs) {
    status = "COMPLETED";
  } else if (spendProgressPct >= 100) {
    status = "EXHAUSTED";
    recommendations.push("Confirm delivery state and billed spend in Ads Manager before taking any action.");
  } else if (nowMs - startMs > 4 * 60 * 60 * 1000 && observation.impressionsToday === 0) {
    status = "STALLED";
    recommendations.push("Inspect ad review, delivery, bid, audience size, schedule, and asset status in Ads Manager.");
  } else if (variancePoints < -20) {
    status = "UNDERPACING";
    recommendations.push("Investigate delivery constraints; prepare changes as proposals rather than applying them automatically.");
  } else if (variancePoints > 20) {
    status = "OVERPACING";
    recommendations.push("Review burn rate and remaining budget; any cap or delivery change requires a new approval.");
  } else {
    status = "ON_TRACK";
  }

  evidence.push(
    `Flight progress is ${rounded(targetProgressPct)}%; spend progress is ${rounded(spendProgressPct)}%.`,
  );
  if (observation.frequencyLifetime !== null && observation.frequencyLifetime > 3) {
    evidence.push(`Lifetime frequency is ${observation.frequencyLifetime}; review possible audience fatigue.`);
    recommendations.push("Compare creative-level results and audience saturation before changing targeting.");
  }

  return {
    entityId: observation.entityId,
    entityName: observation.entityName,
    assessedAt: observation.capturedAt,
    budgetType: observation.budgetType,
    targetProgressPct: rounded(targetProgressPct),
    spendProgressPct: rounded(spendProgressPct),
    variancePoints: rounded(variancePoints),
    status,
    evidence,
    recommendations,
  };
}

export interface PerformanceReview {
  id: string;
  artistId: string;
  generatedAt: string;
  generatedBy: string;
  source: "MANUAL" | "SPOTIFY_ADS_API_V3" | "SCHEDULED_WITH_EXISTING_DATA";
  assessments: PacingAssessment[];
  summary: {
    entitiesReviewed: number;
    onTrack: number;
    needsAttention: number;
  };
  evidenceGaps: string[];
  automaticChangesMade: false;
}

export function createPerformanceReview(
  artistId: string,
  observations: PerformanceObservation[],
  generatedBy: string,
  source: PerformanceReview["source"],
  now = new Date(),
): PerformanceReview {
  const assessments = observations.map(assessPacing);
  const onTrack = assessments.filter((assessment) => assessment.status === "ON_TRACK").length;
  return {
    id: crypto.randomUUID(),
    artistId,
    generatedAt: now.toISOString(),
    generatedBy,
    source,
    assessments,
    summary: {
      entitiesReviewed: assessments.length,
      onTrack,
      needsAttention: assessments.length - onTrack,
    },
    evidenceGaps:
      observations.length === 0
        ? ["No performance observations are available. Connect the official API or ingest a verified Ads Manager export."]
        : ["Attribution and listener-quality conclusions require evidence beyond delivery metrics alone."],
    automaticChangesMade: false,
  };
}
