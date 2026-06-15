import { useEffect, useState } from "react";
import QuizApp from "./QuizApp";
import { getSession } from "./api";
import { useQuizStore } from "./store/quizStore";

type Phase = "loading" | "notfound" | "intro" | "quiz";

export default function PlayerApp({ code }: { code: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [teamName, setTeamName] = useState("");
  const resetQuiz = useQuizStore((s) => s.reset);

  useEffect(() => {
    getSession(code)
      .then((s) => {
        setTeamName(s.teamName);
        setPhase("intro");
      })
      .catch(() => setPhase("notfound"));
  }, [code]);

  if (phase === "loading") {
    return (
      <div className="app narrow">
        <header className="hero">
          <h1>Joining…</h1>
        </header>
      </div>
    );
  }

  if (phase === "notfound") {
    return (
      <div className="app narrow">
        <header className="hero">
          <p className="eyebrow">Code {code}</p>
          <h1>That session isn't open</h1>
          <p className="lede">
            Double-check the code with whoever's running it, or scan the QR code again.
          </p>
        </header>
      </div>
    );
  }

  if (phase === "intro") {
    return (
      <div className="app narrow">
        <header className="hero">
          <p className="eyebrow">Beyond the Game · {teamName}</p>
          <h1>Let's check your team's culture</h1>
          <p className="lede">
            About 14 quick questions — some about how you'd respond, some about what usually happens
            on your team. It's completely anonymous, and it rolls up into one team result.
          </p>
        </header>
        <section className="panel">
          <button
            className="primary block"
            onClick={() => {
              resetQuiz();
              setPhase("quiz");
            }}
          >
            Start
          </button>
          <p className="muted small">Answer honestly — nobody sees your individual answers.</p>
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
