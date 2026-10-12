# Configurable League Size Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the commissioner pick 2–12 managers and 1–⌊60 ÷ managers⌋ rounds before the draft, and end regular drafting early (keeping only completed rounds, voiding the rest) when the next manager has no side they may take.

**Architecture:** The rules stay where they live today. `src/lib/league/config.ts` (new) validates sizes and resizes seats; `src/lib/draft.ts` gains the early-end rule inside `applyDraftAction`, so it runs in the same locked transaction as the pick that triggers it. `DraftState` keeps counted picks in `picks` (every existing reader — scoring, standings, rosters, team page, fades — keeps working unchanged and never sees voided picks) and moves voided ones to a new `voidedPicks` list plus a `blockedPick` marker. The database stores voided picks as rows with `voided = true` and the marker in `leagues.blocked_pick`; `saveLeague` learns to add/remove seats, insert voided picks and flip kept ones to voided. A new `PUT /api/leagues/{id}/config` runs `decideLeagueConfig` under `withLockedLeague` like every other mutation.

**Tech Stack:** Next.js 16.4 App Router (Cache Components), React 19, TypeScript strict, Tailwind CSS v4, Drizzle ORM 0.45 (Postgres / PGlite), Vitest 4.1, lucide-react.

**Spec:** the Requirements section below (the request of 2026-10-12, verbatim in substance) plus `docs/superpowers/specs/2026-10-08-courtline-prototype-design.md` for the draft and fade rules this extends. Read `CLAUDE.md` first: it is the project's rulebook.

## Requirements

Configuration
- 2–12 managers. Rounds from 1 to ⌊60 ÷ managerCount⌋. Default stays 4 managers × 11 rounds.
- Changes only before the draft starts (`not_started`). Commissioner only. Validated on the server and in the UI.
- Existing leagues, picks, manager access (links) and sessions keep working unchanged.

Draft
- Snake order and completion adapt to the configured size. A manager still never holds both sides of a team.
- After each pick, check whether the manager on the clock for the next pick has any eligible side. If not, regular drafting ends for everyone: keep only fully completed rounds, void the picks of the incomplete round (their sides become unclaimed), keep voided picks in the draft history marked as voided, and exclude them from rosters, scoring and fade targets. Done atomically on the server.
- If the configured final pick was made, finish normally (even if no sides are left). Never end early while the manager on the clock has an eligible side.

Fades
- Fade stage follows a normal or an early end. One fade per manager, any order, several may fade the same pick, nobody fades their own. The draft completes when every manager has a fade.

Interface
- Seats, rosters, draft progress and copy use the configured counts. On an early end, explain why it happened and show completed rounds, kept picks and unclaimed sides. Distinguish configured rounds from completed rounds.

Validation
- Tests for several sizes including 6 × 10 and 7 × 8; blocking partway through a round; voided-pick exclusions; normal completion; existing-league compatibility; concurrent draft requests.

## Global Constraints

- `src/config/` is the only home for tunable numbers: limits go in `LEAGUE_LIMITS` in `src/config/league.ts`; `LEAGUE_DEFAULTS` stays `{ managerCount: 4, rounds: 11 }`. The side count is `TOTAL_SIDES` from `src/data/teams.ts` (60).
- `src/lib/` stays pure (no React, no `next/*`, no `server-only`) and test-first.
- Every league write goes through `withLockedLeague` (`src/db/leagues.ts`) with a pure decision from `src/lib/league/commands.ts`. Never authorize with `getViewerId()`.
- Every displayed score comes from `src/lib/scoring.ts` / `src/lib/standings.ts`. Voided picks must never reach them: they live only in `DraftState.voidedPicks`.
- Seat ids stay `m{seat + 1}`; the commissioner is seat 1 (`m1`). Only open seats (`displayName === null`) can be removed, and only from the end of the seat order.
- After editing `src/db/schema.ts`: `npm run db:generate -- --name league_size` and commit the new files in `drizzle/` (SQL, snapshot, journal).
- UI: dark theme tokens only (no raw hex except team colors and the new seat tokens in `globals.css`), numbers through `src/lib/format.ts`, no page-level horizontal scroll at 375px and 1440px. A new `@theme` token needs a dev-server restart before it shows.
- If `npm run typecheck` fails on files named `* 2.*` under `.next/`, delete those iCloud duplicates; they are not ours.
- Before claiming a task done: `npm test && npm run lint && npm run typecheck` (and `npm run build` in the last task).
- Commit messages end with:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## File Structure

| File | Status | Responsibility |
| --- | --- | --- |
| `src/config/league.ts` | modify | `LEAGUE_LIMITS` (2–12 managers, ≥ 1 round) |
| `src/lib/league/config.ts` | create | `LeagueConfig`, `maxRounds`, `isValidLeagueConfig`, `parseLeagueConfig`, `minManagerCount`, `resizeSeats` |
| `src/lib/league/config.test.ts` | create | Tests for the above |
| `src/lib/types.ts` | modify | `DraftState.voidedPicks`, `DraftState.blockedPick` |
| `src/lib/draft.ts` | modify | Early-end rule in `applyDraftAction`; `hasEligibleSide`, `completedRounds`, `earlyEnd`; `currentPickNumber` is null after regular drafting |
| `src/lib/draft-scenarios.ts` | create | Scripted drafts for tests (`plainDraft`, `blockedDraft`, `confirmsOf`, …). Test helper, not app code |
| `src/lib/draft.test.ts` | modify | League sizes, 6 × 10 and 7 × 8 early ends, normal completion, randomized invariant check |
| `src/lib/fades.ts` | modify | `voided_pick` error; targets are kept picks only |
| `src/lib/fades.test.ts`, `src/lib/standings.test.ts`, `src/lib/team-detail.test.ts` | modify | Voided picks are never targets, never scored, never owners |
| `src/lib/league/errors.ts`, `src/server/http.ts` | modify | `voided_pick`, `invalid_config`, `config_locked`, `seats_claimed` |
| `src/lib/league/commands.ts` | modify | `decideLeagueConfig`; start re-validates the size |
| `src/lib/league/commands.test.ts` | modify | Config decisions |
| `src/db/schema.ts` + `drizzle/0004_league_size.sql` (+ meta) | modify / create | `picks.voided`, `leagues.blocked_pick` |
| `src/db/leagues.ts` | modify | Load/save voided picks, blocked pick, rounds, added/removed seats |
| `src/db/actions.ts` | modify | `setLeagueConfig` |
| `src/db/actions.test.ts` | modify | Size changes and early ends on PGlite |
| `src/db/migrations.test.ts` | create | A league stored before migration 0004 still loads and plays |
| `src/db/concurrency.pg.test.ts` | modify | Races at the blocking pick, config vs start, shrink vs claim |
| `src/data/demo-league.ts` + 6 test files with `DraftState` literals | modify | New required fields |
| `src/app/api/leagues/[leagueId]/config/route.ts` | create | `PUT` league size |
| `src/components/draft/use-league-draft.ts` | modify | `saveConfig` |
| `src/components/draft/LeagueSizeForm.tsx` | create | Commissioner's managers/rounds form |
| `src/components/draft/DraftLobby.tsx`, `DraftRoom.tsx` | modify | Host the form; block Start while it has unsaved changes; early-end panel |
| `src/app/globals.css`, `src/components/ui/ManagerAvatar.tsx` | modify | Seat colors 5–12 |
| `src/components/draft/EarlyEndPanel.tsx` | create | Why the draft ended; completed rounds, kept/voided picks, unclaimed sides |
| `src/components/draft/DraftBoard.tsx`, `DraftStatusBar.tsx`, `ManagerPicks.tsx` | modify | Voided cells, blocked cell, configured vs completed rounds |
| `src/app/page.tsx`, `src/components/landing/CreateLeagueForm.tsx` | modify | Copy no longer says four managers |
| `CLAUDE.md` | modify | Document the new rules |

Task order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8. Each task leaves the tree green.

---

### Task 1: League size rules (`src/lib/league/config.ts`)

Suggested model: haiku (complete code below).

**Files:**
- Modify: `src/config/league.ts`
- Create: `src/lib/league/config.ts`
- Test: `src/lib/league/config.test.ts`

**Interfaces:**
- Consumes: `TOTAL_SIDES` (`src/data/teams.ts`, = 60), `Manager` (`src/lib/types.ts`).
- Produces:
  - `LEAGUE_LIMITS: { minManagers: 2; maxManagers: 12; minRounds: 1 }`
  - `interface LeagueConfig { managerCount: number; rounds: number }`
  - `maxRounds(managerCount: number, sideCount?: number): number`
  - `isValidLeagueConfig(config: LeagueConfig, sideCount?: number): boolean`
  - `parseLeagueConfig(input: unknown): LeagueConfig | null` (shape and integer check only)
  - `minManagerCount(managers: readonly Manager[]): number`
  - `resizeSeats(managers: readonly Manager[], managerCount: number): Manager[]`

- [ ] **Step 1: Add the limits**

`src/config/league.ts`, below `LEAGUE_DEFAULTS`:

```ts
/** League sizes the commissioner can choose before the draft. Rounds run from minRounds to ⌊60 sides ÷ managers⌋. */
export const LEAGUE_LIMITS = {
  minManagers: 2,
  maxManagers: 12,
  minRounds: 1,
} as const;
```

- [ ] **Step 2: Write the failing test**

`src/lib/league/config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { LEAGUE_DEFAULTS } from "@/config/league";
import {
  isValidLeagueConfig,
  maxRounds,
  minManagerCount,
  parseLeagueConfig,
  resizeSeats,
} from "@/lib/league/config";
import type { Manager } from "@/lib/types";

function seats(names: Array<string | null>): Manager[] {
  return names.map((displayName, seat) => ({ id: `m${seat + 1}`, seat, displayName }));
}

describe("maxRounds", () => {
  it("is the 60 sides divided by the managers, rounded down", () => {
    expect([2, 4, 6, 7, 12].map((managers) => maxRounds(managers))).toEqual([30, 15, 10, 8, 5]);
  });
});

describe("isValidLeagueConfig", () => {
  it("accepts the default and every size up to the side limit", () => {
    expect(isValidLeagueConfig(LEAGUE_DEFAULTS)).toBe(true);
    for (const [managerCount, rounds] of [[6, 10], [7, 8], [2, 30], [12, 5], [12, 1], [2, 1]]) {
      expect(isValidLeagueConfig({ managerCount, rounds })).toBe(true);
    }
  });

  it("rejects sizes outside 2–12 managers or past the side limit", () => {
    for (const [managerCount, rounds] of [[1, 5], [13, 1], [7, 9], [6, 11], [4, 0], [4, -1], [4.5, 11], [4, 2.5]]) {
      expect(isValidLeagueConfig({ managerCount, rounds })).toBe(false);
    }
  });
});

describe("parseLeagueConfig", () => {
  it("keeps integer fields and drops everything else", () => {
    expect(parseLeagueConfig({ managerCount: 6, rounds: 10, extra: true })).toEqual({ managerCount: 6, rounds: 10 });
    // Range checks belong to isValidLeagueConfig, so an out-of-range size still parses.
    expect(parseLeagueConfig({ managerCount: 40, rounds: 1 })).toEqual({ managerCount: 40, rounds: 1 });
  });

  it("rejects bad shapes", () => {
    for (const input of [null, "6x10", {}, { managerCount: "6", rounds: 10 }, { managerCount: 6 }, { managerCount: 6.5, rounds: 10 }]) {
      expect(parseLeagueConfig(input)).toBeNull();
    }
  });
});

describe("minManagerCount", () => {
  it("never drops a claimed seat", () => {
    expect(minManagerCount(seats(["Ana", null, null, null]))).toBe(2);
    expect(minManagerCount(seats(["Ana", null, null, null, null, "Fay"]))).toBe(6);
  });
});

describe("resizeSeats", () => {
  it("adds open seats after the existing ones", () => {
    expect(resizeSeats(seats(["Ana", "Ben", null, null]), 6)).toEqual(
      seats(["Ana", "Ben", null, null, null, null]),
    );
  });

  it("drops seats from the end and keeps names", () => {
    expect(resizeSeats(seats(["Ana", null, "Cal", null, null]), 3)).toEqual(seats(["Ana", null, "Cal"]));
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run src/lib/league/config.test.ts`
Expected: FAIL — cannot resolve `@/lib/league/config`.

