# Guided Draft Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new user learns Courtline in the real Draft room: a guided overlay spotlights the live UI, the user makes one pick and one fade of their own choosing, and the rest of a 4 × 11 draft and the other fades are simulated deterministically, entirely in the browser.

**Architecture:** The Draft room is split into a presentational `DraftRoomView` that takes a *driver* (state + `dispatch`) and the existing `DraftRoom`, which feeds it the server-backed `useLeagueDraft`. The guided demo feeds the same view a client-only driver whose `dispatch` runs `decideDraftAction`, the exact pure decision the draft endpoint runs, on an in-memory league that is never sent anywhere. Simulation (deterministic pick and fade strategies) and tutorial progression (step derived from league state plus two "seen" flags) are pure modules in `src/lib/tutorial/`, tested exhaustively. A reusable tour overlay (`src/components/tour/`) spotlights elements tagged with typed `data-tour` ids, positions its callout with a pure placement function, and gates input outside the allowed areas.

**Tech Stack:** Next.js 16.4 App Router (Cache Components), React 19, TypeScript strict, Tailwind CSS v4, Vitest 4.1 (node environment), lucide-react. No new dependencies.

**Spec:** the Requirements section below (the request of 2026-10-12, condensed; nothing dropped) plus `docs/superpowers/specs/2026-10-08-courtline-prototype-design.md` for the draft and fade rules. Read `CLAUDE.md` first: it is the project's rulebook.

## Requirements

Experience (in order): 1 welcome · 2 understand Over/Under · 3 confirm your own pick · 4 snake draft explained · 5 rest of the draft simulated (watchable, skippable) · 6 understand fades · 7 confirm your own fade, then the other managers' fades are simulated · 8 draft complete, with an action into the (future) scoring walkthrough.

| # | Spotlight | Callout (verbatim) | Advances when |
| --- | --- | --- | --- |
| 1 | Turn-status banner | "Welcome to your draft! You'll compete with other managers to predict NBA teams' season win totals. Let's make your first pick." | Continue |
| 2 | Available picks (search, filters, lines, Over/Under buttons) | "Each NBA team has a projected win total called its line. Draft OVER if you think they'll finish above it, or UNDER if you think they'll finish below it. Choose any team and side!" + non-blocking details: lines freeze at the start; Over 41.5 needs ≥ 42 wins, Under 41.5 needs ≤ 41; different managers may own opposite sides; one manager can't own both | any eligible selection |
| 3 | Your selection | "This is your pick! Check the team, direction, and locked win total. When you're ready, confirm it." Selection may still change | the pick is confirmed |
| 4 | Draft board | "Courtline uses a snake draft. Everyone picks once per round, but the order reverses each round. Your next pick comes after the other managers take their turns." | Continue / Watch draft |
| 5 | Draft board (during simulation) | "Let's fast-forward through the rest of the draft. We'll make the remaining picks for every manager, including you." Animated, skippable | regular draft complete |
| 6 | Fade selection | "Now it's time to fade! A fade is a bet against another manager's pick. If their pick misses, you earn 2 points. If it hits, you earn 0. Choose any eligible pick to fade." + details: not your own pick; several managers may fade one pick; flat +2 / 0, no margin; a push earns 0 | a valid target is selected |
| 7 | Fade preview / confirm | "You're betting that this manager's pick will be wrong. Confirm your fade to finish your draft!" Target may still change | the fade is confirmed; others' fades then simulated |
| 8 | Completed draft status | "Your draft is complete! You've built your roster and chosen a fade. Now let's see how those picks earn points throughout an NBA season." | (end) action into the scoring walkthrough |

- The user is Manager 1, on the clock for pick 1, board empty. Any eligible team and side; any eligible fade target. Nothing scripted, nothing recommended.
- Simulation: deterministic for a given user choice, adapts to it, never drafts an owned side, never gives one manager both sides of a team, preserves the user's pick, finishes 4 × 11 = 44 retained picks with no early end, and ends in the real fade stage. Skipping the animation must not change the result.
- Fades: same eligibility as real leagues, no artificial order dependency in the logic; every manager ends with a legal locked fade and the draft completes normally.
- Overlay: reusable (not per-step markup); dims outside the spotlight; whole-section spotlights; targets inside scroll containers; callout stays in the viewport and off the controls; subtle animated arrow; blocks unrelated actions during gated steps; exit any time; keyboard and reduced motion; Continue on informational steps; action steps advance on successful application actions, never on clicks or timers; stays positioned through content changes, scrolls and resizes; stable semantic target ids, not fragile selectors.
- Data: no real league mutation, nothing persisted server-side; reuse UI and domain rules; restartable to the initial state; user pick and fade preserved throughout.
- Scoring walkthrough: not built here. Design the handoff so it can show the user's actual pick and direction, ±1 base, ±0.1 per win of margin, fade +2 / 0, projected vs final, through the real Overview / Rosters / team pages, with demo data clearly labeled and consistent with `src/lib/scoring.ts`.
- Must not regress live drafts or fades.

## Findings and decisions (read before Task 1)

What exists today:
- `/l/demo` is a **read-only, complete** league built in code (`src/data/demo-league.ts`). No guided-tour code exists anywhere; no DOM test environment (Vitest runs `environment: "node"`, `src/**/*.test.ts` only).
- `DraftRoom` (`src/components/draft/DraftRoom.tsx`) holds all room UI state (selection, filters, fade choice) and calls `useLeagueDraft`, which fetches, polls every 2 s and calls `router.refresh()`.
- Every rule is pure and client-safe: `applyDraftAction` (`src/lib/draft.ts`), `applyFade` (`src/lib/fades.ts`), and `decideDraftAction` (`src/lib/league/commands.ts`), which adds permissions on top. That last one is what `POST /api/leagues/{id}/draft` runs under the lock.

Problems with reusing the normal controls, and the fix chosen for each:

| Problem | Decision |
| --- | --- |
| `isDemo: true` makes `canPickNow`, `canFadeFor`, `canControlDraft` false and `decideDraftAction` returns `demo_league` | The tutorial league is `isDemo: false` with id `"tutorial"`. It lives only in React state; stored ids are 6 characters (`randomLeagueId`), so the id can never match a stored league, and any stray request for it 404s. |
| `useLeagueDraft` talks to the server | Split the room: `DraftRoomView` takes a `DraftRoomDriver`; `DraftRoom` = `useLeagueDraft` + view (no behavior change); the demo supplies its own driver. |
| Seat 1 is the commissioner, so the bar shows Pause/Resume, and open seats would offer "picking for an open seat" / a "Fading for" selector | Every tutorial seat is named (claimed): "You", "Avery", "Jordan", "Riley". `DraftRoomView` gets `draftControls={false}`. |
| The status bar's complete state links to `/l/{league.id}` (would be `/l/tutorial`) | `completeAction` prop overrides that link. |
| The selection and fade target live in local room state, invisible to a tour | `onSelectionChange` / `onFadeTargetChange` callbacks report the *active* (eligible) values. |
| Below `xl` the selection is confirmed in the fixed `SelectionBar`; at `xl+` in the side panel | Steps list both targets; the first one that is displayed anchors the callout. |
| `DraftBoard` scrolls smoothly even with reduced motion | Use `behavior: "auto"` when the user prefers reduced motion (a small fix that also helps live drafts). |
| Early end could cut the demo short | Impossible at 4 × 11: before a manager's 11th pick at most 10 teams are theirs, so at most 10 open sides are blocked for them, while at least 60 − 43 = 17 sides are open. Asserted for every opening in tests anyway. |

Other decisions:
- **Route:** `/l/demo/tour/draft` (`src/app/l/[leagueId]/tour/draft/page.tsx`, 404 for any league but `demo`), inside the normal league shell; the future walkthrough gets `/l/demo/tour/scoring` (a `NotBuiltYet` stub now). Entry points: the home page's "Just looking?" panel and a "Try a guided draft" button in the demo Draft room header. Exit goes to `/l/demo`.
- **Progression is derived, not scripted:** the step is a pure function of the league state plus `{ welcomed, snakeExplained }` and two booleans (has a selection, has a fade target). Clearing a selection naturally returns to step 2; a confirmed pick (state) is what moves 3 → 4.
- **Simulation strategy:** "best edge": a side's edge is last season's wins against the line, signed for the side; the simulated manager takes the eligible side with the largest edge (ties: team id, then Over), and fades the opponent pick with the smallest edge (ties: lowest pick number). Every simulated command goes through `decideDraftAction` with the acting manager as actor.
- **Persistence:** a replayable snapshot (`{ v, progress, picks, fades }`) in `sessionStorage` (`courtline.tutorial.v1`). Restoring replays every command through the rules, so a tampered or stale snapshot is dropped, never trusted. Restart clears it. This is also the scoring walkthrough's handoff (`tutorialResult`).
- **Isolation guard:** ESLint forbids `@/server/*`, `@/db/*`, `@/app/*`, `use-league-draft` and the `fetch` global inside `src/lib/tutorial`, `src/lib/tour`, `src/components/tour` and `src/components/tutorial`; the final browser check asserts no `/api/` request during a full run.
- **UI tests:** the repo has no DOM test setup. Everything decidable is pure and unit tested (simulation over all 60 openings × every fade target, progression, snapshot replay, placement, geometry); the overlay is verified in the browser pane with the checklist in Task 8. Adding jsdom + Testing Library would be a separate decision.

## Scoring walkthrough handoff (design only, not built here)

