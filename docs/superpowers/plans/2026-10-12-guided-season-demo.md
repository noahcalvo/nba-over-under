# Guided Season & Scoring Demo (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or superpowers:subagent-driven-development) to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After the guided draft (Phase 1, `docs/superpowers/plans/2026-10-12-guided-draft-demo.md`), the user follows
their own demo league through a simulated NBA season in three manual checkpoints (Draft complete → Midseason → Final
results) on the real League overview and Team pages, with the Phase 1 spotlight overlay explaining projected and final
scoring with their own pick and fade.

**Architecture:** Nothing new on the server. `/l/demo`, `/l/demo/rosters` and `/l/demo/teams/{id}` (today
`DemoChapterPlaceholder`) render one client component, `DemoSeason`, which restores the Phase 1 snapshot from
`sessionStorage`, derives a deterministic 82-game season from the completed draft, cuts it at the current checkpoint, and
feeds plain data to the existing `LeagueOverview`, `RostersBoard` and `TeamDetail`. Scores come from the existing
`computeStandings` / `evaluateCall` / `evaluateFade`. The tour reuses `TourOverlay` (spotlight, pointer, callout,
interaction gate). Season progress (checkpoint + seen steps) is added to the existing snapshot, so it survives reloads
and route changes; the step is derived from that progress plus the page the user is on, so the required team-name click
is recognised by the route it opens, not by a click handler.

**Tech Stack:** Next.js 16.4 App Router (Cache Components), React 19, TypeScript strict, Tailwind CSS v4, Vitest 4.1
(node environment). No new dependencies.

## Requirements (condensed from the request of 2026-10-12; nothing dropped)

- Exactly three checkpoints, advanced manually by a small demo-only control that shows the stage (Draft complete ·
  Midseason · Final results) and only the next action ("Advance to Midseason →", "Finish the Season →"). No timeline,
  slider or extra stages.
- The user's Phase 1 draft (their pick 1, their simulated later picks, their fade, the other managers' picks and fades)
  is used unchanged. Never manipulate the season so the user's pick or fade succeeds.
- **Draft complete (Game 0):** Phase 1's last step leads to the normal League overview. Introduce the user's roster and
  opening pick, their fade, and the standings (most total points wins). No games simulated; nothing shown as a final
  zero; no preseason ranking from projections. Frozen lines and ownership preserved.
- **Midseason (Game 41):** every team 41 games. Overview shows records, projected wins, projected pick points, projected
  fades and standings; the opening pick is highlighted; the user must click its team name, which opens the real
  `/l/demo/teams/{TEAM}` (their team, never hardcoded). There: the existing chart (actual wins, locked-line pace,
  projected continuation; Last 8 and Full season work; no future game shown as played; synthetic data labelled; no
  invented dates, opponents or sportsbook data). Then projected wins, frozen line and projected points, explained with
  the team's real demo numbers for the user's side (+1/−1 base, ±0.1 per win of margin, wins ÷ games × 82). Back to the
  overview through normal navigation: standings and the user's projected fade (+2 on a miss, 0 otherwise, no margin,
  may change).
- **Final results (Game 82):** final wins drive final scores through the existing rules (push 0; fade on a push 0);
  final standings, placement, winner (existing tie order), the user's score and place; the opening pick's and fade's
  final outcomes, with the push sentence where relevant. Three actions: Explore Results (dismiss, keep the league),
  Replay Demo (clear demo state, back to the guided draft), Create League (existing flow on the home page).
- Simulation: deterministic per completed draft; one 82-game W/L sequence per team, Game 41 is its first half; varied
  records; isolated from real records (nothing stored, no feed reads).
- Tour UI: the Phase 1 overlay unchanged in look and behaviour (dim, spotlight, pulse, pointer, Continue on
  informational steps, auto-advance on actions, keyboard, reduced motion, exit/restart); progression survives route
  changes and reloads; few steps per checkpoint.
- Tests: simulation correctness, scoring, checkpoint transitions, cross-page step derivation.

## Findings (read before Task 1)

- Phase 1 lives in `src/lib/tutorial/` (session, strategy, simulation, steps, snapshot), `src/lib/tour/` (targets,
  geometry, placement), `src/components/tour/` (`TourOverlay`, rect tracking, interaction gate) and
  `src/components/tutorial/` (`DraftTour`, `use-tutorial-session`, `storage`, `DemoChapterPlaceholder`). The handoff is
  `restoreTutorial(readTutorialSnapshot())` → `tutorialResult(league)`.
