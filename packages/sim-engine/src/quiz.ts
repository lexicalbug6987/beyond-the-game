import type {
  QuizConfig,
  QuizResult,
  QuizSubmission,
  TeamQuizResult,
  TeamValue,
  TeamValueLevel,
  ValueLevel,
} from "./types.js";
import { accrueValues, createInitialLedger } from "./state.js";
import { levelsFromLedger } from "./values.js";

export type QuizAnswers = Record<string, string>;

/**
 * Score a (possibly partial) set of quiz answers into per-value levels plus
 * strengths and concrete growth areas. Each answer option carries value impacts;
 * a value's score reflects how often the player chose answers that upheld it.
 */
export function scoreQuiz(config: QuizConfig, answers: QuizAnswers): QuizResult {
  let ledger = createInitialLedger();
  let answered = 0;

  for (const question of config.questions) {
    const optionId = answers[question.id];
    if (!optionId) continue;
    const option = question.options.find((o) => o.id === optionId);
    if (!option) continue;
    ledger = accrueValues(ledger, option.valueImpacts);
    answered += 1;
  }

  const levels = levelsFromLedger(ledger, config.values);
  const tested = levels.filter((l) => l.tier !== "untested");

  const strengths = [...tested]
    .filter((l) => l.tier === "strong")
    .sort((a, b) => b.score - a.score);

  const growthAreas = [...tested]
    .filter((l) => l.tier === "fragile" || l.tier === "developing")
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map((l) => ({
      value: l.value,
      label: l.label,
      score: l.score,
      tip: config.improvementTips[l.value] ?? "",
    }));

  const overallScore = tested.length
    ? Math.round(tested.reduce((sum, l) => sum + l.score, 0) / tested.length)
    : 0;

  return {
    levels,
    strengths,
    growthAreas,
    overallScore,
    headline: buildHeadline(strengths, growthAreas),
    answered,
    total: config.questions.length,
  };
}

function buildHeadline(
  strengths: ValueLevel[],
  growthAreas: { label: string }[],
): string {
  const strong = strengths.map((s) => s.label);
  if (strong.length === 0 && growthAreas.length === 0) {
    return "Answer a few more to see where your team stands.";
  }
  const lead = strong.length
    ? `Your team leans on ${joinLabels(strong)}.`
    : "No single value stands out yet.";
  const tail = growthAreas.length
    ? ` The clearest room to grow is ${joinLabels(growthAreas.map((g) => g.label))}.`
    : " It's well balanced across the board.";
  return lead + tail;
}

function joinLabels(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? "";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

export function quizValueOrder(config: QuizConfig): TeamValue[] {
  return config.values.map((v) => v.id);
}

/**
 * Combine everyone's submissions into one team result. The team score for each
 * value comes from pooling every answer (collective behavior), while `agreement`
 * captures how much individuals diverge — a high average with low agreement
 * means "some of us carry this value and some of us don't."
 */
export function aggregateSubmissions(
  config: QuizConfig,
  submissions: QuizSubmission[],
): TeamQuizResult {
  const participantCount = submissions.length;

  if (participantCount === 0) {
    return {
      participantCount: 0,
      levels: config.values.map((def) => ({
        value: def.id,
        label: def.label,
        blurb: def.blurb,
        score: 0,
        tier: "untested",
        reinforced: 0,
        undermined: 0,
        agreement: 0,
        strongShare: 0,
      })),
      strengths: [],
      growthAreas: [],
      divided: [],
      overallScore: 0,
      headline: "No one has finished yet — share the code to get started.",
    };
  }

  // Pool every answer into one ledger for the collective score + tier.
  let pooled = createInitialLedger();
  const perPersonScores = {} as Record<TeamValue, number[]>;
  for (const v of config.values) perPersonScores[v.id] = [];

  for (const submission of submissions) {
    for (const question of config.questions) {
      const option = question.options.find((o) => o.id === submission.answers[question.id]);
      if (option) pooled = accrueValues(pooled, option.valueImpacts);
    }
    const personLevels = scoreQuiz(config, submission.answers).levels;
    for (const level of personLevels) {
      if (level.tier !== "untested") perPersonScores[level.value].push(level.score);
    }
  }

  const pooledLevels = levelsFromLedger(pooled, config.values);

  const levels: TeamValueLevel[] = pooledLevels.map((level) => {
    const scores = perPersonScores[level.value];
    return {
      ...level,
      agreement: agreementFor(scores),
      strongShare: scores.length
        ? Math.round((scores.filter((s) => s >= 65).length / scores.length) * 100)
        : 0,
    };
  });

  const tested = levels.filter((l) => l.tier !== "untested");

  const strengths = [...tested]
    .filter((l) => l.tier === "strong")
    .sort((a, b) => b.score - a.score);

  const growthAreas = [...tested]
    .filter((l) => l.tier === "fragile" || l.tier === "developing")
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map((l) => ({
      value: l.value,
      label: l.label,
      score: l.score,
      tip: config.improvementTips[l.value] ?? "",
    }));

  const divided = [...tested]
    .filter((l) => l.agreement < 60)
    .sort((a, b) => a.agreement - b.agreement)
    .slice(0, 2);

  const overallScore = tested.length
    ? Math.round(tested.reduce((sum, l) => sum + l.score, 0) / tested.length)
    : 0;

  return {
    participantCount,
    levels,
    strengths,
    growthAreas,
    divided,
    overallScore,
    headline: buildTeamHeadline(tested, growthAreas),
  };
}

/** 100 = everyone scored a value the same; lower = the team is split on it. */
function agreementFor(scores: number[]): number {
  if (scores.length < 2) return 100;
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length;
  const stdDev = Math.sqrt(variance);
  // Scores live on 0–100; treat a std-dev of 40+ as essentially no consensus.
  return Math.max(0, Math.round(100 - (stdDev / 40) * 100));
}

function buildTeamHeadline(
  tested: TeamValueLevel[],
  growthAreas: { label: string }[],
): string {
  if (tested.length === 0) {
    return "No single value clearly defines this team yet.";
  }
  const byScore = [...tested].sort((a, b) => b.score - a.score);
  const top = byScore.slice(0, 3).map((l) => l.label);
  const lead = `As a team, you run on ${joinLabels(top)}.`;
  const realGrowth = growthAreas.map((g) => g.label);
  let tail: string;
  if (realGrowth.length) {
    tail = ` The clearest room to grow together is ${joinLabels(realGrowth)}.`;
  } else if (byScore.length > 3) {
    tail = ` The clearest room to grow together is ${joinLabels([byScore[byScore.length - 1].label])}.`;
  } else {
    tail = " It's remarkably balanced across the board.";
  }
  return lead + tail;
}
