import type { QuizConfig, QuizCopy } from "@team-culture-sim/sim-engine";

export const DEFAULT_QUIZ_COPY: QuizCopy = {
  hostHeadline: "How does your team actually show up?",
  hostLede:
    "Create a session, put the QR code on a screen, and everyone answers anonymously on their own phone — how they'd respond and what usually happens on the team. You'll get one shared read on your culture, including where you agree and where to grow.",
  playerHeadline: "Let's check your team's culture",
  playerLede:
    "About {count} quick questions — some about how you'd respond, some about what usually happens on your team. It's completely anonymous, and it rolls up into one team result.",
};

export function withQuizCopy(config: QuizConfig): QuizConfig {
  return { ...config, copy: { ...DEFAULT_QUIZ_COPY, ...config.copy } };
}

export function hostHeadline(config: QuizConfig): string {
  return config.copy?.hostHeadline ?? DEFAULT_QUIZ_COPY.hostHeadline;
}

export function hostLede(config: QuizConfig): string {
  return config.copy?.hostLede ?? DEFAULT_QUIZ_COPY.hostLede;
}

export function playerHeadline(config: QuizConfig): string {
  return config.copy?.playerHeadline ?? DEFAULT_QUIZ_COPY.playerHeadline;
}

export function playerLede(config: QuizConfig): string {
  const template = config.copy?.playerLede ?? DEFAULT_QUIZ_COPY.playerLede;
  return template.replaceAll("{count}", String(config.questions.length));
}

export function updateQuizCopy(config: QuizConfig, patch: Partial<QuizCopy>): QuizConfig {
  return {
    ...config,
    copy: { ...DEFAULT_QUIZ_COPY, ...config.copy, ...patch },
  };
}