- The tutorial league has id `"tutorial"` and `isDemo: false` (so the draft rules run). The pages it will be shown on
  build links from `league.id` (`TeamHeader` breadcrumb, Select navigation, draft links) and label demo data with
  `league.isDemo`. **Decision:** render a display copy `{ ...league, id: "demo", isDemo: true }`: links stay inside
  `/l/demo`, every page shows the "Demo data" tag, and commissioner-only controls (records refresh) stay hidden.
- `TeamDetail` takes `gameLog` and `market` promises (`use()` inside Suspense). **Decision:** the demo passes an already
  fulfilled promise for the synthetic log (status fields set so `use` reads it without suspending) and `market: null`;
  `TeamDetail` hides the sportsbook panel when `market` is null and the chart spans the row. No sportsbook data is
  invented. A `historyNote` prop labels the chart "Simulated demo season".
- `LeagueOverview` opens on the projected basis. At Game 82 that would label settled results "Win pace / Projected".
  **Decision:** optional `initialBasis` prop; the demo passes `"final"` at the last checkpoint and remounts the overview
  per checkpoint (`key`).
- Before any game, `StandingsPanel` ranks 1–4 by seat and shows `+0.0`, and `SummaryStats` shows "1st / 4" and `0.0`.
  That is the "artificial preseason ranking" and "final zero" the request forbids, and it contradicts the existing rule
  "Zero games played → Not available" for real leagues too. **Decision:** when `standings.anyScored` is false, both show
  "–" for rank and "Not available" for points (applies to real leagues before their first game; nothing else changes).
- Pushes cannot happen with the mock lines (all end in .5); the push copy is still derived from `CallEvaluation.push`
  and covered by unit tests with an integer line.
- Every number in `src/config/`: add `TUTORIAL_SEASON` (midseason games, strength spread) to `src/config/tour.ts`.
- The seeded generator in `src/data/game-logs.ts` (mulberry32 + FNV hash) moves to `src/lib/random.ts` so the season
  simulation and the mock game logs share it.

## Season simulation (Task 1)

- Seed: the completed draft's picks (`ATL O,MIN U,…` in pick order) plus each team id. Same draft → same season, on
  every page, reload and replay of the same picks.
- Per team: a hidden strength `line + N(0, spread)` wins (spread 6, clamped 12–70), then 82 Bernoulli games at
  `strength ÷ 82`. Real variation (some teams beat their line by 10, some miss by 10, midseason pace drifts from the
  final), independent of who drafted what.
- Records at a checkpoint are prefix counts of that one sequence: Game 41 ⊂ Game 82 by construction.
- Game log at a checkpoint: all 82 numbered games, results after the checkpoint `null` (upcoming), dates, opponents
  and venues `null` (never invented).

## Tour steps

| Checkpoint | Step | Page | Spotlight | Advances when |
| --- | --- | --- | --- | --- |
| Draft complete | `draft-roster` | overview | opening pick row, fades panel | Continue |
| | `draft-standings` | overview | standings | Continue |
| | `draft-advance` | overview | season control (pointer on the action) | checkpoint becomes Midseason |
| Midseason | `mid-pick` | overview | opening pick row (pointer on team name; only it is clickable) | the opening team's page opens |
| | `mid-chart` | team | season progress (its range control usable) | Continue |
| | `mid-points` | team | stat strip, user's side card + numeric breakdown | Continue |
| | `mid-back` | team | Overview nav item and breadcrumb | the overview opens |
| | `mid-standings` | overview | standings, fades + fade breakdown | Continue |
| | `mid-advance` | overview | season control | checkpoint becomes Final results |
| Final results | `final-standings` | overview | standings + winner/placement | Continue |
| | `final-results` | overview | opening pick row, fades + final breakdown | Continue |
| | `final-finish` | overview | none (docked) + Explore / Replay / Create | Explore results |

- Derivation `seasonStep(progress, location, openingTeamId)`: pure; returns the step id or null (explored). On a page
  that isn't the step's page, the overlay shows a resume callout linking to that page (reloads, browser back, a wrong
  team page).
