import { z } from "zod";
import { ActionRequestSchema, ArtistIdSchema } from "./schemas";
import type { ArtistProfile, ActionRequest, JsonValue } from "./schemas";

export type ProposalStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "EXECUTING"
  | "EXECUTED"
  | "FAILED"
  | "RECONCILIATION_REQUIRED"
  | "EXPIRED";

export interface PolicyDecision {
  status: "PASS" | "BLOCKED";
  reasons: string[];
}

export interface ActionProposal {
  id: string;
  artistId: string;
  createdAt: string;
  createdBy: string;
  expiresAt: string;
  request: ActionRequest;
  digest: string;
  status: ProposalStatus;
  policyDecision: PolicyDecision;
  approvedAt: string | null;
  approvedBy: string | null;
  rejectedAt: string | null;
  rejectedBy: string | null;
  executionStartedAt: string | null;
  executedAt: string | null;
  executedBy: string | null;
  outcome: string | null;
  spotifyTraceId: string | null;
}

export const ActionProposalSchema: z.ZodType<ActionProposal> = z.object({
  id: z.uuid(),
  artistId: ArtistIdSchema,
  createdAt: z.string().datetime({ offset: true }),
  createdBy: z.string(),
  expiresAt: z.string().datetime({ offset: true }),
  request: ActionRequestSchema,
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.enum([
    "PENDING",
    "APPROVED",
    "REJECTED",
    "EXECUTING",
    "EXECUTED",
    "FAILED",
    "RECONCILIATION_REQUIRED",
    "EXPIRED",
  ]),
  policyDecision: z.object({
    status: z.enum(["PASS", "BLOCKED"]),
    reasons: z.array(z.string()),
  }),
  approvedAt: z.string().datetime({ offset: true }).nullable(),
  approvedBy: z.string().nullable(),
  rejectedAt: z.string().datetime({ offset: true }).nullable(),
  rejectedBy: z.string().nullable(),
  executionStartedAt: z.string().datetime({ offset: true }).nullable(),
  executedAt: z.string().datetime({ offset: true }).nullable(),
  executedBy: z.string().nullable(),
  outcome: z.string().nullable(),
  spotifyTraceId: z.string().nullable(),
});

function normalizeJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (value !== null && typeof value === "object") {
    const result: Record<string, JsonValue> = {};
    for (const key of Object.keys(value).sort()) {
      const item = value[key];
      if (item !== undefined) result[key] = normalizeJson(item);
    }
    return result;
  }
  return value;
}

