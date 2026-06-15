import { create } from "zustand";
import {
  applyAction,
  getContext,
  generateEvents,
  getSeasonSummary,
  getTeamSignals,
  resolveScenario,
  startSimulation,
  type PlayerAction,
  type SimConfig,
  type SimEvent,
  type SimState,
  type SpaceId,
} from "@team-culture-sim/sim-engine";
import roadTrip from "@team-culture-sim/content/road-trip.json";

const config = roadTrip as SimConfig;

type Phase = "playing" | "complete";

interface SimStore {
  config: SimConfig;
  state: SimState;
  phase: Phase;
  space: SpaceId;
  narrative: string[];
  reset: () => void;
  setSpace: (space: SpaceId) => void;
  performAction: (action: PlayerAction) => void;
  resolveScenario: (scenarioId: string, optionId: string) => void;
  advanceDay: () => void;
}

const OPENING_LINE = "A two-week road trip. No one's keeping score on values — yet.";

const refreshDayEvents = (state: SimState): SimEvent[] => {
  const generated = generateEvents(state, config).map((e) =>
    e.kind === "scenario" ? e : { ...e, resolved: true },
  );
  const other = state.events.filter((e) => e.day !== state.day);
  return [...other, ...generated];
};

const freshState = (): SimState => {
  const s = startSimulation(config);
  return { ...s, events: refreshDayEvents(s) };
};

export const useSimStore = create<SimStore>((set, get) => ({
  config,
  state: freshState(),
  phase: "playing",
  space: config.schedule[0]?.spaces[0] ?? "bus",
  narrative: [OPENING_LINE],

  reset: () =>
    set({
      state: freshState(),
      phase: "playing",
      space: config.schedule[0]?.spaces[0] ?? "bus",
      narrative: [OPENING_LINE],
    }),

  setSpace: (space) => set({ space }),

  performAction: (action) => {
    const { state } = get();
    const result = applyAction(state, action);
    set({
      state: { ...result.state, events: refreshDayEvents(result.state) },
      narrative: [...get().narrative, ...result.notes].slice(-20),
    });
  },

  resolveScenario: (scenarioId, optionId) => {
    const { state } = get();
    const result = resolveScenario(state, config, scenarioId, optionId);
    set({
      state: { ...result.state, events: refreshDayEvents(result.state) },
      narrative: [...get().narrative, ...result.notes].slice(-20),
    });
  },

  advanceDay: () => {
    const { state, narrative } = get();
    if (state.completed) return;

    const plan = config.schedule.find((d) => d.day === state.day);
    let next: SimState = { ...state, fatigue: Math.min(1, state.fatigue + 0.04) };
    if (plan?.gameResult === "loss") next = { ...next, morale: Math.max(0, next.morale - 0.08) };
    if (plan?.gameResult === "win") next = { ...next, morale: Math.min(1, next.morale + 0.06) };

    const nextDay = next.day + 1;
    if (nextDay > config.totalDays) {
      set({
        state: { ...next, completed: true },
        phase: "complete",
        narrative: [...narrative, "Road trip wrapped."].slice(-24),
      });
      return;
    }

    const dayMessages = config.openingMessages
      .filter((_, i) => (nextDay + i) % 3 === 0)
      .map((m, i) => ({ ...m, id: `${m.id}-d${nextDay}-${i}`, day: nextDay }));

    const advanced: SimState = {
      ...next,
      day: nextDay,
      messages: [...next.messages, ...dayMessages],
      events: [],
    };
    const nextSpace = config.schedule.find((d) => d.day === nextDay)?.spaces[0] ?? get().space;

    set({
      state: { ...advanced, events: refreshDayEvents(advanced) },
      space: nextSpace,
      narrative: [...narrative, `— ${dayLabel(nextDay)} —`].slice(-24),
    });
  },
}));

export function useCurrentContext() {
  const state = useSimStore((s) => s.state);
  const space = useSimStore((s) => s.space);
  return getContext(state, space);
}

export function useSignals() {
  const state = useSimStore((s) => s.state);
  return getTeamSignals(state);
}

export function useSummary() {
  const state = useSimStore((s) => s.state);
  return getSeasonSummary(state, config);
}

function dayLabel(day: number) {
  return config.schedule.find((d) => d.day === day)?.label ?? `Day ${day}`;
}

export { config };
