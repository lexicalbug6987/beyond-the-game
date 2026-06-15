import type { PlayerAction, ScenarioDef, SimConfig, SimEvent, SimState, SpaceId } from "./types.js";
import { accrueValues, adjustNorms, adjustRelationship, getInfluentialTeammates, roleWeight } from "./state.js";
import { microValueImpacts } from "./values.js";

export function applyAction(state: SimState, action: PlayerAction): { state: SimState; notes: string[] } {
  const notes: string[] = [];
  let relationships = { ...state.relationships };
  let norms = { ...state.norms };
  let morale = state.morale;
  let fatigue = state.fatigue;

  const bump = (id: string, trust: number, warmth: number, memoryTag?: string) => {
    relationships[id] = adjustRelationship(relationships[id], { trust, warmth, memoryTag });
  };

  const weight = roleWeight(state.playerRole);

  switch (action.type) {
    case "sit_with": {
      bump(action.targetId, 0.06 * weight, 0.08 * weight, "sat_together");
      notes.push(`You sat with ${nameOf(state, action.targetId)}. The moment felt small, but noticed.`);
      if (state.teammates.find((t) => t.id === action.targetId)?.role === "newcomer") {
        norms = adjustNorms(norms, { exclusion: -0.02 * weight });
      }
      break;
    }
    case "check_in": {
      const tone = action.tone;
      bump(action.targetId, 0.05 * weight, 0.07 * weight, "checked_in");
      if (tone === "direct") {
        bump(action.targetId, 0.03 * weight, 0.02 * weight, "direct_support");
        norms = adjustNorms(norms, { speakUpSafety: 0.015 * weight });
      }
      notes.push(`You checked in with ${nameOf(state, action.targetId)}.`);
      break;
    }
    case "react_in_chat": {
      const message = state.messages.find((m) => m.id === action.messageId);
      if (!message) break;
      const authorId = message.authorId;

      if (action.reaction === "laugh") {
        bump(authorId, 0.03 * weight, 0.02 * weight);
        norms = adjustNorms(norms, { banterTolerance: 0.025 * weight, speakUpSafety: -0.01 * weight });
        notes.push("You laughed along. The thread kept moving.");
      } else if (action.reaction === "ignore") {
        norms = adjustNorms(norms, { speakUpSafety: -0.015 * weight });
        notes.push("You stayed quiet. Nobody mentioned it, but the room noticed.");
      } else if (action.reaction === "redirect") {
        bump(authorId, -0.01 * weight, 0.01 * weight, "redirected_joke");
        norms = adjustNorms(norms, { banterTolerance: -0.015 * weight, speakUpSafety: 0.02 * weight });
        notes.push("You changed the subject without making it a thing.");
      } else if (action.reaction === "dm_support") {
        const target = state.teammates.find((t) => t.vulnerability >= 0.55 && t.id !== authorId);
        if (target) {
          bump(target.id, 0.08 * weight, 0.09 * weight, "dm_support");
          notes.push(`You messaged ${target.name} privately.`);
        } else {
          notes.push("You sent a supportive DM.");
        }
        norms = adjustNorms(norms, { speakUpSafety: 0.02 * weight, exclusion: -0.01 * weight });
      }
      break;
    }
    case "speak_up": {
      const influential = getInfluentialTeammates(state.teammates)[0];
      if (influential) bump(influential.id, -0.02 * weight, 0.01 * weight, "spoke_up");
      if (action.tone === "direct") {
        norms = adjustNorms(norms, { speakUpSafety: 0.03 * weight, banterTolerance: -0.01 * weight });
        morale += 0.02;
        notes.push("You said something out loud. The room paused, then adjusted.");
      } else if (action.tone === "light") {
        norms = adjustNorms(norms, { speakUpSafety: 0.015 * weight });
        notes.push("You kept it light, but people got the message.");
      } else {
        notes.push("You flagged it for later. We'll see if later comes.");
      }
      break;
    }
    case "include_someone": {
      bump(action.targetId, 0.07 * weight, 0.08 * weight, "included");
      norms = adjustNorms(norms, { exclusion: -0.025 * weight });
      notes.push(`You made space for ${nameOf(state, action.targetId)} in the ${spaceLabel(action.space)}.`);
      break;
    }
    case "stay_late": {
      fatigue = Math.min(1, fatigue + 0.08);
      morale += 0.03;
      norms = adjustNorms(norms, { coverUp: -0.01 * weight, speakUpSafety: 0.01 * weight });
      for (const t of state.teammates.filter((x) => x.role === "bench" || x.role === "newcomer")) {
        bump(t.id, 0.02 * weight, 0.03 * weight, "stayed_late");
      }
      notes.push("You stayed after most people left. A few teammates remembered.");
      break;
    }
    case "leave_early": {
      fatigue = Math.max(0, fatigue - 0.05);
      norms = adjustNorms(norms, { exclusion: 0.015 * weight });
      notes.push("You dipped out early. Nobody said anything, but the pattern registered.");
      break;
    }
  }

  const valueLedger = accrueValues(state.valueLedger, microValueImpacts(state, action));

  return {
    state: {
      ...state,
      relationships,
      norms,
      morale: Math.min(1, Math.max(0, morale)),
      fatigue: Math.min(1, Math.max(0, fatigue)),
      actionLog: [...state.actionLog, action],
      valueLedger,
    },
    notes,
  };
}