- [ ] **Step 4: Implement**

`src/lib/league/config.ts`:

```ts
import { LEAGUE_LIMITS } from "@/config/league";
import { TOTAL_SIDES } from "@/data/teams";
import type { Manager } from "@/lib/types";

// League size before the draft: how many managers and how many rounds. Every pick takes one of the 60 sides, so
// managers × rounds can't exceed them.

export interface LeagueConfig {
  managerCount: number;
  rounds: number;
}

/** Most rounds a league of this size can draft. */
export function maxRounds(managerCount: number, sideCount: number = TOTAL_SIDES): number {
  return Math.floor(sideCount / managerCount);
}

export function isValidLeagueConfig({ managerCount, rounds }: LeagueConfig, sideCount: number = TOTAL_SIDES): boolean {
  return (
    Number.isInteger(managerCount) &&
    Number.isInteger(rounds) &&
    managerCount >= LEAGUE_LIMITS.minManagers &&
    managerCount <= LEAGUE_LIMITS.maxManagers &&
    rounds >= LEAGUE_LIMITS.minRounds &&
    rounds <= maxRounds(managerCount, sideCount)
  );
}

/** An untrusted request body as a config with integer fields, or null. Ranges are isValidLeagueConfig's job. */
export function parseLeagueConfig(input: unknown): LeagueConfig | null {
  if (!input || typeof input !== "object") return null;
  const { managerCount, rounds } = input as Record<string, unknown>;
  if (typeof managerCount !== "number" || !Number.isInteger(managerCount)) return null;
  if (typeof rounds !== "number" || !Number.isInteger(rounds)) return null;
  return { managerCount, rounds };
}

/** The fewest managers the league can shrink to: seats are removed from the end, and claimed seats never are. */
export function minManagerCount(managers: readonly Manager[]): number {
  const lastClaimed = Math.max(-1, ...managers.filter((manager) => manager.displayName !== null).map((m) => m.seat));
  return Math.max(LEAGUE_LIMITS.minManagers, lastClaimed + 1);
}

/** Seats for a new size: existing seats kept in seat order, trailing seats dropped, new open seats `m{seat + 1}` added. */
export function resizeSeats(managers: readonly Manager[], managerCount: number): Manager[] {
  const kept = [...managers].sort((a, b) => a.seat - b.seat).slice(0, managerCount);
  for (let seat = kept.length; seat < managerCount; seat++) kept.push({ id: `m${seat + 1}`, seat, displayName: null });
  return kept;
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/lib/league/config.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/config/league.ts src/lib/league/config.ts src/lib/league/config.test.ts
git commit -m "feat: league size limits and seat resizing rules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Early end in the draft rules (`src/lib/draft.ts`)

Suggested model: sonnet (type ripple across tests; code below is complete).

**Files:**
- Modify: `src/lib/types.ts` (DraftState)
- Modify: `src/lib/draft.ts`
- Create: `src/lib/draft-scenarios.ts`
- Test: `src/lib/draft.test.ts`
- Modify (new required fields only): `src/data/demo-league.ts`, `src/db/leagues.ts` (`assemble`), `src/lib/fades.test.ts`, `src/lib/standings.test.ts`, `src/lib/team-detail.test.ts`, `src/lib/league/turn.test.ts`, `src/lib/league/permissions.test.ts`

**Interfaces:**
- Consumes: `maxRounds` (Task 1), `TEAM_IDS: ReadonlySet<TeamId>` and `TEAM_INFO` (`src/data/teams.ts`).
- Produces:
  - `DraftState.voidedPicks: DraftPick[]`, `DraftState.blockedPick: number | null`
  - `hasEligibleSide(state: DraftState, managerId: string, teamIds: ReadonlySet<TeamId>): boolean`
  - `completedRounds(state: DraftState): number`
  - `interface EarlyEnd { blockedPick; blockedManagerId; blockedRound; configuredRounds; completedRounds; voidedPicks: DraftPick[]; unclaimedSides: Array<{ teamId: TeamId; side: Side }> }`
  - `earlyEnd(state: DraftState, teamIds: readonly TeamId[]): EarlyEnd | null`
  - `currentPickNumber` returns null in `fades` and `complete`.
  - Test helpers in `src/lib/draft-scenarios.ts`: `SideChoice`, `SIDE_ORDER`, `seatIds(n)`, `startedDraft(n, rounds)`, `confirmNext(state, choice)`, `plainDraft(n, rounds)`, `blockedDraft(n, rounds, blockedPick)`, `confirmsOf(state)`.

How the rule works: after a confirm, if it was the configured last pick the draft moves to `fades` as today. Otherwise the manager on the clock for the next pick is checked with `hasEligibleSide` (a team they don't hold with a side nobody holds). When there is none, `blockedPick` is that next pick number, `picks` keeps the first ⌊(blockedPick − 1) ÷ managers⌋ × managers picks, the rest move to `voidedPicks`, and the status becomes `fades`. Because it happens inside `applyDraftAction`, the server persists it in the same transaction as the pick (Task 5).

Why blocking can't empty a league: the manager on the clock holds at most `rounds` teams, so a block needs at most `rounds` open sides, i.e. at least 60 − rounds picks made. That is always past round 1, so at least one round is kept and every manager has opponent picks to fade. The default 4 × 11 (44 picks) can never block, so existing leagues behave exactly as before.

- [ ] **Step 1: Extend `DraftState`**

In `src/lib/types.ts`, replace the `DraftState` interface:

```ts
export interface DraftState {
  status: DraftStatus;
  /** Configured rounds. After an early end fewer are completed; see completedRounds in draft.ts. */
  rounds: number;
  /** Manager ids in seat order. */
  seatOrder: string[];
  /** Picks that count, in pick-number order. Rosters, scoring and fades read only these. */
  picks: DraftPick[];
  /** Picks from the round an early end cut short, in pick-number order. Draft history only: their sides are unclaimed. */
  voidedPicks: DraftPick[];
  /**
   * The pick the manager on the clock couldn't make (every open side was the other side of a team they hold), which
   * ended regular drafting early. Null unless the draft ended early.
   */
  blockedPick: number | null;
}
```

- [ ] **Step 2: Add the scripted-draft helper**

`src/lib/draft-scenarios.ts` (used only by tests; it lives in `src/lib/` so lib and db tests share it):

```ts
import { TEAM_IDS, TEAM_INFO } from "@/data/teams";
import { applyDraftAction, createDraftState, findPickForSide, holdsTeam, seatForPick } from "@/lib/draft";
import type { DraftState, Side, TeamId } from "@/lib/types";

// Scripted drafts for tests. Every confirm goes through applyDraftAction, so all draft rules (including the early end)
// apply. Seats are m1…mN with all 30 teams.

export interface SideChoice {
  teamId: TeamId;
  side: Side;
}

/** Every side: each team's Over in team order, then each team's Under. */
export const SIDE_ORDER: readonly SideChoice[] = [
  ...TEAM_INFO.map((team) => ({ teamId: team.id, side: "OVER" as const })),
  ...TEAM_INFO.map((team) => ({ teamId: team.id, side: "UNDER" as const })),
];

export function seatIds(managerCount: number): string[] {
  return Array.from({ length: managerCount }, (_, seat) => `m${seat + 1}`);
}

