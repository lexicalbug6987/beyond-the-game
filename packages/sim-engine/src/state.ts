import type {
  Norms,
  Relationship,
  SimConfig,
  SimState,
  TeammateDef,
  TeamValue,
  ValueLedgerEntry,
} from "./types.js";

const ALL_VALUES: TeamValue[] = [
  "courage",
  "excellence",
  "respect",
  "trust",
  "care",
  "accountability",
];

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export function createInitialRelationships(teammates: TeammateDef[]): Record<string, Relationship> {
  return Object.fromEntries(
    teammates.map((t) => [
      t.id,
      {
        trust: 0.45 + (t.role === "newcomer" ? -0.05 : 0),
        warmth: 0.4,
        memoryTags: [],
      },
    ]),
  );
}

export function createInitialNorms(): Norms {
  return {
    exclusion: 0.35,
    coverUp: 0.3,
    banterTolerance: 0.45,
    speakUpSafety: 0.4,
  };
}

export function createInitialLedger(): Record<TeamValue, ValueLedgerEntry> {
  return Object.fromEntries(ALL_VALUES.map((v) => [v, { reinforced: 0, undermined: 0 }])) as Record<
    TeamValue,
    ValueLedgerEntry
  >;
}

export function createInitialState(config: SimConfig, chosenValues: TeamValue[] = []): SimState {
  const messages = config.openingMessages.map((m) => ({ ...m, day: 1 }));

  return {
    configId: config.id,
    day: 1,
    playerRole: config.playerRole,
    teammates: config.teammates,
    relationships: createInitialRelationships(config.teammates),
    norms: createInitialNorms(),
    fatigue: 0.2,
    morale: 0.55,
    messages,
    events: [],
    actionLog: [],
    completed: false,
    chosenValues,
    valueLedger: createInitialLedger(),
    resolvedScenarios: {},
  };
}

/** Fold a set of value impacts into the running ledger (reinforced vs. undermined). */
export function accrueValues(
  ledger: Record<TeamValue, ValueLedgerEntry>,
  impacts: Partial<Record<TeamValue, number>>,
): Record<TeamValue, ValueLedgerEntry> {
  const next: Record<TeamValue, ValueLedgerEntry> = { ...ledger };
  for (const [value, amount] of Object.entries(impacts) as [TeamValue, number][]) {
    if (!amount) continue;
    const entry = next[value] ?? { reinforced: 0, undermined: 0 };
    next[value] =
      amount > 0
        ? { ...entry, reinforced: entry.reinforced + amount }
        : { ...entry, undermined: entry.undermined - amount };
  }
  return next;
}

export function adjustNorms(norms: Norms, delta: Partial<Norms>): Norms {
  return {
    exclusion: clamp(norms.exclusion + (delta.exclusion ?? 0)),
    coverUp: clamp(norms.coverUp + (delta.coverUp ?? 0)),
    banterTolerance: clamp(norms.banterTolerance + (delta.banterTolerance ?? 0)),
    speakUpSafety: clamp(norms.speakUpSafety + (delta.speakUpSafety ?? 0)),
  };
}

export function adjustRelationship(
  rel: Relationship,
  delta: Partial<Pick<Relationship, "trust" | "warmth">> & { memoryTag?: string },
): Relationship {
  const memoryTags = delta.memoryTag ? [...rel.memoryTags, delta.memoryTag].slice(-8) : rel.memoryTags;
  return {
    trust: clamp(rel.trust + (delta.trust ?? 0)),
    warmth: clamp(rel.warmth + (delta.warmth ?? 0)),
    memoryTags,
  };
}

export function getInfluentialTeammates(teammates: TeammateDef[]): TeammateDef[] {
  return [...teammates].sort((a, b) => b.influence - a.influence);
}

export function getMarginalizedTeammates(
  teammates: TeammateDef[],
  relationships: Record<string, Relationship>,
): TeammateDef[] {
  return teammates
    .filter((t) => t.vulnerability >= 0.55 || t.role === "newcomer")
    .sort(
      (a, b) =>
        (relationships[a.id]?.warmth ?? 0) - (relationships[b.id]?.warmth ?? 0) ||
        b.vulnerability - a.vulnerability,
    );
}

export function roleWeight(playerRole: SimState["playerRole"]): number {
  switch (playerRole) {
    case "captain":
      return 1.4;
    case "starter":
      return 1.1;
    case "bench":
      return 0.9;
    case "newcomer":
      return 0.75;
  }
}