/**
 * Resolve a featured scenario. The scenario itself is the same for every team;
 * only the value impacts of the chosen option — and the reflection framing —
 * differ. This is where "did we live up to what we said?" gets recorded.
 */
export function resolveScenario(
  state: SimState,
  config: SimConfig,
  scenarioId: string,
  optionId: string,
): { state: SimState; notes: string[] } {
  const scenario = config.scenarios.find((s) => s.id === scenarioId);
  const option = scenario?.options.find((o) => o.id === optionId);
  if (!scenario || !option) return { state, notes: [] };

  const valueLedger = accrueValues(state.valueLedger, option.valueImpacts);
  const norms = option.norms ? adjustNorms(state.norms, option.norms) : state.norms;

  return {
    state: {
      ...state,
      norms,
      valueLedger,
      resolvedScenarios: { ...state.resolvedScenarios, [scenarioId]: optionId },
      events: state.events.map((e) =>
        e.scenarioId === scenarioId ? { ...e, resolved: true, chosenOptionId: optionId } : e,
      ),
    },
    notes: [option.note],
  };
}

/** The featured scenario scheduled for a given day, if any. */
export function scenarioForDay(config: SimConfig, day: number): ScenarioDef | undefined {
  return config.scenarios.find((s) => s.day === day);
}

