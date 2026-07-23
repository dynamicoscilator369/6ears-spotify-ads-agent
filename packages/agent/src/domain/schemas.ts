import { z } from "zod";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number().finite(),
    z.string(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

export const JsonObjectSchema = z.record(z.string(), JsonValueSchema);
export const ArtistIdSchema = z
  .string()
  .min(2)
  .max(63)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/);
export const ActorSchema = z.string().trim().min(2).max(120);
export const IsoDateTimeSchema = z.string().datetime({ offset: true });
export const CurrencySchema = z.string().regex(/^[A-Z]{3}$/);
export const CountryCodeSchema = z.string().regex(/^[A-Z]{2}$/);
export const MoneyMinorSchema = z.number().int().nonnegative().safe();

export const ApprovalPolicySchema = z.object({
  maxDailyBudgetMinor: MoneyMinorSchema.positive().nullable().default(null),
  maxLifetimeBudgetMinor: MoneyMinorSchema.positive().nullable().default(null),
  requireDistinctApprover: z.boolean().default(true),
});

export const ArtistProfileSchema = z
  .object({
    artistId: ArtistIdSchema,
    displayName: z.string().trim().min(2).max(120),
    spotifyArtistId: z.string().trim().min(1).max(80).nullable().default(null),
    spotifyArtistUri: z
      .string()
      .trim()
      .regex(/^spotify:artist:[A-Za-z0-9]+$/)
      .nullable()
      .default(null),
    genres: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
    priorityMarkets: z.array(CountryCodeSchema).max(30).default([]),
    brandNotes: z.array(z.string().trim().min(1).max(500)).max(30).default([]),
    defaultCurrency: CurrencySchema.nullable().default(null),
    currencyMinorUnit: z.number().int().min(0).max(3).default(2),
    approvalPolicy: ApprovalPolicySchema.default({
      maxDailyBudgetMinor: null,
      maxLifetimeBudgetMinor: null,
      requireDistinctApprover: true,
    }),
  })
  .strict();

export type ArtistProfile = z.infer<typeof ArtistProfileSchema>;

export const CampaignPlanInputSchema = z
  .object({
    actor: ActorSchema,
    name: z.string().trim().min(2).max(160),
    goal: z.enum([
      "AWARENESS",
      "ENGAGEMENT_ON_SPOTIFY",
      "WEBSITE_TRAFFIC",
      "APP_PROMOTION",
      "CUSTOM",
    ]),
    promotedWork: z.string().trim().min(1).max(240),
    hypothesis: z.string().trim().min(10).max(1000),
    startTime: IsoDateTimeSchema,
    endTime: IsoDateTimeSchema,
    countries: z.array(CountryCodeSchema).min(1).max(20),
    formats: z.array(z.enum(["AUDIO", "VIDEO", "IMAGE"])).min(1).max(3),
    currency: CurrencySchema,
    currencyMinorUnit: z.number().int().min(0).max(3).default(2),
    dailyBudgetMinor: MoneyMinorSchema.positive().nullable().default(null),
    lifetimeBudgetMinor: MoneyMinorSchema.positive().nullable().default(null),
    successMetrics: z.array(z.string().trim().min(1).max(120)).min(1).max(12),
    knownFacts: z.array(z.string().trim().min(1).max(500)).max(30).default([]),
    assumptions: z.array(z.string().trim().min(1).max(500)).max(30).default([]),
    constraints: z.array(z.string().trim().min(1).max(500)).max(30).default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new Date(value.endTime).getTime() <= new Date(value.startTime).getTime()) {
      ctx.addIssue({ code: "custom", message: "endTime must be after startTime", path: ["endTime"] });
    }
    const count = Number(value.dailyBudgetMinor !== null) + Number(value.lifetimeBudgetMinor !== null);
    if (count !== 1) {
      ctx.addIssue({
        code: "custom",
        message: "Provide exactly one of dailyBudgetMinor or lifetimeBudgetMinor",
        path: ["dailyBudgetMinor"],
      });
    }
  });