export function startedDraft(managerCount: number, rounds: number): DraftState {
  const result = applyDraftAction(createDraftState(seatIds(managerCount), rounds), { type: "start" }, TEAM_IDS);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

/** Confirms a side for the pick on the clock; throws if the rules refuse it. */
export function confirmNext(state: DraftState, choice: SideChoice): DraftState {
  const pickNumber = state.picks.length + 1;
  const result = applyDraftAction(state, { type: "confirm", ...choice, pickNumber }, TEAM_IDS);
  if (!result.ok) throw new Error(`pick ${pickNumber}: ${result.error}`);
  return result.state;
}

function onClock(state: DraftState): string {
  return state.seatOrder[seatForPick(state.picks.length + 1, state.seatOrder.length)];
}

function canTake(state: DraftState, managerId: string, choice: SideChoice): boolean {
  return !findPickForSide(state, choice.teamId, choice.side) && !holdsTeam(state, managerId, choice.teamId);
}

function playOut(state: DraftState, sidesFor: (managerId: string) => readonly SideChoice[]): DraftState {
  while (state.status === "live") {
    const managerId = onClock(state);
    const choice = sidesFor(managerId).find((candidate) => canTake(state, managerId, candidate));
    if (!choice) throw new Error(`no scripted side for ${managerId} at pick ${state.picks.length + 1}`);
    state = confirmNext(state, choice);
  }
  return state;
}

/** Every pick takes the first side in SIDE_ORDER the manager may hold. Nobody is ever blocked (tested for every size). */
export function plainDraft(managerCount: number, rounds: number): DraftState {
  return playOut(startedDraft(managerCount, rounds), () => SIDE_ORDER);
}

/**
 * Plays picks 1 … blockedPick − 1 so the manager on the clock at blockedPick has no eligible side: they take the Overs of
 * the last teams, everyone else uses up every other side first and then those teams' Unders. Throws unless the draft ends
 * early exactly at blockedPick (it needs blockedPick ≥ 61 − the blocked manager's earlier picks).
 */
export function blockedDraft(managerCount: number, rounds: number, blockedPick: number): DraftState {
  const blockedSeat = seatForPick(blockedPick, managerCount);
  let earlierPicks = 0;
  for (let pickNumber = 1; pickNumber < blockedPick; pickNumber++) {
    if (seatForPick(pickNumber, managerCount) === blockedSeat) earlierPicks++;
  }
  const reserved = TEAM_INFO.slice(TEAM_INFO.length - earlierPicks).map((team) => team.id);
  const blockedSides = reserved.map((teamId) => ({ teamId, side: "OVER" as const }));
  const otherSides = [
    ...SIDE_ORDER.filter((choice) => !reserved.includes(choice.teamId)),
    ...reserved.map((teamId) => ({ teamId, side: "UNDER" as const })),
  ];
  const blocked = seatIds(managerCount)[blockedSeat];
  const state = playOut(startedDraft(managerCount, rounds), (managerId) =>
    managerId === blocked ? blockedSides : otherSides,
  );
  if (state.blockedPick !== blockedPick) {
    throw new Error(`expected the draft to end early at pick ${blockedPick}, got ${state.blockedPick}`);
  }
  return state;
}

/** Every confirm a scripted draft made, kept and voided, in pick order. */
export function confirmsOf(state: DraftState): Array<SideChoice & { pickNumber: number }> {
  return [...state.picks, ...state.voidedPicks]
    .sort((a, b) => a.pickNumber - b.pickNumber)
    .map(({ pickNumber, teamId, side }) => ({ pickNumber, teamId, side }));
}
```

- [ ] **Step 3: Write the failing tests**

In `src/lib/draft.test.ts`:

1. Extend the imports:

```ts
import { TEAM_IDS as ALL_TEAM_IDS } from "@/data/teams";
import {
  applyDraftAction,
  completedRounds,
  createDraftState,
  currentPickNumber,
  earlyEnd,
  findPickForSide,
  hasEligibleSide,
  holdsTeam,
  managerOnTheClock,
  managerUpNext,
  pickNumberFor,
  picksForManager,
  roundOf,
  seatForPick,
  totalPicks,
  type DraftAction,
} from "@/lib/draft";
import { blockedDraft, confirmNext, plainDraft, seatIds, SIDE_ORDER, startedDraft } from "@/lib/draft-scenarios";
import { maxRounds } from "@/lib/league/config";
```

2. In `describe("draft state")`, change the expected object to
   `{ status: "not_started", rounds: 11, seatOrder: SEATS, picks: [], voidedPicks: [], blockedPick: null }`.

3. Append:

```ts
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe("league sizes", () => {
  it("snakes for any number of managers", () => {
    expect(range(1, 12).map((p) => seatForPick(p, 6))).toEqual([0, 1, 2, 3, 4, 5, 5, 4, 3, 2, 1, 0]);
    expect(range(1, 14).map((p) => seatForPick(p, 7))).toEqual([0, 1, 2, 3, 4, 5, 6, 6, 5, 4, 3, 2, 1, 0]);
    expect(totalPicks(6, 10)).toBe(60);
    expect(totalPicks(7, 8)).toBe(56);
  });

  it.each([
    [6, 10],
    [7, 8],
    [4, 11],
    [2, 30],
    [12, 5],
    [3, 1],
  ])("%i managers × %i rounds finishes normally when nobody is blocked", (managerCount, rounds) => {
    const state = plainDraft(managerCount, rounds);
    expect(state).toMatchObject({ status: "fades", blockedPick: null, voidedPicks: [] });
    expect(state.picks).toHaveLength(managerCount * rounds);
    expect(completedRounds(state)).toBe(rounds);
    expect(currentPickNumber(state)).toBeNull();
    expect(earlyEnd(state, [...ALL_TEAM_IDS])).toBeNull();
    for (const managerId of seatIds(managerCount)) expect(picksForManager(state, managerId)).toHaveLength(rounds);
  });

  it("finishes normally when the configured final pick takes the last open side", () => {
    // 6 × 10 uses all 60 sides: after pick 60 nobody could pick again, but the draft is simply done.
    const state = plainDraft(6, 10);
    expect(state.picks).toHaveLength(60);
    expect(state).toMatchObject({ status: "fades", blockedPick: null });
  });
});

describe("early end", () => {
  /** Sides that were open at the block (unclaimed and not voided): the ones the blocked manager couldn't take. */
  function openAtBlock(state: ReturnType<typeof blockedDraft>) {
    const voided = new Set(state.voidedPicks.map((pick) => `${pick.teamId} ${pick.side}`));
    return earlyEnd(state, [...ALL_TEAM_IDS])!.unclaimedSides.filter(
      (side) => !voided.has(`${side.teamId} ${side.side}`),
    );
  }

  it("6 × 10 blocked partway through round 10: keeps 9 rounds, voids the round's picks", () => {
    const state = blockedDraft(6, 10, 58);
    expect(state).toMatchObject({ status: "fades", blockedPick: 58, rounds: 10 });
    expect(state.picks.map((pick) => pick.pickNumber)).toEqual(range(1, 54));
    expect(state.voidedPicks.map((pick) => pick.pickNumber)).toEqual([55, 56, 57]);
    expect(completedRounds(state)).toBe(9);
    expect(currentPickNumber(state)).toBeNull();
    expect(managerOnTheClock(state)).toBeNull();
    expect(managerUpNext(state)).toBeNull();

    const summary = earlyEnd(state, [...ALL_TEAM_IDS])!;
    expect(summary).toMatchObject({
      blockedPick: 58,
      blockedManagerId: "m3",
      blockedRound: 10,
      configuredRounds: 10,
      completedRounds: 9,
    });
    expect(summary.voidedPicks).toEqual(state.voidedPicks);
    expect(summary.unclaimedSides).toHaveLength(60 - 54);
    for (const pick of state.voidedPicks) {
      expect(summary.unclaimedSides).toContainEqual({ teamId: pick.teamId, side: pick.side });
      expect(findPickForSide(state, pick.teamId, pick.side)).toBeUndefined();
    }
    const open = openAtBlock(state);
    expect(open.length).toBeGreaterThan(0);
    for (const side of open) expect(holdsTeam(state, "m3", side.teamId)).toBe(true);
  });

  it("6 × 10 blocked on the first pick of round 10: nothing to void", () => {
    const state = blockedDraft(6, 10, 55);
    expect(state.picks).toHaveLength(54);
    expect(state.voidedPicks).toEqual([]);
    expect(earlyEnd(state, [...ALL_TEAM_IDS])).toMatchObject({ blockedManagerId: "m6", completedRounds: 9 });
  });

  it("6 × 10 blocked at the configured final pick still ends early", () => {
    const state = blockedDraft(6, 10, 60);
    expect(state).toMatchObject({ status: "fades", blockedPick: 60 });
    expect(state.voidedPicks.map((pick) => pick.pickNumber)).toEqual([55, 56, 57, 58, 59]);
    expect(earlyEnd(state, [...ALL_TEAM_IDS])!.blockedManagerId).toBe("m1");
  });

  it("7 × 8 blocked partway through round 8: keeps 7 rounds", () => {
    const state = blockedDraft(7, 8, 54);
    expect(state.picks.map((pick) => pick.pickNumber)).toEqual(range(1, 49));
    expect(state.voidedPicks.map((pick) => pick.pickNumber)).toEqual([50, 51, 52, 53]);
    const summary = earlyEnd(state, [...ALL_TEAM_IDS])!;
    expect(summary).toMatchObject({ blockedManagerId: "m3", blockedRound: 8, configuredRounds: 8, completedRounds: 7 });
    expect(summary.unclaimedSides).toHaveLength(60 - 49);
    for (const side of openAtBlock(state)) expect(holdsTeam(state, "m3", side.teamId)).toBe(true);
  });

  it("takes no more picks once regular drafting ended", () => {
    const state = blockedDraft(6, 10, 58);
    expect(applyDraftAction(state, { type: "confirm", teamId: "MIN", side: "OVER", pickNumber: 58 }, ALL_TEAM_IDS)).toEqual({
      ok: false,
      error: "not_live",
    });
    expect(applyDraftAction(state, { type: "pause" }, ALL_TEAM_IDS)).toEqual({ ok: false, error: "invalid_transition" });
  });

  it("never ends early while the next manager has a side, and always ends when they have none", () => {
    // Random legal drafts for every size, from a fixed seed so failures reproduce.
    let seed = 2026;
    const random = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let managerCount = 2; managerCount <= 12; managerCount++) {
      for (const rounds of [maxRounds(managerCount), maxRounds(managerCount) - 1]) {
        for (let run = 0; run < 5; run++) {
          let state = startedDraft(managerCount, rounds);
          while (state.status === "live") {
            const managerId = managerOnTheClock(state)!;
            const options = SIDE_ORDER.filter(
              (choice) => !findPickForSide(state, choice.teamId, choice.side) && !holdsTeam(state, managerId, choice.teamId),
            );
            expect(options.length).toBeGreaterThan(0);
            const choice = options[Math.floor(random() * options.length)];
            const before = state;
            state = confirmNext(state, choice);
            if (state.blockedPick === null) continue;
            // The moment of the block: every pick made, nothing voided yet.
            const pickNumber = before.picks.length + 1;
            const atBlock = { ...before, picks: [...before.picks, { pickNumber, managerId, ...choice }] };
            const blocked = state.seatOrder[seatForPick(state.blockedPick, managerCount)];
            expect(state.blockedPick).toBe(pickNumber + 1);
            expect(hasEligibleSide(atBlock, blocked, ALL_TEAM_IDS)).toBe(false);
            for (const side of SIDE_ORDER) {
              const attempt = applyDraftAction(atBlock, { type: "confirm", ...side, pickNumber: pickNumber + 1 }, ALL_TEAM_IDS);
              expect(attempt.ok).toBe(false);
            }
            expect(state.picks).toHaveLength(Math.floor(pickNumber / managerCount) * managerCount);
            expect(state.picks.length + state.voidedPicks.length).toBe(pickNumber);
            expect(completedRounds(state)).toBeGreaterThanOrEqual(1);
          }
          if (state.blockedPick === null) expect(state.picks).toHaveLength(managerCount * rounds);
        }
      }
    }
  });
});
```

- [ ] **Step 4: Run them to see them fail**

Run: `npx vitest run src/lib/draft.test.ts`
Expected: FAIL — `completedRounds`, `earlyEnd`, `hasEligibleSide` are not exported (and `draft-scenarios` can't import them).

- [ ] **Step 5: Implement in `src/lib/draft.ts`**

1. Add below the imports:

```ts
const ALL_SIDES: readonly Side[] = ["OVER", "UNDER"];
```

2. Replace `createDraftState` and `currentPickNumber`:

```ts
export function createDraftState(seatOrder: string[], rounds: number): DraftState {
  return { status: "not_started", rounds, seatOrder, picks: [], voidedPicks: [], blockedPick: null };
}
```

```ts
/** The pick being made now, or null once regular drafting is over (every pick in, or ended early). */
export function currentPickNumber(state: DraftState): number | null {
  if (state.status === "fades" || state.status === "complete") return null;
  const next = state.picks.length + 1;
  return next > draftTotalPicks(state) ? null : next;
}
```

3. Add after `holdsTeam`:

```ts
/** Rounds every manager finished. After an early end, the rounds whose picks were kept. */
export function completedRounds(state: DraftState): number {
  return Math.floor(state.picks.length / state.seatOrder.length);
}

/** True when the manager may take at least one open side: a side nobody holds, on a team they don't hold. */
export function hasEligibleSide(state: DraftState, managerId: string, teamIds: ReadonlySet<TeamId>): boolean {
  for (const teamId of teamIds) {
    if (holdsTeam(state, managerId, teamId)) continue;
    if (ALL_SIDES.some((side) => !findPickForSide(state, teamId, side))) return true;
  }
  return false;
}

/**
 * Ends regular drafting because the manager on the clock at blockedPick has no eligible side. Only fully completed
 * rounds are kept; the cut-short round's picks are voided (their sides are unclaimed again) and the fade stage opens.
 */
function endEarly(state: DraftState, blockedPick: number): DraftState {
  const managerCount = state.seatOrder.length;
  const kept = Math.floor((blockedPick - 1) / managerCount) * managerCount;
  return {
    ...state,
    status: "fades",
    picks: state.picks.slice(0, kept),
    voidedPicks: state.picks.slice(kept),
    blockedPick,
  };
}

/** Why and where regular drafting stopped early, for the draft room. */
export interface EarlyEnd {
  blockedPick: number;
  /** The manager who had no eligible side at blockedPick. */
  blockedManagerId: string;
  /** The round regular drafting stopped in. */
  blockedRound: number;
  configuredRounds: number;
  completedRounds: number;
  /** The cut-short round's picks; empty when it stopped on a round's first pick. */
  voidedPicks: DraftPick[];
  /** Every side nobody holds, voided ones included, in team order with the Over first. */
  unclaimedSides: Array<{ teamId: TeamId; side: Side }>;
}

/** Null unless the draft ended early. teamIds gives the order of unclaimedSides. */
export function earlyEnd(state: DraftState, teamIds: readonly TeamId[]): EarlyEnd | null {
  if (state.blockedPick === null) return null;
  const managerCount = state.seatOrder.length;
  return {
    blockedPick: state.blockedPick,
    blockedManagerId: state.seatOrder[seatForPick(state.blockedPick, managerCount)],
    blockedRound: roundOf(state.blockedPick, managerCount),
    configuredRounds: state.rounds,
    completedRounds: completedRounds(state),
    voidedPicks: state.voidedPicks,
    unclaimedSides: teamIds.flatMap((teamId) =>
      ALL_SIDES.filter((side) => !findPickForSide(state, teamId, side)).map((side) => ({ teamId, side })),
    ),
  };
}
```

4. In `applyDraftAction`, update the doc comment's last sentence to:
   `The last pick opens the fade stage (see fades.ts); so does a pick after which the next manager has no eligible side (see endEarly).`
   and replace the last two lines of the `confirm` case (from `const picks = …`) with:

```ts
      const picks = [...state.picks, { pickNumber, managerId, teamId: action.teamId, side: action.side }];
      const next: DraftState = { ...state, picks };
      if (picks.length === draftTotalPicks(state)) return ok({ ...next, status: "fades" });
      // Never end early while the next manager has a side to take; when they have none, nobody drafts again.
      const nextManagerId = managerForPick(next, pickNumber + 1)!;
      return ok(hasEligibleSide(next, nextManagerId, teamIds) ? next : endEarly(next, pickNumber + 1));