export function generateEvents(state: SimState, config: SimConfig): SimEvent[] {
  const events: SimEvent[] = [];
  const day = state.day;
  const plan = config.schedule.find((d) => d.day === day);
  if (!plan) return events;

  const newcomer = state.teammates.find((t) => t.role === "newcomer");
  const captain = state.teammates.find((t) => t.role === "captain");
  const vulnerable = state.teammates.find((t) => t.vulnerability >= 0.65);

  const scenario = config.scenarios.find((s) => s.day === day);
  if (scenario) {
    const resolvedOption = state.resolvedScenarios[scenario.id];
    events.push({
      id: `scenario-${scenario.id}`,
      day,
      space: scenario.space,
      kind: "scenario",
      resolved: Boolean(resolvedOption),
      title: scenario.title,
      description: scenario.description,
      scenarioId: scenario.id,
      options: scenario.options,
      valueTags: scenario.valueTags,
      chosenOptionId: resolvedOption,
    });
  }

  if (state.norms.exclusion > 0.55 && newcomer && plan.spaces.includes("bus")) {
    events.push({
      id: `evt-${day}-exclusion-bus`,
      day,
      space: "bus",
      kind: "choice",
      resolved: false,
      title: "Open seat politics",
      description: `${newcomer.name} is standing near the front while teammates take pairs. The aisle feels crowded.`,
    });
  }

  if (state.norms.banterTolerance > 0.5 && plan.spaces.includes("group_chat")) {
    events.push({
      id: `evt-${day}-chat-pileon`,
      day,
      space: "group_chat",
      kind: "choice",
      resolved: false,
      title: "Group chat momentum",
      description: `${captain?.name ?? "Someone"} posted a clip with a caption that landed wrong. Reactions are rolling in.`,
    });
  }

  if (state.norms.speakUpSafety < 0.35 && vulnerable && plan.spaces.includes("hotel")) {
    events.push({
      id: `evt-${day}-hotel-quiet`,
      day,
      space: "hotel",
      kind: "choice",
      resolved: false,
      title: "Someone on the edge",
      description: `${vulnerable.name} has been quiet all day. A few teammates are joking loudly nearby.`,
    });
  }

  if (plan.gameResult === "loss" && state.norms.coverUp > 0.45) {
    events.push({
      id: `evt-${day}-loss-blame`,
      day,
      space: "locker_room",
      kind: "choice",
      resolved: false,
      title: "After the loss",
      description: "Finger-pointing starts before anyone catches their breath. The room is looking for a scapegoat.",
    });
  }

  if (events.length === 0 && plan.spaces.includes("bus")) {
    events.push({
      id: `evt-${day}-ambient-bus`,
      day,
      space: "bus",
      kind: "ambient",
      resolved: false,
      title: "Travel rhythm",
      description: "Headphones, half-conversations, and the usual seat patterns. Another day on the road.",
    });
  }

  return events;
}

export function getAvailableActions(state: SimState, space: SpaceId) {
  const teammates = state.teammates.map((t) => ({ id: t.id, name: t.name }));
  const common = [
    { action: "stay_late" as const, label: "Stay late", description: "Stick around when others head out." },
    { action: "leave_early" as const, label: "Leave early", description: "Head out before the room settles." },
  ];

  if (space === "bus" || space === "hotel") {
    return [
      { action: "sit_with" as const, label: "Sit with someone", description: "Choose who you ride or hang with.", targets: teammates },
      { action: "check_in" as const, label: "Check in", description: "Ask how someone is doing.", targets: teammates },
      { action: "include_someone" as const, label: "Make space", description: "Invite someone into the moment.", targets: teammates },
      { action: "speak_up" as const, label: "Speak up", description: "Address what you're noticing.", contexts: ["tone in the room", "someone left out", "a joke that went too far"] },
      ...common,
    ];
  }

  if (space === "group_chat") {
    const latest = [...state.messages].reverse().find((m) => m.day === state.day && m.tone === "edgy");
    return [
      {
        action: "react_in_chat" as const,
        label: "React in chat",
        description: latest ? `Respond to ${latest.authorId}'s message.` : "Respond in the thread.",
        contexts: latest ? [latest.id] : [],
      },
      { action: "check_in" as const, label: "DM someone", description: "Take it private.", targets: teammates },
      ...common,
    ];
  }

  return [
    { action: "speak_up" as const, label: "Speak up", description: "Say something to the room.", contexts: ["what's right", "support", "reset the tone"] },
    { action: "include_someone" as const, label: "Include someone", description: "Pull a teammate into the huddle.", targets: teammates },
    ...common,
  ];
}

function nameOf(state: SimState, id: string) {
  return state.teammates.find((t) => t.id === id)?.name ?? "a teammate";
}

function spaceLabel(space: SpaceId) {
  switch (space) {
    case "bus":
      return "bus";
    case "hotel":
      return "hotel lounge";
    case "group_chat":
      return "group chat";
    case "locker_room":
      return "locker room";
  }
}