export type CampaignPlanInput = z.infer<typeof CampaignPlanInputSchema>;

export const AudienceBriefInputSchema = z
  .object({
    actor: ActorSchema,
    planId: z.uuid().nullable().default(null),
    objective: z.string().trim().min(2).max(240),
    primaryListenerHypothesis: z.string().trim().min(10).max(1000),
    countries: z.array(CountryCodeSchema).min(1).max(20),
    ageRanges: z
      .array(z.object({ min: z.number().int().min(13).max(99), max: z.number().int().min(13).max(99) }))
      .max(8)
      .default([]),
    artistTargetHypotheses: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
    genreHypotheses: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
    exclusions: z.array(z.string().trim().min(1).max(240)).max(30).default([]),
    evidence: z.array(z.string().trim().min(1).max(500)).max(30).default([]),
    unknowns: z.array(z.string().trim().min(1).max(500)).max(30).default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    value.ageRanges.forEach((range, index) => {
      if (range.max < range.min) {
        ctx.addIssue({ code: "custom", message: "max must be at least min", path: ["ageRanges", index, "max"] });
      }
    });
  });

export type AudienceBriefInput = z.infer<typeof AudienceBriefInputSchema>;

export const CreativeBriefInputSchema = z
  .object({
    actor: ActorSchema,
    planId: z.uuid().nullable().default(null),
    promotedWork: z.string().trim().min(1).max(240),
    coreMessage: z.string().trim().min(10).max(1000),
    desiredAction: z.string().trim().min(2).max(240),
    formats: z.array(z.enum(["AUDIO", "VIDEO", "IMAGE"])).min(1).max(3),
    hooksToTest: z.array(z.string().trim().min(2).max(300)).min(1).max(12),
    mandatoryElements: z.array(z.string().trim().min(1).max(240)).max(30).default([]),
    prohibitedElements: z.array(z.string().trim().min(1).max(240)).max(30).default([]),
    substantiatedClaims: z.array(z.string().trim().min(1).max(500)).max(30).default([]),
    openQuestions: z.array(z.string().trim().min(1).max(500)).max(30).default([]),
  })
  .strict();

export type CreativeBriefInput = z.infer<typeof CreativeBriefInputSchema>;

export const ManualPerformanceInputSchema = z
  .object({
    actor: ActorSchema,
    source: z.enum(["ADS_MANAGER_EXPORT", "ADS_MANAGER_COPY", "OTHER_VERIFIED_SOURCE"]),
    sourceNote: z.string().trim().min(2).max(500),
    capturedAt: IsoDateTimeSchema,
    entityId: z.string().trim().min(1).max(120),
    entityName: z.string().trim().min(1).max(240),
    budgetType: z.enum(["DAILY", "LIFETIME"]),
    budgetMinor: MoneyMinorSchema.positive(),
    currency: CurrencySchema,
    currencyMinorUnit: z.number().int().min(0).max(3),
    flightStart: IsoDateTimeSchema,
    flightEnd: IsoDateTimeSchema,
    spendMinorToday: MoneyMinorSchema,
    spendMinorLifetime: MoneyMinorSchema,
    impressionsToday: z.number().int().nonnegative().safe(),
    impressionsLifetime: z.number().int().nonnegative().safe(),
    clicksToday: z.number().int().nonnegative().safe().default(0),
    clicksLifetime: z.number().int().nonnegative().safe().default(0),
    frequencyLifetime: z.number().nonnegative().finite().nullable().default(null),
  })
  .strict();

export type ManualPerformanceInput = z.infer<typeof ManualPerformanceInputSchema>;

const ActionCommonSchema = z.object({
  actor: ActorSchema,
  reason: z.string().trim().min(10).max(1000),
  currency: CurrencySchema,
  maxAdditionalSpendMinor: MoneyMinorSchema,
  expiresInHours: z.number().int().min(1).max(168).default(24),
});

const SpotifyBudgetSchema = z.object({
  micro_amount: z.number().int().positive().safe(),
  type: z.enum(["DAILY", "LIFETIME"]),
});