- Progress `{ checkpoint, seen: SeasonStepId[] }` is part of the snapshot (`season`, optional for older snapshots,
  validated on restore, reset to the start when the draft isn't complete).

## File Structure

| File | Status | Responsibility |
| --- | --- | --- |
| `src/config/tour.ts` | modify | `TUTORIAL_SEASON` |
| `src/lib/random.ts` (+ test) | create | `seededRandom`, `seedFor`, `normalSample` (moved from `src/data/game-logs.ts`) |
| `src/data/game-logs.ts` | modify | Import the generator from `src/lib/random.ts` |
| `src/lib/tutorial/season.ts` (+ test) | create | Checkpoints, `simulateSeason`, `recordAfter`, `teamsAt`, `seasonGameLog`, `draftSeed` |
| `src/lib/tutorial/season-steps.ts` (+ test) | create | `SeasonProgress`, step ids, `seasonStep`, `parseSeasonProgress`, `advanceCheckpoint`, `markSeen` |
| `src/lib/tutorial/season-story.ts` (+ test) | create | The user's numbers at a checkpoint: pick and fade breakdowns, standings summary |
| `src/lib/tutorial/season-copy.ts` (+ test) | create | `SEASON_STEPS` (TourStep copy and targets per step) |
| `src/lib/tutorial/snapshot.ts` (+ test) | modify | `season` in the snapshot |
| `src/lib/tour/targets.ts` | modify | New target ids |
| `src/components/overview/{LeagueOverview,PicksPanel,PicksList,StandingsPanel,FadesPanel,SummaryStats}.tsx` | modify | `initialBasis`, `highlightPick`, tour ids, "Not available" before games |
| `src/components/team/{TeamDetail,SeasonProgressPanel,TeamStatStrip,OwnershipCard,TeamHeader}.tsx` | modify | `market` nullable, `historyNote`, `highlightSide`, tour ids |
| `src/components/shell/{nav-items.ts,SidebarNav,BottomNav}.tsx` (+ test) | modify | Demo Overview and Rosters ready; Overview item tagged |
| `src/components/tutorial/use-demo-season.ts` | create | Restore, season state, actions, persistence |
| `src/components/tutorial/SeasonControl.tsx` | create | Stage + next action |
| `src/components/tutorial/SeasonTour.tsx` | create | The overlay for the current season step |
| `src/components/tutorial/DemoSeason.tsx` | create | The demo's Overview / Rosters / Team page |
| `src/components/tutorial/{use-tutorial-session.ts,DraftTour.tsx,DemoChapterPlaceholder.tsx}` | modify | Keep season progress, hand off to `/l/demo`, "finish the draft first" |
| `src/app/l/[leagueId]/{page,rosters/page,teams/[teamId]/page}.tsx` | modify | Demo branch renders `DemoSeason` |
| `src/app/l/[leagueId]/scoring/page.tsx` | delete | The overview replaces the reserved stub |
| `CLAUDE.md` | modify | Architecture and domain notes |

## Global constraints

- `src/lib/` pure and test-first; demo folders keep the Phase 1 ESLint isolation rule (no server, db, app or `fetch`).
- Scoring only through `src/lib/scoring.ts` / `src/lib/standings.ts`; copy numbers from `SCORING`.
- Real leagues: only the pre-season "Not available" display changes; every new prop is optional with the old default.
- Tokens only, `src/lib/format.ts` for numbers, no horizontal scroll at 375px / 1440px, `motion-safe:` animations.
- Before each commit: `npm test && npm run lint && npm run typecheck`; `npm run build` in the last task.

## Tasks

### Task 1: Shared seeded random + deterministic season (`src/lib/random.ts`, `src/lib/tutorial/season.ts`)

- [ ] Tests first (`random.test.ts`): same seed → same sequence; values in [0, 1); `normalSample` mean ≈ 0, sd ≈ 1 over
  10k draws. `game-logs.test.ts` keeps passing unchanged (same generator).
- [ ] Tests (`season.test.ts`), on a draft completed by the Phase 1 simulation:
  - every one of the 30 teams has exactly 82 results; same draft → identical season; a different draft → different
  - `recordAfter(results, 41)` equals the counts of the first 41; wins + losses = games; Game 41 wins ≤ Game 82 wins and
    Game 82 − Game 41 wins ≤ 41
  - `teamsAt(…, 0)` all 0–0; `teamsAt(…, 41)` every team 41 games; `teamsAt(…, 82)` every team 82 games; lines and
    metadata unchanged
  - variety: final wins span ≥ 25 wins across the league; at least 5 teams finish over their line and 5 under
  - `seasonGameLog(…, 41)`: 82 games numbered 1–82, first 41 match the sequence, the rest `result: null`; every date,
    opponent, venue null; `buildChartModel` on it reports history `complete`
  - nothing favours the user: `simulateSeason(teams, seed)` reads only the seed and each team's id and line (same seed,
    teams with different records, `prevWins` or owners → the same season)