```

(`next` keeps `status: "live"` from `state`.)

- [ ] **Step 6: Add the new fields everywhere a `DraftState` is built**

Run `npm run typecheck`. Fix each "missing properties voidedPicks, blockedPick" error by adding `voidedPicks: [], blockedPick: null` to the literal:
- `src/data/demo-league.ts`: `draft: { status: "complete", rounds: LEAGUE_DEFAULTS.rounds, seatOrder: [...DEMO_SEATS], picks, voidedPicks: [], blockedPick: null }`
- `src/db/leagues.ts` `assemble()`: add `voidedPicks: [], blockedPick: null` after `picks` (Task 5 replaces this with stored values; no league can end early before then, because only the default 4 × 11 size exists until Task 6).
- test literals in `src/lib/fades.test.ts`, `src/lib/standings.test.ts`, `src/lib/team-detail.test.ts`, `src/lib/league/turn.test.ts`, `src/lib/league/permissions.test.ts`.

- [ ] **Step 7: Run all tests**

Run: `npm test`
Expected: PASS. If an existing test with a tiny team set (3–4 teams) now ends a draft early, that's the new rule working: widen that test's team set to `TEAM_IDS` from `@/data/teams` (with lines for those teams where the test freezes lines) rather than changing the rule. Report any such change in the commit message.

- [ ] **Step 8: Lint, typecheck, commit**

```bash
npm run lint && npm run typecheck
git add src/lib/types.ts src/lib/draft.ts src/lib/draft-scenarios.ts src/lib/draft.test.ts src/data/demo-league.ts src/db/leagues.ts src/lib/fades.test.ts src/lib/standings.test.ts src/lib/team-detail.test.ts src/lib/league/turn.test.ts src/lib/league/permissions.test.ts
git commit -m "feat: end regular drafting early when the next manager has no eligible side

Keeps only completed rounds and moves the cut-short round's picks to voidedPicks.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Voided picks never count (fades, scoring, team page)

Suggested model: haiku (complete code below).

**Files:**
- Modify: `src/lib/fades.ts`, `src/lib/league/errors.ts`, `src/server/http.ts`
- Test: `src/lib/fades.test.ts`, `src/lib/standings.test.ts`, `src/lib/team-detail.test.ts`

**Interfaces:**
- Consumes: `blockedDraft`, `seatIds` (Task 2), `withLines`, `indexTeams` (`src/lib/lines.ts`), `STATIC_LINES` (`src/data/static-lines.ts`), `TEAM_INFO`.
- Produces: `FadeError` gains `"voided_pick"` (HTTP 400). `applyFade` returns it for a voided target.

Scoring, standings, rosters and the team page already read only `draft.picks`; these tests pin that down so nobody later merges the two lists.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/fades.test.ts` (add imports `import { blockedDraft, seatIds } from "@/lib/draft-scenarios";`):

```ts
describe("fades after an early end", () => {
  // 6 × 10 blocked at pick 58: picks 1–54 kept, 55–57 voided.
  const draft = blockedDraft(6, 10, 58);
  const managers: Manager[] = seatIds(6).map((id, seat) => ({ id, seat, displayName: null }));
  const ended: FadeStage = { managers, draft, fades: [] };

  it("offers only kept opponent picks", () => {
    const targets = fadeTargets(draft, "m1");
    expect(targets).toHaveLength(54 - 9);
    expect(targets.every((pick) => pick.pickNumber <= 54 && pick.managerId !== "m1")).toBe(true);
  });

  it("refuses a voided pick", () => {
    expect(applyFade(ended, "m1", 56)).toEqual({ ok: false, error: "voided_pick" });
  });

  it("lets several managers fade the same pick, refuses your own, and completes with the last manager's fade", () => {
    expect(applyFade(ended, "m1", 1)).toEqual({ ok: false, error: "own_pick" });
    let stage = ended;
    for (const managerId of seatIds(6)) {
      const result = applyFade(stage, managerId, managerId === "m1" ? 2 : 1);
      if (!result.ok) throw new Error(result.error);
      stage = { ...stage, ...result.value };
      expect(stage.draft.status).toBe(managerId === "m6" ? "complete" : "fades");
    }
    expect(stage.fades.filter((fade) => fade.targetPickNumber === 1)).toHaveLength(5);
  });
});
```

Append to `src/lib/standings.test.ts` (add the imports below if missing):

```ts
import { STATIC_LINES } from "@/data/static-lines";
import { TEAM_INFO } from "@/data/teams";
import { blockedDraft, seatIds } from "@/lib/draft-scenarios";
import { indexTeams, withLines } from "@/lib/lines";

describe("after an early end", () => {
  it("scores only kept picks", () => {
    const draft = blockedDraft(6, 10, 58);
    const managers = seatIds(6).map((id, seat) => ({ id, seat, displayName: null }));
    const standings = computeStandings({ managers, draft, fades: [] }, indexTeams(withLines(TEAM_INFO, STATIC_LINES)), "projected");
    const scoredPicks = standings.rows.flatMap((row) => row.calls.map((call) => call.pick.pickNumber));
    expect(scoredPicks.sort((a, b) => a - b)).toEqual(Array.from({ length: 54 }, (_, i) => i + 1));
    for (const row of standings.rows) expect(row.calls).toHaveLength(9);
  });
});
```

Append to `src/lib/team-detail.test.ts` (same imports as above, plus `teamOwnership` if not already imported):

```ts
describe("a voided side", () => {
  it("shows as unclaimed", () => {
    const draft = blockedDraft(6, 10, 58);
    const managers = seatIds(6).map((id, seat) => ({ id, seat, displayName: null }));
    const teams = indexTeams(withLines(TEAM_INFO, STATIC_LINES));
    const voided = draft.voidedPicks[0];
    const sides = teamOwnership({ managers, draft, fades: [] }, voided.teamId, teams[voided.teamId]);
    const side = sides.find((candidate) => candidate.side === voided.side)!;
    expect(side.pick).toBeNull();
    expect(side.manager).toBeNull();
  });
});
```

If an import name above already exists in the file, don't duplicate it.

- [ ] **Step 2: Run to see the fade test fail**

Run: `npx vitest run src/lib/fades.test.ts src/lib/standings.test.ts src/lib/team-detail.test.ts`
Expected: FAIL — "refuses a voided pick" gets `unknown_pick`. (The standings and team-page tests already pass: they guard the design.)

- [ ] **Step 3: Implement**

`src/lib/fades.ts`:
- `export type FadeError = "not_fading" | "fade_locked" | "unknown_pick" | "voided_pick" | "own_pick" | "not_found";`
- Doc of `fadeTargets`: `/** The picks a manager may fade: every kept opponent pick, in pick order. Voided picks are never targets. */`
- In `applyFade`, before `const target = …`:

```ts
  if (league.draft.voidedPicks.some((pick) => pick.pickNumber === targetPickNumber)) {
    return { ok: false, error: "voided_pick" };
  }
```

`src/lib/league/errors.ts`, in `ERROR_MESSAGES` after `unknown_pick`:

```ts
  voided_pick: "That pick was voided when the draft ended early. Fade a kept pick.",
```

`src/server/http.ts`, in `STATUS` after `unknown_pick: 400,`:

```ts
  voided_pick: 400,
```

- [ ] **Step 4: Run tests, lint, typecheck**

Run: `npm test && npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fades.ts src/lib/league/errors.ts src/server/http.ts src/lib/fades.test.ts src/lib/standings.test.ts src/lib/team-detail.test.ts
git commit -m "feat: voided picks can't be faded; tests pin them out of scoring and ownership

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The league-size decision (`decideLeagueConfig`)

Suggested model: haiku (complete code below).

**Files:**
- Modify: `src/lib/league/commands.ts`, `src/lib/league/errors.ts`, `src/server/http.ts`
- Test: `src/lib/league/commands.test.ts`

**Interfaces:**
- Consumes: `LeagueConfig`, `isValidLeagueConfig`, `minManagerCount`, `resizeSeats` (Task 1); `canControlDraft` (`permissions.ts`).
- Produces:
  - `decideLeagueConfig(league: League, actorId: string | null, config: LeagueConfig): Result<League>`
  - `DomainError` gains `"invalid_config"` (400), `"config_locked"` (409), `"seats_claimed"` (409).
  - `decideDraftAction` refuses `start` with `invalid_config` if the stored size is ever invalid (defense in depth).

- [ ] **Step 1: Write the failing tests**

In `src/lib/league/commands.test.ts`, add `decideLeagueConfig` to the commands import, add `import { managerOnTheClock, draftTotalPicks } from "@/lib/draft";` (merge with any existing import from `@/lib/draft`), and append:

```ts
describe("decideLeagueConfig", () => {
  it("adds open seats and sets the rounds", () => {
    const league = must(decideLeagueConfig(join(newLeague(), "m2", "Ben"), "m1", { managerCount: 6, rounds: 10 }));
    expect(league.managers.map((m) => [m.id, m.seat, m.displayName])).toEqual([
      ["m1", 0, "Ana"],
      ["m2", 1, "Ben"],
      ["m3", 2, null],
      ["m4", 3, null],
      ["m5", 4, null],
      ["m6", 5, null],
    ]);
    expect(league.draft).toMatchObject({ rounds: 10, seatOrder: ["m1", "m2", "m3", "m4", "m5", "m6"], picks: [] });
    expect(draftTotalPicks(league.draft)).toBe(60);
  });

  it("removes open seats from the end but never a claimed one", () => {
    const league = join(newLeague(), "m3", "Cal");
    expect(decideLeagueConfig(league, "m1", { managerCount: 2, rounds: 11 })).toEqual({ ok: false, error: "seats_claimed" });
    const smaller = must(decideLeagueConfig(league, "m1", { managerCount: 3, rounds: 20 }));
    expect(smaller.managers.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
    expect(smaller.draft).toMatchObject({ rounds: 20, seatOrder: ["m1", "m2", "m3"] });
  });

  it("refuses invalid sizes, other managers, the demo league and a started draft", () => {
    const league = join(newLeague(), "m2", "Ben");
    expect(decideLeagueConfig(league, "m1", { managerCount: 7, rounds: 9 })).toEqual({ ok: false, error: "invalid_config" });
    expect(decideLeagueConfig(league, "m1", { managerCount: 13, rounds: 1 })).toEqual({ ok: false, error: "invalid_config" });
    expect(decideLeagueConfig(league, "m2", { managerCount: 6, rounds: 10 })).toEqual({ ok: false, error: "forbidden" });
    expect(decideLeagueConfig(league, null, { managerCount: 6, rounds: 10 })).toEqual({ ok: false, error: "forbidden" });
    expect(decideLeagueConfig({ ...league, isDemo: true }, "m1", { managerCount: 6, rounds: 10 })).toEqual({
      ok: false,
      error: "demo_league",
    });
    const started = must(act(league, "m1", { type: "start" }));
    expect(decideLeagueConfig(started, "m1", { managerCount: 6, rounds: 10 })).toEqual({ ok: false, error: "config_locked" });
  });

  it("starts the draft with the configured seats", () => {
    const league = must(decideLeagueConfig(newLeague(), "m1", { managerCount: 7, rounds: 8 }));
    const started = must(act(league, "m1", { type: "start" }));
    expect(started.draft.status).toBe("live");
    expect(draftTotalPicks(started.draft)).toBe(56);
    expect(managerOnTheClock(started.draft)).toBe("m1");
  });

  it("refuses to start a league whose stored size is invalid", () => {
    const league = newLeague();
    const broken = { ...league, draft: { ...league.draft, rounds: 16 } };
    expect(act(broken, "m1", { type: "start" })).toEqual({ ok: false, error: "invalid_config" });
  });

  it("keeps new leagues at the default 4 × 11", () => {
    expect(newLeague().draft).toMatchObject({ rounds: 11, seatOrder: ["m1", "m2", "m3", "m4"] });
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/lib/league/commands.test.ts`
Expected: FAIL — `decideLeagueConfig` is not exported.

- [ ] **Step 3: Add the errors**

`src/lib/league/errors.ts`:
- Add to `DomainError` (after `"records_unavailable"`): `| "invalid_config" | "config_locked" | "seats_claimed"`.
- Add imports `import { LEAGUE_LIMITS } from "@/config/league";` and `import { TOTAL_SIDES } from "@/data/teams";`.
- Add to `ERROR_MESSAGES`:

