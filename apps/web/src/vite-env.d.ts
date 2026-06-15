/// <reference types="vite/client" />

declare module "@team-culture-sim/content/road-trip.json" {
  import type { SimConfig } from "@team-culture-sim/sim-engine";
  const config: SimConfig;
  export default config;
}

declare module "@team-culture-sim/content/quiz.json" {
  import type { QuizConfig } from "@team-culture-sim/sim-engine";
  const config: QuizConfig;
  export default config;
}
