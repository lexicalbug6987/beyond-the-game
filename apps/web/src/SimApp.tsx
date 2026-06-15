import {
  TIER_LABEL,
  type PlayerAction,
  type SpaceId,
  type ValueLevel,
} from "@team-culture-sim/sim-engine";
import { useCurrentContext, useSignals, useSimStore, useSummary, config } from "./store/simStore";

const SPACES: { id: SpaceId; label: string }[] = [
  { id: "bus", label: "Bus" },
  { id: "hotel", label: "Hotel" },
  { id: "group_chat", label: "Group Chat" },
  { id: "locker_room", label: "Locker Room" },
];

export default function SimApp({ onExit }: { onExit: () => void }) {
  const phase = useSimStore((s) => s.phase);
  if (phase === "complete") return <SummaryScreen onExit={onExit} />;
  return <PlayScreen onExit={onExit} />;
}

function PlayScreen({ onExit }: { onExit: () => void }) {
  const state = useSimStore((s) => s.state);
  const space = useSimStore((s) => s.space);
  const narrative = useSimStore((s) => s.narrative);
  const setSpace = useSimStore((s) => s.setSpace);
  const performAction = useSimStore((s) => s.performAction);
  const resolveScenario = useSimStore((s) => s.resolveScenario);
  const advanceDay = useSimStore((s) => s.advanceDay);
  const ctx = useCurrentContext();
  const signals = useSignals();

  const dayPlan = config.schedule.find((d) => d.day === state.day);

  return (
    <div className="app">
      <header className="hero compact">
        <div>
          <button className="link-back" onClick={onExit}>
            ← Home
          </button>
          <p className="eyebrow">{dayPlan?.label ?? `Day ${state.day}`}</p>
          <h1>Road Trip</h1>
          <p className="values-strip">Just play it out. Who you are shows up at the end.</p>
        </div>
        <div className="pill">{signals.vibeLabel}</div>
      </header>

      <div className="grid">
        <section className="panel">
          <h2>Where you are</h2>
          <div className="tabs">
            {SPACES.map((s) => (
              <button
                key={s.id}
                className={space === s.id ? "tab active" : "tab"}
                onClick={() => setSpace(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <p className="muted">{signals.vibeDescription}</p>

          {ctx.scenario && <ScenarioCard scenario={ctx.scenario} onResolve={resolveScenario} />}

          {ctx.events
            .filter((e) => e.kind !== "scenario")
            .map((event) => (
              <article key={event.id} className="event">
                <h3>{event.title}</h3>
                <p>{event.description}</p>
              </article>
            ))}

          {space === "group_chat" && (
            <div className="chat">
              {ctx.messages.map((msg) => {
                const author = state.teammates.find((t) => t.id === msg.authorId)?.name ?? "Teammate";
                return (
                  <div key={msg.id} className={`bubble ${msg.tone === "edgy" ? "edgy" : ""}`}>
                    <strong>{author}</strong>
                    <span>{msg.text}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="panel">
          <h2>Actions</h2>
          <ActionList actions={ctx.actions} space={space} onAction={performAction} />
          <button className="primary block" onClick={advanceDay}>
            End day &amp; continue
          </button>
        </section>

        <section className="panel">
          <h2>Team pulse</h2>
          <ul className="pulse">
            <li>
              <span>Warm toward you</span>
              <strong>{signals.whoReachedOut.join(", ") || "—"}</strong>
            </li>
            <li>
              <span>Going quiet</span>
              <strong>{signals.whoWentQuiet.join(", ") || "—"}</strong>
            </li>
          </ul>
          <div className="log">
            {narrative.slice(-8).map((line, i) => (
              <p key={`${line}-${i}`}>{line}</p>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

type Scenario = NonNullable<ReturnType<typeof useCurrentContext>["scenario"]>;

function ScenarioCard({
  scenario,
  onResolve,
}: {
  scenario: Scenario;
  onResolve: (scenarioId: string, optionId: string) => void;
}) {
  const chosen = scenario.options?.find((o) => o.id === scenario.chosenOptionId);

  return (
    <article className="event scenario">
      <span className="scenario-tag">A moment that counts</span>
      <h3>{scenario.title}</h3>
      <p>{scenario.description}</p>

      {!scenario.resolved ? (
        <div className="scenario-options">
          {scenario.options?.map((opt) => (
            <button
              key={opt.id}
              className="scenario-option"
              onClick={() => onResolve(scenario.scenarioId!, opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      ) : (
        <p className="scenario-outcome">{chosen?.note}</p>
      )}
    </article>
  );
}

type ActionDef = ReturnType<typeof useCurrentContext>["actions"][number];

function ActionList({
  actions,
  space,
  onAction,
}: {
  actions: ActionDef[];
  space: SpaceId;
  onAction: (action: PlayerAction) => void;
}) {
  return (
    <div className="actions">
      {actions.map((def) => (
        <ActionButton key={def.action + def.label} def={def} space={space} onAction={onAction} />
      ))}
    </div>
  );
}

function ActionButton({
  def,
  space,
  onAction,
}: {
  def: ActionDef;
  space: SpaceId;
  onAction: (action: PlayerAction) => void;
}) {
  if (def.action === "sit_with" || def.action === "check_in" || def.action === "include_someone") {
    const first = def.targets?.[0];
    if (!first) return null;
    return (
      <details className="action">
        <summary>{def.label}</summary>
        <p>{def.description}</p>
        <div className="target-grid">
          {def.targets?.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                if (def.action === "sit_with") onAction({ type: "sit_with", targetId: t.id });
                if (def.action === "check_in") onAction({ type: "check_in", targetId: t.id, tone: "casual" });
                if (def.action === "include_someone")
                  onAction({ type: "include_someone", targetId: t.id, space });
              }}
            >
              {t.name}
            </button>
          ))}
        </div>
      </details>
    );
  }

  if (def.action === "react_in_chat") {
    const messageId = def.contexts?.[0] ?? "msg-4";
    return (
      <details className="action">
        <summary>{def.label}</summary>
        <p>{def.description}</p>
        <div className="target-grid">
          {(["laugh", "ignore", "redirect", "dm_support"] as const).map((reaction) => (
            <button key={reaction} onClick={() => onAction({ type: "react_in_chat", messageId, reaction })}>
              {reaction.replace("_", " ")}
            </button>
          ))}
        </div>
      </details>
    );
  }

  if (def.action === "speak_up") {
    const context = def.contexts?.[0] ?? "tone in the room";
    return (
      <button className="action flat" onClick={() => onAction({ type: "speak_up", context, tone: "light" })}>
        <strong>{def.label}</strong>
        <span>{def.description}</span>
      </button>
    );
  }

  return (
    <button
      className="action flat"
      onClick={() => onAction({ type: def.action as "stay_late" | "leave_early" })}
    >
      <strong>{def.label}</strong>
      <span>{def.description}</span>
    </button>
  );
}

function SummaryScreen({ onExit }: { onExit: () => void }) {
  const summary = useSummary();
  const reset = useSimStore((s) => s.reset);

  const ordered = [...summary.valueLevels].sort((a, b) => {
    if (a.tier === "untested" && b.tier !== "untested") return 1;
    if (b.tier === "untested" && a.tier !== "untested") return -1;
    return b.score - a.score;
  });

  return (
    <div className="app narrow">
      <header className="hero">
        <button className="link-back" onClick={onExit}>
          ← Home
        </button>
        <p className="eyebrow">Road trip complete · {summary.vibe}</p>
        <h1>This is the team you actually were</h1>
        <p className="lede">{summary.revealHeadline}</p>
      </header>

      <section className="panel">
        <h2>Your team's values, as lived</h2>
        <div className="levels">
          {ordered.map((v) => (
            <ValueBar key={v.value} level={v} />
          ))}
        </div>
        <p className="muted small">
          Nobody picked these up front — each level is what your choices added up to.
        </p>
      </section>

      <section className="panel">
        <h2>The team you leave with</h2>
        <p className="muted">{summary.description}</p>
        <p>
          <strong>Closest connections:</strong>{" "}
          {summary.closestTeammates.join(", ") || "Still finding your people."}
        </p>
      </section>

      <div className="footer-actions">
        <button className="primary" onClick={reset}>
          Run it again
        </button>
        <button className="ghost" onClick={onExit}>
          Back to home
        </button>
      </div>
    </div>
  );
}

function ValueBar({ level }: { level: ValueLevel }) {
  const untested = level.tier === "untested";
  return (
    <div className={`level-row ${level.tier}`}>
      <div className="level-head">
        <span className="level-label">{level.label}</span>
        <span className="level-tier">{TIER_LABEL[level.tier]}</span>
      </div>
      <div className="level-track">
        <div className="level-fill" style={{ width: untested ? "0%" : `${level.score}%` }} />
      </div>
      <span className="level-blurb">{level.blurb}</span>
    </div>
  );
}
