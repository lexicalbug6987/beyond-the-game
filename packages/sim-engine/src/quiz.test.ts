import { describe, expect, it } from "vitest";
import quizContent from "../../content/quiz.json";
import { aggregateSubmissions, scoreQuiz } from "./quiz.js";
import type { QuizConfig, QuizSubmission } from "./types.js";

const config = quizContent as QuizConfig;

function answersFavoring(value: string): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const q of config.questions) {
    const best = [...q.options].sort(
      (a, b) =>
        ((b.valueImpacts as Record<string, number>)[value] ?? 0) -
        ((a.valueImpacts as Record<string, number>)[value] ?? 0),
    )[0];
    answers[q.id] = best.id;
  }
  return answers;
}

describe("quiz scoring", () => {
  it("has every value covered by multiple questions", () => {
    const counts: Record<string, number> = {};
    for (const q of config.questions) {
      for (const opt of q.options) {
        for (const v of Object.keys(opt.valueImpacts)) {
          counts[v] = (counts[v] ?? 0) + 1;
        }
      }
    }
    for (const v of config.values) {
      expect(counts[v.id] ?? 0).toBeGreaterThanOrEqual(3);
    }
  });

  it("scores high when consistently choosing value-upholding answers", () => {
    // Pick the most pro-courage option for each question.
    const answers: Record<string, string> = {};
    for (const q of config.questions) {
      const best = [...q.options].sort(
        (a, b) => (b.valueImpacts.courage ?? 0) - (a.valueImpacts.courage ?? 0),
      )[0];
      answers[q.id] = best.id;
    }
    const result = scoreQuiz(config, answers);
    const courage = result.levels.find((l) => l.value === "courage")!;
    expect(courage.score).toBeGreaterThanOrEqual(65);
    expect(courage.tier).toBe("strong");
  });

  it("flags a value as a growth area when answers undermine it", () => {
    const answers: Record<string, string> = {};
    for (const q of config.questions) {
      const worst = [...q.options].sort(
        (a, b) => (a.valueImpacts.respect ?? 0) - (b.valueImpacts.respect ?? 0),
      )[0];
      answers[q.id] = worst.id;
    }
    const result = scoreQuiz(config, answers);
    expect(result.growthAreas.some((g) => g.value === "respect")).toBe(true);
    const respectGrowth = result.growthAreas.find((g) => g.value === "respect");
    expect(respectGrowth?.tip.length).toBeGreaterThan(0);
  });

  it("reports answered/total and an overall score", () => {
    const partial = { [config.questions[0].id]: config.questions[0].options[0].id };
    const result = scoreQuiz(config, partial);
    expect(result.answered).toBe(1);
    expect(result.total).toBe(config.questions.length);
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
  });

  it("includes both self and team perspective questions", () => {
    const perspectives = new Set(config.questions.map((q) => q.perspective));
    expect(perspectives.has("self")).toBe(true);
    expect(perspectives.has("team")).toBe(true);
  });
});

describe("team aggregation", () => {
  it("returns an empty, untested result with no submissions", () => {
    const team = aggregateSubmissions(config, []);
    expect(team.participantCount).toBe(0);
    expect(team.levels.every((l) => l.tier === "untested")).toBe(true);
  });

  it("pools submissions into one team result", () => {
    const submissions: QuizSubmission[] = [
      { id: "1", answers: answersFavoring("care"), submittedAt: 1 },
      { id: "2", answers: answersFavoring("care"), submittedAt: 2 },
      { id: "3", answers: answersFavoring("care"), submittedAt: 3 },
    ];
    const team = aggregateSubmissions(config, submissions);
    expect(team.participantCount).toBe(3);
    const care = team.levels.find((l) => l.value === "care")!;
    expect(care.score).toBeGreaterThanOrEqual(65);
    // Everyone answered identically, so agreement should be maxed out.
    expect(care.agreement).toBe(100);
  });

  it("surfaces a divided value when the team disagrees", () => {
    const submissions: QuizSubmission[] = [
      { id: "1", answers: answersFavoring("courage"), submittedAt: 1 },
      { id: "2", answers: answersFavoring("respect"), submittedAt: 2 },
    ];
    const team = aggregateSubmissions(config, submissions);
    // With opposing answer patterns, at least one value should show low agreement.
    expect(team.levels.some((l) => l.agreement < 100)).toBe(true);
  });
});
