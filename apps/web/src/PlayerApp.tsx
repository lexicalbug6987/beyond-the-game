import { useEffect, useState } from "react";
import QuizApp from "./QuizApp";
import { getQuiz, getSession } from "./api";
import { useQuizStore } from "./store/quizStore";
import { useContent } from "./content";

type Phase = "loading" | "notfound" | "intro" | "quiz";

export default function PlayerApp({ code }: { code: string }) {
  const c = useContent();
  const [phase, setPhase] = useState<Phase>("loading");
  const [teamName, setTeamName] = useState("");
  const resetQuiz = useQuizStore((s) => s.reset);
  const loadConfig = useQuizStore((s) => s.loadConfig);

  useEffect(() => {
    getSession(code)
      .then((s) => {
        setTeamName(s.teamName);
        setPhase("intro");
      })
      .catch(() => setPhase("notfound"));
  }, [code]);

  useEffect(() => {
    getQuiz()
      .then(loadConfig)
      .catch(() => {});
  }, [loadConfig]);

  if (phase === "loading") {
    return (
      <div className="app narrow">
        <header className="hero">
          <h1>{c("playerIntro", "loadingTitle")}</h1>
        </header>
      </div>
    );
  }

  if (phase === "notfound") {
    return (
      <div className="app narrow">
        <header className="hero">
          <p className="eyebrow">{c("playerNotFound", "codePrefix")} {code}</p>
          <h1>{c("playerNotFound", "title")}</h1>
          <p className="lede">{c("playerNotFound", "lede")}</p>
        </header>
      </div>
    );
  }

  if (phase === "intro") {
    return (
      <div className="app narrow">
        <header className="hero">
          <p className="eyebrow">{c("playerIntro", "eyebrowPrefix")} · {teamName}</p>
          <h1>{c("playerIntro", "title")}</h1>
          <p className="lede">{c("playerIntro", "lede")}</p>
        </header>
        <section className="panel">
          <button
            className="primary block"
            onClick={() => {
              resetQuiz();
              setPhase("quiz");
            }}
          >
            {c("playerIntro", "startButton")}
          </button>
          <p className="muted small">{c("playerIntro", "privacyHint")}</p>
        </section>
      </div>
    );
  }

  return (
    <QuizApp
      team={{ code, teamName }}
      onExit={() => {
        resetQuiz();
        setPhase("intro");
      }}
    />
  );
}