```ts
  invalid_config: `Leagues have ${LEAGUE_LIMITS.minManagers}–${LEAGUE_LIMITS.maxManagers} managers, and managers × rounds can't exceed the ${TOTAL_SIDES} sides.`,
  config_locked: "League size is locked once the draft starts.",
  seats_claimed: "Claimed seats can't be removed. Only open seats at the end of the order can go.",
```

`src/server/http.ts` `STATUS`: `invalid_config: 400, config_locked: 409, seats_claimed: 409,`.

- [ ] **Step 4: Implement the decision**

`src/lib/league/commands.ts`:
- Import: `import { isValidLeagueConfig, minManagerCount, resizeSeats, type LeagueConfig } from "@/lib/league/config";`
- Change the `createLeague` doc to `/** A fresh league at the default size (LEAGUE_DEFAULTS) with the creator in seat 1 as commissioner. */`
- In `decideDraftAction`, right after `if (action.type !== "start") return succeed({ ...league, draft: result.state });` insert:

```ts
  if (!isValidLeagueConfig({ managerCount: league.managers.length, rounds: league.draft.rounds })) {
    return fail("invalid_config");
  }
```

- Add after `decideLineOverrides`:

```ts
/**
 * Changes the league size before the draft: seats are added open at the end or removed from the end (open seats only),
 * and the rounds are set. Commissioner only. Parse the request with parseLeagueConfig first.
 */
export function decideLeagueConfig(league: League, actorId: string | null, config: LeagueConfig): Result<League> {
  if (league.isDemo) return fail("demo_league");
  if (!canControlDraft(league, actorId)) return fail("forbidden");
  if (league.draft.status !== "not_started") return fail("config_locked");
  if (!isValidLeagueConfig(config)) return fail("invalid_config");
  if (config.managerCount < minManagerCount(league.managers)) return fail("seats_claimed");
  const managers = resizeSeats(league.managers, config.managerCount);
  return succeed({
    ...league,
    managers,
    draft: { ...league.draft, rounds: config.rounds, seatOrder: managers.map((manager) => manager.id) },
  });
}
```

- [ ] **Step 5: Run tests, lint, typecheck**

Run: `npm test && npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/league/commands.ts src/lib/league/errors.ts src/server/http.ts src/lib/league/commands.test.ts
git commit -m "feat: commissioner league-size decision before the draft

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Store sizes and early ends (schema, `saveLeague`, `setLeagueConfig`)

Suggested model: sonnet (database and migration work).

**Files:**
- Modify: `src/db/schema.ts`; Create: `drizzle/0004_league_size.sql` + `drizzle/meta/0004_snapshot.json` (generated) + `drizzle/meta/_journal.json` (generated)
- Modify: `src/db/leagues.ts`, `src/db/actions.ts`
- Test: `src/db/actions.test.ts`, Create: `src/db/migrations.test.ts`, Modify: `src/db/concurrency.pg.test.ts`

**Interfaces:**
- Consumes: `decideLeagueConfig` (Task 4), `LeagueConfig` (Task 1), `blockedDraft`, `plainDraft`, `confirmsOf` (Task 2).
- Produces:
  - Columns `picks.voided boolean not null default false`, `leagues.blocked_pick smallint null`.
  - `loadLeague` fills `draft.voidedPicks` and `draft.blockedPick`.
  - `saveLeague` also writes: added/removed managers, `rounds`, `blocked_pick`, new picks with their `voided` flag, and flips stored picks to voided.
  - `setLeagueConfig(db: Db, leagueId: string, sessionId: string | null, config: LeagueConfig): Promise<Result<DraftOutcome>>`

- [ ] **Step 1: Schema and migration**

`src/db/schema.ts`:
- Add `boolean` to the `drizzle-orm/pg-core` import.
- In `leagues`, after `rounds`:

```ts
    /** The pick nobody could make when regular drafting ended early. Null unless it did. */
    blockedPick: smallint("blocked_pick"),
```

- In `picks`, after `side`:

```ts
    /** Voided when an early end cut its round short: kept for the draft history, never counted. */
    voided: boolean("voided").notNull().default(false),
```

Run: `npm run db:generate -- --name league_size`
Expected: a new `drizzle/0004_league_size.sql` containing (order may differ):

```sql
ALTER TABLE "leagues" ADD COLUMN "blocked_pick" smallint;--> statement-breakpoint
ALTER TABLE "picks" ADD COLUMN "voided" boolean DEFAULT false NOT NULL;
```

plus `drizzle/meta/0004_snapshot.json` and an updated `_journal.json`. Existing rows get `voided = false` and `blocked_pick = null`: every existing league keeps all its picks.

- [ ] **Step 2: Write the failing tests**

In `src/db/actions.test.ts`:
- Add `setLeagueConfig` to the `@/db/actions` import, `picks` to the `@/db/schema` import, and:

```ts
import { blockedDraft, confirmsOf, plainDraft } from "@/lib/draft-scenarios";
import type { DraftState } from "@/lib/types";
```

- Append:

```ts
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe("league size", () => {
  it("grows the league before the draft, and the new seats can be claimed", async () => {
    expect((await setLeagueConfig(db, LEAGUE, ana, { managerCount: 6, rounds: 10 })).ok).toBe(true);
    const league = (await loadLeague(db, LEAGUE))!;
    expect(league.managers.map((m) => m.id)).toEqual(["m1", "m2", "m3", "m4", "m5", "m6"]);
    expect(league.draft).toMatchObject({ rounds: 10, seatOrder: ["m1", "m2", "m3", "m4", "m5", "m6"] });
    expect(league.version).toBe(2);
    expect((await joinAs(ben, "m6", "Ben")).ok).toBe(true);
    expect(await seatInLeague(db, ben, LEAGUE)).toBe("m6");
  });

  it("shrinks by removing open seats only; claimed seats and their sessions stay", async () => {
    await joinAs(ben, "m3", "Ben");
    expect(await setLeagueConfig(db, LEAGUE, ana, { managerCount: 2, rounds: 11 })).toEqual({ ok: false, error: "seats_claimed" });
    expect((await setLeagueConfig(db, LEAGUE, ana, { managerCount: 3, rounds: 20 })).ok).toBe(true);
    const league = (await loadLeague(db, LEAGUE))!;
    expect(league.managers.map((m) => [m.id, m.displayName])).toEqual([["m1", "Ana"], ["m2", null], ["m3", "Ben"]]);
    expect(league.draft.rounds).toBe(20);
    expect(await seatInLeague(db, ben, LEAGUE)).toBe("m3");
    expect(await seatInLeague(db, ana, LEAGUE)).toBe("m1");
  });

  it("refuses other managers, invalid sizes and changes after the start, writing nothing", async () => {
    await joinAs(ben, "m2", "Ben");
    expect(await setLeagueConfig(db, LEAGUE, ben, { managerCount: 6, rounds: 10 })).toEqual({ ok: false, error: "forbidden" });
    expect(await setLeagueConfig(db, LEAGUE, ana, { managerCount: 7, rounds: 9 })).toEqual({ ok: false, error: "invalid_config" });
    await runDraftAction(db, LEAGUE, ana, { type: "start" }, STATIC_LINES);
    expect(await setLeagueConfig(db, LEAGUE, ana, { managerCount: 6, rounds: 10 })).toEqual({ ok: false, error: "config_locked" });
    const league = (await loadLeague(db, LEAGUE))!;
    expect(league.managers).toHaveLength(4);
    expect(league.draft.rounds).toBe(11);
  });
});

describe("early end", () => {
  /** Sizes the league, starts it and replays a scripted draft's confirms; the commissioner picks for every open seat. */
  async function replay(state: DraftState, count = confirmsOf(state).length) {
    await setLeagueConfig(db, LEAGUE, ana, { managerCount: state.seatOrder.length, rounds: state.rounds });
    await runDraftAction(db, LEAGUE, ana, { type: "start" }, STATIC_LINES);
    for (const { pickNumber, teamId, side } of confirmsOf(state).slice(0, count)) {
      const result = await confirm(ana, pickNumber, teamId, side);
      if (!result.ok) throw new Error(`pick ${pickNumber}: ${result.error}`);
    }
  }

  it("6 × 10: voids the cut-short round in the same write as the pick that ended it", async () => {
    const script = confirmsOf(blockedDraft(6, 10, 58));
    await replay(blockedDraft(6, 10, 58), script.length - 1);
    const before = (await loadLeague(db, LEAGUE))!;
    expect(before.draft).toMatchObject({ status: "live", blockedPick: null, voidedPicks: [] });

    const last = script.at(-1)!;
    expect((await confirm(ana, last.pickNumber, last.teamId, last.side)).ok).toBe(true);
    const league = (await loadLeague(db, LEAGUE))!;
    expect(league.version).toBe(before.version + 1);
    expect(league.draft).toMatchObject({ status: "fades", blockedPick: 58, rounds: 10 });
    expect(league.draft.picks.map((p) => p.pickNumber)).toEqual(range(1, 54));
    expect(league.draft.voidedPicks.map((p) => p.pickNumber)).toEqual([55, 56, 57]);

    const rows = await db.select().from(picks).where(eq(picks.leagueId, LEAGUE));
    expect(rows).toHaveLength(57);
    expect(rows.filter((row) => row.voided).map((row) => row.pickNumber).sort((a, b) => a - b)).toEqual([55, 56, 57]);
    expect(await confirm(ana, 58, "MIN", "OVER")).toEqual({ ok: false, error: "not_live" });
  });

  it("excludes voided picks from fades and standings, and completes after every manager's fade", async () => {
    await replay(blockedDraft(6, 10, 58));
    expect(await fade(ana, "m1", 56)).toEqual({ ok: false, error: "voided_pick" });
    for (const managerId of ["m1", "m2", "m3", "m4", "m5", "m6"]) {
      const result = await fade(ana, managerId, managerId === "m1" ? 2 : 1);
      expect(result.ok).toBe(true);
    }
    const league = (await loadLeague(db, LEAGUE))!;
    expect(league.draft.status).toBe("complete");
    expect(league.fades).toHaveLength(6);
    const standings = computeStandings(league, indexTeams(withLines(TEAM_INFO, league.lines!)), "projected");
    const counted = standings.rows.flatMap((row) => row.calls.map((call) => call.pick.pickNumber));
    expect(Math.max(...counted)).toBe(54);
    expect(counted).toHaveLength(54);
  });

  it("7 × 8: keeps 7 rounds", async () => {
    await replay(blockedDraft(7, 8, 54));
    const league = (await loadLeague(db, LEAGUE))!;
    expect(league.draft).toMatchObject({ status: "fades", blockedPick: 54 });
    expect(league.draft.picks).toHaveLength(49);
    expect(league.draft.voidedPicks.map((p) => p.pickNumber)).toEqual([50, 51, 52, 53]);
  });

  it("7 × 8 with nobody blocked keeps every pick", async () => {
    await replay(plainDraft(7, 8));
    const league = (await loadLeague(db, LEAGUE))!;
    expect(league.draft).toMatchObject({ status: "fades", blockedPick: null, voidedPicks: [] });
    expect(league.draft.picks).toHaveLength(56);
  });
});
```

`src/db/migrations.test.ts` (new) — a league stored by the old schema survives migration 0004:

