export type SpaceId = "bus" | "hotel" | "group_chat" | "locker_room";

export type PlayerRole = "newcomer" | "captain" | "bench" | "starter";

export interface TeammateDef {
  id: string;
  name: string;
  role: "captain" | "starter" | "bench" | "newcomer";
  influence: number;
  vulnerability: number;
  traits: string[];
}

export interface Norms {
  /** 0–1: how often people get left out */
  exclusion: number;
  /** 0–1: tendency to cover mistakes instead of owning them */
  coverUp: number;
  /** 0–1: tolerance for edgy banter */
  banterTolerance: number;
  /** 0–1: how safe it feels to speak up */
  speakUpSafety: number;
}

export interface Relationship {
  trust: number;
  warmth: number;
  memoryTags: string[];
}

export type TeamValue =
  | "courage"
  | "excellence"
  | "respect"
  | "trust"
  | "care"
  | "accountability";

export interface ValueDef {
  id: TeamValue;
  label: string;
  /** One-line description shown on the selection screen. */
  blurb: string;
}

/** Running tally of how much a value was lived up to vs. let slide. */
export interface ValueLedgerEntry {
  reinforced: number;
  undermined: number;
}

export type ValueStatus = "demonstrated" | "partial" | "fell_short" | "untested";

export interface ValueOutcome {
  value: TeamValue;
  label: string;
  chosen: boolean;
  status: ValueStatus;
  reinforced: number;
  undermined: number;
}

export type ValueTier = "strong" | "developing" | "fragile" | "untested";

/** End-of-season reveal: the level a team reached on a value, discovered through play. */
export interface ValueLevel {
  value: TeamValue;
  label: string;
  blurb: string;
  /** 0–100 read on how cleanly the value held up when it was put to the test. */
  score: number;
  tier: ValueTier;
  reinforced: number;
  undermined: number;
}

/** An explicit choice inside a featured scenario. */
export interface ScenarioOption {
  id: string;
  label: string;
  /** In-world consequence shown after choosing. */
  note: string;
  valueImpacts: Partial<Record<TeamValue, number>>;
  norms?: Partial<Norms>;
}

export interface ScenarioDef {
  id: string;
  day: number;
  space: SpaceId;
  title: string;
  description: string;
  /** Values this moment puts to the test. */
  valueTags: TeamValue[];
  options: ScenarioOption[];
}

export interface ChatMessage {
  id: string;
  authorId: string;
  text: string;
  day: number;
  tone?: "neutral" | "edgy" | "supportive";
}

export interface SimEvent {
  id: string;
  day: number;
  space: SpaceId;
  title: string;
  description: string;
  kind: "ambient" | "choice" | "consequence" | "scenario";
  resolved: boolean;
  /** Present when this event is a featured, value-tested scenario. */
  scenarioId?: string;
  options?: ScenarioOption[];
  valueTags?: TeamValue[];
  /** The option the player picked, once resolved. */
  chosenOptionId?: string;
}

export interface DayPlan {
  day: number;
  label: string;
  spaces: SpaceId[];
  gameResult?: "win" | "loss" | "none";
}

export interface SimConfig {
  id: string;
  title: string;
  totalDays: number;
  playerRole: PlayerRole;
  teammates: TeammateDef[];
  schedule: DayPlan[];
  openingMessages: Omit<ChatMessage, "day">[];
  /** The team's core values, scored across the experience. */
  values: ValueDef[];
  minValues: number;
  maxValues: number;
  /** Featured, value-tested moments keyed to specific days. */
  scenarios: ScenarioDef[];
}

export interface TeamSignals {
  vibeLabel: string;
  vibeDescription: string;
  whoReachedOut: string[];
  whoWentQuiet: string[];
  recentShifts: string[];
}

export interface SimState {
  configId: string;
  day: number;
  playerRole: PlayerRole;
  teammates: TeammateDef[];
  relationships: Record<string, Relationship>;
  norms: Norms;
  fatigue: number;
  morale: number;
  messages: ChatMessage[];
  events: SimEvent[];
  actionLog: PlayerAction[];
  completed: boolean;
  /** Values the team committed to at the start (2–3 of 5). */
  chosenValues: TeamValue[];
  /** Lived-vs-claimed tally for every value, not just chosen ones. */
  valueLedger: Record<TeamValue, ValueLedgerEntry>;
  /** scenarioId -> chosen optionId. */
  resolvedScenarios: Record<string, string>;
}

export type PlayerAction =
  | { type: "sit_with"; targetId: string }
  | { type: "check_in"; targetId: string; tone: "casual" | "direct" }
  | { type: "react_in_chat"; messageId: string; reaction: "laugh" | "ignore" | "redirect" | "dm_support" }
  | { type: "speak_up"; context: string; tone: "light" | "direct" | "defer" }
  | { type: "include_someone"; targetId: string; space: SpaceId }
  | { type: "stay_late" }
  | { type: "leave_early" };

export interface TickResult {
  state: SimState;
  newEvents: SimEvent[];
  signals: TeamSignals;
  narrative: string[];
}

export interface ActionAvailability {
  action: PlayerAction["type"];
  label: string;
  description: string;
  targets?: { id: string; name: string }[];
  contexts?: string[];
}

// --- Quiz mode -------------------------------------------------------------
// A faster, structured alternative to the sim: situational questions whose
// answers score each value, so a team can see exactly where to improve.

export interface QuizOption {
  id: string;
  label: string;
  valueImpacts: Partial<Record<TeamValue, number>>;
  /** Shown in review after answering — the "why" behind the scoring. */
  insight?: string;
}

/**
 * "self" = how would YOU respond; "team" = what typically happens on your team.
 * Both feed the same value scores; perspective only changes framing.
 */
export type QuizPerspective = "self" | "team";

export interface QuizQuestion {
  id: string;
  /** Theme tag, e.g. "Bystander intervention" or "Peer pressure". */
  theme: string;
  perspective: QuizPerspective;
  prompt: string;
  options: QuizOption[];
}

export interface QuizConfig {
  id: string;
  title: string;
  values: ValueDef[];
  /** One actionable growth tip per value. */
  improvementTips: Record<TeamValue, string>;
  questions: QuizQuestion[];
}

export interface QuizGrowthArea {
  value: TeamValue;
  label: string;
  score: number;
  tip: string;
}

export interface QuizResult {
  levels: ValueLevel[];
  strengths: ValueLevel[];
  growthAreas: QuizGrowthArea[];
  overallScore: number;
  headline: string;
  answered: number;
  total: number;
}

// --- Team mode (multiple people, one shared result) ------------------------

/** One person's completed quiz, as stored against a team session. */
export interface QuizSubmission {
  id: string;
  answers: Record<string, string>;
  submittedAt: number;
}

/**
 * A value level for the whole team, plus how much people agree. A low
 * `agreement` means the team is split on whether the value is upheld — often
 * more revealing than the average score itself.
 */
export interface TeamValueLevel extends ValueLevel {
  /** 0–100: how tightly individual scores cluster around the team average. */
  agreement: number;
  /** Share of participants who scored this value as strong (0–100). */
  strongShare: number;
}

export interface TeamQuizResult {
  participantCount: number;
  levels: TeamValueLevel[];
  strengths: TeamValueLevel[];
  growthAreas: QuizGrowthArea[];
  /** Values where the team most disagrees with itself. */
  divided: TeamValueLevel[];
  overallScore: number;
  headline: string;
}
