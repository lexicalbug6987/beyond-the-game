import { describe, expect, it } from "vitest";
import roadTrip from "../../content/road-trip.json";
import { startSimulation, tickDay, getTeamSignals, getSeasonSummary } from "./engine.js";
import { applyAction, resolveScenario, scenarioForDay } from "./actions.js";
import { getValueLevels } from "./values.js";
import type { SimConfig } from "./types.js";

const config = roadTrip as SimConfig;

describe("sim-engine", () => {
  it("starts with no values chosen and neutral-ish norms", () => {
    const state = startSimulation(config);
    expect(state.day).toBe(1);
    expect(state.completed).toBe(false);
    expect(state.chosenValues).toEqual([]);
    expect(Object.keys(state.relationships)).toHaveLength(config.teammates.length);
    expect(state.norms.exclusion).toBeGreaterThan(0.2);
    expect(state.norms.exclusion).toBeLessThan(0.5);
  });

  it("inclusion actions reduce exclusion norm over time", () => {
    let state = startSimulation(config);
    const newcomer = config.teammates.find((t) => t.role === "newcomer")!;

    for (let i = 0; i < 4; i++) {
      const result = tickDay(state, config, [
        { type: "include_someone", targetId: newcomer.id, space: "bus" },
      ]);
      state = result.state;
    }

    expect(state.norms.exclusion).toBeLessThan(0.35);
  });

  it("generates exclusion events when norm is high", () => {
    let state = startSimulation(config);
    state = {
      ...state,
      norms: { ...state.norms, exclusion: 0.7 },
      day: 4,
    };

    const result = tickDay(state, config, [{ type: "leave_early" }]);
    expect(result.newEvents.some((e) => e.title.includes("Open seat"))).toBe(true);
  });

  it("returns human-readable team signals", () => {
    const state = startSimulation(config);
    const signals = getTeamSignals(state);
    expect(signals.vibeLabel.length).toBeGreaterThan(0);
    expect(signals.vibeDescription.length).toBeGreaterThan(0);
  });

  it("schedules the locker-room scenario on its day", () => {
    const scenario = scenarioForDay(config, 2);
    expect(scenario?.id).toBe("locker-mockery");
    expect(scenario?.options).toHaveLength(5);
  });

  it("scenario choices move the value ledger differently for the same scenario", () => {
    const base = startSimulation(config);

    const speakUp = resolveScenario(base, config, "locker-mockery", "speak-up").state;
    const laughed = resolveScenario(base, config, "locker-mockery", "laugh").state;

    expect(speakUp.valueLedger.courage.reinforced).toBeGreaterThan(0);
    expect(speakUp.valueLedger.respect.reinforced).toBeGreaterThan(0);
    expect(laughed.valueLedger.respect.undermined).toBeGreaterThan(0);
    expect(laughed.valueLedger.courage.undermined).toBeGreaterThan(0);
  });

  it("reveals a strong level for a value lived consistently", () => {
    let state = resolveScenario(startSimulation(config), config, "locker-mockery", "speak-up").state;
    const levels = getValueLevels(state, config);
    const courage = levels.find((v) => v.value === "courage")!;
    expect(courage.tier).toBe("strong");
    expect(courage.score).toBeGreaterThanOrEqual(65);
  });

  it("reveals a fragile level for a value that was undermined", () => {
    let state = startSimulation(config);
    state = resolveScenario(state, config, "locker-mockery", "laugh").state;
    for (let i = 0; i < 3; i++) {
      state = applyAction(state, { type: "react_in_chat", messageId: "msg-4", reaction: "laugh" }).state;
    }
    const levels = getValueLevels(state, config);
    const respect = levels.find((v) => v.value === "respect")!;
    expect(respect.tier).toBe("fragile");
    expect(respect.score).toBeLessThan(45);
  });

  it("marks a value that never came up as untested", () => {
    const state = startSimulation(config);
    const levels = getValueLevels(state, config);
    expect(levels.every((v) => v.tier === "untested")).toBe(true);
  });

  it("builds a discovery headline at season end", () => {
    let state = resolveScenario(startSimulation(config), config, "locker-mockery", "speak-up").state;
    state = { ...state, completed: true };
    const summary = getSeasonSummary(state, config);
    expect(summary.valueLevels).toHaveLength(6);
    expect(summary.revealHeadline.length).toBeGreaterThan(0);
    expect(summary.topValues.length).toBeGreaterThan(0);
  });
});