- [ ] Implement; move mulberry32/FNV from `src/data/game-logs.ts` into `src/lib/random.ts`.
- [ ] Commit `feat: deterministic demo season from the completed demo draft`.

### Task 2: Season progress and step derivation (`season-steps.ts`)

- [ ] Tests: the full walk (draft-roster → … → final-finish → null) with `markSeen`/`advanceCheckpoint` and locations;
  `mid-pick` until the opening team's page opens; another team's page → still the opening-team step with
  `onPage: false`; back on the overview before `mid-points` → `mid-pick`; after `mid-points`, team page → `mid-back`,
  overview → `mid-standings`; rosters page → `onPage: false`; `advanceCheckpoint` stops at final; parse rejects bad
  checkpoints/ids and keeps known ids only.
- [ ] Implement; commit `feat: guided season steps derived from checkpoint, seen steps and page`.

### Task 3: The user's numbers (`season-story.ts`) and step copy (`season-copy.ts`)

- [ ] Tests for `pickBreakdown`: Over above the line at midseason (positive, "+1 base", "+0.1 × margin"), Over below
  (negative), Under above/below, final settled, push on an integer line (0 points, push sentence), zero games ("Not
  available"); values equal `evaluateCall` exactly. `fadeBreakdown`: target on track to miss → +2, to hit → 0, push → 0,
  final wording. `standingsSummary`: winner = rank 1 from `computeStandings`, user's place, final vs projected wording.
- [ ] Tests for `SEASON_STEPS`: every step id has copy; action steps have no Continue; informational steps do; scoring
  numbers come from `SCORING`.
- [ ] Implement; commit `feat: season walkthrough copy built from the user's own scores`.

### Task 4: Snapshot carries season progress

- [ ] Tests: round trip keeps `season`; a v1 snapshot without `season` restores with the initial progress; a malformed
  `season` falls back to initial; an incomplete draft always restores the initial season.
- [ ] Implement in `snapshot.ts`; `use-tutorial-session` keeps the restored `season` when it writes; commit.

### Task 5: Existing pages accept demo data (props and tour ids)

- [ ] `LeagueOverview`: `initialBasis?`, `highlightPick?` → `PicksPanel` → `PicksTable` / `PickCards` tag that row
  `highlight-pick` and its name link `highlight-pick-team`; `StandingsPanel` `standings`, `FadesPanel` `fades`.
- [ ] `StandingsPanel` / `SummaryStats`: "–" rank and "Not available" points when `!standings.anyScored`.
- [ ] `TeamDetail`: `market: Promise<MarketLine> | null`, `historyNote?`, `highlightSide?`; tags `team-stats`,
  `season-progress`, `my-side`; `TeamHeader` breadcrumb and nav Overview items tagged `nav-overview`.
- [ ] `nav-items`: demo Overview and Rosters ready (update its test).
- [ ] Typecheck, lint, tests; commit `feat: overview and team pages take demo data and name their tour areas`.

### Task 6: Demo season pages

- [ ] `use-demo-season`: client-only restore; `null` → `DemoChapterPlaceholder` ("Finish the demo draft first");
  memoised season, teams at the checkpoint, display league; `markSeen`, `advance`, `replay` (clear, push
  `/l/demo/draft`), `exit` (clear); writes the snapshot on change unless exited.
- [ ] `SeasonControl` (`season-control`, action `season-advance`), `SeasonTour` (TourOverlay per step, resume callout
  off-page, breakdown children, final actions), `DemoSeason` (overview / rosters / team).
- [ ] App pages: demo branches render `DemoSeason`; unknown demo team id → `notFound()`; delete the scoring stub;
  Phase 1's finish links go to `/l/demo`.
- [ ] Commit `feat: guided season on the demo's overview, rosters and team pages`.

### Task 7: Verify in the browser, docs

- [ ] Full run at 1440×900 and 375×812 against `npm run dev` with `RECORD_SOURCE=static LINE_SOURCE=static`: draft →
  every season step; Last 8 / Full season; reload on each page keeps the step; no page-level horizontal scroll; no
  `/api/` request during the demo; Replay returns to step 1 of the draft; Create League opens the home page form.
- [ ] `CLAUDE.md` updates; `npm test && npm run lint && npm run typecheck && npm run build`; commit and push.
