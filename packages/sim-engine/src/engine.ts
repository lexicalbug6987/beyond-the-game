import type { SimConfig, SimState, TeamSignals, TickResult } from "./types.js";
import { applyAction, generateEvents, getAvailableActions } from "./actions.js";
import { createInitialState } from "./state.js";
import { getValueLevels } from "./values.js";

export function startSimulation(config: SimConfig): SimState {
  return createInitialState(config);
}

export function getTeamSignals(state: SimState): TeamSignals {
  const sorted = [...state.teammates].sort(
    (a, b) => (state.relationships[b.id]?.warmth ?? 0) - (state.relationships[a.id]?.warmth ?? 0),
  );

  const warm = sorted.filter((t) => (state.relationships[t.id]?.warmth ?? 0) >= 0.55).slice(0, 3);
  const quiet = sorted.filter((t) => (state.relationships[t.id]?.warmth ?? 0) <= 0.35).slice(0, 3);

  const { vibeLabel, vibeDescription } = describeVibe(state);

  const recentShifts: string[] = [];
  if (state.norms.exclusion > 0.6) recentShifts.push("Inside circles are forming faster.");
  if (state.norms.speakUpSafety > 0.55) recentShifts.push("More people seem willing to say the uncomfortable thing.");
  if (state.norms.banterTolerance > 0.6) recentShifts.push("Jokes are landing harder; some people talk less after.");
  if (state.morale < 0.4) recentShifts.push("The room feels tighter after recent results.");

  return {
    vibeLabel,
    vibeDescription,
    whoReachedOut: warm.map((t) => t.name),
    whoWentQuiet: quiet.map((t) => t.name),
    recentShifts,
  };
}

export function tickDay(
  state: SimState,
  config: SimConfig,
  actions: Parameters<typeof applyAction>[1][],
): TickResult {
  let next = { ...state };
  const narrative: string[] = [];

  for (const action of actions) {
    const result = applyAction(next, action);
    next = result.state;
    narrative.push(...result.notes);
  }

  const plan = config.schedule.find((d) => d.day === next.day);
  if (plan?.gameResult === "loss") next = { ...next, morale: Math.max(0, next.morale - 0.08) };
  if (plan?.gameResult === "win") next = { ...next, morale: Math.min(1, next.morale + 0.06) };

  const newEvents = generateEvents(next, config).map((e) =>
    e.kind === "scenario" ? e : { ...e, resolved: true },
  );
  next = {
    ...next,
    events: [...next.events, ...newEvents],
    fatigue: Math.min(1, next.fatigue + 0.04),
  };

  if (next.day >= config.totalDays) {
    next = { ...next, completed: true };
  } else {
    next = { ...next, day: next.day + 1 };
    const dayMessages = config.openingMessages
      .filter((_, i) => (next.day + i) % 3 === 0)
      .map((m, i) => ({
        ...m,
        id: `${m.id}-d${next.day}-${i}`,
        day: next.day,
      }));
    next = { ...next, messages: [...next.messages, ...dayMessages] };
  }

  return {
    state: next,
    newEvents,
    signals: getTeamSignals(next),
    narrative,
  };
}

export function getContext(state: SimState, space: Parameters<typeof getAvailableActions>[1]) {
  const events = state.events.filter((e) => e.day === state.day);
  const scenario = events.find((e) => e.kind === "scenario");
  return {
    day: state.day,
    space,
    actions: getAvailableActions(state, space),
    signals: getTeamSignals(state),
    messages: state.messages.filter((m) => m.day <= state.day).slice(-12),
    events,
    scenario,
  };
}

function describeVibe(state: SimState): { vibeLabel: string; vibeDescription: string } {
  const { exclusion, speakUpSafety, banterTolerance, coverUp } = state.norms;

  if (exclusion > 0.6 && speakUpSafety < 0.4) {
    return {
      vibeLabel: "Tight but cliquey",
      vibeDescription: "Groups within the group. People show up, but not everyone feels inside.",
    };
  }
  if (speakUpSafety > 0.55 && exclusion < 0.4) {
    return {
      vibeLabel: "Open and steady",
      vibeDescription: "Not perfect, but people seem willing to look out for each other.",
    };
  }
  if (banterTolerance > 0.6 && speakUpSafety < 0.45) {
    return {
      vibeLabel: "Loud edge",
      vibeDescription: "Energy is high, but some teammates go quiet when the jokes pick a target.",
    };
  }
  if (coverUp > 0.55) {
    return {
      vibeLabel: "Protect the image",
      vibeDescription: "Mistakes get smoothed over quickly. Problems may show up later.",
    };
  }
  return {
    vibeLabel: "Still forming",
    vibeDescription: "Norms are settling. Small choices this week will matter.",
  };
}

export function getSeasonSummary(state: SimState, config: SimConfig) {
  const signals = getTeamSignals(state);
  const closest = [...state.teammates]
    .sort((a, b) => (state.relationships[b.id]?.trust ?? 0) - (state.relationships[a.id]?.trust ?? 0))
    .slice(0, 3)
    .map((t) => t.name);

  // No values were chosen up front — they're discovered here, ranked by how
  // cleanly each held up when the team was actually tested.
  const levels = getValueLevels(state, config);
  const tested = levels.filter((v) => v.tier !== "untested");
  const ranked = [...tested].sort((a, b) => b.score - a.score);

  const strong = ranked.filter((v) => v.tier === "strong").map((v) => v.label);
  const fragile = ranked.filter((v) => v.tier === "fragile").map((v) => v.label);

  return {
    completed: state.completed,
    vibe: signals.vibeLabel,
    description: signals.vibeDescription,
    closestTeammates: closest,
    shifts: signals.recentShifts,
    actionsTaken: state.actionLog.length,
    valueLevels: levels,
    topValues: ranked.slice(0, 2).map((v) => v.label),
    strongValues: strong,
    fragileValues: fragile,
    revealHeadline: buildRevealHeadline(ranked, strong, fragile),
  };
}

function buildRevealHeadline(
  ranked: { label: string }[],
  strong: string[],
  fragile: string[],
): string {
  if (ranked.length === 0) {
    return "Not many moments tested who this team is yet — play a full trip to find out.";
  }
  const lead = strong.length
    ? `Under pressure, this team ran on ${joinLabels(strong)}.`
    : `When it counted, ${joinLabels([ranked[0].label])} carried this team.`;
  const tail = fragile.length
    ? ` ${joinLabels(fragile)} ${fragile.length > 1 ? "are" : "is"} where it got thin.`
    : "";
  return lead + tail;
}

function joinLabels(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? "";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}