const ExpectedAdSetStateSchema = z.object({
  budget: SpotifyBudgetSchema,
  flightStart: IsoDateTimeSchema,
  flightEnd: IsoDateTimeSchema,
});

const DraftPayloadSchema = JsonObjectSchema.superRefine((value, ctx) => {
  const encoded = JSON.stringify(value);
  if (encoded.length > 32_000) {
    ctx.addIssue({ code: "custom", message: "Draft payload exceeds 32 KB" });
  }
  const sensitiveKey = Object.keys(value).find((key) => /token|secret|password|authorization/i.test(key));
  if (sensitiveKey) {
    ctx.addIssue({ code: "custom", message: `Sensitive-looking field is not allowed: ${sensitiveKey}` });
  }
});

export const ActionRequestSchema = z.discriminatedUnion("kind", [
  ActionCommonSchema.extend({
    kind: z.literal("CREATE_DRAFT_CAMPAIGN"),
    payload: DraftPayloadSchema.and(z.object({ name: z.string().trim().min(2).max(200) })),
  }).strict(),
  ActionCommonSchema.extend({
    kind: z.literal("CREATE_DRAFT_AD_SET"),
    payload: DraftPayloadSchema.and(
      z.object({
        name: z.string().trim().min(2).max(200),
        campaign_id: z.string().trim().min(1).max(120),
      }),
    ),
  }).strict(),
  ActionCommonSchema.extend({
    kind: z.literal("CREATE_DRAFT_AD"),
    payload: DraftPayloadSchema.and(
      z.object({
        name: z.string().trim().min(2).max(200),
        ad_set_id: z.string().trim().min(1).max(120),
      }),
    ),
  }).strict(),
  ActionCommonSchema.extend({
    kind: z.literal("VALIDATE_DRAFT_CAMPAIGN"),
    draftCampaignId: z.string().trim().min(1).max(120),
    draftHierarchyVersion: z.number().int().nonnegative().safe(),
  }).strict(),
  ActionCommonSchema.extend({
    kind: z.literal("PUBLISH_DRAFT_CAMPAIGN"),
    draftCampaignId: z.string().trim().min(1).max(120),
    draftHierarchyVersion: z.number().int().nonnegative().safe(),
  }).strict(),
  ActionCommonSchema.extend({
    kind: z.literal("UPDATE_AD_SET_BUDGET"),
    adSetId: z.string().trim().min(1).max(120),
    currentBudget: SpotifyBudgetSchema,
    budget: SpotifyBudgetSchema,
  }).strict(),
  ActionCommonSchema.extend({
    kind: z.literal("SET_AD_SET_DELIVERY"),
    adSetId: z.string().trim().min(1).max(120),
    delivery: z.enum(["ON", "OFF"]),
    expectedState: ExpectedAdSetStateSchema.nullable().default(null),
  }).strict(),
]);

export type ActionRequest = z.infer<typeof ActionRequestSchema>;

export const ApprovalDecisionSchema = z
  .object({
    actor: ActorSchema,
    digest: z.string().regex(/^[a-f0-9]{64}$/),
    note: z.string().trim().max(500).default(""),
  })
  .strict();

export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;

export const LearningInputSchema = z
  .object({
    actor: ActorSchema,
    category: z.enum(["AUDIENCE", "CREATIVE", "PACING", "OPERATIONS", "ARTIST_CONTEXT"]),
    observation: z.string().trim().min(10).max(1500),
    evidence: z.string().trim().min(2).max(1000),
    confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
  })
  .strict();

export type LearningInput = z.infer<typeof LearningInputSchema>;

export const ReviewScheduleInputSchema = z
  .object({
    actor: ActorSchema,
    cronUtc: z
      .string()
      .trim()
      .min(9)
      .max(100)
      .refine((value) => value.split(/\s+/).length === 5, "cronUtc must contain five fields"),
  })
  .strict();

export type ReviewScheduleInput = z.infer<typeof ReviewScheduleInputSchema>;

export const ReviewRequestSchema = z.object({ actor: ActorSchema }).strict();