export function canonicalJson(value: JsonValue): string {
  return JSON.stringify(normalizeJson(value));
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function microAmountToMinor(microAmount: number, currencyMinorUnit: number): number {
  return Math.round(microAmount / 10 ** (6 - currencyMinorUnit));
}

export function evaluateActionPolicy(
  action: ActionRequest,
  artist: ArtistProfile | null,
  now = new Date(),
): PolicyDecision {
  const reasons: string[] = [];
  if (artist === null) return { status: "BLOCKED", reasons: ["Configure the artist profile first."] };

  if (artist.defaultCurrency !== null && action.currency !== artist.defaultCurrency) {
    reasons.push(
      `Action currency ${action.currency} does not match configured artist currency ${artist.defaultCurrency}.`,
    );
  }

  const requiresZeroDeclaredSpend = [
    "CREATE_DRAFT_CAMPAIGN",
    "CREATE_DRAFT_AD_SET",
    "CREATE_DRAFT_AD",
    "VALIDATE_DRAFT_CAMPAIGN",
  ].includes(action.kind);
  if (requiresZeroDeclaredSpend && action.maxAdditionalSpendMinor !== 0) {
    reasons.push("Draft creation and validation must declare zero immediate spend impact.");
  }

  if (action.kind === "SET_AD_SET_DELIVERY") {
    if (action.delivery === "OFF" && action.maxAdditionalSpendMinor !== 0) {
      reasons.push("Turning delivery off must declare zero additional spend.");
    }
    if (action.delivery === "ON" && action.maxAdditionalSpendMinor <= 0) {
      reasons.push("Turning delivery on requires a non-zero maximum additional spend declaration.");
    }
    if (action.delivery === "ON") {
      if (action.expectedState === null) {
        reasons.push("Turning delivery on requires the current ad-set budget and flight as an approved state anchor.");
      } else {
        const start = new Date(action.expectedState.flightStart).getTime();
        const end = new Date(action.expectedState.flightEnd).getTime();
        if (end <= start || end <= now.getTime()) {
          reasons.push("The approved ad-set flight must end in the future and after it starts.");
        } else {
          const budgetMinor = microAmountToMinor(
            action.expectedState.budget.micro_amount,
            artist.currencyMinorUnit,
          );
          const exposureStart = Math.max(start, now.getTime());
          const remainingDays = Math.max(1, Math.ceil((end - exposureStart) / 86_400_000));
          const conservativeExposure = action.expectedState.budget.type === "DAILY"
            ? budgetMinor * remainingDays
            : budgetMinor;
          if (action.maxAdditionalSpendMinor < conservativeExposure) {
            reasons.push(
              "Declared additional spend is below the conservative exposure of the approved budget and remaining flight.",
            );
          }
        }
      }
    }
  }

  if (action.kind === "UPDATE_AD_SET_BUDGET") {
    const budgetMinor = microAmountToMinor(action.budget.micro_amount, artist.currencyMinorUnit);
    const currentBudgetMinor = microAmountToMinor(
      action.currentBudget.micro_amount,
      artist.currencyMinorUnit,
    );
    const limit =
      action.budget.type === "DAILY"
        ? artist.approvalPolicy.maxDailyBudgetMinor
        : artist.approvalPolicy.maxLifetimeBudgetMinor;
    if (limit === null) {
      reasons.push(`No ${action.budget.type.toLowerCase()} budget ceiling is configured.`);
    } else if (budgetMinor > limit) {
      reasons.push(`Requested ${action.budget.type.toLowerCase()} budget exceeds the configured ceiling.`);
    }
    if (action.currentBudget.type !== action.budget.type) {
      reasons.push("Changing the ad-set budget type is not supported by the automated approval lane.");
    }
    const expectedIncrease = Math.max(0, budgetMinor - currentBudgetMinor);
    if (action.maxAdditionalSpendMinor !== expectedIncrease) {
      reasons.push("Declared additional spend must equal the proposed budget increase from the anchored current budget.");
    }
  }

  if (action.kind === "PUBLISH_DRAFT_CAMPAIGN" || (action.kind === "SET_AD_SET_DELIVERY" && action.delivery === "ON")) {
    const limit = artist.approvalPolicy.maxLifetimeBudgetMinor;
    if (limit === null) {
      reasons.push("No lifetime spend ceiling is configured for activation or publication.");
    } else if (action.maxAdditionalSpendMinor > limit) {
      reasons.push("Declared additional spend exceeds the configured lifetime ceiling.");
    }
  }

  return { status: reasons.length === 0 ? "PASS" : "BLOCKED", reasons };
}

export async function createActionProposal(
  artistId: string,
  action: ActionRequest,
  artist: ArtistProfile | null,
  now = new Date(),
): Promise<ActionProposal> {
  const id = crypto.randomUUID();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + action.expiresInHours * 3_600_000).toISOString();
  const immutable = {
    id,
    artistId,
    createdAt,
    expiresAt,
    request: action,
  } satisfies JsonValue;
  const digest = await sha256Hex(canonicalJson(immutable));
  return {
    id,
    artistId,
    createdAt,
    createdBy: action.actor,
    expiresAt,
    request: action,
    digest,
    status: "PENDING",
    policyDecision: evaluateActionPolicy(action, artist, now),
    approvedAt: null,
    approvedBy: null,
    rejectedAt: null,
    rejectedBy: null,
    executionStartedAt: null,
    executedAt: null,
    executedBy: null,
    outcome: null,
    spotifyTraceId: null,
  };
}

export function isProposalExpired(proposal: ActionProposal, now = new Date()): boolean {
  return new Date(proposal.expiresAt).getTime() <= now.getTime();
}