```ts
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { expect, it } from "vitest";
import { buildDemoLeague } from "@/data/demo-league";
import { runDraftAction } from "@/db/actions";
import { MIGRATIONS_FOLDER } from "@/db/client";
import { loadLeague } from "@/db/leagues";
import * as schema from "@/db/schema";
import { seatInLeague } from "@/db/sessions";

// Applies the migration files by hand so a league can be stored in the shape the app wrote before 0004.
const files = readdirSync(MIGRATIONS_FOLDER)
  .filter((file) => file.endsWith(".sql"))
  .sort();

async function apply(client: PGlite, file: string) {
  const text = readFileSync(path.join(MIGRATIONS_FOLDER, file), "utf8");
  for (const statement of text.split("--> statement-breakpoint")) {
    if (statement.trim()) await client.exec(statement);
  }
}

it("keeps a league stored before league sizes existed: picks, seats and sessions", async () => {
  const client = new PGlite();
  for (const file of files.filter((name) => name < "0004")) await apply(client, file);

  // A 4 × 11 league in the fade stage, as the old code stored it.
  await client.query(
    `insert into leagues (id, name, season_label, commissioner_id, rounds, draft_status) values ('old001', 'Old', '2026–27', 'm1', 11, 'fades')`,
  );
  for (const [seat, name] of ["Ana", "Ben", null, null].entries()) {
    await client.query(`insert into managers (league_id, id, seat, display_name) values ('old001', $1, $2, $3)`, [
      `m${seat + 1}`,
      seat,
      name,
    ]);
  }
  for (const pick of buildDemoLeague().draft.picks) {
    await client.query(
      `insert into picks (league_id, pick_number, manager_id, team_id, side) values ('old001', $1, $2, $3, $4)`,
      [pick.pickNumber, pick.managerId, pick.teamId, pick.side],
    );
  }
  const session = await client.query<{ id: string }>(
    `insert into sessions (token_hash, expires_at) values ('hash-old', now() + interval '30 days') returning id`,
  );
  const sessionId = session.rows[0].id;
  await client.query(`insert into session_seats (session_id, league_id, manager_id) values ($1, 'old001', 'm1')`, [sessionId]);

  for (const file of files.filter((name) => name >= "0004")) await apply(client, file);
  const db = drizzle({ client, schema });

  const league = (await loadLeague(db, "old001"))!;
  expect(league.draft).toMatchObject({ status: "fades", rounds: 11, voidedPicks: [], blockedPick: null });
  expect(league.draft.picks).toHaveLength(44);
  expect(league.managers.map((m) => m.displayName)).toEqual(["Ana", "Ben", null, null]);
  expect(await seatInLeague(db, sessionId, "old001")).toBe("m1");

  const faded = await runDraftAction(db, "old001", sessionId, { type: "fade", managerId: "m1", targetPickNumber: 2 }, null);
  expect(faded.ok).toBe(true);
});
```

- [ ] **Step 3: Run to see them fail**

Run: `npx vitest run src/db/actions.test.ts src/db/migrations.test.ts`
Expected: FAIL — `setLeagueConfig` is not exported, so `actions.test.ts` doesn't load. (`migrations.test.ts` may already pass: Task 2's placeholder returns the same empty values an old league should have. It guards the migration from here on.)

- [ ] **Step 4: Load and save the new state (`src/db/leagues.ts`)**

- Add `inArray` to the `drizzle-orm` import.
- In `assemble`, replace the `picks: pickRows.map(…)` entry and the placeholder fields from Task 2 with:

```ts
      picks: pickRows.filter((pick) => !pick.voided).map(toDraftPick),
      voidedPicks: pickRows.filter((pick) => pick.voided).map(toDraftPick),
      blockedPick: row.blockedPick,
```

and add above `assemble`:

```ts
function toDraftPick(pick: typeof picks.$inferSelect): DraftPick {
  return { pickNumber: pick.pickNumber, managerId: pick.managerId, teamId: pick.teamId, side: pick.side };
}
```

(import `DraftPick` from `@/lib/types`).

- Replace the body of `saveLeague` up to (not including) `const version = …` with:

```ts
  // Seats change only before the draft (decideLeagueConfig): removed seats are open, so nothing else points at them.
  const removed = before.managers.filter((manager) => !after.managers.some((kept) => kept.id === manager.id));
  if (removed.length > 0) {
    await tx.delete(managers).where(
      and(
        eq(managers.leagueId, after.id),
        inArray(
          managers.id,
          removed.map((manager) => manager.id),
        ),
      ),
    );
  }
  const added = after.managers.filter((manager) => !before.managers.some((old) => old.id === manager.id));
  if (added.length > 0) {
    await tx.insert(managers).values(
      added.map((manager) => ({ leagueId: after.id, id: manager.id, seat: manager.seat, displayName: manager.displayName })),
    );
  }

  // Picks: insert new ones (a pick that ends the draft early can be voided as it is stored), then void stored ones.
  const stored = new Set([...before.draft.picks, ...before.draft.voidedPicks].map((pick) => pick.pickNumber));
  const wasVoided = new Set(before.draft.voidedPicks.map((pick) => pick.pickNumber));
  const voided = new Set(after.draft.voidedPicks.map((pick) => pick.pickNumber));
  const newPicks = [...after.draft.picks, ...after.draft.voidedPicks].filter((pick) => !stored.has(pick.pickNumber));
  if (newPicks.length > 0) {
    await tx
      .insert(picks)
      .values(newPicks.map((pick) => ({ leagueId: after.id, ...pick, voided: voided.has(pick.pickNumber) })));
  }
  const newlyVoided = [...voided].filter((pickNumber) => stored.has(pickNumber) && !wasVoided.has(pickNumber));
  if (newlyVoided.length > 0) {
    await tx
      .update(picks)
      .set({ voided: true })
      .where(and(eq(picks.leagueId, after.id), inArray(picks.pickNumber, newlyVoided)));
  }

  const newFades = after.fades.filter((fade) => !before.fades.some((old) => old.managerId === fade.managerId));
  if (newFades.length > 0) {
    await tx.insert(fades).values(
      newFades.map((fade) => ({ leagueId: after.id, managerId: fade.managerId, targetPickNumber: fade.targetPickNumber })),
    );
  }
  for (const manager of after.managers) {
    const previous = before.managers.find((candidate) => candidate.id === manager.id);
    if (!previous || previous.displayName === manager.displayName) continue;
    await tx
      .update(managers)
      .set({ displayName: manager.displayName })
      .where(and(eq(managers.leagueId, after.id), eq(managers.id, manager.id)));
  }
```

- In the `leagues` update `.set({ … })`, add `rounds: after.draft.rounds,` and `blockedPick: after.draft.blockedPick,`.
- Update the doc of `saveLeague` to: `/** Writes what changed between two versions of a locked league (seats, rounds, new and voided picks, fades, names, status, lines) and bumps version. */`

- [ ] **Step 5: Add the action (`src/db/actions.ts`)**

Add `decideLeagueConfig` to the commands import and `import type { LeagueConfig } from "@/lib/league/config";`, then after `setLineOverrides`:

```ts
/** Commissioner: change the league size before the draft. Parse the body with parseLeagueConfig before calling. */
export function setLeagueConfig(
  db: Db,
  leagueId: string,
  sessionId: string | null,
  config: LeagueConfig,
): Promise<Result<DraftOutcome>> {
  return withLockedLeague(db, leagueId, sessionId, async ({ tx, league, actorId }) => {
    const decided = decideLeagueConfig(league, actorId, config);
    if (!decided.ok) return fail(decided.error);
    return succeed({ league: await saveLeague(tx, league, decided.value), actorId });
  });
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/db`
Expected: PASS (the `.pg.test.ts` file skips without `TEST_DATABASE_URL`).

- [ ] **Step 7: Concurrency tests on real Postgres**

In `src/db/concurrency.pg.test.ts`, add `setLeagueConfig` to the `@/db/actions` import, add `import { blockedDraft, confirmsOf } from "@/lib/draft-scenarios";`, and append inside the `describe`:

```ts
  it("ends the draft early exactly once when parallel confirms race at the pick that blocks", async () => {
    const { leagueId, commissioner } = await newLeague();
    await setLeagueConfig(db, leagueId, commissioner, { managerCount: 6, rounds: 10 });
    await runDraftAction(db, leagueId, commissioner, { type: "start" }, STATIC_LINES);
    const script = confirmsOf(blockedDraft(6, 10, 58));
    for (const { pickNumber, teamId, side } of script.slice(0, -1)) {
      await runDraftAction(db, leagueId, commissioner, { type: "confirm", teamId, side, pickNumber }, null);
    }
    const last = script.at(-1)!;
    const results = await Promise.all(
      Array.from({ length: PARALLEL }, () =>
        runDraftAction(db, leagueId, commissioner, { type: "confirm", ...last }, null),
      ),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    // Every loser saw the draft already over (or, if it raced the winner's commit, the pick already taken).
    for (const result of results) if (!result.ok) expect(["not_live", "stale_pick"]).toContain(result.error);
    const league = (await loadLeague(db, leagueId))!;
    expect(league.draft).toMatchObject({ status: "fades", blockedPick: 58 });
    expect(league.draft.picks).toHaveLength(54);
    expect(league.draft.voidedPicks.map((pick) => pick.pickNumber)).toEqual([55, 56, 57]);
  });

  it("applies a size change and a start in one order or the other, never half of each", async () => {
    const { leagueId, commissioner } = await newLeague();
    const [resized, started] = await Promise.all([
      setLeagueConfig(db, leagueId, commissioner, { managerCount: 6, rounds: 10 }),
      runDraftAction(db, leagueId, commissioner, { type: "start" }, STATIC_LINES),
    ]);
    expect(started.ok).toBe(true);
    const league = (await loadLeague(db, leagueId))!;
    expect(league.draft.status).toBe("live");
    if (resized.ok) {
      expect(league.managers).toHaveLength(6);
      expect(league.draft).toMatchObject({ rounds: 10, seatOrder: ["m1", "m2", "m3", "m4", "m5", "m6"] });
    } else {
      expect(resized.error).toBe("config_locked");
      expect(league.managers).toHaveLength(4);
      expect(league.draft.rounds).toBe(11);
    }
  });

  it("lets only one of a shrink and a claim of the last seat win", async () => {
    const { leagueId, commissioner } = await newLeague();
    const invite = (await listActiveLinks(db, leagueId)).find((link) => link.kind === "league_invite")!;
    const guest = await createSession(db, crypto.randomUUID());
    const [shrunk, claimed] = await Promise.all([
      setLeagueConfig(db, leagueId, commissioner, { managerCount: 3, rounds: 11 }),
      claimLink(db, invite.id, guest, { managerId: "m4", displayName: "Dee" }),
    ]);
    expect([shrunk.ok, claimed.ok].filter(Boolean)).toHaveLength(1);
    const league = (await loadLeague(db, leagueId))!;
    if (shrunk.ok) {
      expect(claimed).toEqual({ ok: false, error: "not_found" });
      expect(league.managers).toHaveLength(3);
    } else {
      expect(shrunk.error).toBe("seats_claimed");
      expect(league.managers.find((manager) => manager.id === "m4")?.displayName).toBe("Dee");
    }
  });
```

If a local Postgres is available, run: `TEST_DATABASE_URL=postgres://… npm run test:pg` — Expected: PASS. If none is available, say so in the task report; the controller runs it.

- [ ] **Step 8: Full checks and commit**

```bash
npm test && npm run lint && npm run typecheck
git add src/db/schema.ts drizzle/ src/db/leagues.ts src/db/actions.ts src/db/actions.test.ts src/db/migrations.test.ts src/db/concurrency.pg.test.ts
git commit -m "feat: store league sizes, voided picks and early ends atomically

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: League size in the draft lobby (API, form, seat colors)

Suggested model: sonnet (UI and integration).

**Files:**
- Create: `src/app/api/leagues/[leagueId]/config/route.ts`
- Modify: `src/components/draft/use-league-draft.ts`
- Create: `src/components/draft/LeagueSizeForm.tsx`
- Modify: `src/components/draft/DraftLobby.tsx`, `src/components/draft/DraftRoom.tsx`
- Modify: `src/app/globals.css`, `src/components/ui/ManagerAvatar.tsx`

**Interfaces:**
- Consumes: `setLeagueConfig` (Task 5), `parseLeagueConfig`, `maxRounds`, `minManagerCount`, `isValidLeagueConfig`, `LeagueConfig`, `LEAGUE_LIMITS` (Task 1), `TOTAL_SIDES`.
- Produces: `PUT /api/leagues/{id}/config` with body `{ managerCount, rounds }` → `LeagueView` (errors as JSON `{ error, message }`); `useLeagueDraft(...).saveConfig(config: LeagueConfig): Promise<boolean>`.

- [ ] **Step 1: Route**

`src/app/api/leagues/[leagueId]/config/route.ts`:

```ts
import { setLeagueConfig } from "@/db/actions";
import { parseLeagueConfig } from "@/lib/league/config";
import { getDb } from "@/server/db";
import { errorResponse, isSameOrigin, readJsonBody } from "@/server/http";
import { toLeagueView } from "@/server/league";
import { getSession } from "@/server/session";

