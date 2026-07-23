import type {
  ArtistProfile,
  AudienceBriefInput,
  CampaignPlanInput,
  CreativeBriefInput,
} from "./schemas";

export interface CampaignPlan {
  id: string;
  createdAt: string;
  createdBy: string;
  artistId: string;
  name: string;
  goal: CampaignPlanInput["goal"];
  promotedWork: string;
  hypothesis: string;
  flight: {
    startTime: string;
    endTime: string;
    durationDays: number;
  };
  budget: {
    type: "DAILY" | "LIFETIME";
    amountMinor: number;
    currency: string;
    currencyMinorUnit: number;
    projectedMaximumMinor: number;
  };
  structure: {
    marketCells: Array<{ country: string; formats: CampaignPlanInput["formats"] }>;
    testPrinciple: string;
  };
  successMetrics: string[];
  knownFacts: string[];
  assumptions: string[];
  constraints: string[];
  evidenceGaps: string[];
  policyWarnings: string[];
  status: "DRAFT";
}

export interface AudienceBrief {
  id: string;
  createdAt: string;
  createdBy: string;
  artistId: string;
  planId: string | null;
  objective: string;
  primaryListenerHypothesis: string;
  marketCells: Array<{
    country: string;
    ageRanges: AudienceBriefInput["ageRanges"];
    artistTargetHypotheses: string[];
    genreHypotheses: string[];
  }>;
  exclusions: string[];
  supportingEvidence: string[];
  unknowns: string[];
  platformChecksRequired: string[];
  status: "DRAFT";
}

export interface CreativeBrief {
  id: string;
  createdAt: string;
  createdBy: string;
  artistId: string;
  planId: string | null;
  promotedWork: string;
  coreMessage: string;
  desiredAction: string;
  formats: CreativeBriefInput["formats"];
  testCells: Array<{ label: string; hook: string; invariant: string }>;
  mandatoryElements: string[];
  prohibitedElements: string[];
  substantiatedClaims: string[];
  openQuestions: string[];
  platformChecksRequired: string[];
  status: "DRAFT";
}

export function createCampaignPlan(
  input: CampaignPlanInput,
  artist: ArtistProfile,
  now = new Date(),
): CampaignPlan {
  const start = new Date(input.startTime);
  const end = new Date(input.endTime);
  const durationDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000));
  const budgetType = input.dailyBudgetMinor === null ? "LIFETIME" : "DAILY";
  const amountMinor = input.dailyBudgetMinor ?? input.lifetimeBudgetMinor ?? 0;
  const projectedMaximumMinor = budgetType === "DAILY" ? amountMinor * durationDays : amountMinor;
  const policyWarnings: string[] = [];

  if (artist.defaultCurrency !== null && artist.defaultCurrency !== input.currency) {
    policyWarnings.push(
      `Plan currency ${input.currency} differs from configured artist currency ${artist.defaultCurrency}.`,
    );
  }

  const policyLimit =
    budgetType === "DAILY"
      ? artist.approvalPolicy.maxDailyBudgetMinor
      : artist.approvalPolicy.maxLifetimeBudgetMinor;
  if (policyLimit === null) {
    policyWarnings.push(`No ${budgetType.toLowerCase()} approval ceiling is configured; live execution is blocked.`);
  } else if (amountMinor > policyLimit) {
    policyWarnings.push(
      `Planned ${budgetType.toLowerCase()} budget exceeds the configured approval ceiling.`,
    );
  }

  const evidenceGaps = [...input.assumptions.map((assumption) => `Validate assumption: ${assumption}`)];
  if (artist.spotifyArtistId === null) {
    evidenceGaps.push("Resolve and verify the Spotify artist ID before using artist targeting or artist promotion fields.");
  }
  evidenceGaps.push("Run Spotify audience and bid estimates before preparing a publish action.");

  return {
    id: crypto.randomUUID(),
    createdAt: now.toISOString(),
    createdBy: input.actor,
    artistId: artist.artistId,
    name: input.name,
    goal: input.goal,
    promotedWork: input.promotedWork,
    hypothesis: input.hypothesis,
    flight: { startTime: input.startTime, endTime: input.endTime, durationDays },
    budget: {
      type: budgetType,
      amountMinor,
      currency: input.currency,
      currencyMinorUnit: input.currencyMinorUnit,
      projectedMaximumMinor,
    },
    structure: {
      marketCells: input.countries.map((country) => ({ country, formats: [...input.formats] })),
      testPrinciple: "Change one major audience or creative variable per test cell; do not treat correlation as causation.",
    },
    successMetrics: [...input.successMetrics],
    knownFacts: [...input.knownFacts],
    assumptions: [...input.assumptions],
    constraints: [...input.constraints],
    evidenceGaps,
    policyWarnings,
    status: "DRAFT",
  };
}

export function createAudienceBrief(
  input: AudienceBriefInput,
  artist: ArtistProfile,
  now = new Date(),
): AudienceBrief {
  return {
    id: crypto.randomUUID(),
    createdAt: now.toISOString(),
    createdBy: input.actor,
    artistId: artist.artistId,
    planId: input.planId,
    objective: input.objective,
    primaryListenerHypothesis: input.primaryListenerHypothesis,
    marketCells: input.countries.map((country) => ({
      country,
      ageRanges: input.ageRanges.map((range) => ({ ...range })),
      artistTargetHypotheses: [...input.artistTargetHypotheses],
      genreHypotheses: [...input.genreHypotheses],
    })),
    exclusions: [...input.exclusions],
    supportingEvidence: [...input.evidence],
    unknowns: [...input.unknowns],
    platformChecksRequired: [
      "Resolve target IDs through the current Spotify targets endpoints; never infer IDs from names.",
      "Run the official audience estimate for every ad-set cell before draft creation.",
      "Confirm current geographic and age-targeting restrictions for every market.",
    ],
    status: "DRAFT",
  };
}

export function createCreativeBrief(
  input: CreativeBriefInput,
  artist: ArtistProfile,
  now = new Date(),
): CreativeBrief {
  return {
    id: crypto.randomUUID(),
    createdAt: now.toISOString(),
    createdBy: input.actor,
    artistId: artist.artistId,
    planId: input.planId,
    promotedWork: input.promotedWork,
    coreMessage: input.coreMessage,
    desiredAction: input.desiredAction,
    formats: [...input.formats],
    testCells: input.hooksToTest.map((hook, index) => ({
      label: `Hook ${index + 1}`,
      hook,
      invariant: input.coreMessage,
    })),
    mandatoryElements: [...input.mandatoryElements],
    prohibitedElements: [...input.prohibitedElements],
    substantiatedClaims: [...input.substantiatedClaims],
    openQuestions: [...input.openQuestions],
    platformChecksRequired: [
      "Verify current Spotify asset duration, codec, dimension, file-size, CTA, and companion-image requirements.",
      "Upload as a draft and confirm processing plus policy-review status before publication.",
      "Treat every unsupported public claim as blocked until evidence is attached.",
    ],
    status: "DRAFT",
  };
}

