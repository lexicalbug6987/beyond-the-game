import type { QuizConfig, TeamValue } from "@team-culture-sim/sim-engine";

const TEAM_VALUES: TeamValue[] = [
  "courage",
  "excellence",
  "respect",
  "trust",
  "care",
  "accountability",
];

export function formatImpacts(impacts: Partial<Record<TeamValue, number>>): string {
  return Object.entries(impacts)
    .map(([value, delta]) => `${value} ${delta > 0 ? "+" : ""}${delta}`)
    .join(", ");
}

export function parseImpacts(raw: string): Partial<Record<TeamValue, number>> {
  const impacts: Partial<Record<TeamValue, number>> = {};
  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  for (const part of parts) {
    const match = part.match(/^([a-z]+)\s*([+-]?\d+)$/i);
    if (!match) continue;
    const value = match[1].toLowerCase() as TeamValue;
    if (!TEAM_VALUES.includes(value)) continue;
    impacts[value] = Number(match[2]);
  }

  return impacts;
}

export function cloneQuizConfig(config: QuizConfig): QuizConfig {
  return structuredClone(config);
}