/** Change the league size before the draft: `{ managerCount: 6, rounds: 10 }`. Commissioner only. */
export async function PUT(request: Request, ctx: RouteContext<"/api/leagues/[leagueId]/config">) {
  if (!isSameOrigin(request)) return errorResponse("forbidden");
  const { leagueId } = await ctx.params;
  const config = parseLeagueConfig(await readJsonBody(request));
  if (!config) return errorResponse("invalid_config");
  const session = await getSession();
  const result = await setLeagueConfig(await getDb(), leagueId, session?.id ?? null, config);
  if (!result.ok) return errorResponse(result.error);
  return Response.json(await toLeagueView(result.value.league, result.value.actorId));
}
```

- [ ] **Step 2: Hook**

In `src/components/draft/use-league-draft.ts`, import `import type { LeagueConfig } from "@/lib/league/config";`, add after `saveLineOverrides`:

```ts
  const saveConfig = useCallback(
    (config: LeagueConfig) => send(`/api/leagues/${initial.league.id}/config`, "PUT", config),
    [send, initial.league.id],
  );
```

and return it: `return { view, error, pending, dispatch, saveLineOverrides, saveConfig, dismissError };`

- [ ] **Step 3: The form**

`src/components/draft/LeagueSizeForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { LEAGUE_LIMITS } from "@/config/league";
import { TOTAL_SIDES } from "@/data/teams";
import { isValidLeagueConfig, maxRounds, minManagerCount, type LeagueConfig } from "@/lib/league/config";
import type { League } from "@/lib/types";

function range(from: number, to: number): number[] {
  return Array.from({ length: Math.max(0, to - from + 1) }, (_, index) => from + index);
}

