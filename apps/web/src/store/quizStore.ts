import { create } from "zustand";
import { scoreQuiz, type QuizAnswers, type QuizConfig, type QuizResult } from "@team-culture-sim/sim-engine";
import quizContent from "@team-culture-sim/content/quiz.json";

const config = quizContent as QuizConfig;

interface QuizStore {
  config: QuizConfig;
  index: number;
  answers: QuizAnswers;
  finished: boolean;
  answer: (questionId: string, optionId: string) => void;
  back: () => void;
  reset: () => void;
}

export const useQuizStore = create<QuizStore>((set, get) => ({
  config,
  index: 0,
  answers: {},
  finished: false,

  answer: (questionId, optionId) => {
    const { index, answers } = get();
    const nextAnswers = { ...answers, [questionId]: optionId };
    const isLast = index >= config.questions.length - 1;
    set({
      answers: nextAnswers,
      index: isLast ? index : index + 1,
      finished: isLast,
    });
  },

  back: () => {
    const { index, finished } = get();
    if (finished) {
      set({ finished: false });
      return;
    }
    if (index > 0) set({ index: index - 1 });
  },

  reset: () => set({ index: 0, answers: {}, finished: false }),
}));

export function useQuizResult(): QuizResult {
  const answers = useQuizStore((s) => s.answers);
  return scoreQuiz(config, answers);
}

export { config as quizConfig };
