import { TIER_LABEL, type TeamValueLevel } from "@team-culture-sim/sim-engine";
import type { TeamResults } from "./api";

export function TeamResultsView({ results }: { results: TeamResults }) {
  const ordered = [...results.levels].sort((a, b) => {
    if (a.tier === "untested" && b.tier !== "untested") return 1;
    if (b.tier === "untested" && a.tier !== "untested") return -1;
    return b.score - a.score;
  });

  return (
    <>
      <section className="panel">
        <h2>Team value scores</h2>
        <p className="muted small">
          Pooled from everyone's answers. The bar is the team's score; the chip shows how much you
          agree with each other.
        </p>
        <div className="levels">
          {ordered.map((v) => (
            <TeamScoreBar key={v.value} level={v} />
          ))}
        </div>
      </section>

      {results.divided.length > 0 && (
        <section className="panel">
          <h2>Where you see it differently</h2>
          <p className="muted">
            The team is split on {results.divided.map((d) => d.label).join(" and ")}. Some of you
            feel it's strong here and some don't — usually the most useful thing to talk about.
          </p>
        </section>
      )}

      {results.growthAreas.length > 0 && (
        <section className="panel">
          <h2>Where to grow together</h2>
          <div className="growth-list">
            {results.growthAreas.map((g) => (
              <article key={g.value} className="growth-card">
                <div className="growth-head">
                  <strong>{g.label}</strong>
                  <span className="growth-score">{g.score}/100</span>
                </div>
                <p>{g.tip}</p>
              </article>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function TeamScoreBar({ level }: { level: TeamValueLevel }) {
  const untested = level.tier === "untested";
  return (
    <div className={`level-row ${level.tier}`}>
      <div className="level-head">
        <span className="level-label">{level.label}</span>
        <span className="level-tier">
          {untested ? TIER_LABEL[level.tier] : `${level.score} · ${TIER_LABEL[level.tier]}`}
        </span>
      </div>
      <div className="level-track">
        <div className="level-fill" style={{ width: untested ? "0%" : `${level.score}%` }} />
      </div>
      <div className="level-foot">
        <span className="level-blurb">{level.blurb}</span>
        {!untested && (
          <span className={`agreement ${level.agreement < 60 ? "low" : "ok"}`}>
            {level.agreement < 60 ? "Split" : "Agreed"} · {level.agreement}%
          </span>
        )}
      </div>
    </div>
  );
}
