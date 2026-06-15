# Technical approach — Option A (lightweight web sim)

## Stack

| Layer | Choice |
|---|---|
| Sim engine | TypeScript (pure, UI-free) |
| Web client | React 19 + Vite |
| Client state | Zustand |
| Content | JSON (`packages/content`) |
| Tests | Vitest (engine only) |
| Future backend | Supabase (saves, cohorts, coach dashboard) |

## Monorepo layout

```
team-culture-sim/
├── packages/
│   ├── sim-engine/     # norms, relationships, events, values, quiz, team aggregation
│   └── content/        # road-trip.json (sim), quiz.json (culture check)
└── apps/
    ├── server/         # Express API: sessions, submissions, aggregate results
    └── web/            # React UI (home → team | quiz | sim, plus QR-join player flow)
```

## Three modes, one value model

The app opens on a home screen offering three entry points that share the same six
values (Courage, Excellence, Respect, Trust, Care, Accountability) and the same
ledger-based scoring (`levelsFromLedger` in `values.ts`):

- **Beyond the Game** — multiplayer. A host creates a session (4-char code + QR);
  teammates join via `/?s=CODE` and answer anonymously on their phones. Each quiz
  question is tagged `perspective: "self"` (how you'd respond) or `"team"` (what
  usually happens). `aggregateSubmissions` pools everyone's answers into one team
  result with per-value scores, an **agreement** score (how much individuals diverge),
  the most **divided** values, and shared growth areas.
- **Quick Self-Check** — the same questions, solo, returning a personal `QuizResult`.
- **Road Trip Sim** — emergent discovery over a simulated road trip; the end reveal
  shows what level each value reached.

## Team mode data flow

```
host: POST /api/sessions {teamName}          → { code }
player: GET  /api/sessions/:code             → { teamName, participantCount }
player: POST /api/sessions/:code/submissions → { answers }   (anonymous)
host: GET  /api/sessions/:code/results       → TeamQuizResult (polled live)
```

Sessions live in memory and persist to `apps/server/data/sessions.json`. The server
re-scores from the same `content/quiz.json` it serves, so client and server never drift.

## Engine API

```typescript
startSimulation(config) → SimState
applyAction(state, action) → { state, notes }
getContext(state, space) → { actions, messages, events, signals }
getSeasonSummary(state) → summary

levelsFromLedger(ledger, values) → ValueLevel[]        // shared scoring core
scoreQuiz(quizConfig, answers) → QuizResult            // solo / per-person
aggregateSubmissions(quizConfig, submissions) → TeamQuizResult   // team mode
```

**Rule:** UI sends `PlayerAction` objects only. It never writes trust/norms directly.

## State model

### Norms (0–1)
- `exclusion` — cliques, leaving people out
- `coverUp` — smoothing mistakes vs owning them
- `banterTolerance` — edgy joke tolerance
- `speakUpSafety` — cost of speaking up

### Values (the core learning mechanic — discovery model)
- **No values are chosen up front.** The team just plays the trip.
- Every action and scenario choice folds **value impacts** into a `valueLedger` (`reinforced` vs. `undermined`) for all 6 values: Courage, Excellence, Respect, Trust, Care, Accountability
- The **same scenario** is shown to everyone; the value weight of each option is what differs
- At season end, each value is **revealed** at a level — `strong` / `developing` / `fragile` / `untested` — with a 0–100 score (`getValueLevels`)
- The reveal headline names what the team *actually ran on* and where it got thin. The learning is the discovery: "this is who you were under pressure," inferred from repeated small choices rather than declared in advance

### Relationships (per teammate)
- `trust`, `warmth`, `memoryTags[]`

### World
- `day`, `fatigue`, `morale`, `messages[]`, `events[]`, `actionLog[]`, `resolvedScenarios{}`

### Why this scales without branch explosion
Scenarios are simple and few. Meaning comes from the running ledger of small everyday choices
plus a handful of featured moments. Culture is **discovered, not declared** — the team finds out
what level of each value they reached, accumulated over repeated micro-decisions, with no tree of
authored endings.

## Event generation

Events are **systemic**, not a fixed curriculum. Examples:

- `exclusion > 0.55` + bus day → "Open seat politics"
- `banterTolerance > 0.5` + chat → "Group chat momentum"
- `speakUpSafety < 0.35` + hotel → "Someone on the edge"
- loss + high `coverUp` → "After the loss" blame spiral

## Player actions (MVP)

- `sit_with`, `check_in`, `include_someone`
- `react_in_chat` (laugh | ignore | redirect | dm_support)
- `speak_up` (light | direct | defer)
- `stay_late`, `leave_early`

Actions are weighted by `playerRole` (captain > starter > bench > newcomer).

## UI surfaces

1. **Day header** — schedule label + vibe pill (not raw meters)
2. **Space tabs** — bus, hotel, group chat, locker room
3. **Action tray** — context actions from engine
4. **Team pulse** — who’s warm / quiet (observable signals)
5. **Narrative log** — in-world consequences, not rubric feedback
6. **Season end** — vibe profile + closest connections

## Phase roadmap

### Phase 1 (current)
- Road Trip MVP, local-only, fictional roster
- Engine unit tests
- No auth/backend

### Phase 2
- Supabase saves + team codes
- Content CMS (Sanity/Strapi) for teammates/events
- Coach aggregate dashboard (norm trends, not individual grades)

### Phase 3 (optional)
- PWA + push notifications
- Same engine via WASM in Godot/Unity 2D shell

## Privacy defaults

- Fictional names only in v1
- Coach views show **cohort patterns**, not “Player X failed intervention”
- Clear simulation framing in onboarding

## Run locally

```bash
cd ~/Projects/team-culture-sim
npm install
npm run dev
npm test
```
