import { useEffect } from "react";
import { getQuiz } from "./api";
import { useQuizStore } from "./store/quizStore";

/** Keep host/player screens in sync with the latest saved quiz content. */
export function useQuizConfigLoader() {
  const loadConfig = useQuizStore((s) => s.loadConfig);

  useEffect(() => {
    const refresh = () => {
      getQuiz()
        .then(loadConfig)
        .catch(() => {});
    };

    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [loadConfig]);
}