- Read the snapshot with `readTutorialSnapshot()` → `restoreTutorial()` → `tutorialResult(league)`: `{ league, teams, viewerId: "m1", openingPick, fade }`. `null` until the draft is complete (send the user back to `/l/demo/tour/draft`).
- Score with `src/lib/scoring.ts` / `src/lib/standings.ts` against `teams` from `tutorialTeams()` (mock lines `STATIC_LINES` frozen as the league's lines; mock records from `TEAM_INFO`, already consistent with `src/data/game-logs.ts`). Label every page "Demo data" (the existing `tag` pattern).
- To show right/wrong picks, ±0.1 margins and a fade hit/miss, the walkthrough will need its own demo *final* records (e.g. a pure `tutorialSeasonOutcome(league)` that sets chosen teams' wins to land above or below the line). Demonstrating a push is out of scope.
- Overview, Rosters and the team page are server components reading `findLeague`. Reusing them with a client-held league needs either a client data path for those components or a short-lived server representation. Decide in the walkthrough's own spec. Note `TeamLink` builds `/l/{leagueId}/teams/…` from the URL, which would point at the static demo league.

## Global Constraints

- `src/config/` is the only home for tunable numbers: add `src/config/tour.ts` (`TUTORIAL`: managerCount 4, rounds 11, pick and fade intervals; `TOUR`: overlay spacing). Scoring numbers in copy come from `SCORING` (`src/config/scoring.ts`), never literals.
- `src/lib/` stays pure (no React, no `next/*`, no `server-only`) and test-first. Tests colocated as `*.test.ts`.
- League rules are not changed. The demo only calls `decideDraftAction` / `applyDraftAction` / `applyFade` / `fadeTargets` / `holdsTeam` / `findPickForSide`; it never re-implements eligibility.
- The demo never imports `@/server/*` or `@/db/*`, never calls `fetch`, never writes a real league. The live `DraftRoom` must behave exactly as before.
- UI: dark tokens only (`bg-ink-900`, `fill-ink-950/80`, `text-accent`, `ring-accent`, …), numbers via `src/lib/format.ts`, no page-level horizontal scroll at 375px and 1440px, `motion-safe:` for every animation.
- React 19 lint (`eslint-plugin-react-hooks` 7): no synchronous `setState` in an effect body, no ref writes during render. The patterns below respect this.
- Wrap anything reading `params` in `<Suspense>` (Cache Components), as existing pages do.
- If `npm run typecheck` fails on files named `* 2.*` under `.next/`, delete those iCloud duplicates.
- Before claiming a task done: `npm test && npm run lint && npm run typecheck` (and `npm run build` in the last task).
- Commit messages end with:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## File Structure

| File | Status | Responsibility |
| --- | --- | --- |
| `src/config/tour.ts` | create | `TUTORIAL` (4 × 11, pacing) and `TOUR` (overlay spacing) |
| `src/data/tutorial-league.ts` (+ test) | create | `buildTutorialLeague`, `tutorialTeams`, ids and manager names |
| `src/lib/tutorial/session.ts` (+ test) | create | `applyTutorialCommand`: `decideDraftAction` on the in-memory league |
| `src/lib/tutorial/strategy.ts` (+ test) | create | `sideEdge`, `eligibleSides`, `chooseSide`, `chooseFadeTarget` |
| `src/lib/tutorial/simulation.ts` (+ test) | create | `nextSimulatedPick`, `nextSimulatedFade`, `simulateStep`, `simulateAll` |
| `src/lib/tutorial/steps.ts` (+ test) | create | Step ids, copy, targets, `tutorialStep` derivation |
| `src/lib/tutorial/snapshot.ts` (+ test) | create | `snapshotOf`, `restoreTutorial`, `tutorialResult`, storage key |
| `src/lib/tour/targets.ts` | create | `TourTargetId`, `tourTarget()`, `TourStep` |
| `src/lib/tour/geometry.ts` (+ test) | create | `Rect`, `intersectRects`, `clipRect`, `inflateRect`, `sameRects` |
| `src/lib/tour/placement.ts` (+ test) | create | `placeCallout`, `placePointer` |
| `src/components/draft/DraftRoomView.tsx` | create (moved) | The room UI, driven by a `DraftRoomDriver`; new optional props |
| `src/components/draft/DraftRoom.tsx` | modify | `useLeagueDraft` + `DraftRoomView` |
| `src/components/draft/use-league-draft.ts` | modify | Returns `DraftRoomDriver` |
| `src/components/ui/Panel.tsx` | modify | Optional `tour` id |
| `src/components/draft/{DraftStatusBar,AvailablePicks,SideButton,SelectionPreview,SelectionBar,DraftBoard,FadePicker,FadeStatusPanel}.tsx` | modify | `data-tour` ids; `completeAction`; reduced-motion board scroll |
| `src/components/ui/use-prefers-reduced-motion.ts` | create | `usePrefersReducedMotion()` |
| `src/components/tour/dom.ts` | create | `findTargets`, `isDisplayed`, `visibleRect`, `focusablesIn` |
| `src/components/tour/use-target-rects.ts` | create | Live visible rects of tagged elements |
| `src/components/tour/use-interaction-gate.ts` | create | Blocks input outside allowed areas; Tab trap |
| `src/components/tour/TourOverlay.tsx` | create | Dimmer, spotlight rings, pointer arrow, callout |
| `src/components/tutorial/storage.ts` | create | `sessionStorage` read/write/clear of the snapshot |
| `src/components/tutorial/use-tutorial-session.ts` | create | In-memory league, driver, simulation, restart |
| `src/components/tutorial/DraftTour.tsx` | create | The guided page: `DraftRoomView` + `TourOverlay` |
| `src/app/l/[leagueId]/tour/draft/page.tsx` | create | Demo-only route |
| `src/app/l/[leagueId]/tour/scoring/page.tsx` | create | `NotBuiltYet` stub |
| `src/app/page.tsx` | modify | Entry link |
| `eslint.config.mjs` | modify | Isolation rule |
| `CLAUDE.md` | modify | Architecture and domain notes |

---

### Task 1: Tutorial league and command boundary

**Model:** haiku (complete code below).

**Files:**
- Create: `src/config/tour.ts`
- Create: `src/data/tutorial-league.ts`, `src/data/tutorial-league.test.ts`
- Create: `src/lib/tutorial/session.ts`, `src/lib/tutorial/session.test.ts`

**Interfaces:**
- Consumes: `decideDraftAction` (`src/lib/league/commands.ts`), `applyDraftAction`, `createDraftState` (`src/lib/draft.ts`), `withLines` (`src/lib/lines.ts`), `STATIC_LINES`, `TEAM_INFO`, `TEAM_IDS`.
- Produces:
  - `TUTORIAL: { managerCount: 4; rounds: 11; pickIntervalMs: number; fadeIntervalMs: number }`, `TOUR: { calloutGap: number; viewportMargin: number; spotlightPadding: number; pointerSize: number; pointerGap: number }` from `@/config/tour`
  - `TUTORIAL_LEAGUE_ID = "tutorial"`, `TUTORIAL_VIEWER_ID = "m1"`, `TUTORIAL_MANAGER_NAMES: readonly string[]`, `buildTutorialLeague(): League`, `tutorialTeams(): Team[]` from `@/data/tutorial-league`
  - `applyTutorialCommand(league: League, actorId: string, command: DraftCommand): Result<League>` from `@/lib/tutorial/session`

- [ ] **Step 1: Write the failing tests**

`src/data/tutorial-league.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SEASON } from "@/config/league";
import { TUTORIAL } from "@/config/tour";
import { STATIC_LINES } from "@/data/static-lines";
import { currentPickNumber, managerOnTheClock } from "@/lib/draft";
import {
  buildTutorialLeague,
  TUTORIAL_LEAGUE_ID,
  TUTORIAL_MANAGER_NAMES,
  TUTORIAL_VIEWER_ID,
  tutorialTeams,
} from "./tutorial-league";

describe("buildTutorialLeague", () => {
  it("is a live 4 × 11 draft with an empty board and the viewer on the clock", () => {
    const league = buildTutorialLeague();
    expect(league.draft.status).toBe("live");
    expect(league.draft.seatOrder).toEqual(["m1", "m2", "m3", "m4"]);
    expect(league.draft.rounds).toBe(TUTORIAL.rounds);
    expect(league.draft.picks).toEqual([]);
    expect(league.draft.voidedPicks).toEqual([]);
    expect(league.draft.blockedPick).toBeNull();
    expect(currentPickNumber(league.draft)).toBe(1);
    expect(managerOnTheClock(league.draft)).toBe(TUTORIAL_VIEWER_ID);
    expect(league.fades).toEqual([]);
  });

  it("names every seat, so nobody picks or fades for an open seat", () => {
    const league = buildTutorialLeague();
    expect(TUTORIAL_MANAGER_NAMES).toHaveLength(TUTORIAL.managerCount);
    expect(league.managers.map((manager) => manager.displayName)).toEqual([...TUTORIAL_MANAGER_NAMES]);
    expect(league.commissionerId).toBe(TUTORIAL_VIEWER_ID);
  });

  it("is writable in memory but can never be a stored league or the demo", () => {
    const league = buildTutorialLeague();
    expect(league.isDemo).toBe(false);
    expect(league.id).toBe(TUTORIAL_LEAGUE_ID);
    // Stored league ids are exactly 6 characters (randomLeagueId).
    expect(TUTORIAL_LEAGUE_ID).not.toHaveLength(6);
  });

  it("scores against the mock lines, frozen", () => {
    const league = buildTutorialLeague();
    expect(league.lines).toBe(STATIC_LINES);
    expect(league.seasonLabel).toBe(SEASON.label);
  });

  it("builds a fresh league every time", () => {
    const a = buildTutorialLeague();
    const b = buildTutorialLeague();
    expect(a).toEqual(b);
    expect(a.draft).not.toBe(b.draft);
  });
});

describe("tutorialTeams", () => {
  it("gives all 30 teams their mock line", () => {
    const teams = tutorialTeams();
    expect(teams).toHaveLength(30);
    for (const team of teams) expect(team.line).toBe(STATIC_LINES.values[team.id]);
  });
});
```

`src/lib/tutorial/session.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildTutorialLeague, TUTORIAL_VIEWER_ID } from "@/data/tutorial-league";
import type { DraftCommand } from "@/lib/fades";
import type { Result } from "@/lib/league/errors";
import type { League, Side, TeamId } from "@/lib/types";
import { applyTutorialCommand } from "./session";

function must(result: Result<League>): League {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function confirm(teamId: TeamId, side: Side, pickNumber: number): DraftCommand {
  return { type: "confirm", teamId, side, pickNumber };
}

describe("applyTutorialCommand", () => {
  it("records the viewer's pick exactly as the draft endpoint would, without touching the input", () => {
    const league = buildTutorialLeague();
    const next = must(applyTutorialCommand(league, TUTORIAL_VIEWER_ID, confirm("DET", "UNDER", 1)));
    expect(next.draft.picks).toEqual([{ pickNumber: 1, managerId: "m1", teamId: "DET", side: "UNDER" }]);
    expect(next.version).toBe(league.version + 1);
    expect(league.draft.picks).toEqual([]);
  });

  it("refuses what a real league refuses", () => {
    const league = buildTutorialLeague();
    expect(applyTutorialCommand(league, "m2", confirm("DET", "UNDER", 1))).toEqual({ ok: false, error: "forbidden" });
    expect(applyTutorialCommand(league, "m1", confirm("DET", "UNDER", 2))).toEqual({ ok: false, error: "stale_pick" });
    expect(applyTutorialCommand(league, "m1", { type: "fade", managerId: "m1", targetPickNumber: 1 })).toEqual({
      ok: false,
      error: "not_fading",
    });
  });

  it("allows opposite sides for different managers but never a held side or both sides for one manager", () => {
    let league = must(applyTutorialCommand(buildTutorialLeague(), "m1", confirm("DET", "OVER", 1)));
    expect(applyTutorialCommand(league, "m2", confirm("DET", "OVER", 2))).toEqual({ ok: false, error: "side_taken" });
    league = must(applyTutorialCommand(league, "m2", confirm("BOS", "OVER", 2)));
    league = must(applyTutorialCommand(league, "m3", confirm("BOS", "UNDER", 3)));
    league = must(applyTutorialCommand(league, "m4", confirm("CLE", "OVER", 4)));
    // Round 2 runs backward: m4 picks again at 5.
    expect(applyTutorialCommand(league, "m4", confirm("CLE", "UNDER", 5))).toEqual({
      ok: false,
      error: "team_already_held",
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/data/tutorial-league.test.ts src/lib/tutorial/session.test.ts`
Expected: FAIL: cannot resolve `@/config/tour`, `./tutorial-league`, `./session`.

- [ ] **Step 3: Write the implementation**

`src/config/tour.ts`:

```ts
/** The guided draft demo: the fixture league's size (the default league size) and how fast simulated actions play. */
export const TUTORIAL = {
  managerCount: 4,
  rounds: 11,
  /** Delay between simulated picks while the user watches the rest of the draft. */
  pickIntervalMs: 160,
  /** Delay between the other managers' simulated fades. */
  fadeIntervalMs: 700,
} as const;

/** Guided-tour overlay layout, in CSS pixels. */
export const TOUR = {
  /** Space between a spotlight and its callout. */
  calloutGap: 14,
  /** The callout never comes closer than this to the viewport edge. */
  viewportMargin: 16,
  /** How far a spotlight extends past its element. */
  spotlightPadding: 8,
  pointerSize: 28,
  /** Space between the pointer arrow and the element it points at. */
  pointerGap: 6,
} as const;
```

`src/data/tutorial-league.ts`:

```ts
import { SEASON } from "@/config/league";
import { TUTORIAL } from "@/config/tour";
import { STATIC_LINES } from "@/data/static-lines";
import { TEAM_IDS, TEAM_INFO } from "@/data/teams";
import { applyDraftAction, createDraftState } from "@/lib/draft";
import { withLines } from "@/lib/lines";
import type { League, Team } from "@/lib/types";

/** The guided demo's league lives in browser memory only. Stored league ids are 6 characters, so this never matches one. */
export const TUTORIAL_LEAGUE_ID = "tutorial";

/** The person taking the demo: seat 1, first on the clock. */
export const TUTORIAL_VIEWER_ID = "m1";

/** One name per seat. Every seat is claimed so nobody picks or fades for an open seat. */
export const TUTORIAL_MANAGER_NAMES: readonly string[] = ["You", "Avery", "Jordan", "Riley"];

/** A live 4 × 11 draft on the mock lines with an empty board. Writable (isDemo false) so the real rules run in memory. */
export function buildTutorialLeague(): League {
  const seatOrder = Array.from({ length: TUTORIAL.managerCount }, (_, seat) => `m${seat + 1}`);
  const started = applyDraftAction(createDraftState(seatOrder, TUTORIAL.rounds), { type: "start" }, TEAM_IDS);
  if (!started.ok) throw new Error(started.error);
  return {
    id: TUTORIAL_LEAGUE_ID,
    name: "National Balla Association",
    seasonLabel: SEASON.label,
    isDemo: false,
    commissionerId: TUTORIAL_VIEWER_ID,
    version: 1,
    managers: seatOrder.map((id, seat) => ({ id, seat, displayName: TUTORIAL_MANAGER_NAMES[seat] })),
    draft: started.state,
    fades: [],
    lineOverrides: {},
    lines: STATIC_LINES,
  };
}

/** The teams the demo drafts and scores: mock records with the mock lines. */
export function tutorialTeams(): Team[] {
  return withLines(TEAM_INFO, STATIC_LINES);
}
```

`src/lib/tutorial/session.ts`:

```ts
import { TEAM_IDS } from "@/data/teams";
import type { DraftCommand } from "@/lib/fades";
import { decideDraftAction } from "@/lib/league/commands";
import type { Result } from "@/lib/league/errors";
import type { League } from "@/lib/types";

/**
 * Applies one command to the demo league exactly as the draft endpoint decides it (decideDraftAction: permissions, turn,
 * pick number, side and team rules, fade rules), then bumps the version as a save would. Nothing is stored or sent.
 */
export function applyTutorialCommand(league: League, actorId: string, command: DraftCommand): Result<League> {
  const result = decideDraftAction(league, actorId, command, TEAM_IDS, null);
  return result.ok ? { ok: true, value: { ...result.value, version: league.version + 1 } } : result;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/data/tutorial-league.test.ts src/lib/tutorial/session.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Full checks and commit**

Run: `npm test && npm run lint && npm run typecheck`

```bash
git add src/config/tour.ts src/data/tutorial-league.ts src/data/tutorial-league.test.ts src/lib/tutorial/session.ts src/lib/tutorial/session.test.ts
git commit -m "feat: in-memory tutorial league that runs the real draft decisions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Deterministic simulation

**Model:** haiku (complete code below).

**Files:**
- Create: `src/lib/tutorial/strategy.ts`, `src/lib/tutorial/strategy.test.ts`
- Create: `src/lib/tutorial/simulation.ts`, `src/lib/tutorial/simulation.test.ts`

**Interfaces:**
- Consumes: Task 1 (`applyTutorialCommand`, `buildTutorialLeague`, `tutorialTeams`, `TUTORIAL_VIEWER_ID`, `TUTORIAL`); `findPickForSide`, `holdsTeam`, `currentPickNumber`, `managerOnTheClock`, `seatForPick`, `applyDraftAction` (`src/lib/draft.ts`); `fadeTargets`, `fadeFor` (`src/lib/fades.ts`); `indexTeams` (`src/lib/lines.ts`).
- Produces:
  - `sideEdge(team: Pick<Team, "prevWins" | "line">, side: Side): number`
  - `eligibleSides(draft: DraftState, managerId: string, teams: readonly Team[]): SideRef[]` (teams sorted by id, Over before Under)
  - `chooseSide(draft: DraftState, managerId: string, teams: readonly Team[]): SideRef | null`
  - `chooseFadeTarget(draft: DraftState, managerId: string, teams: readonly Team[]): number | null`
  - `type SimulationKind = "draft" | "fades"`, `interface SimulatedCommand { actorId: string; command: DraftCommand }`
  - `nextSimulatedPick(league: League, teams: readonly Team[]): SimulatedCommand | null`
  - `nextSimulatedFade(league: League, teams: readonly Team[], except: string): SimulatedCommand | null`
  - `simulateStep(league: League, teams: readonly Team[], kind: SimulationKind): League` (returns the same object when there is nothing to simulate)
  - `simulateAll(league: League, teams: readonly Team[], kind: SimulationKind): League`

- [ ] **Step 1: Write the failing strategy tests**

`src/lib/tutorial/strategy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildTutorialLeague, tutorialTeams } from "@/data/tutorial-league";
import { TEAM_IDS } from "@/data/teams";
import { applyDraftAction } from "@/lib/draft";
import { indexTeams } from "@/lib/lines";
import type { DraftState, Side, TeamId } from "@/lib/types";
import { chooseFadeTarget, chooseSide, eligibleSides, sideEdge } from "./strategy";

const teams = tutorialTeams();
const byId = indexTeams(teams);
const fresh = () => buildTutorialLeague().draft;

function pick(draft: DraftState, teamId: TeamId, side: Side): DraftState {
  const result = applyDraftAction(draft, { type: "confirm", teamId, side, pickNumber: draft.picks.length + 1 }, TEAM_IDS);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

describe("sideEdge", () => {
  it("is last season's wins against the line, signed for the side", () => {
    expect(sideEdge({ prevWins: 50, line: 46.5 }, "OVER")).toBe(3.5);
    expect(sideEdge({ prevWins: 50, line: 46.5 }, "UNDER")).toBe(-3.5);
  });
});

describe("eligibleSides", () => {
  it("offers every side on an empty board", () => {
    expect(eligibleSides(fresh(), "m1", teams)).toHaveLength(60);
  });

  it("drops held sides for everyone and the other side for the holder only", () => {
    const draft = pick(fresh(), "DET", "OVER");
    const forHolder = eligibleSides(draft, "m1", teams);
    const forOther = eligibleSides(draft, "m2", teams);
    expect(forHolder).toHaveLength(58);
    expect(forHolder.some((side) => side.teamId === "DET")).toBe(false);
    expect(forOther).toHaveLength(59);
    expect(forOther).toContainEqual({ teamId: "DET", side: "UNDER" });
  });
});

describe("chooseSide", () => {
  it("takes an eligible side with the biggest edge", () => {
    const draft = pick(fresh(), "DET", "OVER");
    const choice = chooseSide(draft, "m2", teams)!;
    const eligible = eligibleSides(draft, "m2", teams);
    expect(eligible).toContainEqual(choice);
    for (const other of eligible) {
      expect(sideEdge(byId[choice.teamId], choice.side)).toBeGreaterThanOrEqual(sideEdge(byId[other.teamId], other.side));
    }
  });

  it("adapts to the board: never the side just taken, never the other side of a held team", () => {
    const first = chooseSide(fresh(), "m1", teams)!;
    const draft = pick(fresh(), first.teamId, first.side);
    expect(chooseSide(draft, "m2", teams)).not.toEqual(first);
    expect(chooseSide(draft, "m1", teams)!.teamId).not.toBe(first.teamId);
  });

  it("breaks ties by team id, then the Over", () => {
    const base = teams.find((team) => team.id === "DET")!;
    const twins = [
      { ...base, id: "ZZZ", prevWins: 50, line: 45.5 },
      { ...base, id: "AAA", prevWins: 50, line: 45.5 },
    ];
    expect(chooseSide(fresh(), "m1", twins)).toEqual({ teamId: "AAA", side: "OVER" });
  });

  it("returns null when nothing is eligible", () => {
    const draft = pick(fresh(), "DET", "OVER");
    expect(chooseSide(draft, "m1", teams.filter((team) => team.id === "DET"))).toBeNull();
  });
});

describe("chooseFadeTarget", () => {
  it("fades the weakest opponent pick, never its own", () => {
    let draft = fresh();
    for (const [teamId, side] of [["OKC", "OVER"], ["WAS", "OVER"], ["BKN", "UNDER"], ["CLE", "OVER"]] as const) {
      draft = pick(draft, teamId, side);
    }
    const target = chooseFadeTarget(draft, "m1", teams)!;
    const chosen = draft.picks.find((candidate) => candidate.pickNumber === target)!;
    expect(chosen.managerId).not.toBe("m1");
    for (const other of draft.picks.filter((candidate) => candidate.managerId !== "m1")) {
      expect(sideEdge(byId[chosen.teamId], chosen.side)).toBeLessThanOrEqual(sideEdge(byId[other.teamId], other.side));
    }
  });

  it("returns null without opponent picks", () => {
    expect(chooseFadeTarget(fresh(), "m1", teams)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/tutorial/strategy.test.ts`
Expected: FAIL: cannot resolve `./strategy`.

- [ ] **Step 3: Implement the strategy**

`src/lib/tutorial/strategy.ts`:

```ts
import { findPickForSide, holdsTeam } from "@/lib/draft";
import type { SideRef } from "@/lib/draft-filters";
import { fadeTargets } from "@/lib/fades";
import { indexTeams } from "@/lib/lines";
import type { DraftPick, DraftState, Side, Team } from "@/lib/types";

// How the guided demo's simulated managers choose. Deterministic: the same board always gives the same choice. They
// only ever choose among sides and picks the real rules allow; the rules themselves still decide every command.

const SIDE_ORDER: readonly Side[] = ["OVER", "UNDER"];

/** How far a side looks ahead of its line on last season's wins, signed for the side. */
export function sideEdge(team: Pick<Team, "prevWins" | "line">, side: Side): number {
  return side === "OVER" ? team.prevWins - team.line : team.line - team.prevWins;
}

/** Sides the manager may draft (nobody holds them, the manager holds neither side of the team), by team id, Over first. */
export function eligibleSides(draft: DraftState, managerId: string, teams: readonly Team[]): SideRef[] {
  return [...teams]
    .sort((a, b) => a.id.localeCompare(b.id))
    .flatMap((team) =>
      holdsTeam(draft, managerId, team.id)
        ? []
        : SIDE_ORDER.filter((side) => !findPickForSide(draft, team.id, side)).map((side) => ({ teamId: team.id, side })),
    );
}

/** The eligible side with the biggest edge; ties go to the earlier team id, then the Over. Null when none is eligible. */
export function chooseSide(draft: DraftState, managerId: string, teams: readonly Team[]): SideRef | null {
  const byId = indexTeams(teams);
  let best: SideRef | null = null;
  let bestEdge = -Infinity;
  for (const choice of eligibleSides(draft, managerId, teams)) {
    const edge = sideEdge(byId[choice.teamId], choice.side);
    if (edge > bestEdge) {
      best = choice;
      bestEdge = edge;
    }
  }
  return best;
}

/** The opponent pick with the smallest edge (the likeliest miss); ties go to the earlier pick. Null without targets. */
export function chooseFadeTarget(draft: DraftState, managerId: string, teams: readonly Team[]): number | null {
  const byId = indexTeams(teams);
  let best: DraftPick | null = null;
  let bestEdge = Infinity;
  for (const pick of fadeTargets(draft, managerId)) {
    const edge = sideEdge(byId[pick.teamId], pick.side);
    if (edge < bestEdge) {
      best = pick;
      bestEdge = edge;
    }
  }
  return best?.pickNumber ?? null;
}
```

- [ ] **Step 4: Run strategy tests**

Run: `npx vitest run src/lib/tutorial/strategy.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Write the failing simulation tests**

`src/lib/tutorial/simulation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { TUTORIAL } from "@/config/tour";
import { buildTutorialLeague, TUTORIAL_VIEWER_ID, tutorialTeams } from "@/data/tutorial-league";
import { seatForPick } from "@/lib/draft";
import { fadeFor, fadeTargets } from "@/lib/fades";
import type { Result } from "@/lib/league/errors";
import type { League, Side, TeamId } from "@/lib/types";
import { applyTutorialCommand } from "./session";
import { simulateAll, simulateStep } from "./simulation";
import { eligibleSides } from "./strategy";

const teams = tutorialTeams();
const TOTAL = TUTORIAL.managerCount * TUTORIAL.rounds;

function must(result: Result<League>): League {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

/** The demo right after the viewer's own first pick. */
function opened(teamId: TeamId, side: Side): League {
  return must(
    applyTutorialCommand(buildTutorialLeague(), TUTORIAL_VIEWER_ID, { type: "confirm", teamId, side, pickNumber: 1 }),
  );
}

function fade(league: League, managerId: string, targetPickNumber: number): Result<League> {
  return applyTutorialCommand(league, managerId, { type: "fade", managerId, targetPickNumber });
}

/** Every opening the viewer could make: all 60 sides. */
const OPENINGS = eligibleSides(buildTutorialLeague().draft, TUTORIAL_VIEWER_ID, teams);

function expectValidDraft(league: League) {
  const { draft } = league;
  expect(draft.status).toBe("fades");
  expect(draft.picks).toHaveLength(TOTAL);
  expect(draft.voidedPicks).toEqual([]);
  expect(draft.blockedPick).toBeNull();
  const sides = new Set<string>();
  const holdings = new Set<string>();
  draft.picks.forEach((pick, index) => {
    expect(pick.pickNumber).toBe(index + 1);
    expect(pick.managerId).toBe(draft.seatOrder[seatForPick(pick.pickNumber, draft.seatOrder.length)]);
    const side = `${pick.teamId} ${pick.side}`;
    const holding = `${pick.managerId} ${pick.teamId}`;
    expect(sides.has(side)).toBe(false);
    expect(holdings.has(holding)).toBe(false);
    sides.add(side);
    holdings.add(holding);
  });
  for (const managerId of draft.seatOrder) {
    expect(draft.picks.filter((pick) => pick.managerId === managerId)).toHaveLength(TUTORIAL.rounds);
  }
}

describe("simulating the draft", () => {
  it("finishes a valid 4 × 11 draft after every legal opening and keeps the viewer's pick", () => {
    expect(OPENINGS).toHaveLength(60);
    for (const opening of OPENINGS) {
      const league = simulateAll(opened(opening.teamId, opening.side), teams, "draft");
      expectValidDraft(league);
      expect(league.draft.picks[0]).toEqual({ pickNumber: 1, managerId: TUTORIAL_VIEWER_ID, ...opening });
    }
  });

  it("is deterministic", () => {
    expect(simulateAll(opened("DET", "UNDER"), teams, "draft")).toEqual(simulateAll(opened("DET", "UNDER"), teams, "draft"));
  });

  it("adapts to the opening", () => {
    const drafts = new Set(
      OPENINGS.map((opening) =>
        JSON.stringify(simulateAll(opened(opening.teamId, opening.side), teams, "draft").draft.picks.slice(1)),
      ),
    );
    expect(drafts.size).toBeGreaterThan(1);
  });

  it("ends the same whether watched pick by pick or skipped", () => {
    const start = opened("DET", "UNDER");
    let watched = start;
    for (let step = 0; step < 7; step++) watched = simulateStep(watched, teams, "draft");
    expect(watched.draft.picks).toHaveLength(8);
    expect(simulateAll(watched, teams, "draft")).toEqual(simulateAll(start, teams, "draft"));
  });

  it("lets different managers hold opposite sides of a team", () => {
    const { picks } = simulateAll(opened("DET", "UNDER"), teams, "draft").draft;
    const shared = picks.filter((pick) => picks.some((other) => other.teamId === pick.teamId && other.side !== pick.side));
    expect(shared.length).toBeGreaterThan(0);
  });

  it("does nothing outside a live draft", () => {
    const drafted = simulateAll(opened("DET", "UNDER"), teams, "draft");
    expect(simulateStep(drafted, teams, "draft")).toBe(drafted);
  });
});

describe("simulating fades", () => {
  it("completes the draft after any fade the viewer chooses, after any opening", () => {
    for (const opening of OPENINGS) {
      const drafted = simulateAll(opened(opening.teamId, opening.side), teams, "draft");
      for (const target of fadeTargets(drafted.draft, TUTORIAL_VIEWER_ID)) {
        const done = simulateAll(must(fade(drafted, TUTORIAL_VIEWER_ID, target.pickNumber)), teams, "fades");
        expect(done.draft.status).toBe("complete");
        expect(done.fades).toHaveLength(TUTORIAL.managerCount);
        expect(fadeFor(done.fades, TUTORIAL_VIEWER_ID)?.targetPickNumber).toBe(target.pickNumber);
        for (const locked of done.fades) {
          const faded = done.draft.picks.find((pick) => pick.pickNumber === locked.targetPickNumber)!;
          expect(faded.managerId).not.toBe(locked.managerId);
        }
      }
    }
  });

  it("never fades for the viewer, and accepts the viewer's fade last (no order dependency)", () => {
    const drafted = simulateAll(opened("DET", "UNDER"), teams, "draft");
    const others = simulateAll(drafted, teams, "fades");
    expect(others.draft.status).toBe("fades");
    expect(others.fades).toHaveLength(TUTORIAL.managerCount - 1);
    expect(fadeFor(others.fades, TUTORIAL_VIEWER_ID)).toBeUndefined();
    const target = fadeTargets(others.draft, TUTORIAL_VIEWER_ID)[0];
    expect(must(fade(others, TUTORIAL_VIEWER_ID, target.pickNumber)).draft.status).toBe("complete");
  });

  it("applies the real fade rules to the viewer", () => {
    const drafted = simulateAll(opened("DET", "UNDER"), teams, "draft");
    expect(fade(drafted, TUTORIAL_VIEWER_ID, 1)).toEqual({ ok: false, error: "own_pick" });
    const locked = must(fade(drafted, TUTORIAL_VIEWER_ID, 2));
    expect(fade(locked, TUTORIAL_VIEWER_ID, 3)).toEqual({ ok: false, error: "fade_locked" });
  });
});
```

- [ ] **Step 6: Run to verify failure**

Run: `npx vitest run src/lib/tutorial/simulation.test.ts`
Expected: FAIL: cannot resolve `./simulation`.

- [ ] **Step 7: Implement the simulation**

`src/lib/tutorial/simulation.ts`:

```ts
import { TUTORIAL_VIEWER_ID } from "@/data/tutorial-league";
import { currentPickNumber, managerOnTheClock } from "@/lib/draft";
import { fadeFor, type DraftCommand } from "@/lib/fades";
import type { League, Team } from "@/lib/types";
import { applyTutorialCommand } from "./session";
import { chooseFadeTarget, chooseSide } from "./strategy";

// The guided demo's simulated managers. Each step is one command by the manager whose turn or fade it is, decided by
// the same rules as a real league (applyTutorialCommand). Watching step by step and skipping run the same steps.

export type SimulationKind = "draft" | "fades";

export interface SimulatedCommand {
  actorId: string;
  command: DraftCommand;
}

/** The pick the manager on the clock makes (the viewer's later picks included). Null unless a pick is due. */
export function nextSimulatedPick(league: League, teams: readonly Team[]): SimulatedCommand | null {
  const { draft } = league;
  const pickNumber = currentPickNumber(draft);
  const managerId = managerOnTheClock(draft);
  if (draft.status !== "live" || pickNumber === null || managerId === null) return null;
  const choice = chooseSide(draft, managerId, teams);
  return choice && { actorId: managerId, command: { type: "confirm", ...choice, pickNumber } };
}

/** The next fade by a manager other than `except` who has none yet, in seat order. Null when there is none to make. */
export function nextSimulatedFade(league: League, teams: readonly Team[], except: string): SimulatedCommand | null {
  if (league.draft.status !== "fades") return null;
  const manager = league.managers.find((candidate) => candidate.id !== except && !fadeFor(league.fades, candidate.id));
  if (!manager) return null;
  const target = chooseFadeTarget(league.draft, manager.id, teams);
  return target === null
    ? null
    : { actorId: manager.id, command: { type: "fade", managerId: manager.id, targetPickNumber: target } };
}

/** Applies one simulated command; returns the same league when nothing is left to simulate. */
export function simulateStep(league: League, teams: readonly Team[], kind: SimulationKind): League {
  const next = kind === "draft" ? nextSimulatedPick(league, teams) : nextSimulatedFade(league, teams, TUTORIAL_VIEWER_ID);
  if (!next) return league;
  const result = applyTutorialCommand(league, next.actorId, next.command);
  // Unreachable: simulated choices come from the eligible sides and targets (see simulation.test.ts).
  if (!result.ok) throw new Error(`simulated ${next.command.type} refused: ${result.error}`);
  return result.value;
}

/** Simulates until nothing is left: the regular draft for "draft", every fade but the viewer's for "fades". */
export function simulateAll(league: League, teams: readonly Team[], kind: SimulationKind): League {
  let current = league;
  for (let next = simulateStep(current, teams, kind); next !== current; next = simulateStep(current, teams, kind)) {
    current = next;
  }
  return current;
}
```

- [ ] **Step 8: Run all tutorial tests**

Run: `npx vitest run src/lib/tutorial`
Expected: PASS. (The exhaustive fade test runs ≈ 2,000 short simulations; it should finish in a few seconds. If it exceeds 5 s, keep all 60 openings but fade only the first, middle and last target per opening.)

- [ ] **Step 9: Full checks and commit**

Run: `npm test && npm run lint && npm run typecheck`

```bash
git add src/lib/tutorial/strategy.ts src/lib/tutorial/strategy.test.ts src/lib/tutorial/simulation.ts src/lib/tutorial/simulation.test.ts
git commit -m "feat: deterministic draft and fade simulation for the guided demo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Tutorial steps, snapshot and handoff

**Model:** haiku (complete code below).

**Files:**
- Create: `src/lib/tour/targets.ts`
- Create: `src/lib/tutorial/steps.ts`, `src/lib/tutorial/steps.test.ts`
- Create: `src/lib/tutorial/snapshot.ts`, `src/lib/tutorial/snapshot.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2; `SCORING` (`src/config/scoring.ts`); `fadeFor`; `picksForManager`, `currentPickNumber`, `managerOnTheClock`.
- Produces:
  - `TOUR_TARGET_IDS`, `type TourTargetId`, `tourTarget(id): { "data-tour": TourTargetId }`, `interface TourStep { title; body; details?: { summary: string; items: readonly string[] }; spotlight: readonly TourTargetId[]; interactive: readonly TourTargetId[]; pointAt?: TourTargetId; continueLabel?: string }` from `@/lib/tour/targets`
  - `type TutorialStepId = "welcome" | "over-under" | "confirm-pick" | "snake" | "simulate" | "fades" | "confirm-fade" | "fade-sim" | "complete"`, `TUTORIAL_STEP_ORDER`, `TUTORIAL_STEP_COUNT = 8`, `interface TutorialStep extends TourStep { number: number; advance: "continue" | "action" | "automatic" | "end" }`, `TUTORIAL_STEPS: Record<TutorialStepId, TutorialStep>`, `interface TutorialProgress { welcomed: boolean; snakeExplained: boolean }`, `INITIAL_PROGRESS`, `interface TutorialFacts { league: League; hasSelection: boolean; hasFadeTarget: boolean }`, `tutorialStep(progress, facts): TutorialStepId` from `@/lib/tutorial/steps`
  - `TUTORIAL_STORAGE_KEY = "courtline.tutorial.v1"`, `interface TutorialSnapshot`, `snapshotOf(league, progress)`, `restoreTutorial(raw: unknown): { league: League; progress: TutorialProgress } | null`, `interface TutorialResult { league; teams; viewerId; openingPick: DraftPick; fade: Fade }`, `tutorialResult(league): TutorialResult | null` from `@/lib/tutorial/snapshot`

- [ ] **Step 1: Write the target ids (no test of its own; typed and used by the tests below)**

`src/lib/tour/targets.ts`:

```ts
// Stable names for the parts of the app a guided tour can spotlight. Components tag their root element with
// tourTarget(id); the overlay finds them by that attribute. Ids name what the area is, never how it is styled.

export const TOUR_TARGET_IDS = [
  "draft-status",
  "available-picks",
  "side-button",
  "selection-panel",
  "selection-bar",
  "confirm-pick",
  "draft-board",
  "fade-targets",
  "fade-target",
  "fade-confirm",
  "fade-bar",
  "confirm-fade",
  "fade-status",
] as const;

export type TourTargetId = (typeof TOUR_TARGET_IDS)[number];

export function tourTarget(id: TourTargetId): { "data-tour": TourTargetId } {
  return { "data-tour": id };
}

/** One step of a guided tour. */
export interface TourStep {
  title: string;
  /** The short explanation. */
  body: string;
  /** More rules, folded away so they never block the step. */
  details?: { summary: string; items: readonly string[] };
  /** Areas lit up, in priority order: the first one on screen anchors the callout. */
  spotlight: readonly TourTargetId[];
  /** Areas the user may use. Everything else ignores pointer and keyboard input while the step is shown. */
  interactive: readonly TourTargetId[];
  /** Where the animated arrow points: the first matching element on screen. */
  pointAt?: TourTargetId;
  /** Informational steps advance with this button; action steps have none. */
  continueLabel?: string;
}
```

- [ ] **Step 2: Write the failing step tests**

`src/lib/tutorial/steps.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SCORING } from "@/config/scoring";
import { buildTutorialLeague, TUTORIAL_VIEWER_ID, tutorialTeams } from "@/data/tutorial-league";
import type { Result } from "@/lib/league/errors";
import type { League } from "@/lib/types";
import { applyTutorialCommand } from "./session";
import { simulateAll } from "./simulation";
import {
  INITIAL_PROGRESS,
  TUTORIAL_STEP_COUNT,
  TUTORIAL_STEP_ORDER,
  TUTORIAL_STEPS,
  tutorialStep,
  type TutorialFacts,
} from "./steps";

const teams = tutorialTeams();

function must(result: Result<League>): League {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

const facts = (league: League, extra: Partial<TutorialFacts> = {}): TutorialFacts => ({
  league,
  hasSelection: false,
  hasFadeTarget: false,
  ...extra,
});

describe("tutorialStep", () => {
  it("walks the whole tutorial, advancing only on real state changes", () => {
    let league = buildTutorialLeague();
    let progress = INITIAL_PROGRESS;
    expect(tutorialStep(progress, facts(league))).toBe("welcome");
    expect(tutorialStep(progress, facts(league, { hasSelection: true }))).toBe("welcome");

    progress = { ...progress, welcomed: true };
    expect(tutorialStep(progress, facts(league))).toBe("over-under");
    expect(tutorialStep(progress, facts(league, { hasSelection: true }))).toBe("confirm-pick");

    league = must(
      applyTutorialCommand(league, TUTORIAL_VIEWER_ID, { type: "confirm", teamId: "DET", side: "UNDER", pickNumber: 1 }),
    );
    expect(tutorialStep(progress, facts(league))).toBe("snake");

    progress = { ...progress, snakeExplained: true };
    expect(tutorialStep(progress, facts(league))).toBe("simulate");

    league = simulateAll(league, teams, "draft");
    expect(tutorialStep(progress, facts(league))).toBe("fades");
    expect(tutorialStep(progress, facts(league, { hasFadeTarget: true }))).toBe("confirm-fade");

    league = must(
      applyTutorialCommand(league, TUTORIAL_VIEWER_ID, { type: "fade", managerId: TUTORIAL_VIEWER_ID, targetPickNumber: 2 }),
    );
    expect(tutorialStep(progress, facts(league))).toBe("fade-sim");

    league = simulateAll(league, teams, "fades");
    expect(tutorialStep(progress, facts(league))).toBe("complete");
  });
});

describe("TUTORIAL_STEPS", () => {
  it("numbers the steps 1 to 8 in tutorial order", () => {
    expect(TUTORIAL_STEP_ORDER.map((id) => TUTORIAL_STEPS[id].number)).toEqual([1, 2, 3, 4, 5, 6, 7, 7, 8]);
    expect(TUTORIAL_STEP_COUNT).toBe(8);
  });

  it("gives every step a spotlight, a Continue to informational steps and an area to act in to action steps", () => {
    for (const id of TUTORIAL_STEP_ORDER) {
      const step = TUTORIAL_STEPS[id];
      expect(step.spotlight.length).toBeGreaterThan(0);
      expect(step.continueLabel !== undefined).toBe(step.advance === "continue");
      if (step.advance === "action") expect(step.interactive.length).toBeGreaterThan(0);
    }
  });

  it("takes fade points from the scoring config", () => {
    expect(TUTORIAL_STEPS.fades.body).toContain(`you earn ${SCORING.fadeHit} points`);
    expect(TUTORIAL_STEPS.fades.body).toContain(`you earn ${SCORING.fadeMiss}.`);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/lib/tutorial/steps.test.ts`
Expected: FAIL: cannot resolve `./steps`.

- [ ] **Step 4: Implement the steps**

`src/lib/tutorial/steps.ts`:

```ts
import { SCORING } from "@/config/scoring";
import { TUTORIAL_VIEWER_ID } from "@/data/tutorial-league";
import { picksForManager } from "@/lib/draft";
import { fadeFor } from "@/lib/fades";
import type { TourStep } from "@/lib/tour/targets";
import type { League } from "@/lib/types";

// The guided draft. The step shown is derived from the demo league itself (a confirmed pick, a locked fade) plus two
// "seen" flags for the informational steps, so it only ever moves on a real state change, and going back (clearing a
// selection) needs no special handling.

export type TutorialStepId =
  | "welcome"
  | "over-under"
  | "confirm-pick"
  | "snake"
  | "simulate"
  | "fades"
  | "confirm-fade"
  | "fade-sim"
  | "complete";

export const TUTORIAL_STEP_ORDER: readonly TutorialStepId[] = [
  "welcome",
  "over-under",
  "confirm-pick",
  "snake",
  "simulate",
  "fades",
  "confirm-fade",
  "fade-sim",
  "complete",
];

/** Steps as the user counts them; the other managers' fades are part of step 7. */
export const TUTORIAL_STEP_COUNT = 8;

export interface TutorialStep extends TourStep {
  number: number;
  /** continue: a button; action: the user's own successful action; automatic: simulation; end: the last step. */
  advance: "continue" | "action" | "automatic" | "end";
}

export interface TutorialProgress {
  welcomed: boolean;
  snakeExplained: boolean;
}

export const INITIAL_PROGRESS: TutorialProgress = { welcomed: false, snakeExplained: false };

export interface TutorialFacts {
  league: League;
  /** The draft room shows an eligible selection. */
  hasSelection: boolean;
  /** The fade panel has a target chosen. */
  hasFadeTarget: boolean;
}

export function tutorialStep(progress: TutorialProgress, facts: TutorialFacts): TutorialStepId {
  const { draft, fades } = facts.league;
  if (draft.status === "complete") return "complete";
  if (draft.status === "fades") {
    if (fadeFor(fades, TUTORIAL_VIEWER_ID)) return "fade-sim";
    return facts.hasFadeTarget ? "confirm-fade" : "fades";
  }
  if (!progress.welcomed) return "welcome";
  if (picksForManager(draft, TUTORIAL_VIEWER_ID).length === 0) return facts.hasSelection ? "confirm-pick" : "over-under";
  return progress.snakeExplained ? "simulate" : "snake";
}

export const TUTORIAL_STEPS: Record<TutorialStepId, TutorialStep> = {
  welcome: {
    number: 1,
    advance: "continue",
    title: "Welcome to your draft",
    body: "Welcome to your draft! You'll compete with other managers to predict NBA teams' season win totals. Let's make your first pick.",
    spotlight: ["draft-status"],
    interactive: [],
    continueLabel: "Continue",
  },
  "over-under": {
    number: 2,
    advance: "action",
    title: "Over or Under",
    body: "Each NBA team has a projected win total called its line. Draft OVER if you think they'll finish above it, or UNDER if you think they'll finish below it. Choose any team and side!",
    details: {
      summary: "How lines work",
      items: [
        "Lines freeze when the draft starts and stay locked all season.",
        "Over 41.5 needs at least 42 wins. Under 41.5 needs 41 wins or fewer.",
        "Different managers can own opposite sides of the same team.",
        "You can't own both sides of one team.",
      ],
    },
    spotlight: ["available-picks"],
    interactive: ["available-picks"],
    pointAt: "side-button",
  },
  "confirm-pick": {
    number: 3,
    advance: "action",
    title: "Confirm your pick",
    body: "This is your pick! Check the team, direction, and locked win total. When you're ready, confirm it.",
    spotlight: ["selection-bar", "selection-panel"],
    interactive: ["selection-bar", "selection-panel", "available-picks"],
    pointAt: "confirm-pick",
  },
  snake: {
    number: 4,
    advance: "continue",
    title: "A snake draft",
    body: "Courtline uses a snake draft. Everyone picks once per round, but the order reverses each round. Your next pick comes after the other managers take their turns.",
    spotlight: ["draft-board"],
    interactive: ["draft-board"],
    continueLabel: "Watch the draft",
  },
  simulate: {
    number: 5,
    advance: "automatic",
    title: "The rest of the draft",
    body: "Let's fast-forward through the rest of the draft. We'll make the remaining picks for every manager, including you.",
    spotlight: ["draft-board", "draft-status"],
    interactive: ["draft-board"],
  },
  fades: {
    number: 6,
    advance: "action",
    title: "Time to fade",
    body: `Now it's time to fade! A fade is a bet against another manager's pick. If their pick misses, you earn ${SCORING.fadeHit} points. If it hits, you earn ${SCORING.fadeMiss}. Choose any eligible pick to fade.`,
    details: {
      summary: "Fade rules",
      items: [
        "You can't fade your own pick.",
        "Several managers can fade the same pick.",
        `A fade earns a flat +${SCORING.fadeHit} or ${SCORING.fadeMiss}, with no margin bonus.`,
        `If the faded pick pushes (wins land exactly on the line), the fade earns ${SCORING.fadeMiss}.`,
      ],
    },
    spotlight: ["fade-targets"],
    interactive: ["fade-targets"],
    pointAt: "fade-target",
  },
  "confirm-fade": {
    number: 7,
    advance: "action",
    title: "Confirm your fade",
    body: "You're betting that this manager's pick will be wrong. Confirm your fade to finish your draft!",
    spotlight: ["fade-bar", "fade-confirm"],
    interactive: ["fade-bar", "fade-confirm", "fade-targets"],
    pointAt: "confirm-fade",
  },
  "fade-sim": {
    number: 7,
    advance: "automatic",
    title: "The other fades",
    body: "Your fade is locked. The other managers are choosing theirs, in any order.",
    spotlight: ["fade-status"],
    interactive: [],
  },
  complete: {
    number: 8,
    advance: "end",
    title: "Draft complete",
    body: "Your draft is complete! You've built your roster and chosen a fade. Now let's see how those picks earn points throughout an NBA season.",
    spotlight: ["draft-status"],
    interactive: ["draft-status"],
  },
};
```

- [ ] **Step 5: Write the failing snapshot tests**

`src/lib/tutorial/snapshot.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildTutorialLeague, TUTORIAL_VIEWER_ID, tutorialTeams } from "@/data/tutorial-league";
import type { Result } from "@/lib/league/errors";
import type { League } from "@/lib/types";
import { applyTutorialCommand } from "./session";
import { simulateAll, simulateStep } from "./simulation";
import { restoreTutorial, snapshotOf, tutorialResult } from "./snapshot";
import { INITIAL_PROGRESS, type TutorialProgress } from "./steps";

const teams = tutorialTeams();

function must(result: Result<League>): League {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

const fresh = buildTutorialLeague();
const opened = must(
  applyTutorialCommand(fresh, TUTORIAL_VIEWER_ID, { type: "confirm", teamId: "PHI", side: "OVER", pickNumber: 1 }),
);
let midDraft = opened;
for (let step = 0; step < 9; step++) midDraft = simulateStep(midDraft, teams, "draft");
const drafted = simulateAll(opened, teams, "draft");
const faded = must(
  applyTutorialCommand(drafted, TUTORIAL_VIEWER_ID, { type: "fade", managerId: TUTORIAL_VIEWER_ID, targetPickNumber: 2 }),
);
const complete = simulateAll(faded, teams, "fades");
const seen: TutorialProgress = { welcomed: true, snakeExplained: true };

describe("snapshotOf / restoreTutorial", () => {
  it("restores the same league and progress at every stage, through JSON", () => {
    const stages: Array<[League, TutorialProgress]> = [
      [fresh, INITIAL_PROGRESS],
      [opened, { welcomed: true, snakeExplained: false }],
      [midDraft, seen],
      [drafted, seen],
      [faded, seen],
      [complete, seen],
    ];
    for (const [league, progress] of stages) {
      const stored: unknown = JSON.parse(JSON.stringify(snapshotOf(league, progress)));
      expect(restoreTutorial(stored)).toEqual({ league, progress });
    }
  });

  it("drops anything that is not a valid tutorial", () => {
    const good = snapshotOf(opened, seen);
    const invalid: unknown[] = [
      null,
      42,
      "tutorial",
      {},
      { ...good, v: 2 },
      { ...good, progress: { welcomed: "yes", snakeExplained: false } },
      { ...good, picks: [{ teamId: "PHI", side: "SIDEWAYS" }] },
      { ...good, picks: [{ teamId: "PHI", side: "OVER" }, { teamId: "PHI", side: "OVER" }] },
      { ...good, fades: [{ managerId: "m1", targetPickNumber: 1 }] },
    ];
    for (const raw of invalid) expect(restoreTutorial(raw)).toBeNull();
  });
});

describe("tutorialResult", () => {
  it("is null until the draft is complete", () => {
    expect(tutorialResult(drafted)).toBeNull();
    expect(tutorialResult(faded)).toBeNull();
  });

  it("hands the scoring walkthrough the viewer's own pick and fade", () => {
    const result = tutorialResult(complete)!;
    expect(result.viewerId).toBe(TUTORIAL_VIEWER_ID);
    expect(result.openingPick).toEqual({ pickNumber: 1, managerId: TUTORIAL_VIEWER_ID, teamId: "PHI", side: "OVER" });
    expect(result.fade).toMatchObject({ managerId: TUTORIAL_VIEWER_ID, targetPickNumber: 2 });
    expect(result.league).toBe(complete);
    expect(result.teams).toHaveLength(30);
  });
});
```

- [ ] **Step 6: Run to verify failure**

Run: `npx vitest run src/lib/tutorial/snapshot.test.ts`
Expected: FAIL: cannot resolve `./snapshot`.

- [ ] **Step 7: Implement the snapshot**

`src/lib/tutorial/snapshot.ts`:

```ts
import { buildTutorialLeague, TUTORIAL_VIEWER_ID, tutorialTeams } from "@/data/tutorial-league";
import { currentPickNumber, managerOnTheClock } from "@/lib/draft";
import { fadeFor } from "@/lib/fades";
import type { DraftPick, Fade, League, Side, Team, TeamId } from "@/lib/types";
import { applyTutorialCommand } from "./session";
import type { TutorialProgress } from "./steps";

/** Where the browser keeps this tab's demo (sessionStorage). The scoring walkthrough reads the same key. */
export const TUTORIAL_STORAGE_KEY = "courtline.tutorial.v1";

/** The demo as the commands that made it. Restoring replays them through the rules, so a bad snapshot is dropped. */
export interface TutorialSnapshot {
  v: 1;
  progress: TutorialProgress;
  /** Every pick in pick order. Each was made by the manager on the clock. */
  picks: Array<{ teamId: TeamId; side: Side }>;
  /** Every fade in the order it was locked. */
  fades: Array<{ managerId: string; targetPickNumber: number }>;
}

export function snapshotOf(league: League, progress: TutorialProgress): TutorialSnapshot {
  return {
    v: 1,
    progress,
    picks: league.draft.picks.map(({ teamId, side }) => ({ teamId, side })),
    fades: league.fades.map(({ managerId, targetPickNumber }) => ({ managerId, targetPickNumber })),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** The demo a snapshot describes, or null when it isn't one or any command breaks a rule. */
export function restoreTutorial(raw: unknown): { league: League; progress: TutorialProgress } | null {
  if (!isRecord(raw) || raw.v !== 1 || !Array.isArray(raw.picks) || !Array.isArray(raw.fades)) return null;
  const progress = raw.progress;
  if (!isRecord(progress) || typeof progress.welcomed !== "boolean" || typeof progress.snakeExplained !== "boolean") {
    return null;
  }
  let league = buildTutorialLeague();
  for (const pick of raw.picks) {
    if (!isRecord(pick) || typeof pick.teamId !== "string" || (pick.side !== "OVER" && pick.side !== "UNDER")) return null;
    const pickNumber = currentPickNumber(league.draft);
    const actorId = managerOnTheClock(league.draft);
    if (pickNumber === null || actorId === null) return null;
    const result = applyTutorialCommand(league, actorId, { type: "confirm", teamId: pick.teamId, side: pick.side, pickNumber });
    if (!result.ok) return null;
    league = result.value;
  }
  for (const fade of raw.fades) {
    if (!isRecord(fade) || typeof fade.managerId !== "string" || typeof fade.targetPickNumber !== "number") return null;
    const command = { type: "fade" as const, managerId: fade.managerId, targetPickNumber: fade.targetPickNumber };
    const result = applyTutorialCommand(league, fade.managerId, command);
    if (!result.ok) return null;
    league = result.value;
  }
  return { league, progress: { welcomed: progress.welcomed, snakeExplained: progress.snakeExplained } };
}

/** What the scoring walkthrough starts from. */
export interface TutorialResult {
  league: League;
  /** Mock records with the mock lines: demo data, to be labeled as such. */
  teams: Team[];
  viewerId: string;
  /** The pick the user chose (pick 1). */
  openingPick: DraftPick;
  /** The fade the user chose. */
  fade: Fade;
}

/** Null until the demo draft is complete. */
export function tutorialResult(league: League): TutorialResult | null {
  const fade = fadeFor(league.fades, TUTORIAL_VIEWER_ID);
  const openingPick = league.draft.picks[0];
  if (league.draft.status !== "complete" || !fade || !openingPick) return null;
  return { league, teams: tutorialTeams(), viewerId: TUTORIAL_VIEWER_ID, openingPick, fade };
}
```

- [ ] **Step 8: Run tutorial tests**

Run: `npx vitest run src/lib/tutorial`
Expected: PASS.

- [ ] **Step 9: Full checks and commit**

Run: `npm test && npm run lint && npm run typecheck`

```bash
git add src/lib/tour/targets.ts src/lib/tutorial/steps.ts src/lib/tutorial/steps.test.ts src/lib/tutorial/snapshot.ts src/lib/tutorial/snapshot.test.ts
git commit -m "feat: guided demo steps derived from league state, replayable snapshot

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Tour geometry and placement

**Model:** haiku (complete code below).

**Files:**
- Create: `src/lib/tour/geometry.ts`, `src/lib/tour/geometry.test.ts`
- Create: `src/lib/tour/placement.ts`, `src/lib/tour/placement.test.ts`

**Interfaces:**
- Consumes: `TOUR` (`src/config/tour.ts`).
- Produces: `interface Rect { top; left; width; height }`, `interface Size { width; height }`, `intersectRects(a, b): Rect | null`, `clipRect(rect, clips: readonly Rect[]): Rect | null`, `inflateRect(rect, by): Rect`, `sameRects(a: readonly Rect[], b: readonly Rect[]): boolean`; `type CalloutSide = "bottom" | "top" | "right" | "left" | "docked"`, `placeCallout(target: Rect | null, callout: Size, viewport: Size): { side; top; left }`, `placePointer(target: Rect, viewport: Size): { direction: "down" | "up"; top; left }`.

- [ ] **Step 1: Write the failing tests**

`src/lib/tour/geometry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { clipRect, inflateRect, intersectRects, sameRects } from "./geometry";

const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height });

describe("intersectRects", () => {
  it("returns the overlap, or null when the rects only touch or miss", () => {
    expect(intersectRects(rect(0, 0, 100, 100), rect(50, 60, 100, 100))).toEqual(rect(50, 60, 50, 40));
    expect(intersectRects(rect(0, 0, 100, 100), rect(100, 0, 50, 50))).toBeNull();
    expect(intersectRects(rect(0, 0, 10, 10), rect(20, 20, 5, 5))).toBeNull();
  });
});

describe("clipRect", () => {
  it("keeps the part inside every clip (scroll containers, then the viewport)", () => {
    const board = rect(300, 400, 800, 300);
    const cell = rect(900, 650, 200, 120);
    expect(clipRect(cell, [board, rect(0, 0, 1440, 900)])).toEqual(rect(900, 650, 200, 50));
    expect(clipRect(rect(0, 1000, 10, 10), [rect(0, 0, 1440, 900)])).toBeNull();
  });
});

describe("inflateRect", () => {
  it("grows on every side", () => {
    expect(inflateRect(rect(10, 20, 30, 40), 8)).toEqual(rect(2, 12, 46, 56));
  });
});

describe("sameRects", () => {
  it("compares lists rect by rect", () => {
    expect(sameRects([rect(1, 2, 3, 4)], [rect(1, 2, 3, 4)])).toBe(true);
    expect(sameRects([rect(1, 2, 3, 4)], [rect(1, 2, 3, 5)])).toBe(false);
    expect(sameRects([], [rect(1, 2, 3, 4)])).toBe(false);
  });
});
```

`src/lib/tour/placement.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { placeCallout, placePointer } from "./placement";

const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height });
const desktop = { width: 1440, height: 900 };
const phone = { width: 375, height: 812 };
const callout = { width: 352, height: 200 };

describe("placeCallout", () => {
  it("goes below the target, centered under it, when it fits", () => {
    expect(placeCallout(rect(300, 100, 800, 120), callout, desktop)).toEqual({ side: "bottom", top: 234, left: 524 });
  });

  it("goes above when there is no room below", () => {
    expect(placeCallout(rect(300, 700, 800, 150), callout, desktop)).toEqual({ side: "top", top: 486, left: 524 });
  });

  it("goes beside a target taller than the viewport", () => {
    expect(placeCallout(rect(288, 0, 700, 900), callout, desktop)).toEqual({ side: "right", top: 350, left: 1002 });
  });

  it("docks to the bottom edge when nothing fits beside it (full-width section on a phone)", () => {
    expect(placeCallout(rect(0, 0, 375, 812), { width: 343, height: 220 }, phone)).toEqual({
      side: "docked",
      top: 576,
      left: 16,
    });
  });

  it("docks bottom-right on a wide screen when the target is not on screen", () => {
    expect(placeCallout(null, callout, desktop)).toEqual({ side: "docked", top: 684, left: 1072 });
  });

  it("stays inside the viewport margins", () => {
    expect(placeCallout(rect(0, 100, 40, 40), callout, desktop)).toEqual({ side: "bottom", top: 154, left: 16 });
  });
});

describe("placePointer", () => {
  it("sits above the target pointing down, or below it pointing up near the top edge", () => {
    expect(placePointer(rect(100, 200, 80, 40), desktop)).toEqual({ direction: "down", top: 166, left: 126 });
    expect(placePointer(rect(100, 10, 80, 40), desktop)).toEqual({ direction: "up", top: 56, left: 126 });
  });

  it("stays inside the viewport horizontally", () => {
    expect(placePointer(rect(1430, 200, 10, 40), desktop).left).toBe(1412);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/tour`
Expected: FAIL: cannot resolve `./geometry`, `./placement`.

- [ ] **Step 3: Implement**

`src/lib/tour/geometry.ts`:

```ts
/** A box in viewport (CSS pixel) coordinates, like getBoundingClientRect. */
export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export function intersectRects(a: Rect, b: Rect): Rect | null {
  const top = Math.max(a.top, b.top);
  const left = Math.max(a.left, b.left);
  const bottom = Math.min(a.top + a.height, b.top + b.height);
  const right = Math.min(a.left + a.width, b.left + b.width);
  return bottom > top && right > left ? { top, left, width: right - left, height: bottom - top } : null;
}

/** The part of `rect` inside every clip, or null when none of it is. */
export function clipRect(rect: Rect, clips: readonly Rect[]): Rect | null {
  return clips.reduce<Rect | null>((current, clip) => current && intersectRects(current, clip), rect);
}

export function inflateRect(rect: Rect, by: number): Rect {
  return { top: rect.top - by, left: rect.left - by, width: rect.width + by * 2, height: rect.height + by * 2 };
}

export function sameRects(a: readonly Rect[], b: readonly Rect[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (rect, index) =>
        rect.top === b[index].top &&
        rect.left === b[index].left &&
        rect.width === b[index].width &&
        rect.height === b[index].height,
    )
  );
}
```

`src/lib/tour/placement.ts`:

```ts
import { TOUR } from "@/config/tour";
import type { Rect, Size } from "./geometry";

export type CalloutSide = "bottom" | "top" | "right" | "left" | "docked";

export interface CalloutPlacement {
  side: CalloutSide;
  top: number;
  left: number;
}

/** Wide enough to dock the callout in the bottom-right corner instead of across the bottom. */
const DOCK_RIGHT_MIN_WIDTH = 768;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * Where the callout goes: below the spotlight, above it, right of it, then left of it, the first that fits inside the
 * viewport margins without covering the spotlight. Otherwise (the spotlight fills the screen, or is off screen) it docks
 * to the bottom edge, where the tour lets the user fold it away.
 */
export function placeCallout(target: Rect | null, callout: Size, viewport: Size): CalloutPlacement {
  const { calloutGap: gap, viewportMargin: margin } = TOUR;
  const maxLeft = viewport.width - margin - callout.width;
  const maxTop = viewport.height - margin - callout.height;
  if (target) {
    const centeredLeft = clamp(target.left + target.width / 2 - callout.width / 2, margin, maxLeft);
    const centeredTop = clamp(target.top + target.height / 2 - callout.height / 2, margin, maxTop);
    const below = target.top + target.height + gap;
    if (below <= maxTop) return { side: "bottom", top: below, left: centeredLeft };
    const above = target.top - gap - callout.height;
    if (above >= margin) return { side: "top", top: above, left: centeredLeft };
    const right = target.left + target.width + gap;
    if (right <= maxLeft) return { side: "right", top: centeredTop, left: right };
    const left = target.left - gap - callout.width;
    if (left >= margin) return { side: "left", top: centeredTop, left };
  }
  const left = viewport.width >= DOCK_RIGHT_MIN_WIDTH ? maxLeft : clamp((viewport.width - callout.width) / 2, margin, maxLeft);
  return { side: "docked", top: maxTop, left };
}

export interface PointerPlacement {
  direction: "down" | "up";
  top: number;
  left: number;
}

/** The pointer arrow: centered on the target, above it pointing down, or below it pointing up when there's no room. */
export function placePointer(target: Rect, viewport: Size): PointerPlacement {
  const { pointerSize: size, pointerGap: gap } = TOUR;
  const left = clamp(target.left + target.width / 2 - size / 2, 0, viewport.width - size);
  const above = target.top - gap - size;
  return above >= 0
    ? { direction: "down", top: above, left }
    : { direction: "up", top: target.top + target.height + gap, left };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/tour`
Expected: PASS (11 tests). (Check: `placePointer(rect(100,200,80,40))`: left = 100 + 40 − 14 = 126, top = 200 − 6 − 28 = 166.)

- [ ] **Step 5: Full checks and commit**

Run: `npm test && npm run lint && npm run typecheck`

```bash
git add src/lib/tour/geometry.ts src/lib/tour/geometry.test.ts src/lib/tour/placement.ts src/lib/tour/placement.test.ts
git commit -m "feat: tour geometry and callout placement

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Drivable Draft room with tour targets

**Model:** sonnet (UI refactor; must not change live behavior).

**Files:**
- Create: `src/components/draft/DraftRoomView.tsx` (moved from `DraftRoom.tsx` with `git mv`)
- Modify: `src/components/draft/DraftRoom.tsx`, `src/components/draft/use-league-draft.ts`
- Modify: `src/components/ui/Panel.tsx`, `src/components/draft/DraftStatusBar.tsx`, `AvailablePicks.tsx`, `SideButton.tsx`, `SelectionPreview.tsx`, `SelectionBar.tsx`, `DraftBoard.tsx`, `FadePicker.tsx`, `FadeStatusPanel.tsx`
- Create: `src/components/ui/use-prefers-reduced-motion.ts`

**Interfaces:**
- Consumes: `tourTarget`, `TourTargetId` (Task 3).
- Produces:
  - `interface DraftRoomDriver { view: LeagueView; error: string | null; pending: boolean; dispatch(command: DraftCommand): Promise<boolean>; saveLineOverrides(overrides: Record<string, number>): Promise<boolean>; saveConfig(config: LeagueConfig): Promise<boolean>; dismissError(): void }`
  - `DraftRoomView({ driver, access, headerTag?, headerActions?, draftControls? = true, completeAction?, onSelectionChange?, onFadeTargetChange? })`
  - `usePrefersReducedMotion(): boolean`
  - `data-tour` ids in the DOM: `draft-status` (status bar), `available-picks`, `side-button` (each Over/Under button), `selection-panel`, `confirm-pick` (preview and bar buttons), `selection-bar`, `draft-board`, `fade-targets`, `fade-target` (each target button), `fade-confirm`, `confirm-fade` (preview and bar buttons), `fade-bar`, `fade-status`.

- [ ] **Step 1: Move the room and introduce the driver**

```bash
git mv src/components/draft/DraftRoom.tsx src/components/draft/DraftRoomView.tsx
```

In `DraftRoomView.tsx`:
1. Rename the component to `DraftRoomView`; remove the `useLeagueDraft` import; add imports `useEffect` and `type ReactNode` from `react`, `type DraftCommand` from `@/lib/fades` (merge with the existing `openFadeSeats` import), `type LeagueConfig` from `@/lib/league/config`, `type LeagueView` (merge with `LeagueView` already imported from `@/lib/types`).
2. Above the component add:

```tsx
/** Where the room's state comes from and where its actions go: the server (useLeagueDraft) or the guided demo. */
export interface DraftRoomDriver {
  view: LeagueView;
  error: string | null;
  pending: boolean;
  dispatch: (command: DraftCommand) => Promise<boolean>;
  saveLineOverrides: (overrides: Record<string, number>) => Promise<boolean>;
  saveConfig: (config: LeagueConfig) => Promise<boolean>;
  dismissError: () => void;
}
```

3. Replace the signature and first line with:

```tsx
export function DraftRoomView({
  driver,
  access,
  headerTag,
  headerActions,
  draftControls = true,
  completeAction,
  onSelectionChange,
  onFadeTargetChange,
}: {
  driver: DraftRoomDriver;
  access: LeagueAccess;
  /** Replaces the "Demo draft" tag. */
  headerTag?: string;
  headerActions?: ReactNode;
  /** False hides start, pause and resume even from the commissioner (the guided demo drives the draft itself). */
  draftControls?: boolean;
  /** Replaces the status bar's "League overview" link once the draft is complete. */
  completeAction?: ReactNode;
  /** Told whenever the active (still eligible) selection changes. */
  onSelectionChange?: (selection: SideRef | null) => void;
  /** Told whenever the chosen fade target changes (its pick number). */
  onFadeTargetChange?: (pickNumber: number | null) => void;
}) {
  const { view, error, pending, dispatch, saveLineOverrides, saveConfig, dismissError } = driver;
```

4. `const canControl = canControlDraft(league, viewerId);` → `const canControl = draftControls && canControlDraft(league, viewerId);`
5. After the `fadeTarget` declaration add:

```tsx
  const fadeTargetNumber = fadeTarget?.pickNumber ?? null;
  useEffect(() => onSelectionChange?.(activeSelection), [activeSelection, onSelectionChange]);
  useEffect(() => onFadeTargetChange?.(fadeTargetNumber), [fadeTargetNumber, onFadeTargetChange]);
```

6. `PageHeader`: `tag={headerTag ?? (league.isDemo ? "Demo draft" : undefined)}` and `actions={headerActions}`.
7. `DraftStatusBar`: add `completeAction={completeAction}`.
8. Fade side panel: `<Panel title={fadingFor === viewerId ? "Your fade" : "Fade"} tour="fade-confirm" …>`; selection side panel: `<Panel title={viewerId ? "Your selection" : "Selection"} tour="selection-panel" …>`.
9. The fade `SelectionBar`: add `tourBar="fade-bar" tourConfirm="confirm-fade"`; the pick `SelectionBar`: add `tourBar="selection-bar" tourConfirm="confirm-pick"`.

Rewrite `src/components/draft/DraftRoom.tsx`:

```tsx
"use client";

import type { LeagueAccess } from "@/lib/access/links";
import type { LeagueView } from "@/lib/types";
import { DraftRoomView } from "./DraftRoomView";
import { useLeagueDraft } from "./use-league-draft";

/** A stored league's draft room (or the read-only demo): the server holds the state; useLeagueDraft polls and sends. */
export function DraftRoom({ initial, access }: { initial: LeagueView; access: LeagueAccess }) {
  return <DraftRoomView driver={useLeagueDraft(initial)} access={access} />;
}
```

In `use-league-draft.ts`: `import type { DraftRoomDriver } from "./DraftRoomView";` and annotate `export function useLeagueDraft(initial: LeagueView): DraftRoomDriver {`. Nothing else changes.

- [ ] **Step 2: Tag the shared pieces**

`src/components/ui/Panel.tsx`: add prop `tour?: TourTargetId` (import type from `@/lib/tour/targets`, doc comment: `/** Names this panel for a guided tour (data-tour). */`) and render `<section data-tour={tour} className=…>`.

Then, each with `import { tourTarget } from "@/lib/tour/targets";` where spread is used:
- `DraftStatusBar.tsx`: `<section {...tourTarget("draft-status")} aria-live="polite" …>`; add prop `completeAction?: ReactNode` (`/** Replaces the "League overview" link once the draft is complete. */`) and render `turn.kind === "complete" ? (completeAction ?? <Link …>League overview</Link>) : …`.
- `AvailablePicks.tsx`: `<Panel title="Available picks" tour="available-picks" …>`.
- `SideButton.tsx`: the `<button>` (not the drafted `<span>`) gets `{...tourTarget("side-button")}`.
- `SelectionPreview.tsx`: the Confirm pick `<Button {...tourTarget("confirm-pick")} …>`.
- `SelectionBar.tsx`: new props `tourBar?: TourTargetId; tourConfirm?: TourTargetId`; the selection frame `<div data-tour={tourBar} …>` (the notice-only frame stays untagged) and the confirm `<Button data-tour={tourConfirm} …>`.
- `DraftBoard.tsx`: `<Panel tour="draft-board" title={…}>`.
- `FadePicker.tsx`: `FadeTargets` panel `tour="fade-targets"`; each target `<button {...tourTarget("fade-target")} …>`; `FadeConfirm`'s Confirm fade `<Button {...tourTarget("confirm-fade")} …>`.
- `FadeStatusPanel.tsx`: its `<Panel tour="fade-status" …>`.

- [ ] **Step 3: Reduced-motion board scroll**

`src/components/ui/use-prefers-reduced-motion.ts`:

```ts
"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** True when the user asked for less motion. False while server rendering. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
}
```

In `DraftBoard.tsx`: `const reduceMotion = usePrefersReducedMotion();`, use `behavior: reduceMotion ? "auto" : "smooth"` in the scroll effect and add `reduceMotion` to its dependencies.

- [ ] **Step 4: Static checks**

Run: `npm test && npm run lint && npm run typecheck`
Expected: all pass, no new warnings.

- [ ] **Step 5: Verify the live room is unchanged (browser pane)**

Start the `dev` server (`preview_start {name: "dev"}`; see the memory note on which `launch.json` it reads). Then:
1. `/` → create a league → `/l/{id}/draft`: lobby renders; Start the draft; select a side, change it, Confirm; the board shows the pick; Pause and Resume work.
2. `scripts/smoke.sh http://localhost:3000` passes (two-browser API flow).
3. `/l/demo/draft`: unchanged, "Demo draft" tag.
4. In the JS tool: `[...new Set([...document.querySelectorAll('[data-tour]')].map(e => e.dataset.tour))]` on a live draft lists `draft-status, draft-board, available-picks, side-button, selection-panel` (plus `confirm-pick` / `selection-bar` once a side is selected).

- [ ] **Step 6: Commit**

```bash
git add -A src/components/draft src/components/ui/Panel.tsx src/components/ui/use-prefers-reduced-motion.ts
git commit -m "refactor: draft room renders from a driver and names its areas for tours

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Reusable tour overlay

**Model:** sonnet (DOM measurement, focus handling). Verified in the browser in Task 7, the first page that hosts it.

**Files:**
- Create: `src/components/tour/dom.ts`, `use-target-rects.ts`, `use-interaction-gate.ts`, `TourOverlay.tsx`

**Interfaces:**
- Consumes: `TourStep`, `TourTargetId` (Task 3); `placeCallout`, `placePointer`, `inflateRect`, `clipRect`, `sameRects`, `Rect`, `Size` (Task 4); `TOUR`; `usePrefersReducedMotion`, `Button` (Task 5 / existing).
- Produces: `TourOverlay({ step, stepLabel, onContinue?, onRestart, exitHref, children? })`. Mount it with `key={stepId}` so per-step state (folded, focus, scroll) resets on each step.

- [ ] **Step 1: DOM helpers**

`src/components/tour/dom.ts`:

```ts
import { clipRect, type Rect } from "@/lib/tour/geometry";
import type { TourTargetId } from "@/lib/tour/targets";

export function findTargets(id: TourTargetId): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${id}"]`));
}

/** Laid out at all (not display: none), on screen or not. */
export function isDisplayed(element: HTMLElement): boolean {
  return element.getClientRects().length > 0;
}

function toRect(box: DOMRect): Rect {
  return { top: box.top, left: box.left, width: box.width, height: box.height };
}

function clipsContent(element: Element): boolean {
  const style = getComputedStyle(element);
  return /(auto|scroll|hidden|clip)/.test(`${style.overflowX} ${style.overflowY}`);
}

/** The part of the element the user can see: clipped by every scrolling ancestor and the viewport. Null when none. */
export function visibleRect(element: HTMLElement): Rect | null {
  if (!isDisplayed(element)) return null;
  const clips: Rect[] = [];
  for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
    if (clipsContent(parent)) clips.push(toRect(parent.getBoundingClientRect()));
  }
  clips.push({ top: 0, left: 0, width: window.innerWidth, height: window.innerHeight });
  return clipRect(toRect(element.getBoundingClientRect()), clips);
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/** Keyboard-focusable elements inside the roots (and the roots themselves), in document order. */
export function focusablesIn(roots: readonly HTMLElement[]): HTMLElement[] {
  const found = new Set<HTMLElement>();
  for (const root of roots) {
    if (root.matches(FOCUSABLE)) found.add(root);
    root.querySelectorAll<HTMLElement>(FOCUSABLE).forEach((element) => found.add(element));
  }
  return [...found]
    .filter(isDisplayed)
    .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
}
```

- [ ] **Step 2: Live target rects**

`src/components/tour/use-target-rects.ts`:

```ts
"use client";

import { useEffect, useState } from "react";
import { sameRects, type Rect, type Size } from "@/lib/tour/geometry";
import type { TourTargetId } from "@/lib/tour/targets";
import { findTargets, visibleRect } from "./dom";

export interface TargetLayout {
  /** Visible rects of every element tagged with each id, in document order. Off-screen elements are left out. */
  rects: ReadonlyMap<TourTargetId, readonly Rect[]>;
  viewport: Size;
}

const EMPTY: TargetLayout = { rects: new Map(), viewport: { width: 0, height: 0 } };

/**
 * Measures the tagged elements and re-measures (once per frame at most) on any scroll, including inside scroll
 * containers, on resize, and on DOM or layout changes, so the spotlight follows content as it moves.
 */
export function useTargetRects(ids: readonly TourTargetId[]): TargetLayout {
  const key = ids.join(" ");
  const [layout, setLayout] = useState<TargetLayout>(EMPTY);
  useEffect(() => {
    const wanted = key === "" ? [] : (key.split(" ") as TourTargetId[]);
    let frame = 0;
    const measure = () => {
      frame = 0;
      const rects = new Map(wanted.map((id) => [id, findTargets(id).flatMap((element) => visibleRect(element) ?? [])]));
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      setLayout((current) =>
        current.viewport.width === viewport.width &&
        current.viewport.height === viewport.height &&
        wanted.every((id) => sameRects(current.rects.get(id) ?? [], rects.get(id) ?? []))
          ? current
          : { rects, viewport },
      );
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(measure);
    };
    schedule();
    const resizes = new ResizeObserver(schedule);
    resizes.observe(document.body);
    const mutations = new MutationObserver(schedule);
    mutations.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      resizes.disconnect();
      mutations.disconnect();
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
    };
  }, [key]);
  return layout;
}
```

- [ ] **Step 3: Interaction gate**

`src/components/tour/use-interaction-gate.ts`:

```ts
"use client";

import { useEffect, type RefObject } from "react";
import type { TourTargetId } from "@/lib/tour/targets";
import { findTargets, focusablesIn } from "./dom";

const BLOCKED_EVENTS = ["mousedown", "click", "dblclick", "auxclick", "contextmenu", "submit"] as const;

/**
 * While a step is shown, only the callout and the step's interactive areas take input: clicks, presses and focus
 * elsewhere are stopped before the app sees them, and Tab cycles through the allowed controls. Scrolling stays free.
 */
export function useInteractionGate(interactive: readonly TourTargetId[], callout: RefObject<HTMLElement | null>) {
  const key = interactive.join(" ");
  useEffect(() => {
    const ids = key === "" ? [] : (key.split(" ") as TourTargetId[]);
    const roots = () => [callout.current, ...ids.flatMap(findTargets)].filter((root): root is HTMLElement => root !== null);
    const allowed = (target: EventTarget | null) =>
      target instanceof Node && roots().some((root) => root.contains(target));
    const block = (event: Event) => {
      if (allowed(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    const onFocus = (event: FocusEvent) => {
      if (!allowed(event.target)) callout.current?.focus({ preventScroll: true });
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        const order = focusablesIn(roots());
        if (order.length === 0) return;
        const index = order.indexOf(document.activeElement as HTMLElement);
        const next = event.shiftKey
          ? order[index <= 0 ? order.length - 1 : index - 1]
          : order[index === -1 || index === order.length - 1 ? 0 : index + 1];
        event.preventDefault();
        next.focus();
      } else if ((event.key === "Enter" || event.key === " ") && !allowed(event.target)) {
        block(event);
      }
    };
    for (const type of BLOCKED_EVENTS) document.addEventListener(type, block, true);
    document.addEventListener("focusin", onFocus, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      for (const type of BLOCKED_EVENTS) document.removeEventListener(type, block, true);
      document.removeEventListener("focusin", onFocus, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [key, callout]);
}
```

(`mousedown` is cancelled so blocked inputs never take focus; `touchstart`/`wheel` are never touched, so scrolling works everywhere.)

- [ ] **Step 4: The overlay**

`src/components/tour/TourOverlay.tsx`:

```tsx
"use client";

import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";
import { usePrefersReducedMotion } from "@/components/ui/use-prefers-reduced-motion";
import { TOUR } from "@/config/tour";
import { inflateRect, type Size } from "@/lib/tour/geometry";
import { placeCallout, placePointer } from "@/lib/tour/placement";
import type { TourStep, TourTargetId } from "@/lib/tour/targets";
import { findTargets, isDisplayed } from "./dom";
import { useInteractionGate } from "./use-interaction-gate";
import { useTargetRects } from "./use-target-rects";

/** Until the callout has been measured. */
const INITIAL_CALLOUT: Size = { width: 352, height: 220 };

/**
 * A guided-tour step over the real UI: dims everything but the step's spotlight, points at where to act, and explains
 * it in a callout that stays on screen. Mount with key={step id} so each step starts fresh.
 */
export function TourOverlay({
  step,
  stepLabel,
  onContinue,
  onRestart,
  exitHref,
  children,
}: {
  step: TourStep;
  /** E.g. "Step 2 of 8". */
  stepLabel: string;
  /** Required when the step has a continueLabel. */
  onContinue?: () => void;
  onRestart: () => void;
  exitHref: string;
  /** Step-specific controls under the text (simulation progress, finish links). */
  children?: ReactNode;
}) {
  const reduceMotion = usePrefersReducedMotion();
  const calloutRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const maskId = useId();
  const [folded, setFolded] = useState(false);
  const [calloutSize, setCalloutSize] = useState<Size>(INITIAL_CALLOUT);
  const ids = useMemo<TourTargetId[]>(
    () => [...new Set([...step.spotlight, ...(step.pointAt ? [step.pointAt] : [])])],
    [step],
  );
  const { rects, viewport } = useTargetRects(ids);
  useInteractionGate(step.interactive, calloutRef);

  // Each step: bring its spotlight on screen and move focus to the callout so its text is read first.
  useEffect(() => {
    calloutRef.current?.focus({ preventScroll: true });
    const first = step.spotlight.flatMap(findTargets).find(isDisplayed);
    first?.scrollIntoView({
      block: first.offsetHeight > window.innerHeight * 0.8 ? "start" : "center",
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [step, reduceMotion]);

  useEffect(() => {
    const callout = calloutRef.current;
    if (!callout) return;
    const observer = new ResizeObserver(() => setCalloutSize({ width: callout.offsetWidth, height: callout.offsetHeight }));
    observer.observe(callout);
    return () => observer.disconnect();
  }, []);

  // Escape folds the callout out of the way (and back); it never leaves the tour.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFolded((current) => !current);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const holes = step.spotlight
    .flatMap((id) => rects.get(id) ?? [])
    .map((rect) => inflateRect(rect, TOUR.spotlightPadding));
  const anchor = step.spotlight.map((id) => rects.get(id)?.[0]).find((rect) => rect !== undefined);
  const placement = placeCallout(
    anchor ? inflateRect(anchor, TOUR.spotlightPadding) : null,
    calloutSize,
    viewport,
  );
  const pointAt = step.pointAt ? rects.get(step.pointAt)?.[0] : undefined;
  const pointer = pointAt && placePointer(pointAt, viewport);
  const Arrow = pointer?.direction === "up" ? ArrowUp : ArrowDown;

  return createPortal(
    <>
      <svg aria-hidden className="pointer-events-none fixed inset-0 z-40 size-full">
        <defs>
          <mask id={maskId}>
            <rect width="100%" height="100%" fill="white" />
            {holes.map((hole, index) => (
              <rect key={index} x={hole.left} y={hole.top} width={hole.width} height={hole.height} rx={14} fill="black" />
            ))}
          </mask>
        </defs>
        <rect width="100%" height="100%" className="fill-ink-950/80" mask={`url(#${maskId})`} />
      </svg>
      {holes.map((hole, index) => (
        <div
          key={index}
          aria-hidden
          className="pointer-events-none fixed z-40 rounded-[14px] ring-2 ring-accent/70 motion-safe:animate-pulse"
          style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height }}
        />
      ))}
      {pointer && (
        <Arrow
          aria-hidden
          className="pointer-events-none fixed z-50 text-accent drop-shadow motion-safe:animate-bounce"
          style={{ top: pointer.top, left: pointer.left, width: TOUR.pointerSize, height: TOUR.pointerSize }}
        />
      )}
      <div
        ref={calloutRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="fixed z-50 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-accent/60 bg-ink-900 p-4 shadow-2xl focus:outline-none focus-visible:outline-2 focus-visible:outline-accent"
        style={{ top: placement.top, left: placement.left }}
      >
        <div className="flex items-center gap-1">
          <p className="flex-1 text-xs font-semibold uppercase tracking-[0.2em] text-link">{stepLabel}</p>
          <Button variant="ghost" size="sm" onClick={() => setFolded((current) => !current)} aria-expanded={!folded} aria-label={folded ? "Show tip" : "Hide tip"}>
            {folded ? <ChevronUp aria-hidden className="size-4" /> : <ChevronDown aria-hidden className="size-4" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={onRestart} aria-label="Restart demo">
            <RotateCcw aria-hidden className="size-4" />
          </Button>
          <Link href={exitHref} aria-label="Exit demo" className="inline-flex size-8 items-center justify-center rounded-lg text-fog-300 hover:text-fog-50 focus-visible:outline-2 focus-visible:outline-accent">
            <X aria-hidden className="size-4" />
          </Link>
        </div>
        <h2 id={titleId} className="mt-1 font-display text-xl font-semibold text-fog-50">
          {step.title}
        </h2>
        {!folded && (
          <>
            <p className="mt-2 text-sm text-fog-300">{step.body}</p>
            {step.details && (
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer font-semibold text-link">{step.details.summary}</summary>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-fog-300">
                  {step.details.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </details>
            )}
            {children && <div className="mt-4 flex flex-col gap-3">{children}</div>}
            {step.continueLabel && onContinue && (
              <Button className="mt-4 w-full" onClick={onContinue}>
                {step.continueLabel}
              </Button>
            )}
          </>
        )}
      </div>
    </>,
    document.body,
  );
}
```

- [ ] **Step 5: Static checks and commit**

Run: `npm test && npm run lint && npm run typecheck`
Expected: pass. (`react-hooks/set-state-in-effect` does not fire: every `setState` runs in an observer, frame, or event callback.)

```bash
git add src/components/tour
git commit -m "feat: reusable guided-tour overlay (spotlight, pointer, callout, input gate)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The guided draft page

**Model:** sonnet (integration + browser verification).

**Files:**
- Create: `src/components/tutorial/storage.ts`, `use-tutorial-session.ts`, `DraftTour.tsx`
- Create: `src/app/l/[leagueId]/tour/draft/page.tsx`, `src/app/l/[leagueId]/tour/scoring/page.tsx`
- Modify: `src/components/draft/DraftRoom.tsx` (entry button), `src/app/page.tsx` (entry link)

**Interfaces:**
- Consumes: everything above; `DEMO_LEAGUE_ID`; `NO_ACCESS` (`src/lib/access/links.ts`); `ERROR_MESSAGES`; `roundOf`, `draftTotalPicks`; `DraftFallback`.
- Produces: routes `/l/demo/tour/draft`, `/l/demo/tour/scoring`; `readTutorialSnapshot(): unknown` for the future walkthrough.

- [ ] **Step 1: Storage**

`src/components/tutorial/storage.ts`:

```ts
import { TUTORIAL_STORAGE_KEY, type TutorialSnapshot } from "@/lib/tutorial/snapshot";

// This tab's demo. Storage can be missing or refuse writes (private windows, blocked site data): the demo still works,
// it just starts over on reload.

export function readTutorialSnapshot(): unknown {
  try {
    const raw = window.sessionStorage.getItem(TUTORIAL_STORAGE_KEY);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeTutorialSnapshot(snapshot: TutorialSnapshot): void {
  try {
    window.sessionStorage.setItem(TUTORIAL_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // See above.
  }
}

export function clearTutorialSnapshot(): void {
  try {
    window.sessionStorage.removeItem(TUTORIAL_STORAGE_KEY);
  } catch {
    // See above.
  }
}
```

- [ ] **Step 2: Session hook (the demo's driver)**

`src/components/tutorial/use-tutorial-session.ts`:

```ts
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DraftRoomDriver } from "@/components/draft/DraftRoomView";
import { buildTutorialLeague, TUTORIAL_VIEWER_ID, tutorialTeams } from "@/data/tutorial-league";
import type { DraftCommand } from "@/lib/fades";
import { ERROR_MESSAGES } from "@/lib/league/errors";
import { applyTutorialCommand } from "@/lib/tutorial/session";
import { simulateAll, simulateStep, type SimulationKind } from "@/lib/tutorial/simulation";
import { restoreTutorial, snapshotOf } from "@/lib/tutorial/snapshot";
import { INITIAL_PROGRESS, type TutorialProgress } from "@/lib/tutorial/steps";
import type { League, LeagueView } from "@/lib/types";
import { clearTutorialSnapshot, readTutorialSnapshot, writeTutorialSnapshot } from "./storage";

interface SessionState {
  league: League;
  progress: TutorialProgress;
  /** Bumped by a restart so the room's own state (selection, filters) starts over too. */
  generation: number;
}

function freshState(generation: number): SessionState {
  return { league: buildTutorialLeague(), progress: INITIAL_PROGRESS, generation };
}

/** Client only (DraftTour renders this after mount): resumes this tab's demo when its snapshot replays cleanly. */
function initialState(): SessionState {
  const restored = typeof window === "undefined" ? null : restoreTutorial(readTutorialSnapshot());
  return restored ? { ...restored, generation: 0 } : freshState(0);
}

/** The guided demo's league, held in memory: a DraftRoomDriver whose actions run the real rules and go nowhere. */
export function useTutorialSession() {
  const [state, setState] = useState(initialState);
  const [error, setError] = useState<string | null>(null);
  const teams = useMemo(() => tutorialTeams(), []);
  const { league, progress, generation } = state;

  useEffect(() => writeTutorialSnapshot(snapshotOf(league, progress)), [league, progress]);

  const view = useMemo<LeagueView>(
    () => ({ league, viewerId: TUTORIAL_VIEWER_ID, teams, lineReview: null, records: null }),
    [league, teams],
  );

  const dispatch = useCallback(
    async (command: DraftCommand) => {
      const result = applyTutorialCommand(league, TUTORIAL_VIEWER_ID, command);
      if (!result.ok) {
        setError(ERROR_MESSAGES[result.error]);
        return false;
      }
      setError(null);
      setState((current) => ({ ...current, league: result.value }));
      return true;
    },
    [league],
  );

  const driver = useMemo<DraftRoomDriver>(
    () => ({
      view,
      error,
      pending: false,
      dispatch,
      // The demo starts live, so the lobby (lines, league size) never shows.
      saveLineOverrides: async () => false,
      saveConfig: async () => false,
      dismissError: () => setError(null),
    }),
    [view, error, dispatch],
  );

  const acknowledge = useCallback(
    (flag: keyof TutorialProgress) =>
      setState((current) => ({ ...current, progress: { ...current.progress, [flag]: true } })),
    [],
  );

  /** One simulated command, or (skip) all that remain. Both reach the same league. */
  const simulate = useCallback(
    (kind: SimulationKind, all: boolean) =>
      setState((current) => {
        const next = (all ? simulateAll : simulateStep)(current.league, teams, kind);
        return next === current.league ? current : { ...current, league: next };
      }),
    [teams],
  );

  const restart = useCallback(() => {
    clearTutorialSnapshot();
    setError(null);
    setState((current) => freshState(current.generation + 1));
  }, []);

  return { league, progress, generation, driver, acknowledge, simulate, restart };
}
```

- [ ] **Step 3: The page component**

`src/components/tutorial/DraftTour.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { DraftFallback } from "@/components/draft/DraftFallback";
import { DraftRoomView } from "@/components/draft/DraftRoomView";
import { TourOverlay } from "@/components/tour/TourOverlay";
import { Button, buttonClasses } from "@/components/ui/Button";
import { TUTORIAL } from "@/config/tour";
import { DEMO_LEAGUE_ID } from "@/data/demo-league";
import { NO_ACCESS } from "@/lib/access/links";
import { draftTotalPicks, roundOf } from "@/lib/draft";
import type { SideRef } from "@/lib/draft-filters";
import { TUTORIAL_STEP_COUNT, TUTORIAL_STEPS, tutorialStep, type TutorialStepId } from "@/lib/tutorial/steps";
import type { League } from "@/lib/types";
import { useTutorialSession } from "./use-tutorial-session";

const EXIT_HREF = `/l/${DEMO_LEAGUE_ID}`;
const SCORING_HREF = `/l/${DEMO_LEAGUE_ID}/tour/scoring`;

const subscribeNever = () => () => {};

/** The guided draft. Client only: it resumes from this tab's storage, which the server can't see. */
export function DraftTour() {
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);
  return mounted ? <DraftTourSession /> : <DraftFallback />;
}

function DraftTourSession() {
  const { league, progress, generation, driver, acknowledge, simulate, restart } = useTutorialSession();
  const [hasSelection, setHasSelection] = useState(false);
  const [hasFadeTarget, setHasFadeTarget] = useState(false);
  const onSelectionChange = useCallback((selection: SideRef | null) => setHasSelection(selection !== null), []);
  const onFadeTargetChange = useCallback((target: number | null) => setHasFadeTarget(target !== null), []);
  const stepId = tutorialStep(progress, { league, hasSelection, hasFadeTarget });
  const step = TUTORIAL_STEPS[stepId];

  // Simulated steps play one command at a time; each new league version schedules the next.
  useEffect(() => {
    if (step.advance !== "automatic") return;
    const kind = stepId === "simulate" ? "draft" : "fades";
    const timer = window.setTimeout(
      () => simulate(kind, false),
      kind === "draft" ? TUTORIAL.pickIntervalMs : TUTORIAL.fadeIntervalMs,
    );
    return () => window.clearTimeout(timer);
  }, [step.advance, stepId, league.version, simulate]);

  const continueFor: Partial<Record<TutorialStepId, () => void>> = {
    welcome: () => acknowledge("welcomed"),
    snake: () => acknowledge("snakeExplained"),
  };

  return (
    <>
      <DraftRoomView
        key={generation}
        driver={driver}
        access={NO_ACCESS}
        headerTag="Guided demo"
        draftControls={false}
        completeAction={
          <Link href={SCORING_HREF} className={buttonClasses()}>
            See how scoring works
          </Link>
        }
        onSelectionChange={onSelectionChange}
        onFadeTargetChange={onFadeTargetChange}
      />
      <TourOverlay
        key={`${generation}-${stepId}`}
        step={step}
        stepLabel={`Step ${step.number} of ${TUTORIAL_STEP_COUNT}`}
        onContinue={continueFor[stepId]}
        onRestart={restart}
        exitHref={EXIT_HREF}
      >
        {stepId === "simulate" && (
          <SimulationProgress label={draftProgress(league)} onSkip={() => simulate("draft", true)} />
        )}
        {stepId === "fade-sim" && (
          <SimulationProgress
            label={`${league.fades.length} of ${league.managers.length} fades locked`}
            onSkip={() => simulate("fades", true)}
          />
        )}
        {stepId === "complete" && (
          <Link href={SCORING_HREF} className={buttonClasses("primary", "lg")}>
            See how scoring works
          </Link>
        )}
      </TourOverlay>
    </>
  );
}

/** "Pick 9 of 44 · Round 3, left to right": the snake direction of the pick being made. */
function draftProgress(league: League): string {
  const { draft } = league;
  const total = draftTotalPicks(draft);
  const current = Math.min(draft.picks.length + 1, total);
  const round = roundOf(current, draft.seatOrder.length);
  return `Pick ${current} of ${total} · Round ${round}, ${round % 2 === 1 ? "left to right" : "right to left"}`;
}

function SimulationProgress({ label, onSkip }: { label: string; onSkip: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p role="status" className="text-sm font-semibold text-fog-50">
        {label}
      </p>
      <Button variant="secondary" size="sm" onClick={onSkip}>
        Skip to the end
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Routes**

`src/app/l/[leagueId]/tour/draft/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DraftFallback } from "@/components/draft/DraftFallback";
import { DraftTour } from "@/components/tutorial/DraftTour";
import { DEMO_LEAGUE_ID } from "@/data/demo-league";

/** The guided draft. Only the demo league has one; it never reads or writes a stored league. */
export default function DraftTourPage({ params }: PageProps<"/l/[leagueId]/tour/draft">) {
  return (
    <Suspense fallback={<DraftFallback />}>
      <DraftTourContent params={params} />
    </Suspense>
  );
}

async function DraftTourContent({ params }: { params: PageProps<"/l/[leagueId]/tour/draft">["params"] }) {
  const { leagueId } = await params;
  if (leagueId !== DEMO_LEAGUE_ID) notFound();
  return <DraftTour />;
}
```

`src/app/l/[leagueId]/tour/scoring/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { NotBuiltYet } from "@/components/ui/NotBuiltYet";
import { DEMO_LEAGUE_ID } from "@/data/demo-league";

/** Placeholder for the scoring walkthrough that continues the guided draft (it will read the demo's snapshot). */
export default function ScoringTourPage({ params }: PageProps<"/l/[leagueId]/tour/scoring">) {
  return (
    <Suspense fallback={null}>
      <ScoringTourContent params={params} />
    </Suspense>
  );
}

async function ScoringTourContent({ params }: { params: PageProps<"/l/[leagueId]/tour/scoring">["params"] }) {
  const { leagueId } = await params;
  if (leagueId !== DEMO_LEAGUE_ID) notFound();
  return (
    <div className="flex flex-col items-center gap-4">
      <NotBuiltYet
        title="Scoring walkthrough"
        description="Next: see how your pick and your fade earn points as a season plays out."
      />
      <Link href={`/l/${DEMO_LEAGUE_ID}/tour/draft`} className="font-semibold text-link hover:text-fog-50">
        Back to the guided draft
      </Link>
    </div>
  );
}
```

- [ ] **Step 5: Entry points**

`src/components/draft/DraftRoom.tsx`: pass a header action for the demo league:

```tsx
"use client";

import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import type { LeagueAccess } from "@/lib/access/links";
import type { LeagueView } from "@/lib/types";
import { DraftRoomView } from "./DraftRoomView";
import { useLeagueDraft } from "./use-league-draft";

/** A stored league's draft room (or the read-only demo): the server holds the state; useLeagueDraft polls and sends. */
export function DraftRoom({ initial, access }: { initial: LeagueView; access: LeagueAccess }) {
  const { league } = initial;
  return (
    <DraftRoomView
      driver={useLeagueDraft(initial)}
      access={access}
      headerActions={
        league.isDemo ? (
          <Link href={`/l/${league.id}/tour/draft`} className={buttonClasses("secondary", "sm")}>
            Try a guided draft
          </Link>
        ) : undefined
      }
    />
  );
}
```

`src/app/page.tsx`, in the "Just looking?" panel, before the existing demo link:

```tsx
        <Link
          href={`/l/${DEMO_LEAGUE_ID}/tour/draft`}
          className="inline-flex items-center gap-2 font-semibold text-link hover:text-fog-50"
        >
          Try a guided draft <ArrowRight aria-hidden className="size-4" />
        </Link>
        <p className="mb-4 mt-1 text-sm text-fog-400">Make a pick and a fade yourself; we simulate everyone else. Nothing is saved.</p>
```

- [ ] **Step 6: Static checks**

Run: `npm test && npm run lint && npm run typecheck`
Expected: pass.

- [ ] **Step 7: Browser verification at 1440px**

`preview_start {name: "dev"}`, open `/l/demo/tour/draft`, and confirm with `read_page`, `javascript_tool` and screenshots:
1. Step 1: callout "Step 1 of 8" near the turn-status banner ("Your turn · You", Round 1 · Pick 1 of 44), board empty, everything else dimmed, no Pause button. Clicking a sidebar nav link does nothing (URL unchanged). Continue.
2. Step 2: Available picks lit; the arrow bounces over an Over/Under button; the "How lines work" details open without advancing. Search "pistons", choose UNDER → step 3. Clear selection → back to step 2. Choose Phoenix OVER → Confirm pick → step 4; the board shows pick 1 Phoenix OVER under "You".
3. Step 4 → "Watch the draft": picks appear one by one; the callout reads "Pick n of 44 · Round r, left to right / right to left" and flips direction each round; the board's current cell moves in snake order. Press "Skip to the end": the fade step appears.
4. Step 6: choose a target from Avery; step 7 shows "You fades … · Avery, pick n"; change to a Jordan pick; Confirm fade → step 7 "The other fades" counts 2, 3, 4 locked → step 8: status bar "Draft complete" with "See how scoring works".
5. Determinism and skip: in the JS tool, read `sessionStorage.getItem("courtline.tutorial.v1")` and note `picks`. Restart (↺), pick Phoenix OVER again, watch without skipping to the end; the stored `picks` are identical.
6. Reload mid-simulation: the demo resumes at the same pick. Restart: back to step 1 with an empty board.
7. `/l/abc123/tour/draft` 404s.

- [ ] **Step 8: Commit**

```bash
git add src/components/tutorial "src/app/l/[leagueId]/tour" src/components/draft/DraftRoom.tsx src/app/page.tsx
git commit -m "feat: guided draft demo at /l/demo/tour/draft

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Isolation guard, docs, full verification

**Model:** sonnet; the controller runs the browser checklist itself.

**Files:**
- Modify: `eslint.config.mjs`, `CLAUDE.md`

- [ ] **Step 1: Isolation lint rule**

In `eslint.config.mjs`, add after `...nextTs,`:

```js
  // The guided demo runs in the browser only: it must never reach the server, the database or a real league.
  {
    files: ["src/lib/tutorial/**", "src/lib/tour/**", "src/components/tour/**", "src/components/tutorial/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@/server/*", "@/db/*", "@/app/*"], message: "The guided demo never reaches the server or the database." },
          ],
          paths: [
            { name: "@/components/draft/use-league-draft", message: "The guided demo drives the room with its own in-memory driver." },
          ],
        },
      ],
      "no-restricted-globals": ["error", { name: "fetch", message: "The guided demo never calls the server." }],
    },
  },
```

Run: `npm run lint` → passes. Prove the rule bites: temporarily add `import "@/server/db";` to `src/components/tutorial/storage.ts`, run `npm run lint` (expect the error), then remove it.

- [ ] **Step 2: CLAUDE.md**

- Architecture → `src/config/` list: add `TUTORIAL` and `TOUR` (`tour.ts`: guided demo size and pacing, overlay spacing).
- Architecture → `src/lib/`: add "guided demo (`tutorial/`: in-memory league commands, deterministic simulation, steps, snapshot) and tour layout (`tour/`: target ids, geometry, callout placement)".
- Architecture → `src/data/`: add `tutorial-league.ts` (the guided demo's fixture: live 4 × 11, empty board).
- Architecture → components: "`tour/` reusable guided-tour overlay; `tutorial/` the guided draft. `DraftRoomView` renders from a `DraftRoomDriver`; `DraftRoom` feeds it `useLeagueDraft`."
- Domain rules, new bullet: "Guided demo (`/l/demo/tour/draft`): an in-memory league (`tutorial`, never stored, `isDemo: false` so the rules run) in a real `DraftRoomView`; every command, simulated or not, goes through `decideDraftAction` (`applyTutorialCommand`). The step is derived from league state (`tutorialStep`). Tag tour targets with `tourTarget(id)` from `src/lib/tour/targets.ts`, never by class or text. State lives in `sessionStorage` (`courtline.tutorial.v1`) as a replayable snapshot; the scoring walkthrough (`/l/demo/tour/scoring`, not built yet) reads it via `tutorialResult`. ESLint forbids server, database and `fetch` use in the demo folders."

- [ ] **Step 3: Full checks**

Run: `npm test && npm run lint && npm run typecheck && npm run build`
Expected: all pass; the build lists `/l/[leagueId]/tour/draft` and `/l/[leagueId]/tour/scoring`.

- [ ] **Step 4: Browser checklist (dev server, controller runs it)**

| Check | How | Pass when |
| --- | --- | --- |
| No server writes | `read_network_requests` with `urlPattern: "/api/"` after a full run from step 1 to step 8 | no requests |
| Any choice | Two full runs with different openings (an Under on a low line, an Over on a high one) and different fade targets | both complete; step 8 shows the chosen pick at pick 1 and the chosen fade in the Fades panel |
| Gating | During steps 2, 5 and 6 click the sidebar "Rosters" link, the board, the search box (step 5) | nothing happens outside the step's interactive areas |
| Keyboard | From step 2: Tab reaches search, filters and side buttons; Enter on a side → step 3; Tab to Confirm pick, Enter; Escape folds and unfolds the callout; Tab never lands in the dimmed sidebar | all true |
| Scroll and resize | In step 2, scroll the page and the board; resize 1440 → 900 → 1440 | spotlight and callout follow without lag or drift |
| Reduced motion | `resize_window` won't emulate it: in the JS tool check `matchMedia("(prefers-reduced-motion: reduce)")`; with macOS Reduce Motion on, `getComputedStyle(arrow).animationName === "none"` | no bounce, no pulse, board scrolls instantly |
| 375px | `resize_window {preset: "mobile"}`, reload, run steps 1–8 | callout always inside the viewport; step 3 anchors on the bottom selection bar; `document.documentElement.scrollWidth <= innerWidth` on every step |
| Restart and resume | Restart at step 6; reload at step 5 | step 1 with an empty board; resumes at the same pick |
| Live flows | Create a league, start, pick, run `scripts/smoke.sh http://localhost:3000`, finish fades for all seats as commissioner | unchanged behavior; Pause/Resume present |

Reset the viewport with `resize_window {preset: "desktop"}` afterwards.

- [ ] **Step 5: Commit**

```bash
git add eslint.config.mjs CLAUDE.md
git commit -m "chore: keep the guided demo client-only; document it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Acceptance criteria → where they are proven

| Criterion | Proof |
| --- | --- |
| Normal-looking Draft room in demo mode | Task 5 (same `DraftRoomView`), Task 7 step 7.1 |
| Step 1 spotlights the status banner | `TUTORIAL_STEPS.welcome`, Task 7 step 7.1 |
| ANY eligible team and side | `simulation.test.ts` (all 60 openings), Task 8 "Any choice" |
| Review and confirm through the existing UI | `SelectionPreview` / `SelectionBar` unchanged, Task 7 step 7.2 |
| Advances on the successful action | `tutorialStep` reads the confirmed pick (`steps.test.ts`) |
| Pick stays in the user's roster | `expectValidDraft` + `picks[0]` assertion; `tutorialResult.openingPick` |
| Other 43 picks valid | `expectValidDraft` for every opening |
| Shows snake order | board arrows + current cell + "left to right / right to left" progress; Task 7 step 7.3 |
| Skip doesn't change the result | "ends the same whether watched pick by pick or skipped"; Task 7 step 7.5 |
| Transitions into fades | `tutorialStep` → `fades` when status is `fades` |
| Free fade choice and confirmation | every target × every opening in `simulation.test.ts`; Task 7 step 7.4 |
| Others' fades simulated, draft completes | same test; "no order dependency" test |
| No persistent changes to real leagues | in-memory only; ESLint guard; no `/api/` requests (Task 8) |
| Overlay usable with scrolling, keyboard, reduced motion | Task 8 checklist |
| Restart returns to the initial state | `restart` → `freshState`; Task 7 step 7.6 |
| No regression of live draft and fades | Task 5 step 5 and Task 8 "Live flows"; all existing tests |
