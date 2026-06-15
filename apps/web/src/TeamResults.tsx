import { TIER_LABEL, type TeamValueLevel } from "@team-culture-sim/sim-engine";
import type { TeamResults } from "./api";
import { useContent } from "./content";

export function TeamResultsView({ results }: { results: TeamResults }) {
  const c = useContent();
  const ordered = [...results.levels].sort((a, b) => {
    if (a.tier === "untested" && b.tier !== "untested") return 1;
    if (b.tier === "untested" && a.tier !== "untested") return -1;
    return b.score - a.score;
  });

  return (
    <>
      <section className="panel">
        <h2>{c("hostResults", "valueScoresTitle")}</h2>
        <p className="muted small">{c("hostResults", "valueScoresHint")}</p>
        <div className="levels">
          {ordered.map((v) => (
            <TeamScoreBar key={v.value} level={v} />
          ))}
        </div>
      </section>

      {results.divided.length > 0 && (
        <section className="panel">
          <h2>{c("hostResults", "dividedTitle")}</h2>
          <p className="muted">
            {c("hostResults", "dividedPrefix")}{" "}
            {results.divided.map((d) => d.label).join(` ${c("hostResults", "dividedJoinWord")} `)}.{" "}
            {c("hostResults", "dividedSuffix")}
          </p>
        </section>
      )}

      {results.growthAreas.length > 0 && (
        <section className="panel">
          <h2>{c("hostResults", "growTitle")}</h2>
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
  const c = useContent();
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
            {level.agreement < 60
              ? c("hostResults", "agreementSplit")
              : c("hostResults", "agreementAgreed")}{" "}
            · {level.agreement}%
          </span>
        )}
      </div>
    </div>
  );
}
