import { create } from "zustand";
import { scoreQuiz, type QuizAnswers, type QuizConfig, type QuizResult } from "@team-culture-sim/sim-engine";
import quizContent from "@team-culture-sim/content/quiz.json";
import { withQuizCopy } from "../quizCopy";

const defaultConfig = withQuizCopy(quizContent as QuizConfig);

interface QuizStore {
  config: QuizConfig;
  index: number;
  answers: QuizAnswers;
  finished: boolean;
  loadConfig: (config: QuizConfig) => void;
  answer: (questionId: string, optionId: string) => void;
  back: () => void;
  reset: () => void;
}

export const useQuizStore = create<QuizStore>((set, get) => ({
  config: defaultConfig,
  index: 0,
  answers: {},
  finished: false,

  loadConfig: (config) => {
    // Only swap in a freshly fetched config when the player hasn't started
    // answering yet — replacing it mid-quiz would desync index/answers.
    const { index, finished, answers } = get();
    if (index > 0 || finished || Object.keys(answers).length > 0) return;
    set({ config: withQuizCopy(config) });
  },

  answer: (questionId, optionId) => {
    const { index, answers, config } = get();
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
  const config = useQuizStore((s) => s.config);
  return scoreQuiz(config, answers);
}

export { defaultConfig as quizConfig };