/** Commissioner, before the draft: how many managers and rounds. The server checks the same rules (decideLeagueConfig). */
export function LeagueSizeForm({
  league,
  pending,
  onSave,
  onDirtyChange,
}: {
  league: League;
  pending: boolean;
  onSave: (config: LeagueConfig) => Promise<boolean>;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const saved: LeagueConfig = { managerCount: league.managers.length, rounds: league.draft.rounds };
  const [config, setConfig] = useState<LeagueConfig>(saved);
  const fewestManagers = minManagerCount(league.managers);
  const roundLimit = maxRounds(config.managerCount);
  const dirty = config.managerCount !== saved.managerCount || config.rounds !== saved.rounds;
  const valid = isValidLeagueConfig(config) && config.managerCount >= fewestManagers;

  function update(next: LeagueConfig) {
    setConfig(next);
    onDirtyChange(next.managerCount !== saved.managerCount || next.rounds !== saved.rounds);
  }

  async function save() {
    if (await onSave(config)) onDirtyChange(false);
  }

  return (
    <section aria-labelledby="league-size-title" className="flex flex-col gap-3 rounded-lg border border-ink-700 bg-ink-900 p-4">
      <h3 id="league-size-title" className="text-sm font-semibold">
        League size
      </h3>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <span aria-hidden className="text-xs text-fog-400">
            Managers
          </span>
          <Select
            label="Managers"
            value={String(config.managerCount)}
            onChange={(value) => {
              const managerCount = Number(value);
              update({ managerCount, rounds: Math.min(config.rounds, maxRounds(managerCount)) });
            }}
            options={range(fewestManagers, LEAGUE_LIMITS.maxManagers).map((count) => ({
              value: String(count),
              label: `${count} managers`,
            }))}
            className="w-40"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span aria-hidden className="text-xs text-fog-400">
            Rounds
          </span>
          <Select
            label="Rounds"
            value={String(config.rounds)}
            onChange={(value) => update({ ...config, rounds: Number(value) })}
            options={range(LEAGUE_LIMITS.minRounds, roundLimit).map((count) => ({
              value: String(count),
              label: `${count} round${count === 1 ? "" : "s"}`,
            }))}
            className="w-36"
          />
        </div>
        <div className="flex gap-2">
          <Button onClick={save} disabled={pending || !dirty || !valid}>
            Save size
          </Button>
          {dirty && (
            <Button variant="secondary" onClick={() => update(saved)} disabled={pending}>
              Discard
            </Button>
          )}
        </div>
      </div>
      <p className="text-sm text-fog-400">
        {config.managerCount * config.rounds} of {TOTAL_SIDES} sides drafted · up to {roundLimit} rounds with{" "}
        {config.managerCount} managers.
        {fewestManagers > LEAGUE_LIMITS.minManagers &&
          ` Claimed seats stay, so the league needs at least ${fewestManagers} managers.`}
      </p>
    </section>
  );
}
```

Check `Button`'s props in `src/components/ui/Button.tsx` before using `variant="secondary"` and `onClick` (DraftStatusBar already uses both).

- [ ] **Step 4: Lobby and room**

`src/components/draft/DraftLobby.tsx`:
- Imports: `import type { LeagueConfig } from "@/lib/league/config";` and `import { LeagueSizeForm } from "./LeagueSizeForm";`
- New props in the destructuring and the type: `onSaveConfig: (config: LeagueConfig) => Promise<boolean>;` and `onConfigDirtyChange: (dirty: boolean) => void;`
- Right after the `<p>` that shows "{n} managers · {r} rounds · snake order · {total} picks", add:

```tsx
      {canControl && (
        <LeagueSizeForm
          key={`${league.managers.length}x${league.draft.rounds}`}
          league={league}
          pending={pending}
          onSave={onSaveConfig}
          onDirtyChange={onConfigDirtyChange}
        />
      )}
```

- Seat grid: change `sm:grid-cols-2 2xl:grid-cols-4` to `sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4` (12 seats stay compact).

`src/components/draft/DraftRoom.tsx`:
- Destructure `saveConfig` from `useLeagueDraft(initial)`.
- Add state: `const [configDirty, setConfigDirty] = useState(false);`
- Make the size form block Start like unsaved lines do — replace the start of `startBlocker`:

```ts
  const startBlocker = !review
    ? null
    : configDirty
      ? "Save or discard your league size change first."
      : review.missing.length > 0
```

  (the rest of the chain is unchanged).
- Pass to `<DraftLobby …>`: `onSaveConfig={saveConfig}` and `onConfigDirtyChange={setConfigDirty}`.

- [ ] **Step 5: Seat colors 5–12**

`src/app/globals.css`, after `--color-seat-4`:

```css
  --color-seat-5: #d9480f;
  --color-seat-6: #c2255c;
  --color-seat-7: #0b7285;
  --color-seat-8: #8f6a00;
  --color-seat-9: #495057;
  --color-seat-10: #9c36b5;
  --color-seat-11: #5c940d;
  --color-seat-12: #8a5a44;
```

`src/components/ui/ManagerAvatar.tsx`:

```ts
const SEAT_BG = [
  "bg-seat-1",
  "bg-seat-2",
  "bg-seat-3",
  "bg-seat-4",
  "bg-seat-5",
  "bg-seat-6",
  "bg-seat-7",
  "bg-seat-8",
  "bg-seat-9",
  "bg-seat-10",
  "bg-seat-11",
  "bg-seat-12",
];
```

- [ ] **Step 6: Checks**

Run: `npm test && npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Browser check**

Restart the dev server (new theme tokens), using `preview_start` with `{ name: "dev" }` (see `.claude/launch.json`; run offline with `RECORD_SOURCE=static LINE_SOURCE=static` if the feeds are unreachable). On `/`, create a league, then in the draft room:
1. The lobby shows "League size" with 4 managers / 11 rounds and "44 of 60 sides drafted · up to 15 rounds with 4 managers."
2. Choose 7 managers: rounds clamp to 8; Start draft shows "Save or discard your league size change first." Save: the seat list shows M1–M7 with seven distinct avatar colors, the summary reads "7 managers · 8 rounds · snake order · 56 picks".
3. Choose 6 managers / 10 rounds, Save. The draft board shows 6 columns × 10 rows.
4. In the browser console: `await fetch(location.pathname.replace(/^\/l\/(\w+)\/draft$/, "/api/leagues/$1/config"), { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ managerCount: 7, rounds: 9 }) }).then((r) => r.json())` → `{ error: "invalid_config", … }`.
5. At 375px wide (`resize_window` preset mobile) the form wraps and the page doesn't scroll sideways; reset to desktop afterwards.

- [ ] **Step 8: Commit**

```bash
git add "src/app/api/leagues/[leagueId]/config/route.ts" src/components/draft/use-league-draft.ts src/components/draft/LeagueSizeForm.tsx src/components/draft/DraftLobby.tsx src/components/draft/DraftRoom.tsx src/app/globals.css src/components/ui/ManagerAvatar.tsx
git commit -m "feat: commissioner sets league size in the draft lobby

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Early end in the draft room, configured vs completed rounds, copy

Suggested model: sonnet (UI).

**Files:**
- Create: `src/components/draft/EarlyEndPanel.tsx`
- Modify: `src/components/draft/DraftRoom.tsx`, `DraftBoard.tsx`, `DraftStatusBar.tsx`, `ManagerPicks.tsx`
- Modify: `src/app/page.tsx`, `src/components/landing/CreateLeagueForm.tsx`

**Interfaces:**
- Consumes: `earlyEnd`, `EarlyEnd`, `completedRounds` (Task 2), `Badge`, `Panel`, `TeamLogo`, `SidePill`, `formatNumber`, `findManager`, `managerLabel`.
- Produces: `EarlyEndPanel({ league, teams, summary }: { league: League; teams: TeamLookup; summary: EarlyEnd })`.

- [ ] **Step 1: The explanation panel**

`src/components/draft/EarlyEndPanel.tsx`:

```tsx
import { Ban } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { SidePill } from "@/components/ui/SidePill";
import { TeamLogo } from "@/components/ui/TeamLogo";
import type { EarlyEnd } from "@/lib/draft";
import { formatNumber } from "@/lib/format";
import { findManager, managerLabel } from "@/lib/league/managers";
import type { TeamLookup } from "@/lib/standings";
import type { League } from "@/lib/types";

/** Why regular drafting stopped early, what was kept and what is unclaimed. */
export function EarlyEndPanel({ league, teams, summary }: { league: League; teams: TeamLookup; summary: EarlyEnd }) {
  const blocked = findManager(league.managers, summary.blockedManagerId)!;
  const voided = summary.voidedPicks.length;
  const stats = [
    { label: "Rounds completed", value: `${summary.completedRounds} of ${summary.configuredRounds}` },
    { label: "Picks kept", value: String(league.draft.picks.length) },
    { label: "Picks voided", value: String(voided) },
    { label: "Unclaimed sides", value: String(summary.unclaimedSides.length) },
  ];
  return (
    <Panel
      title="Draft ended early"
      icon={<Ban aria-hidden className="size-5 text-negative" />}
      bodyClassName="flex flex-col gap-4 p-4 sm:p-5"
    >
      <p className="text-sm text-fog-300">
        At pick {summary.blockedPick} (round {summary.blockedRound}), {managerLabel(blocked)} had nothing left to take:
        every open side was the other side of a team they already hold, and nobody may hold both sides of a team. So
        regular drafting ended for everyone, and only the {summary.completedRounds} completed rounds count.
      </p>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-lg border border-ink-700 bg-ink-900 px-3 py-2">
            <dt className="text-xs text-fog-400">{stat.label}</dt>
            <dd className="font-display text-xl font-semibold tabular-nums">{stat.value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-fog-300">
        {voided === 0
          ? `Round ${summary.blockedRound} hadn't started, so no picks were voided.`
          : `Round ${summary.blockedRound}'s ${voided} pick${voided === 1 ? " was" : "s were"} voided: they stay on the board marked Voided, don't score and can't be faded, and their sides are unclaimed.`}
      </p>
      <div>
        <h3 className="text-sm font-semibold">Unclaimed sides</h3>
        <ul className="mt-2 flex flex-wrap gap-2">
          {summary.unclaimedSides.map(({ teamId, side }) => {
            const team = teams[teamId];
            return (
              <li
                key={`${teamId}-${side}`}
                className="flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-900 px-2.5 py-1.5 text-sm"
              >
                <TeamLogo team={team} size={20} />
                <span>{team.id}</span>
                <SidePill side={side} size="sm" />
                <span className="font-semibold tabular-nums">{formatNumber(team.line)}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </Panel>
  );
}
```

- [ ] **Step 2: Show it in the room**

`src/components/draft/DraftRoom.tsx`:
- Import `earlyEnd` from `@/lib/draft` (add to the existing import) and `import { EarlyEndPanel } from "./EarlyEndPanel";`.
- After `const teamsById = …`: `const ended = earlyEnd(draft, view.teams.map((team) => team.id));`
- Immediately before `<DraftBoard league={league} teams={teamsById} />`: `{ended && <EarlyEndPanel league={league} teams={teamsById} summary={ended} />}`

- [ ] **Step 3: Board — voided and blocked cells, completed rounds**

`src/components/draft/DraftBoard.tsx`:
- Import `completedRounds` from `@/lib/draft` and `import { Badge } from "@/components/ui/Badge";`.
- After `picksByNumber`: `const voidedByNumber = new Map(draft.voidedPicks.map((pick) => [pick.pickNumber, pick]));`
- Panel title subtitle:

```tsx
          <span className="ml-2 font-sans text-sm font-normal text-fog-400">
            Snake draft ·{" "}
            {draft.blockedPick === null
              ? `${draft.rounds} rounds`
              : `${completedRounds(draft)} of ${draft.rounds} rounds completed`}
          </span>
```

- In the cell map:

```tsx
                const pickNumber = pickNumberFor(round, seat, seatCount);
                const pick = picksByNumber.get(pickNumber) ?? voidedByNumber.get(pickNumber);
                return (
                  <BoardCell
                    key={manager.id}
                    pickNumber={pickNumber}
                    pick={pick}
                    voided={voidedByNumber.has(pickNumber)}
                    team={pick ? teams[pick.teamId] : undefined}
                    state={
                      pickNumber === draft.blockedPick
                        ? "blocked"
                        : pickNumber === current
                          ? "current"
                          : pickNumber === upNext
                            ? "next"
                            : "open"
                    }
                    status={draft.status}
                  />
                );
```

- `BoardCell`: add `voided: boolean` to props and `"blocked"` to `state`. Replace the drafted branch and the open label:

```tsx
  if (pick && team) {
    return (
      <div role="cell" data-pick={pickNumber} className={`${base} ${voided ? "bg-ink-900/60" : ""}`}>
        <span className="w-5 shrink-0 text-xs tabular-nums text-fog-400">{pickNumber}</span>
        <span className={`flex shrink-0 ${voided ? "opacity-50" : ""}`}>
          <TeamLogo team={team} size={26} />
        </span>
        <span
          className={`min-w-0 flex-1 truncate ${voided ? "text-fog-400 line-through" : ""}`}
          title={`${team.city} ${team.name}${voided ? " (voided)" : ""}`}
        >
          <span className="@5xl:hidden">{team.id}</span>
          <span className="hidden @5xl:inline">{team.name}</span>
        </span>
        <SidePill side={pick.side} size="sm" />
        {voided ? (
          <Badge tone="danger">Voided</Badge>
        ) : (
          <span className="shrink-0 font-semibold tabular-nums">{formatNumber(team.line)}</span>
        )}
      </div>
    );
  }
  const currentLabel = status === "live" ? "On the clock" : status === "paused" ? "Paused" : "First pick";
  const label =
    state === "blocked" ? "No eligible pick" : state === "current" ? currentLabel : state === "next" ? "Up next" : "—";
  return (
    <div
      role="cell"
      data-pick={pickNumber}
      className={`${base} ${state === "current" ? "rounded-md border-2 border-accent bg-accent/5" : ""}`}
    >
      <span className="w-5 shrink-0 text-xs tabular-nums text-fog-400">{pickNumber}</span>
      <span
        className={`flex-1 text-center ${
          state === "current" ? "font-semibold text-accent" : state === "blocked" ? "font-semibold text-negative" : "text-fog-300"
        }`}
      >
        {label}
      </span>
    </div>
  );
```

- [ ] **Step 4: Status bar and manager picks**

`src/components/draft/DraftStatusBar.tsx`: import `completedRounds`; after `const paused = …` add:

```ts
  const picksIn =
    draft.blockedPick === null
      ? `All ${total} picks are in`
      : `Draft ended early after round ${completedRounds(draft)} of ${draft.rounds} · ${draft.picks.length} picks kept`;
```

and replace the subtitle expression:

```tsx
            {turn.kind === "fades"
              ? `${picksIn} · ${league.fades.length} of ${managers.length} fades locked`
              : pickNumber === null
                ? `${picksIn}${league.fades.length > 0 ? ` · ${league.fades.length} fades locked` : ""}.`
                : `Round ${roundOf(pickNumber, draft.seatOrder.length)} of ${draft.rounds} · Pick ${pickNumber} of ${total}`}
```

`src/components/draft/ManagerPicks.tsx`: import `completedRounds` alongside `picksForManager`, and replace the counter text:

```tsx
          {league.draft.blockedPick === null
            ? `${picks.length} / ${league.draft.rounds} drafted`
            : `${picks.length} kept · ${completedRounds(league.draft)} of ${league.draft.rounds} rounds`}
```

- [ ] **Step 5: Copy that assumed four managers**

- `src/app/page.tsx` line 18: `Four managers snake-draft Overs and Unders…` → `Two to twelve managers snake-draft Overs and Unders on every NBA win total, then score on how the season plays out.`
- `src/components/landing/CreateLeagueForm.tsx` footnote → `You'll be Manager 1 and the commissioner. Leagues start at 4 managers and 11 rounds; change the size in the draft room before the draft starts, then share the invite link.` (keep the `&apos;` escape).

- [ ] **Step 6: Checks**

Run: `npm test && npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Browser check of an early end**

With the dev server running, create a fresh league (seat 1 only, so the commissioner picks for every open seat), set 6 managers / 10 rounds, tick the lines box and Start. Then run this in the page (`javascript_tool`) on `/l/{id}/draft`; it replays the same scripted block as `blockedDraft(6, 10, 58)`:

```js
const id = location.pathname.split("/")[2];
const api = `/api/leagues/${id}/draft`;
const post = (body) =>
  fetch(api, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
const view = await fetch(api).then((r) => r.json());
const n = view.league.managers.length;
const P = 58; // use 54 for 7 managers × 8 rounds
const seatFor = (p) => { const i = (p - 1) % n; return Math.ceil(p / n) % 2 === 1 ? i : n - 1 - i; };
const teams = view.teams.map((t) => t.id);
const victim = seatFor(P);
let h = 0;
for (let p = 1; p < P; p++) if (seatFor(p) === victim) h++;
const reserved = teams.slice(teams.length - h);
const order = [...teams.map((t) => [t, "OVER"]), ...teams.map((t) => [t, "UNDER"])];
const others = [...order.filter(([t]) => !reserved.includes(t)), ...reserved.map((t) => [t, "UNDER"])];
const mine = reserved.map((t) => [t, "OVER"]);
const made = [];
for (let p = 1; p < P; p++) {
  const seat = seatFor(p);
  const free = ([t, s]) => !made.some((m) => m.t === t && m.s === s) && !made.some((m) => m.seat === seat && m.t === t);
  const [t, s] = (seat === victim ? mine : others).find(free);
  made.push({ seat, t, s });
  const res = await post({ type: "confirm", teamId: t, side: s, pickNumber: p });
  if (res.error) throw new Error(`pick ${p}: ${res.message}`);
}
(await fetch(api).then((r) => r.json())).league.draft.blockedPick;
```

Expected: returns `58`. After the next poll (or a reload) the room shows:
- "Draft ended early" panel: M3 blocked at pick 58 (round 10), Rounds completed "9 of 10", Picks kept 54, Picks voided 3, Unclaimed sides 6 with chips.
- Board subtitle "Snake draft · 9 of 10 rounds completed"; picks 55–57 struck through with a "Voided" badge; pick 58 "No eligible pick"; 59–60 "—".
- Status bar "Draft ended early after round 9 of 10 · 54 picks kept · 0 of 6 fades locked".
- The fade picker lists no pick numbered above 54.
Take a screenshot for the report. Check 375px (no sideways page scroll; the board scrolls inside its box) and reset to desktop.

- [ ] **Step 8: Commit**

```bash
git add src/components/draft/EarlyEndPanel.tsx src/components/draft/DraftRoom.tsx src/components/draft/DraftBoard.tsx src/components/draft/DraftStatusBar.tsx src/components/draft/ManagerPicks.tsx src/app/page.tsx src/components/landing/CreateLeagueForm.tsx
git commit -m "feat: draft room explains an early end and marks voided picks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Docs and final verification

Suggested model: sonnet (or the controller).

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update `CLAUDE.md`**

- Architecture, `src/config/` bullet: `LEAGUE_DEFAULTS` (4 managers, 11 rounds) → `LEAGUE_DEFAULTS` (4 managers, 11 rounds), `LEAGUE_LIMITS` (2–12 managers, rounds up to ⌊60 ÷ managers⌋).
- Architecture, `src/lib/` bullet: add `league size rules (`league/config.ts`)` and `scripted test drafts (`draft-scenarios.ts`, tests only)`.
- Domain rules — replace the "Draft:" bullet with:
  `- Draft: snake order; each team's Over and Under are separate sides (60). The commissioner sets 2–12 managers and 1–⌊60 ÷ managers⌋ rounds before the start (`PUT /api/leagues/{id}/config`, `decideLeagueConfig`; seats are added or removed at the end, never a claimed one); default 4 × 11 = 44 picks.`
- Add after the `team_already_held` bullet:
  `- Early end: after each pick, if the manager on the clock for the next pick has no eligible side (every open side is the other side of a team they hold), regular drafting ends for everyone in the same write: only completed rounds are kept (`draft.picks`), the cut-short round's picks move to `draft.voidedPicks` (stored as `picks.voided`, shown on the board as Voided, never scored or faded; `voided_pick`) and `draft.blockedPick` records where it stopped. The configured last pick always finishes normally. 4 × 11 can never end early.`
- Fade stage bullet: `the 44th pick moves the draft to fades` → `the last pick (or an early end) moves the draft to fades`; `The fourth fade completes the draft` → `The last manager's fade completes the draft`.

- [ ] **Step 2: Full verification**

Run: `npm test && npm run lint && npm run typecheck && npm run build`
Expected: all pass. Run `TEST_DATABASE_URL=postgres://… npm run test:pg` if a Postgres is available; otherwise say it wasn't run.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: league size and early-end rules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Requirement coverage

| Requirement | Where |
| --- | --- |
| 2–12 managers; rounds 1–⌊60 ÷ n⌋; default 4 × 11 | Task 1 (`LEAGUE_LIMITS`, `isValidLeagueConfig`), Task 4 test "keeps new leagues at the default" |
| Changes only before the start; server + UI validation | Task 4 (`config_locked`, `invalid_config`), Task 6 (form limits options, route parses) |
| Preserve leagues, picks, access, sessions | Task 5 migration defaults + `migrations.test.ts`; shrink never removes claimed seats (`seats_claimed`) |
| Snake order and completion adapt | Task 2 "league sizes" tests; Task 4 "starts the draft with the configured seats" |
| One side per team per manager | unchanged `team_already_held`; Task 2 randomized check |
| Check next manager after each pick; end for everyone; keep complete rounds; void the rest; history; exclusions | Task 2 (`applyDraftAction`, `endEarly`), Task 3 (fades, standings, team page), Task 7 (board) |
| Atomic on the server | Task 5 (same `saveLeague` write as the pick; version bumps once), concurrency test |
| Final pick completes normally; never end early while eligible | Task 2 "finishes normally…" and randomized invariant test |
| Fade phase after either end; one per manager; shared targets; no own; completes with all | Task 3 fades tests, Task 5 "completes after every manager's fade" |
| UI counts, early-end explanation, configured vs completed rounds | Tasks 6–7 |
| 6 × 10, 7 × 8, mid-round block, voided exclusions, normal completion, compatibility, concurrency | Tasks 2, 3, 5 |
