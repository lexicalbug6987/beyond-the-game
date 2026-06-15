import type {
  PlayerAction,
  SimConfig,
  SimState,
  TeamValue,
  ValueDef,
  ValueLedgerEntry,
  ValueLevel,
  ValueOutcome,
  ValueStatus,
  ValueTier,
} from "./types.js";

/**
 * Small value impacts from everyday actions. These are intentionally modest —
 * culture is built by repeating them, not by any single choice. Featured
 * scenarios carry larger, explicit impacts (see ScenarioOption.valueImpacts).
 */
export function microValueImpacts(
  state: SimState,
  action: PlayerAction,
): Partial<Record<TeamValue, number>> {
  switch (action.type) {
    case "sit_with": {
      const target = state.teammates.find((t) => t.id === action.targetId);
      const marginal = target && (target.role === "newcomer" || target.vulnerability >= 0.55);
      return marginal ? { respect: 0.5, trust: 0.4, care: 0.4 } : { trust: 0.25, care: 0.2 };
    }
    case "check_in":
      return action.tone === "direct"
        ? { courage: 0.4, trust: 0.5, respect: 0.4, care: 0.4 }
        : { trust: 0.35, respect: 0.25, care: 0.3 };
    case "include_someone":
      return { respect: 0.6, trust: 0.4, care: 0.3 };
    case "react_in_chat":
      switch (action.reaction) {
        case "laugh":
          return { respect: -0.6, courage: -0.4, trust: -0.3, care: -0.3 };
        case "ignore":
          return { courage: -0.4, care: -0.2 };
        case "redirect":
          return { respect: 0.4, courage: 0.3 };
        case "dm_support":
          return { trust: 0.5, respect: 0.4, courage: 0.2, care: 0.5 };
      }
      return {};
    case "speak_up":
      switch (action.tone) {
        case "direct":
          return { courage: 0.7, respect: 0.5, care: 0.4, accountability: 0.3 };
        case "light":
          return { courage: 0.35, respect: 0.3 };
        case "defer":
          return { courage: -0.3, care: -0.2, accountability: -0.2 };
      }
      return {};
    case "stay_late":
      return { excellence: 0.5, care: 0.3, accountability: 0.4 };
    case "leave_early":
      return { excellence: -0.3, care: -0.2, accountability: -0.3 };
  }
}

function statusFor(reinforced: number, undermined: number): ValueStatus {
  const total = reinforced + undermined;
  if (total < 1) return "untested";
  const ratio = reinforced / total;
  if (ratio >= 0.65) return "demonstrated";
  if (ratio >= 0.45) return "partial";
  return "fell_short";
}

export function getValueOutcomes(state: SimState, config: SimConfig): ValueOutcome[] {
  return config.values.map((def) => {
    const entry = state.valueLedger[def.id] ?? { reinforced: 0, undermined: 0 };
    return {
      value: def.id,
      label: def.label,
      chosen: state.chosenValues.includes(def.id),
      status: statusFor(entry.reinforced, entry.undermined),
      reinforced: Math.round(entry.reinforced * 10) / 10,
      undermined: Math.round(entry.undermined * 10) / 10,
    };
  });
}

export const STATUS_MARK: Record<ValueStatus, string> = {
  demonstrated: "✓",
  partial: "△",
  fell_short: "✗",
  untested: "·",
};

const MIN_SIGNAL = 1; // below this much total activity, a value is "untested"

function tierFor(reinforced: number, undermined: number): ValueTier {
  const total = reinforced + undermined;
  if (total < MIN_SIGNAL) return "untested";
  const ratio = reinforced / total;
  if (ratio >= 0.65) return "strong";
  if (ratio >= 0.45) return "developing";
  return "fragile";
}

/** Turn any value ledger into per-value levels. Shared by the sim and the quiz. */
export function levelsFromLedger(
  ledger: Partial<Record<TeamValue, ValueLedgerEntry>>,
  values: ValueDef[],
): ValueLevel[] {
  return values.map((def) => {
    const entry = ledger[def.id] ?? { reinforced: 0, undermined: 0 };
    const total = entry.reinforced + entry.undermined;
    const tier = tierFor(entry.reinforced, entry.undermined);
    return {
      value: def.id,
      label: def.label,
      blurb: def.blurb,
      // 0–100 read on how cleanly the value held up when it came up.
      score: total < MIN_SIGNAL ? 0 : Math.round((entry.reinforced / total) * 100),
      tier,
      reinforced: Math.round(entry.reinforced * 10) / 10,
      undermined: Math.round(entry.undermined * 10) / 10,
    };
  });
}

/**
 * Discovery model: no value is chosen up front. Every action and scenario choice
 * accrues into the ledger, and at the end the team finds out what level of each
 * value they actually demonstrated — strong, developing, fragile, or untested.
 */
export function getValueLevels(state: SimState, config: SimConfig): ValueLevel[] {
  return levelsFromLedger(state.valueLedger, config.values);
}

export const TIER_LABEL: Record<ValueTier, string> = {
  strong: "Strong",
  developing: "Developing",
  fragile: "Fragile",
  untested: "Barely tested",
};
