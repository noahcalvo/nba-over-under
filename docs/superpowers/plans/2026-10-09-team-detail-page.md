# Team Detail Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A league-scoped page per NBA team (`/l/{leagueId}/teams/{teamId}`) showing record versus the frozen line, a
season-progress chart from real game results, the FanDuel line at draft versus now, and Over/Under ownership with fades.

**Architecture:** Pure, tested logic in `src/lib/game-log/` (ESPN schedule parsing, progress math, chart model,
per-team cache), `src/lib/chart-window.ts` (window and Y axis) and `src/lib/team-detail.ts` (ownership, statuses,
market line). `src/server/game-log.ts` and `src/server/team-page.ts` load everything in parallel and never throw for a
feed failure. Client components in `src/components/team/` render it. Scores always come from `src/lib/scoring.ts`.

**Tech Stack:** Next.js 16.4 App Router (Cache Components), React 19, TypeScript strict, Tailwind v4, Vitest 4.1,
lucide-react. No new dependencies; the chart is hand-written SVG.

**Spec:** `docs/superpowers/specs/2026-10-09-team-detail-page-design.md` (brief:
`docs/superpowers/specs/2026-10-09-team-detail-page-brief.md`). **Visual design source of truth:**
`docs/superpowers/specs/2026-10-09-team-detail-page-reference.png`. Read the image before any UI task.

## Global Constraints

- Every score, status and projection derives from `src/lib/scoring.ts` (`projectWins`, `evaluateCall`, `evaluateFade`, `isSettled`, `gamesPlayed`). Never re-implement scoring.
- League scoring and locked-line pace use the league's frozen line (`league.lines.values[teamId]`) only. The current FanDuel line is display-only.
- Wins needed for Over = `max(0, floor(lockedLine) + 1 − currentWins)`. Locked-line pace at game n = `lockedLine × n / 82`.
- Push (wins exactly on the line) stays a miss, as today.
- Never fabricate: no invented opponents, dates, game results, market lines or movement. Missing data shows a clear unavailable state.
- `src/lib/` stays pure: no React, no `next/*`, no `server-only`. Tests colocated as `*.test.ts`, written first.
- Tunable numbers live in `src/config/`.
- Dark theme tokens only (`bg-ink-850`, `text-fog-300`, `text-accent`, `border-over`, `border-under`, `text-positive`, `text-negative`, …); team colours from data are the only raw hex.
- Numbers are formatted with `src/lib/format.ts` (U+2212 minus, en-dash records).
- Over = lime (`over`), Under = purple (`under`); positive points = `positive`, negative = `negative`, independent of side.
- Wrap anything reading `params`, `cookies()` or the database in `<Suspense>`.
- No horizontal page scroll at 375 px or 1440 px.
- The visual reference image decides visual questions. Deliberate differences: the breadcrumb is `{league name} / {team}` linking to the overview, no "ILLUSTRATIVE DATA" tag or "Illustrative market snapshot" note (the demo league keeps the app's usual "Demo data" tag), projected items vanish when Show projected is off.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Done means: `npm test && npm run lint && npm run typecheck && npm run build` all pass.

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/game-log/types.ts` | `Game`, `GameLog`, `GameLogSource`, `GameLogRead` |
| `src/lib/game-log/espn.ts` (+ test, 4 fixtures already committed) | ESPN schedule URL and parser |
| `src/data/teams.ts` (modify) | `espnAbbr(teamId)` |
| `src/lib/game-log/progress.ts` (+ test) | Cumulative wins, locked pace, projection at game n, wins needed, games remaining |
| `src/lib/team-detail.ts` (+ test) | Page data type, ownership per side, pick/fade display status, decided outcome, market line, movement |
| `src/lib/chart-window.ts` (+ test) | Chart window, subtitle, Y axis |
| `src/lib/game-log/chart-model.ts` (+ test) | Chart points for the visible window |
| `src/lib/format.ts` (modify, + test) | `formatGameDate` |
| `src/data/game-logs.ts` (+ test) | Mock game log (demo and `RECORD_SOURCE=static`) |
| `src/lib/game-log/cache.ts` (+ test) | Per-team cache for a `GameLogSource` |
| `src/config/records.ts` (modify) | Game-log cache timings |
| `src/server/game-log.ts` | ESPN/mock source selection, `readGameLog` |
| `src/server/team-page.ts` | `loadTeamPage` |
| `src/app/l/[leagueId]/teams/[teamId]/page.tsx` | Route |
| `src/components/team/*.tsx` | `TeamDetail`, `TeamHeader`, `TeamStatStrip`, `SportsbookPanel`, `OwnershipCard`, `SeasonProgressPanel`, `SeasonProgressChart` |
| `src/components/ui/TeamLink.tsx` | Link to a team page in the current league |
| `src/components/ui/TeamLogo.tsx`, `TeamBadge.tsx` (modify) | Accept `TeamInfo` (no line needed) |
| `src/app/globals.css` (modify) | `--color-progress` chart blue |
| Overview/Rosters components (modify) | Team logos and names link to the team page |

---

### Task 1: ESPN schedule parser

Model: haiku (complete code).

**Files:**
- Create: `src/lib/game-log/types.ts`, `src/lib/game-log/espn.ts`, `src/lib/game-log/espn.test.ts`
- Modify: `src/data/teams.ts` (append `espnAbbr`)
- Fixtures (already in the repo, do not edit): `src/lib/game-log/espn-schedule-{orl-2026,ny-2026,gs-2026,orl-2027}.fixture.json` — trimmed real ESPN responses.

**Interfaces:**
- Produces: `Game`, `GameResult`, `GameLog`, `GameLogSource`, `GameLogRead` (types.ts); `espnScheduleUrl(espnAbbr: string, season: number): string`; `parseEspnSchedule(payload: unknown, season: number, teamId: TeamId, resolveTeam: (name: string) => TeamId | null): GameLog` (throws `FeedError`); `espnAbbr(teamId: TeamId): string`.

- [ ] **Step 1: Create the types**

`src/lib/game-log/types.ts`:

```ts
import type { TeamId } from "@/lib/types";

export type GameResult = "W" | "L";

/** One regular-season game of one team. */
export interface Game {
  /** 1-based game number within the regular season, by date. */
  number: number;
  /** ISO 8601 tip-off time; null when unknown (mock data). */
  date: string | null;
  /** Our team id; null when the opponent is not one of the 30, or unknown (mock data). */
  opponentId: TeamId | null;
  /** Null when unknown (mock data). */
  home: boolean | null;
  /** Null until the game is completed. */
  result: GameResult | null;
}

/** A team's regular-season games, completed and upcoming, in game-number order. */
export interface GameLog {
  /** Season end year: 2027 for 2026–27. */
  season: number;
  teamId: TeamId;
  games: Game[];
}

/** Where game logs come from. `fetch` rejects with a FeedError whose message is safe to show users. */
export interface GameLogSource {
  /** Display name, e.g. "ESPN". */
  readonly name: string;
  fetch(season: number, teamId: TeamId): Promise<GameLog>;
}

/** A game-log read for a page: the log, or null with the reason. Never a rejection. */
export interface GameLogRead {
  log: GameLog | null;
  source: string;
  error: string | null;
}
```

- [ ] **Step 2: Add `espnAbbr` to `src/data/teams.ts`** (append at the end of the file)

```ts
/** ESPN's abbreviations where they differ from ours, for ESPN URLs. */
const ESPN_ABBR: Readonly<Record<TeamId, string>> = {
  GSW: "gs",
  NOP: "no",
  NYK: "ny",
  SAS: "sa",
  UTA: "utah",
  WAS: "wsh",
};

/** The team's abbreviation in ESPN URLs: "orl", "ny", "utah". */
export function espnAbbr(teamId: TeamId): string {
  return ESPN_ABBR[teamId] ?? teamId.toLowerCase();
}
```

- [ ] **Step 3: Write the failing tests** — `src/lib/game-log/espn.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { espnAbbr, teamIdByNickname } from "@/data/teams";
import { FeedError } from "@/lib/feed-error";
import { espnScheduleUrl, parseEspnSchedule } from "@/lib/game-log/espn";
import type { GameLog } from "@/lib/game-log/types";
import gs2026 from "./espn-schedule-gs-2026.fixture.json";
import ny2026 from "./espn-schedule-ny-2026.fixture.json";
import orl2026 from "./espn-schedule-orl-2026.fixture.json";
import orl2027 from "./espn-schedule-orl-2027.fixture.json";

const parse = (payload: unknown, season: number, teamId: string) =>
  parseEspnSchedule(payload, season, teamId, teamIdByNickname);
const wins = (log: GameLog) => log.games.filter((game) => game.result === "W").length;

describe("espnScheduleUrl", () => {
  it("uses ESPN's abbreviation and always asks for the regular season", () => {
    expect(espnScheduleUrl(espnAbbr("NYK"), 2027)).toBe(
      "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/ny/schedule?season=2027&seasontype=2",
    );
  });

  it("maps the abbreviations ESPN spells differently", () => {
    expect(espnAbbr("ORL")).toBe("orl");
    expect(espnAbbr("GSW")).toBe("gs");
    expect(espnAbbr("NOP")).toBe("no");
    expect(espnAbbr("SAS")).toBe("sa");
    expect(espnAbbr("UTA")).toBe("utah");
    expect(espnAbbr("WAS")).toBe("wsh");
  });
});

describe("parseEspnSchedule", () => {
  it("reads a finished season in date order, numbered 1 to 82", () => {
    const log = parse(orl2026, 2026, "ORL");
    expect(log.season).toBe(2026);
    expect(log.teamId).toBe("ORL");
    expect(log.games).toHaveLength(82);
    expect(wins(log)).toBe(45);
    expect(log.games[0]).toEqual({ number: 1, date: "2025-10-22T23:00Z", opponentId: "MIA", home: true, result: "W" });
    expect(log.games.slice(0, 10).map((game) => game.result).join("")).toBe("WLLLLWWLWL");
    expect(log.games.map((game) => game.number)).toEqual(Array.from({ length: 82 }, (_, i) => i + 1));
  });

  it("leaves out the NBA Cup Championship, which doesn't count in the standings", () => {
    const log = parse(ny2026, 2026, "NYK");
    expect(log.games).toHaveLength(82);
    expect(wins(log)).toBe(53);
  });

  it("lists a postponed game once, on its make-up date", () => {
    const log = parse(gs2026, 2026, "GSW");
    expect(log.games).toHaveLength(82);
    expect(wins(log)).toBe(37);
    expect(log.games[0]).toMatchObject({ opponentId: "LAL", home: false, result: "W" });
  });

  it("keeps upcoming games with their date and opponent and no result", () => {
    const log = parse(orl2027, 2027, "ORL");
    expect(log.games).toHaveLength(80);
    expect(log.games.every((game) => game.result === null)).toBe(true);
    expect(log.games[0]).toEqual({ number: 1, date: "2026-10-21T23:00Z", opponentId: "ATL", home: true, result: null });
  });

  it("drops preseason and playoff games", () => {
    const payload = structuredClone(orl2026);
    const first = payload.events[0];
    payload.events.push(
      { ...structuredClone(first), id: "pre", date: "2025-10-05T23:00Z", seasonType: { type: 1 } },
      { ...structuredClone(first), id: "post", date: "2026-04-20T23:00Z", seasonType: { type: 3 } },
    );
    const log = parse(payload, 2026, "ORL");
    expect(log.games).toHaveLength(82);
    expect(wins(log)).toBe(45);
  });

  it("rejects another season", () => {
    expect(() => parse(orl2026, 2027, "ORL")).toThrow(FeedError);
    expect(() => parse(orl2026, 2027, "ORL")).toThrow("ESPN schedule was for a different season than 2026–27.");
  });

  it("rejects more than 82 games", () => {
    const payload = structuredClone(orl2026);
    payload.events.push({ ...structuredClone(payload.events[0]), id: "extra", date: "2026-04-13T23:00Z" });
    expect(() => parse(payload, 2026, "ORL")).toThrow("ESPN schedule listed more than 82 games for ORL.");
  });

  it("rejects a finished game without exactly one winner", () => {
    const payload = structuredClone(orl2026);
    for (const competitor of payload.events[0].competitions[0].competitors) competitor.winner = false;
    expect(() => parse(payload, 2026, "ORL")).toThrow("ESPN schedule had a finished game without one winner.");
  });

  it("rejects a game the team isn't in", () => {
    const payload = structuredClone(orl2026);
    for (const competitor of payload.events[0].competitions[0].competitors) {
      if (competitor.team.abbreviation === "ORL") competitor.team.displayName = "Boston Celtics";
    }
    expect(() => parse(payload, 2026, "ORL")).toThrow("ESPN schedule listed a game without ORL.");
  });

  it("rejects a payload without events", () => {
    expect(() => parse({}, 2026, "ORL")).toThrow("ESPN schedule wasn't in the expected format.");
    expect(() => parse(null, 2026, "ORL")).toThrow(FeedError);
  });
});
```

- [ ] **Step 4: Run the tests to see them fail**

Run: `npx vitest run src/lib/game-log/espn.test.ts`
Expected: FAIL — cannot resolve `@/lib/game-log/espn`.

- [ ] **Step 5: Implement** — `src/lib/game-log/espn.ts`

```ts
import { RECORDS } from "@/config/records";
import { SCORING } from "@/config/scoring";
import { FeedError } from "@/lib/feed-error";
import { seasonLabelFor } from "@/lib/records/season";
import type { TeamId } from "@/lib/types";
import type { Game, GameLog, GameResult } from "./types";

// ESPN's public team schedule JSON (unofficial; keyless). We always ask for the regular season. Two quirks: the NBA Cup
// Championship is listed as a regular-season game (competition type "CC") but doesn't count in the standings, and a
// postponed game stays listed as postponed next to its make-up game. Both are dropped. Teams match by name.

const SCHEDULE_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams";
const REGULAR_SEASON = 2;
const CUP_CHAMPIONSHIP = "CC";
const DROPPED_STATUSES: ReadonlySet<string> = new Set(["STATUS_POSTPONED", "STATUS_CANCELED"]);

export function espnScheduleUrl(espnAbbr: string, season: number): string {
  return `${SCHEDULE_URL}/${espnAbbr}/schedule?season=${season}&seasontype=${REGULAR_SEASON}`;
}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function problem(detail: string): FeedError {
  return new FeedError(`${RECORDS.source} schedule ${detail}.`);
}

const BAD_FORMAT = "wasn't in the expected format";

/** One team's regular-season games from ESPN's schedule payload. Throws FeedError unless all of it checks out. */
export function parseEspnSchedule(
  payload: unknown,
  season: number,
  teamId: TeamId,
  resolveTeam: (name: string) => TeamId | null,
): GameLog {
  if (!isObject(payload) || !Array.isArray(payload.events)) throw problem(BAD_FORMAT);
  const requested = isObject(payload.requestedSeason) ? payload.requestedSeason : null;
  if (requested?.year !== season || requested?.type !== REGULAR_SEASON) {
    throw problem(`was for a different season than ${seasonLabelFor(season)}`);
  }

  const rows: Omit<Game, "number">[] = [];
  for (const event of payload.events) {
    if (!isObject(event)) throw problem(BAD_FORMAT);
    if (!isObject(event.seasonType) || event.seasonType.type !== REGULAR_SEASON) continue;
    const competition = Array.isArray(event.competitions) ? event.competitions[0] : undefined;
    if (!isObject(competition)) throw problem(BAD_FORMAT);
    if (isObject(competition.type) && competition.type.abbreviation === CUP_CHAMPIONSHIP) continue;
    const status = isObject(competition.status) && isObject(competition.status.type) ? competition.status.type : null;
    if (!status || typeof status.name !== "string") throw problem(BAD_FORMAT);
    if (DROPPED_STATUSES.has(status.name)) continue;

    const competitors = Array.isArray(competition.competitors) ? competition.competitors.filter(isObject) : [];
    const ids = competitors.map((competitor) =>
      isObject(competitor.team) && typeof competitor.team.displayName === "string"
        ? resolveTeam(competitor.team.displayName)
        : null,
    );
    const ownIndex = ids.indexOf(teamId);
    if (competitors.length !== 2 || ownIndex === -1) throw problem(`listed a game without ${teamId}`);
    const own = competitors[ownIndex];

    let result: GameResult | null = null;
    if (status.completed === true) {
      const winners = competitors.filter((competitor) => competitor.winner === true).length;
      if (winners !== 1) throw problem("had a finished game without one winner");
      result = own.winner === true ? "W" : "L";
    }
    rows.push({
      date: typeof event.date === "string" ? event.date : null,
      opponentId: ids[1 - ownIndex],
      home: own.homeAway === "home" ? true : own.homeAway === "away" ? false : null,
      result,
    });
  }

  if (rows.length > SCORING.seasonGames) throw problem(`listed more than ${SCORING.seasonGames} games for ${teamId}`);
  rows.sort((a, b) => timeOf(a.date) - timeOf(b.date));
  return { season, teamId, games: rows.map((row, index) => ({ number: index + 1, ...row })) };
}

/** Undated games sort last. */
function timeOf(date: string | null): number {
  const time = date === null ? Number.NaN : Date.parse(date);
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `npx vitest run src/lib/game-log/espn.test.ts`
Expected: PASS (12 tests). If TypeScript complains about assigning `winner` in the fixture clone, the fixture's inferred type already has `winner?: boolean`; do not loosen the parser.

- [ ] **Step 7: Lint, typecheck and commit**

```bash
npm run lint && npm run typecheck
git add src/lib/game-log src/data/teams.ts
git commit -m "feat: parse ESPN team schedules into regular-season game logs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Progress math

Model: haiku (complete code).

**Files:**
- Create: `src/lib/game-log/progress.ts`, `src/lib/game-log/progress.test.ts`

**Interfaces:**
- Consumes: `Game` (Task 1); `gamesPlayed`, `projectWins` from `src/lib/scoring.ts`; `TeamRecord` from `src/lib/records/types.ts`.
- Produces:
  - `interface WinPoint { game: number; wins: number; source: Game }`
  - `type HistoryStatus = "complete" | "partial" | "mismatch"`
  - `interface ActualSeries { points: WinPoint[]; status: HistoryStatus }`
  - `actualSeries(games: readonly Game[], record: TeamRecord): ActualSeries`
  - `lockedPace(line: number, game: number): number`
  - `projectedAt(record: TeamRecord, game: number): number | null`
  - `winsNeededForOver(line: number, wins: number): number`
  - `gamesRemaining(record: TeamRecord): number`

- [ ] **Step 1: Write the failing tests** — `src/lib/game-log/progress.test.ts`

```ts
import { describe, expect, it } from "vitest";
import {
  actualSeries,
  gamesRemaining,
  lockedPace,
  projectedAt,
  winsNeededForOver,
} from "@/lib/game-log/progress";
import type { Game } from "@/lib/game-log/types";
import { projectWins } from "@/lib/scoring";

/** "WL-": W and L are completed games, "-" an upcoming one. */
function games(results: string): Game[] {
  return [...results].map((r, i) => ({
    number: i + 1,
    date: null,
    opponentId: null,
    home: null,
    result: r === "-" ? null : (r as "W" | "L"),
  }));
}
const record = (wins: number, losses: number) => ({ wins, losses });
const wins = (series: ReturnType<typeof actualSeries>) => series.points.map((p) => [p.game, p.wins]);

describe("actualSeries", () => {
  it("adds one per win and nothing per loss, through the last completed game", () => {
    const series = actualSeries(games("WLW--"), record(2, 1));
    expect(wins(series)).toEqual([
      [1, 1],
      [2, 1],
      [3, 2],
    ]);
    expect(series.status).toBe("complete");
    expect(series.points[2].source.number).toBe(3);
  });

  it("stops at the stored record's games played when the log is ahead", () => {
    const series = actualSeries(games("WLWW-"), record(2, 1));
    expect(wins(series)).toEqual([
      [1, 1],
      [2, 1],
      [3, 2],
    ]);
    expect(series.status).toBe("complete");
  });

  it("is partial when the log has fewer completed games than the record", () => {
    const series = actualSeries(games("WL"), record(2, 1));
    expect(series.points).toHaveLength(2);
    expect(series.status).toBe("partial");
  });

  it("is a mismatch when the log's wins differ from the record's", () => {
    expect(actualSeries(games("WLL"), record(2, 1)).status).toBe("mismatch");
  });

  it("is empty before the first game", () => {
    expect(actualSeries(games("--"), record(0, 0))).toEqual({ points: [], status: "complete" });
  });
});

describe("lockedPace", () => {
  it("is the line spread evenly over 82 games", () => {
    expect(lockedPace(51.5, 0)).toBe(0);
    expect(lockedPace(51.5, 41)).toBeCloseTo(25.75);
    expect(lockedPace(51.5, 82)).toBeCloseTo(51.5);
  });
});

describe("projectedAt", () => {
  it("continues from the current wins at the season win rate", () => {
    expect(projectedAt(record(30, 18), 48)).toBeCloseTo(30);
    expect(projectedAt(record(30, 18), 50)).toBeCloseTo(31.25);
  });

  it("reaches the league's projected wins at game 82", () => {
    expect(projectedAt(record(30, 18), 82)).toBeCloseTo(projectWins(record(30, 18))!);
  });

  it("is null before the first game", () => {
    expect(projectedAt(record(0, 0), 10)).toBeNull();
  });
});

describe("winsNeededForOver", () => {
  it("needs one more than the line's whole part", () => {
    expect(winsNeededForOver(51.5, 30)).toBe(22);
  });

  it("needs to beat an integer line outright, because a push misses", () => {
    expect(winsNeededForOver(50, 30)).toBe(21);
  });

  it("never goes below zero", () => {
    expect(winsNeededForOver(51.5, 52)).toBe(0);
  });
});

describe("gamesRemaining", () => {
  it("counts down from 82", () => {
    expect(gamesRemaining(record(30, 18))).toBe(34);
    expect(gamesRemaining(record(41, 41))).toBe(0);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run src/lib/game-log/progress.test.ts`
Expected: FAIL — cannot resolve `@/lib/game-log/progress`.

- [ ] **Step 3: Implement** — `src/lib/game-log/progress.ts`

```ts
import { SCORING, type ScoringConfig } from "@/config/scoring";
import type { TeamRecord } from "@/lib/records/types";
import { gamesPlayed, projectWins } from "@/lib/scoring";
import type { Game } from "./types";

/** Cumulative wins after a game. `source` is the game itself (for date, opponent and result). */
export interface WinPoint {
  game: number;
  wins: number;
  source: Game;
}

/** "partial": the log has fewer completed games than the record. "mismatch": its wins differ from the record's. */
export type HistoryStatus = "complete" | "partial" | "mismatch";

export interface ActualSeries {
  points: WinPoint[];
  status: HistoryStatus;
}

/**
 * Cumulative wins after each completed game, cut at the stored record's games played so the chart never runs ahead of
 * the numbers the league scores on. Never fills gaps.
 */
export function actualSeries(games: readonly Game[], record: TeamRecord): ActualSeries {
  const completed = games.filter((game) => game.result !== null).slice(0, gamesPlayed(record));
  let wins = 0;
  const points = completed.map((game, index) => {
    if (game.result === "W") wins += 1;
    return { game: index + 1, wins, source: game };
  });
  const status: HistoryStatus =
    points.length < gamesPlayed(record) ? "partial" : wins !== record.wins ? "mismatch" : "complete";
  return { points, status };
}

/** Wins the locked line implies after `game` games. */
export function lockedPace(line: number, game: number, config: ScoringConfig = SCORING): number {
  return (line * game) / config.seasonGames;
}

/** Current wins plus the season win rate for each game after the current one. Equals `projectWins` at game 82. */
export function projectedAt(record: TeamRecord, game: number, config: ScoringConfig = SCORING): number | null {
  const projected = projectWins(record, config);
  if (projected === null) return null;
  return record.wins + (game - gamesPlayed(record)) * (projected / config.seasonGames);
}

/** Wins still needed for the Over to hit. A push misses, so an integer line needs one more than the line. */
export function winsNeededForOver(line: number, wins: number): number {
  return Math.max(0, Math.floor(line) + 1 - wins);
}

export function gamesRemaining(record: TeamRecord, config: ScoringConfig = SCORING): number {
  return Math.max(0, config.seasonGames - gamesPlayed(record));
}
```

- [ ] **Step 4: Run to see it pass**

Run: `npx vitest run src/lib/game-log/progress.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game-log/progress.ts src/lib/game-log/progress.test.ts
git commit -m "feat: cumulative wins, locked-line pace and wins needed for a team's season

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Team detail logic (ownership, statuses, market line)

Model: haiku (complete code).

**Files:**
- Create: `src/lib/team-detail.ts`, `src/lib/team-detail.test.ts`

**Interfaces:**
- Consumes: `evaluateCall`, `evaluateFade`, `isSettled`, `CallEvaluation`, `FadeEvaluation` (`src/lib/scoring.ts`); `fadeStatus`, `FadeStatus`, `StatusTone` (`src/lib/fade-status.ts`); `findManager` (`src/lib/league/managers.ts`); `gamesRemaining` (Task 2); `FeedRead` (`src/lib/lines.ts`); `GameLogRead` (Task 1); `formatNumber` (`src/lib/format.ts`).
- Produces:
  - `interface TeamOption { id: TeamId; label: string }`
  - `interface MarketLine { book: string; line: number | null; asOf: string | null; error: string | null }`
  - `interface TeamPageData { league: League; info: TeamInfo; lockedLine: number | null; teamOptions: TeamOption[]; gameLog: GameLogRead; market: MarketLine }`
  - `interface FadeOnPick { fade: Fade; manager: Manager; projected: FadeEvaluation; final: FadeEvaluation }`
  - `interface SideOwnership { side: Side; pick: DraftPick | null; manager: Manager | null; projected: CallEvaluation | null; final: CallEvaluation | null; fades: FadeOnPick[] }`
  - `teamOwnership(league: Pick<League, "managers" | "draft" | "fades">, teamId: TeamId, team: Team | null): [SideOwnership, SideOwnership]` — `[Over, Under]`
  - `type Decided = "clinched" | "eliminated"`; `decidedOutcome(side: Side, line: number, record: TeamRecord): Decided | null`
  - `interface DisplayStatus { label: string; tone: StatusTone }`; `pickStatus(ownership: SideOwnership, record: TeamRecord, showProjected: boolean): DisplayStatus | null`
  - `pickPoints(ownership: SideOwnership, showProjected: boolean): { label: "Final points" | "Projected points"; value: number | null } | null`
  - `fadeDisplay(fade: FadeOnPick, showProjected: boolean): { status: FadeStatus; points: number; pointsLabel: "pts" | "projected pts" } | null`
  - `latestMarketLine(read: FeedRead, book: string, seasonLabel: string, teamId: TeamId): MarketLine`
  - `lineMovement(latest: number | null, locked: number | null): number | null`

- [ ] **Step 1: Write the failing tests** — `src/lib/team-detail.test.ts`

```ts
import { describe, expect, it } from "vitest";
import type { FeedRead } from "@/lib/lines";
import {
  decidedOutcome,
  fadeDisplay,
  latestMarketLine,
  lineMovement,
  pickPoints,
  pickStatus,
  teamOwnership,
} from "@/lib/team-detail";
import type { DraftState, Fade, League, Manager, Team } from "@/lib/types";

const managers: Manager[] = [
  { id: "m1", seat: 0, displayName: "Ana" },
  { id: "m2", seat: 1, displayName: null },
  { id: "m3", seat: 2, displayName: "Cy" },
  { id: "m4", seat: 3, displayName: "Di" },
];
const draft: DraftState = {
  status: "complete",
  rounds: 11,
  seatOrder: ["m1", "m2", "m3", "m4"],
  picks: [
    { pickNumber: 1, managerId: "m2", teamId: "MIN", side: "OVER" },
    { pickNumber: 9, managerId: "m1", teamId: "ORL", side: "OVER" },
    { pickNumber: 37, managerId: "m3", teamId: "ORL", side: "UNDER" },
  ],
};
const fades: Fade[] = [
  { id: "f4", managerId: "m4", targetPickNumber: 9 },
  { id: "f2", managerId: "m2", targetPickNumber: 9 },
  { id: "f1", managerId: "m1", targetPickNumber: 1 },
];
const league: Pick<League, "managers" | "draft" | "fades"> = { managers, draft, fades };

function orl(overrides: Partial<Team> = {}): Team {
  return {
    id: "ORL",
    nbaId: 1610612753,
    city: "Orlando",
    name: "Magic",
    conference: "East",
    color: "#0077C0",
    line: 51.5,
    prevWins: 41,
    wins: 30,
    losses: 18,
    ...overrides,
  };
}

describe("teamOwnership", () => {
  it("returns the Over then the Under with their managers and scores", () => {
    const [over, under] = teamOwnership(league, "ORL", orl());
    expect(over.side).toBe("OVER");
    expect(over.manager?.id).toBe("m1");
    expect(over.pick?.pickNumber).toBe(9);
    // Projected 51.25 wins against 51.5: the Over misses by 0.25.
    expect(over.projected?.points).toBeCloseTo(-1.025);
    expect(under.side).toBe("UNDER");
    expect(under.manager?.id).toBe("m3");
    expect(under.projected?.points).toBeCloseTo(1.025);
    expect(over.final?.status).toBe("pending");
  });

  it("lists every fade on a pick in seat order", () => {
    const [over, under] = teamOwnership(league, "ORL", orl());
    expect(over.fades.map((f) => f.manager.id)).toEqual(["m2", "m4"]);
    expect(over.fades[0].projected.points).toBe(2);
    expect(under.fades).toEqual([]);
  });

  it("leaves an undrafted side empty", () => {
    const [, under] = teamOwnership(league, "MIN", orl({ id: "MIN" }));
    expect(under).toEqual({ side: "UNDER", line: 51.5, pick: null, manager: null, projected: null, final: null, fades: [] });
  });

  it("has no evaluations before lines are frozen", () => {
    const [over] = teamOwnership({ managers, draft: { ...draft, picks: [] }, fades: [] }, "ORL", null);
    expect(over).toEqual({ side: "OVER", line: null, pick: null, manager: null, projected: null, final: null, fades: [] });
  });
});

describe("decidedOutcome", () => {
  it("clinches the Over once wins pass the line", () => {
    expect(decidedOutcome("OVER", 51.5, { wins: 52, losses: 10 })).toBe("clinched");
    expect(decidedOutcome("UNDER", 51.5, { wins: 52, losses: 10 })).toBe("eliminated");
  });

  it("eliminates the Under at an integer line reached, because a push misses", () => {
    expect(decidedOutcome("UNDER", 50, { wins: 50, losses: 10 })).toBe("eliminated");
    expect(decidedOutcome("OVER", 50, { wins: 50, losses: 10 })).toBeNull();
  });

  it("clinches the Under when the line is out of reach", () => {
    expect(decidedOutcome("UNDER", 51.5, { wins: 20, losses: 60 })).toBe("clinched");
    expect(decidedOutcome("OVER", 51.5, { wins: 20, losses: 60 })).toBe("eliminated");
  });

  it("is undecided otherwise", () => {
    expect(decidedOutcome("OVER", 51.5, { wins: 30, losses: 18 })).toBeNull();
    expect(decidedOutcome("UNDER", 51.5, { wins: 30, losses: 18 })).toBeNull();
  });
});

describe("pickStatus", () => {
  it("says whether a projected pick is on track to hit or miss", () => {
    const [over, under] = teamOwnership(league, "ORL", orl());
    expect(pickStatus(over, orl(), true)).toEqual({ label: "On track to miss · projected 51.3 vs 51.5", tone: "danger" });
    expect(pickStatus(under, orl(), true)).toEqual({ label: "On track to hit · projected 51.3 vs 51.5", tone: "accent" });
  });

  it("shows only decided outcomes with Show projected off", () => {
    const [over] = teamOwnership(league, "ORL", orl());
    expect(pickStatus(over, orl(), false)).toBeNull();
    const clinched = orl({ wins: 52, losses: 10 });
    const [cOver, cUnder] = teamOwnership(league, "ORL", clinched);
    expect(pickStatus(cOver, clinched, false)).toEqual({ label: "Clinched · already past the line", tone: "accent" });
    expect(pickStatus(cUnder, clinched, false)).toEqual({
      label: "Can no longer hit · already at or past the line",
      tone: "danger",
    });
    const sunk = orl({ wins: 20, losses: 60 });
    const [sOver, sUnder] = teamOwnership(league, "ORL", sunk);
    expect(pickStatus(sOver, sunk, false)).toEqual({ label: "Can no longer hit · can't get past the line", tone: "danger" });
    expect(pickStatus(sUnder, sunk, false)).toEqual({ label: "Clinched · can't get past the line", tone: "accent" });
  });

  it("shows the final result once the season is over, with or without projections", () => {
    const done = orl({ wins: 52, losses: 30 });
    const [over, under] = teamOwnership(league, "ORL", done);
    expect(pickStatus(over, done, false)).toEqual({ label: "Hit · 52 wins vs 51.5", tone: "accent" });
    expect(pickStatus(under, done, true)).toEqual({ label: "Missed · 52 wins vs 51.5", tone: "danger" });
  });

  it("says when no games have been played", () => {
    const fresh = orl({ wins: 0, losses: 0 });
    const [over] = teamOwnership(league, "ORL", fresh);
    expect(pickStatus(over, fresh, true)).toEqual({ label: "No games played yet", tone: "neutral" });
  });

  it("has nothing for an undrafted side", () => {
    const [, under] = teamOwnership(league, "MIN", orl({ id: "MIN" }));
    expect(pickStatus(under, orl(), true)).toBeNull();
  });
});

describe("pickPoints", () => {
  it("shows projected points only with Show projected on", () => {
    const [over] = teamOwnership(league, "ORL", orl());
    expect(pickPoints(over, true)?.label).toBe("Projected points");
    expect(pickPoints(over, true)?.value).toBeCloseTo(-1.025);
    expect(pickPoints(over, false)).toBeNull();
  });

  it("shows final points once settled, whatever the switch", () => {
    const [over] = teamOwnership(league, "ORL", orl({ wins: 52, losses: 30 }));
    expect(pickPoints(over, false)).toEqual({ label: "Final points", value: expect.closeTo(1.05) });
  });

  it("keeps a projection that isn't available as null, never zero", () => {
    const [over] = teamOwnership(league, "ORL", orl({ wins: 0, losses: 0 }));
    expect(pickPoints(over, true)).toEqual({ label: "Projected points", value: null });
  });

  it("has nothing for an undrafted side", () => {
    const [, under] = teamOwnership(league, "MIN", orl({ id: "MIN" }));
    expect(pickPoints(under, true)).toBeNull();
  });
});

describe("fadeDisplay", () => {
  it("shows a projected fade's status and points with Show projected on", () => {
    const [over] = teamOwnership(league, "ORL", orl());
    expect(fadeDisplay(over.fades[0], true)).toEqual({
      status: { label: "On track", tone: "accent" },
      points: 2,
      pointsLabel: "projected pts",
    });
    expect(fadeDisplay(over.fades[0], false)).toBeNull();
  });

  it("shows the final fade result once settled", () => {
    const [over] = teamOwnership(league, "ORL", orl({ wins: 52, losses: 30 }));
    expect(fadeDisplay(over.fades[0], false)).toEqual({
      status: { label: "No bonus", tone: "neutral" },
      points: 0,
      pointsLabel: "pts",
    });
  });

  it("has nothing before the target's team has played", () => {
    const [over] = teamOwnership(league, "ORL", orl({ wins: 0, losses: 0 }));
    expect(fadeDisplay(over.fades[0], true)).toBeNull();
  });
});

describe("latestMarketLine", () => {
  const read: FeedRead = {
    lines: { values: { ORL: 49.5 }, source: "FanDuel", season: "2026–27", asOf: "2026-10-09T12:00:00.000Z", manual: [] },
    error: null,
  };

  it("reads the team's current line for the league's season", () => {
    expect(latestMarketLine(read, "FanDuel", "2026–27", "ORL")).toEqual({
      book: "FanDuel",
      line: 49.5,
      asOf: "2026-10-09T12:00:00.000Z",
      error: null,
    });
  });

  it("has no line when the book has no open market for the team", () => {
    expect(latestMarketLine(read, "FanDuel", "2026–27", "BOS")).toMatchObject({ line: null, asOf: "2026-10-09T12:00:00.000Z" });
  });

  it("never uses another season's lines", () => {
    expect(latestMarketLine(read, "FanDuel", "2025–26", "ORL")).toEqual({ book: "FanDuel", line: null, asOf: null, error: null });
  });

  it("passes on why the read failed", () => {
    expect(latestMarketLine({ lines: null, error: "FanDuel answered 503." }, "FanDuel", "2026–27", "ORL")).toEqual({
      book: "FanDuel",
      line: null,
      asOf: null,
      error: "FanDuel answered 503.",
    });
  });
});

describe("lineMovement", () => {
  it("is the latest line minus the locked line, only when both exist", () => {
    expect(lineMovement(49.5, 51.5)).toBe(-2);
    expect(lineMovement(null, 51.5)).toBeNull();
    expect(lineMovement(49.5, null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run src/lib/team-detail.test.ts`
Expected: FAIL — cannot resolve `@/lib/team-detail`.

- [ ] **Step 3: Implement** — `src/lib/team-detail.ts`

```ts
import { SCORING, type ScoringConfig } from "@/config/scoring";
import { fadeStatus, type FadeStatus, type StatusTone } from "@/lib/fade-status";
import { formatNumber } from "@/lib/format";
import { gamesRemaining } from "@/lib/game-log/progress";
import type { GameLogRead } from "@/lib/game-log/types";
import { findManager } from "@/lib/league/managers";
import type { FeedRead } from "@/lib/lines";
import type { TeamRecord } from "@/lib/records/types";
import { evaluateCall, evaluateFade, type CallEvaluation, type FadeEvaluation } from "@/lib/scoring";
import type { DraftPick, Fade, League, Manager, Side, Team, TeamId, TeamInfo } from "@/lib/types";

export interface TeamOption {
  id: TeamId;
  label: string;
}

/** The latest sportsbook line for one team. Display only: league scoring uses the frozen line. */
export interface MarketLine {
  book: string;
  /** Null when the book has no current market for the team in the league's season. */
  line: number | null;
  /** When the lines shown were read. Null without a read for this season. */
  asOf: string | null;
  /** Why the latest read failed. Null when it succeeded. */
  error: string | null;
}

/** What the team page's server loader hands the client. */
export interface TeamPageData {
  league: League;
  /** Metadata and this league's record for the team. */
  info: TeamInfo;
  /** The league's frozen line. Null before the draft starts. */
  lockedLine: number | null;
  /** Every team, sorted by full name, for the team selector. */
  teamOptions: TeamOption[];
  gameLog: GameLogRead;
  market: MarketLine;
}

export interface FadeOnPick {
  fade: Fade;
  manager: Manager;
  projected: FadeEvaluation;
  final: FadeEvaluation;
}

/** One side of a team: who holds it, its scores on both bases and the fades on it. */
export interface SideOwnership {
  side: Side;
  /** The frozen line. Null before the draft starts. */
  line: number | null;
  /** Null when undrafted. */
  pick: DraftPick | null;
  manager: Manager | null;
  projected: CallEvaluation | null;
  final: CallEvaluation | null;
  /** Fades on this pick, in seat order. */
  fades: FadeOnPick[];
}

const SIDES: readonly Side[] = ["OVER", "UNDER"];

/** The Over and the Under of a team. `team` (with the frozen line) is null before the draft starts. */
export function teamOwnership(
  league: Pick<League, "managers" | "draft" | "fades">,
  teamId: TeamId,
  team: Team | null,
  config: ScoringConfig = SCORING,
): [SideOwnership, SideOwnership] {
  const [over, under] = SIDES.map((side): SideOwnership => {
    const line = team?.line ?? null;
    const pick = league.draft.picks.find((candidate) => candidate.teamId === teamId && candidate.side === side) ?? null;
    if (!pick || !team) return { side, line, pick: null, manager: null, projected: null, final: null, fades: [] };
    const projected = evaluateCall(side, team, "projected", config);
    const final = evaluateCall(side, team, "final", config);
    const fades = league.fades
      .filter((fade) => fade.targetPickNumber === pick.pickNumber)
      .flatMap((fade): FadeOnPick[] => {
        const manager = findManager(league.managers, fade.managerId);
        return manager
          ? [{ fade, manager, projected: evaluateFade(projected, config), final: evaluateFade(final, config) }]
          : [];
      })
      .sort((a, b) => a.manager.seat - b.manager.seat);
    const manager = findManager(league.managers, pick.managerId) ?? null;
    return { side, line, pick, manager, projected, final, fades };
  });
  return [over, under];
}

export type Decided = "clinched" | "eliminated";

/**
 * Whether the record alone already settles a side, whatever happens in the remaining games. Display arithmetic on the
 * existing rule (a call hits when its signed margin is above 0), not a scoring rule.
 */
export function decidedOutcome(
  side: Side,
  line: number,
  record: TeamRecord,
  config: ScoringConfig = SCORING,
): Decided | null {
  const maxWins = record.wins + gamesRemaining(record, config);
  if (side === "OVER") {
    if (record.wins > line) return "clinched";
    if (maxWins <= line) return "eliminated";
  } else {
    if (maxWins < line) return "clinched";
    if (record.wins >= line) return "eliminated";
  }
  return null;
}

export interface DisplayStatus {
  label: string;
  tone: StatusTone;
}

const DECIDED_LABELS: Record<Side, Record<Decided, string>> = {
  OVER: {
    clinched: "Clinched · already past the line",
    eliminated: "Can no longer hit · can't get past the line",
  },
  UNDER: {
    clinched: "Clinched · can't get past the line",
    eliminated: "Can no longer hit · already at or past the line",
  },
};

/**
 * One line of text saying how a drafted side stands: the final result once settled; with Show projected on, whether
 * the projection hits; otherwise only an outcome the record already decides. Null for an undrafted side or nothing to say.
 */
export function pickStatus(ownership: SideOwnership, record: TeamRecord, showProjected: boolean): DisplayStatus | null {
  const { side, line, pick, projected, final } = ownership;
  if (!pick || line === null || !projected || !final) return null;
  if (final.status === "scored") {
    const text = `${formatNumber(final.wins ?? 0, 0)} wins vs ${formatNumber(line)}`;
    return final.correct ? { label: `Hit · ${text}`, tone: "accent" } : { label: `Missed · ${text}`, tone: "danger" };
  }
  if (showProjected) {
    if (projected.status !== "scored") return { label: "No games played yet", tone: "neutral" };
    const text = `projected ${formatNumber(projected.wins ?? 0)} vs ${formatNumber(line)}`;
    return projected.correct
      ? { label: `On track to hit · ${text}`, tone: "accent" }
      : { label: `On track to miss · ${text}`, tone: "danger" };
  }
  const decided = decidedOutcome(side, line, record);
  if (!decided) return null;
  return { label: DECIDED_LABELS[side][decided], tone: decided === "clinched" ? "accent" : "danger" };
}

/** Final points once settled; projected points only with Show projected on. A null value means "Not available". */
export function pickPoints(
  ownership: SideOwnership,
  showProjected: boolean,
): { label: "Final points" | "Projected points"; value: number | null } | null {
  const { pick, projected, final } = ownership;
  if (!pick || !projected || !final) return null;
  if (final.status === "scored") return { label: "Final points", value: final.points };
  if (showProjected) return { label: "Projected points", value: projected.points };
  return null;
}

/** A fade's status and points: final once settled, projected with Show projected on. Null before its target plays. */
export function fadeDisplay(
  fade: FadeOnPick,
  showProjected: boolean,
): { status: FadeStatus; points: number; pointsLabel: "pts" | "projected pts" } | null {
  if (fade.final.status === "scored") {
    return { status: fadeStatus(fade.final), points: fade.final.points ?? 0, pointsLabel: "pts" };
  }
  if (showProjected && fade.projected.status === "scored") {
    return { status: fadeStatus(fade.projected), points: fade.projected.points ?? 0, pointsLabel: "projected pts" };
  }
  return null;
}

/** The team's current line from the latest read, only when that read is for the league's season. */
export function latestMarketLine(read: FeedRead, book: string, seasonLabel: string, teamId: TeamId): MarketLine {
  const lines = read.lines;
  if (!lines || lines.season !== seasonLabel) return { book, line: null, asOf: null, error: read.error };
  return { book: lines.source, line: lines.values[teamId] ?? null, asOf: lines.asOf, error: read.error };
}

/** Latest minus locked, only when both exist. */
export function lineMovement(latest: number | null, locked: number | null): number | null {
  return latest === null || locked === null ? null : latest - locked;
}
```

- [ ] **Step 4: Run to see it pass**

Run: `npx vitest run src/lib/team-detail.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint, typecheck and commit**

```bash
npm run lint && npm run typecheck
git add src/lib/team-detail.ts src/lib/team-detail.test.ts
git commit -m "feat: team ownership, pick and fade statuses, and the latest market line for the team page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Chart window, Y axis and chart model

Model: haiku (complete code).

**Files:**
- Create: `src/lib/chart-window.ts`, `src/lib/chart-window.test.ts`, `src/lib/game-log/chart-model.ts`, `src/lib/game-log/chart-model.test.ts`
- Modify: `src/lib/format.ts` (add `formatGameDate`), `src/lib/format.test.ts`

**Interfaces:**
- Consumes: `actualSeries`, `lockedPace`, `projectedAt`, `HistoryStatus` (Task 2); `Game` (Task 1); `gamesPlayed` (scoring).
- Produces:
  - `type ChartMode = "last8" | "full"`
  - `interface ChartWindow { first: number; last: number; completed: number; upcoming: number; current: number }`
  - `chartWindow(played: number, mode: ChartMode): ChartWindow`
  - `windowSubtitle(window: ChartWindow, mode: ChartMode): string`
  - `interface YAxis { min: number; max: number; ticks: number[] }`
  - `yAxis(values: readonly number[], mode: ChartMode): YAxis`
  - `interface ChartPoint { game: number; actual: number | null; pace: number | null; projected: number | null; detail: Game | null }`
  - `interface ChartModel { mode: ChartMode; window: ChartWindow; subtitle: string; points: ChartPoint[]; axis: YAxis; history: HistoryStatus | null; historyGames: number; showsProjected: boolean; hasData: boolean }`
  - `buildChartModel(input: { games: readonly Game[] | null; record: TeamRecord; line: number | null; mode: ChartMode; showProjected: boolean }): ChartModel`
  - `formatGameDate(iso: string): string` — `"Wed, Oct 22"` in US Eastern.

- [ ] **Step 1: Write the failing tests** — `src/lib/chart-window.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { chartWindow, windowSubtitle, yAxis } from "@/lib/chart-window";

describe("chartWindow", () => {
  it("shows the last 8 completed games and the next 2", () => {
    expect(chartWindow(48, "last8")).toEqual({ first: 41, last: 50, completed: 8, upcoming: 2, current: 48 });
  });

  it("shows fewer completed games early in the season", () => {
    expect(chartWindow(3, "last8")).toEqual({ first: 1, last: 5, completed: 3, upcoming: 2, current: 3 });
    expect(chartWindow(0, "last8")).toEqual({ first: 1, last: 2, completed: 0, upcoming: 2, current: 0 });
  });

  it("never runs past game 82", () => {
    expect(chartWindow(81, "last8")).toEqual({ first: 74, last: 82, completed: 8, upcoming: 1, current: 81 });
    expect(chartWindow(82, "last8")).toEqual({ first: 75, last: 82, completed: 8, upcoming: 0, current: 82 });
  });

  it("shows every game in the full season", () => {
    expect(chartWindow(48, "full")).toEqual({ first: 1, last: 82, completed: 48, upcoming: 34, current: 48 });
  });
});

describe("windowSubtitle", () => {
  it("counts completed and upcoming positions", () => {
    expect(windowSubtitle(chartWindow(48, "last8"), "last8")).toBe("8 completed games + 2 upcoming");
    expect(windowSubtitle(chartWindow(1, "last8"), "last8")).toBe("1 completed game + 2 upcoming");
    expect(windowSubtitle(chartWindow(81, "last8"), "last8")).toBe("8 completed games + 1 upcoming");
    expect(windowSubtitle(chartWindow(82, "last8"), "last8")).toBe("8 completed games");
    expect(windowSubtitle(chartWindow(0, "last8"), "last8")).toBe("No games played yet · 2 upcoming");
  });

  it("describes the full season", () => {
    expect(windowSubtitle(chartWindow(48, "full"), "full")).toBe("48 of 82 games played");
  });
});

describe("yAxis (Last 8)", () => {
  it("fits the data to 70% of the height with 15% padding above and below", () => {
    const axis = yAxis([10, 20], "last8");
    const span = axis.max - axis.min;
    expect((20 - 10) / span).toBeCloseTo(0.7);
    expect((axis.max - 20) / span).toBeCloseTo(0.15);
    expect((10 - axis.min) / span).toBeCloseTo(0.15);
  });

  it("uses readable ticks inside the range", () => {
    const axis = yAxis([25, 30.6], "last8");
    expect(axis.min).toBeCloseTo(23.8);
    expect(axis.max).toBeCloseTo(31.8);
    expect(axis.ticks).toEqual([24, 26, 28, 30]);
  });

  it("keeps a 4-win minimum span when the values are equal", () => {
    expect(yAxis([30, 30], "last8")).toEqual({ min: 28, max: 32, ticks: [28, 29, 30, 31, 32] });
  });

  it("never goes below zero and doesn't start at zero otherwise", () => {
    expect(yAxis([0, 1], "last8")).toEqual({ min: 0, max: 4, ticks: [0, 1, 2, 3, 4] });
    expect(yAxis([25, 30.6], "last8").min).toBeGreaterThan(0);
  });

  it("has a default range with no values", () => {
    expect(yAxis([], "last8")).toEqual({ min: 0, max: 4, ticks: [0, 1, 2, 3, 4] });
  });
});

describe("yAxis (Full season)", () => {
  it("starts at zero with headroom above the highest value", () => {
    expect(yAxis([0, 30, 51.5], "full")).toEqual({ min: 0, max: 60, ticks: [0, 10, 20, 30, 40, 50, 60] });
  });

  it("has a default range with no wins yet", () => {
    expect(yAxis([0], "full")).toEqual({ min: 0, max: 10, ticks: [0, 2, 4, 6, 8, 10] });
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run src/lib/chart-window.test.ts`
Expected: FAIL — cannot resolve `@/lib/chart-window`.

- [ ] **Step 3: Implement** — `src/lib/chart-window.ts`

```ts
import { SCORING } from "@/config/scoring";

/** "last8": the latest completed games and the next upcoming ones, zoomed in. "full": the whole season from zero. */
export type ChartMode = "last8" | "full";

const RECENT_GAMES = 8;
const UPCOMING_GAMES = 2;
/** Share of the plot height the data fills in "last8"; the rest is split evenly above and below. */
const DATA_SHARE = 0.7;
/** Smallest Y range in wins, so a flat stretch doesn't blow up tiny differences. */
const MIN_AXIS_SPAN = 4;
/** Full season: headroom above the highest value, and the smallest top. */
const FULL_HEADROOM = 1.1;
const MIN_FULL_TOP = 10;

/** Game positions shown. `current` is games played; `completed`/`upcoming` count positions on each side of it. */
export interface ChartWindow {
  first: number;
  last: number;
  completed: number;
  upcoming: number;
  current: number;
}

export function chartWindow(played: number, mode: ChartMode, seasonGames = SCORING.seasonGames): ChartWindow {
  if (mode === "full") {
    return { first: 1, last: seasonGames, completed: played, upcoming: seasonGames - played, current: played };
  }
  const first = Math.max(1, played - RECENT_GAMES + 1);
  const last = Math.min(seasonGames, played + UPCOMING_GAMES);
  return { first, last, completed: Math.max(0, played - first + 1), upcoming: last - played, current: played };
}

function games(count: number): string {
  return `${count} completed ${count === 1 ? "game" : "games"}`;
}

export function windowSubtitle(window: ChartWindow, mode: ChartMode, seasonGames = SCORING.seasonGames): string {
  if (mode === "full") return `${window.current} of ${seasonGames} games played`;
  if (window.completed === 0) return `No games played yet · ${window.upcoming} upcoming`;
  if (window.upcoming === 0) return games(window.completed);
  return `${games(window.completed)} + ${window.upcoming} upcoming`;
}

export interface YAxis {
  min: number;
  max: number;
  ticks: number[];
}

/** 1, 2 or 5 × 10ⁿ at or above `raw`; never below 1 (wins are whole). */
function niceStep(raw: number): number {
  if (raw <= 1) return 1;
  const power = 10 ** Math.floor(Math.log10(raw));
  const base = raw / power;
  return (base <= 1 ? 1 : base <= 2 ? 2 : base <= 5 ? 5 : 10) * power;
}

function ticksFor(min: number, max: number, step: number): number[] {
  const ticks: number[] = [];
  for (let value = Math.ceil(min / step - 1e-9) * step; value <= max + 1e-9; value += step) ticks.push(value);
  return ticks;
}

/** Y range for the visible values: zoomed to them in "last8", from zero in "full". */
export function yAxis(values: readonly number[], mode: ChartMode): YAxis {
  const high = values.length ? Math.max(...values) : 0;
  if (mode === "full") {
    const step = niceStep(Math.max(high * FULL_HEADROOM, MIN_FULL_TOP) / 6);
    const max = Math.max(MIN_FULL_TOP, Math.ceil((high * FULL_HEADROOM) / step - 1e-9) * step);
    return { min: 0, max, ticks: ticksFor(0, max, step) };
  }
  const low = values.length ? Math.min(...values) : 0;
  const span = Math.max((high - low) / DATA_SHARE, MIN_AXIS_SPAN);
  const min = Math.max(0, (low + high) / 2 - span / 2);
  const max = min + span;
  return { min, max, ticks: ticksFor(min, max, niceStep(span / 5)) };
}
```

Check against the tests: `[0,30,51.5]` full → `high*1.1 = 56.65`, step `niceStep(56.65/6 = 9.44) = 10`, max `ceil(5.665)*10 = 60`. `[0]` full → step `niceStep(10/6) = 2`, max `max(10, 0) = 10`. `[30,30]` → span 4, min 28, step `niceStep(0.8) = 1`. `[0,1]` → span `max(1.43, 4) = 4`, min `max(0, −1.5) = 0`.

- [ ] **Step 4: Run to see it pass**

Run: `npx vitest run src/lib/chart-window.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing chart-model and date tests**

`src/lib/game-log/chart-model.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildChartModel } from "@/lib/game-log/chart-model";
import type { Game } from "@/lib/game-log/types";

/** 30 wins and 18 losses (W and L alternating, then wins), then upcoming games with known opponents. */
function orlGames(): Game[] {
  const results = [..."WL".repeat(18), ..."W".repeat(12)];
  const completed: Game[] = results.map((r, i) => ({
    number: i + 1,
    date: null,
    opponentId: null,
    home: null,
    result: r as "W" | "L",
  }));
  const upcoming: Game[] = Array.from({ length: 34 }, (_, i) => ({
    number: 49 + i,
    date: "2027-03-01T00:00Z",
    opponentId: i === 0 ? "MIA" : "BOS",
    home: i === 0,
    result: null,
  }));
  return [...completed, ...upcoming];
}
const record = { wins: 30, losses: 18 };

describe("buildChartModel", () => {
  it("covers the last 8 completed games and the next 2", () => {
    const model = buildChartModel({ games: orlGames(), record, line: 51.5, mode: "last8", showProjected: true });
    expect(model.points.map((p) => p.game)).toEqual([41, 42, 43, 44, 45, 46, 47, 48, 49, 50]);
    expect(model.subtitle).toBe("8 completed games + 2 upcoming");
    expect(model.history).toBe("complete");
    expect(model.historyGames).toBe(48);
  });

  it("stops actual wins at the current game and starts the projection there", () => {
    const model = buildChartModel({ games: orlGames(), record, line: 51.5, mode: "last8", showProjected: true });
    const at = (game: number) => model.points.find((p) => p.game === game)!;
    expect(at(48).actual).toBe(30);
    expect(at(48).projected).toBeCloseTo(30);
    expect(at(49).actual).toBeNull();
    expect(at(49).projected).toBeCloseTo(30.625);
    expect(at(47).projected).toBeNull();
    expect(at(41).pace).toBeCloseTo(25.75);
    expect(model.showsProjected).toBe(true);
  });

  it("attaches each game's details: completed games, then upcoming ones in order", () => {
    const model = buildChartModel({ games: orlGames(), record, line: 51.5, mode: "last8", showProjected: true });
    const at = (game: number) => model.points.find((p) => p.game === game)!;
    expect(at(48).detail?.result).toBe("W");
    expect(at(49).detail).toMatchObject({ opponentId: "MIA", home: true, result: null });
    expect(at(50).detail?.opponentId).toBe("BOS");
  });

  it("drops the projection and refits the axis without it", () => {
    // A 40-win line keeps pace below the projection, so the projection sets the top of the axis.
    const withProjection = buildChartModel({ games: orlGames(), record, line: 40, mode: "last8", showProjected: true });
    const without = buildChartModel({ games: orlGames(), record, line: 40, mode: "last8", showProjected: false });
    expect(without.points.every((p) => p.projected === null)).toBe(true);
    expect(without.showsProjected).toBe(false);
    expect(without.axis).not.toEqual(withProjection.axis);
  });

  it("has no pace before lines are frozen", () => {
    const model = buildChartModel({ games: orlGames(), record, line: null, mode: "last8", showProjected: true });
    expect(model.points.every((p) => p.pace === null)).toBe(true);
  });

  it("has no actual wins without a game log", () => {
    const model = buildChartModel({ games: null, record, line: 51.5, mode: "last8", showProjected: true });
    expect(model.points.every((p) => p.actual === null)).toBe(true);
    expect(model.history).toBeNull();
    expect(model.hasData).toBe(true);
  });

  it("shows the whole season from zero", () => {
    const model = buildChartModel({ games: orlGames(), record, line: 51.5, mode: "full", showProjected: true });
    expect(model.points).toHaveLength(82);
    expect(model.axis.min).toBe(0);
    expect(model.points[81].projected).toBeCloseTo(51.25);
    expect(model.points[81].pace).toBeCloseTo(51.5);
  });

  it("has nothing to draw before the draft and the first game", () => {
    const model = buildChartModel({ games: [], record: { wins: 0, losses: 0 }, line: null, mode: "last8", showProjected: true });
    expect(model.hasData).toBe(false);
  });

  it("reports a partial game log", () => {
    const model = buildChartModel({ games: orlGames().slice(0, 40), record, line: 51.5, mode: "last8", showProjected: true });
    expect(model.history).toBe("partial");
    expect(model.historyGames).toBe(40);
  });
});
```

Add to `src/lib/format.test.ts` (inside the file, new `describe`; import `formatGameDate` alongside the existing imports):

```ts
describe("formatGameDate", () => {
  it("shows the weekday and date in US Eastern", () => {
    expect(formatGameDate("2025-10-22T23:00Z")).toBe("Wed, Oct 22");
    // 01:30 UTC on the 17th is still the 16th in New York.
    expect(formatGameDate("2025-12-17T01:30Z")).toBe("Tue, Dec 16");
  });
});
```

- [ ] **Step 6: Run to see them fail**

Run: `npx vitest run src/lib/game-log/chart-model.test.ts src/lib/format.test.ts`
Expected: FAIL — missing `chart-model` module and `formatGameDate` export.

- [ ] **Step 7: Implement**

Append to `src/lib/format.ts`:

```ts
const GAME_DATE = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "America/New_York",
});

/** "Wed, Oct 22": a game's date in US Eastern, the same on the server and every browser. */
export function formatGameDate(iso: string): string {
  return GAME_DATE.format(new Date(iso));
}
```

`src/lib/game-log/chart-model.ts`:

```ts
import { chartWindow, windowSubtitle, yAxis, type ChartMode, type ChartWindow, type YAxis } from "@/lib/chart-window";
import type { TeamRecord } from "@/lib/records/types";
import { gamesPlayed } from "@/lib/scoring";
import { actualSeries, lockedPace, projectedAt, type HistoryStatus } from "./progress";
import type { Game } from "./types";

/** One game position on the chart. Null values are not drawn. */
export interface ChartPoint {
  game: number;
  /** Cumulative wins after this game; null for upcoming games or when the log lacks it. */
  actual: number | null;
  /** Wins the locked line implies by this game; null before lines are frozen. */
  pace: number | null;
  /** Projected cumulative wins from the current game on; null when hidden or unavailable. */
  projected: number | null;
  /** The game itself (date, opponent, result) when the log has it. */
  detail: Game | null;
}

export interface ChartModel {
  mode: ChartMode;
  window: ChartWindow;
  subtitle: string;
  points: ChartPoint[];
  axis: YAxis;
  /** Null without a game log. */
  history: HistoryStatus | null;
  /** Completed games the log covers (up to the record's games played). */
  historyGames: number;
  showsProjected: boolean;
  /** False when no series has a single value (before the draft and the first game). */
  hasData: boolean;
}

export function buildChartModel({
  games,
  record,
  line,
  mode,
  showProjected,
}: {
  games: readonly Game[] | null;
  record: TeamRecord;
  line: number | null;
  mode: ChartMode;
  showProjected: boolean;
}): ChartModel {
  const played = gamesPlayed(record);
  const window = chartWindow(played, mode);
  const series = games ? actualSeries(games, record) : null;
  const completed = games ? games.filter((game) => game.result !== null) : [];
  // Positions after the current game: completed games the record doesn't count yet, then upcoming games, in order.
  const later = games ? [...completed.slice(played), ...games.filter((game) => game.result === null)] : [];

  const points: ChartPoint[] = [];
  for (let game = window.first; game <= window.last; game += 1) {
    const actualPoint = series?.points[game - 1];
    points.push({
      game,
      actual: actualPoint ? actualPoint.wins : null,
      pace: line === null ? null : lockedPace(line, game),
      projected: showProjected && game >= played ? projectedAt(record, game) : null,
      detail: game <= played ? (actualPoint?.source ?? null) : (later[game - played - 1] ?? null),
    });
  }

  const values = points.flatMap((point) =>
    [point.actual, point.pace, point.projected].filter((value): value is number => value !== null),
  );
  return {
    mode,
    window,
    subtitle: windowSubtitle(window, mode),
    points,
    axis: yAxis(mode === "full" ? [0, ...values] : values, mode),
    history: series?.status ?? null,
    historyGames: series?.points.length ?? 0,
    showsProjected: points.some((point) => point.projected !== null),
    hasData: values.length > 0,
  };
}
```

- [ ] **Step 8: Run to see them pass**

Run: `npx vitest run src/lib/game-log src/lib/chart-window.test.ts src/lib/format.test.ts`
Expected: PASS.

- [ ] **Step 9: Lint, typecheck and commit**

```bash
npm run lint && npm run typecheck
git add src/lib/chart-window.ts src/lib/chart-window.test.ts src/lib/game-log/chart-model.ts src/lib/game-log/chart-model.test.ts src/lib/format.ts src/lib/format.test.ts
git commit -m "feat: season-progress chart window, zoomed Y axis and chart points

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Mock game log, cache, server loaders

Model: haiku (complete code).

**Files:**
- Create: `src/data/game-logs.ts`, `src/data/game-logs.test.ts`, `src/lib/game-log/cache.ts`, `src/lib/game-log/cache.test.ts`, `src/server/game-log.ts`, `src/server/team-page.ts`
- Modify: `src/config/records.ts`

**Interfaces:**
- Consumes: Task 1 types and parser, `espnAbbr`, `teamIdByNickname`, `TEAM_INFO`, `TEAM_IDS`; Task 3 `TeamPageData`, `latestMarketLine`; `fetchFeedJson` (`src/server/feed.ts`); `readLines` (`src/server/lines.ts`); `teamInfoFor` (`src/server/league.ts`); `seasonEndYear`; `LINES`, `RECORDS`.
- Produces: `mockGameLog(team: Pick<TeamInfo, "id" | "wins" | "losses">, season: number): GameLog`; `cachedGameLogSource(source, ttlMs, retryMs, now?)`; `readGameLog(league: Pick<League, "isDemo" | "seasonLabel">, teamId: TeamId): Promise<GameLogRead>`; `loadTeamPage(league: League, teamId: string): Promise<TeamPageData | null>`.

- [ ] **Step 1: Config** — in `src/config/records.ts` add to `RECORDS` (after `fetchTimeoutMs`):

```ts
  /** A team's game log (season-progress chart) is reused this long after a successful read. */
  gameLogCacheSeconds: 600,
  /** After a failed game-log read, wait this long before asking again. */
  gameLogRetrySeconds: 30,
```

- [ ] **Step 2: Write the failing tests**

`src/data/game-logs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mockGameLog } from "@/data/game-logs";
import { TEAM_INFO } from "@/data/teams";

describe("mockGameLog", () => {
  it("adds up to every team's mock record", () => {
    for (const team of TEAM_INFO) {
      const log = mockGameLog(team, 2026);
      expect(log.teamId).toBe(team.id);
      expect(log.games).toHaveLength(team.wins + team.losses);
      expect(log.games.filter((game) => game.result === "W")).toHaveLength(team.wins);
    }
  });

  it("is the same on every run and invents no dates, opponents or venues", () => {
    const team = TEAM_INFO.find((candidate) => candidate.id === "ORL")!;
    expect(mockGameLog(team, 2026)).toEqual(mockGameLog(team, 2026));
    expect(mockGameLog(team, 2026).games[0]).toMatchObject({ number: 1, date: null, opponentId: null, home: null });
  });

  it("mixes wins and losses rather than listing all wins first", () => {
    const team = TEAM_INFO.find((candidate) => candidate.id === "ORL")!;
    const results = mockGameLog(team, 2026).games.map((game) => game.result).join("");
    expect(results).not.toBe("W".repeat(team.wins) + "L".repeat(team.losses));
  });
});
```

`src/lib/game-log/cache.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { cachedGameLogSource } from "@/lib/game-log/cache";
import type { GameLog, GameLogSource } from "@/lib/game-log/types";

const log = (teamId: string): GameLog => ({ season: 2027, teamId, games: [] });

function fakeSource() {
  const fetch = vi.fn(async (season: number, teamId: string) => log(teamId));
  const source: GameLogSource = { name: "ESPN", fetch };
  return { source, fetch };
}

describe("cachedGameLogSource", () => {
  it("reuses a success until the cache time passes", async () => {
    let now = 0;
    const { source, fetch } = fakeSource();
    const cached = cachedGameLogSource(source, 1000, 100, () => now);
    await cached.fetch(2027, "ORL");
    now = 999;
    await cached.fetch(2027, "ORL");
    expect(fetch).toHaveBeenCalledTimes(1);
    now = 1000;
    await cached.fetch(2027, "ORL");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("caches each season and team separately", async () => {
    const { source, fetch } = fakeSource();
    const cached = cachedGameLogSource(source, 1000, 100, () => 0);
    await cached.fetch(2027, "ORL");
    await cached.fetch(2027, "BOS");
    await cached.fetch(2026, "ORL");
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("repeats a failure until the retry time passes", async () => {
    let now = 0;
    const fetch = vi.fn(async () => {
      throw new Error("down");
    });
    const cached = cachedGameLogSource({ name: "ESPN", fetch }, 1000, 100, () => now);
    await expect(cached.fetch(2027, "ORL")).rejects.toThrow("down");
    now = 99;
    await expect(cached.fetch(2027, "ORL")).rejects.toThrow("down");
    expect(fetch).toHaveBeenCalledTimes(1);
    now = 100;
    await expect(cached.fetch(2027, "ORL")).rejects.toThrow("down");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("shares one read between concurrent callers", async () => {
    const { source, fetch } = fakeSource();
    const cached = cachedGameLogSource(source, 1000, 100, () => 0);
    await Promise.all([cached.fetch(2027, "ORL"), cached.fetch(2027, "ORL")]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps the source's name", () => {
    expect(cachedGameLogSource(fakeSource().source, 1000, 100).name).toBe("ESPN");
  });
});
```

- [ ] **Step 3: Run to see them fail**

Run: `npx vitest run src/data/game-logs.test.ts src/lib/game-log/cache.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 4: Implement**

`src/data/game-logs.ts`:

```ts
import type { Game, GameLog } from "@/lib/game-log/types";
import type { TeamInfo } from "@/lib/types";

// The mock dataset's game-by-game results, for the demo league and RECORD_SOURCE=static. Each team's mock wins and
// losses in a fixed order (a shuffle seeded by the team id), so the chart has a believable curve that adds up to the
// mock record. No dates, opponents or venues: we never invent them, and no upcoming games are listed.

/** mulberry32: a small deterministic generator. */
function generator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFor(text: string): number {
  let hash = 2166136261;
  for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash;
}

export function mockGameLog(team: Pick<TeamInfo, "id" | "wins" | "losses">, season: number): GameLog {
  const results: Array<"W" | "L"> = [...Array<"W">(team.wins).fill("W"), ...Array<"L">(team.losses).fill("L")];
  const random = generator(seedFor(team.id));
  for (let i = results.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [results[i], results[j]] = [results[j], results[i]];
  }
  const games: Game[] = results.map((result, index) => ({
    number: index + 1,
    date: null,
    opponentId: null,
    home: null,
    result,
  }));
  return { season, teamId: team.id, games };
}
```

`src/lib/game-log/cache.ts`:

```ts
import type { TeamId } from "@/lib/types";
import type { GameLog, GameLogSource } from "./types";

interface Entry {
  success: { log: GameLog; at: number } | null;
  failure: { error: unknown; at: number } | null;
  inflight: Promise<GameLog> | null;
}

/**
 * Reuses each team's successful read for `ttlMs` and a failure for `retryMs`, so page views don't hit the source every
 * time. Concurrent callers for one team share one read. Like `cachedLineSource`, per server instance.
 */
export function cachedGameLogSource(
  source: GameLogSource,
  ttlMs: number,
  retryMs: number,
  now: () => number = Date.now,
): GameLogSource {
  const entries = new Map<string, Entry>();
  return {
    name: source.name,
    fetch(season: number, teamId: TeamId) {
      const key = `${season}:${teamId}`;
      let entry = entries.get(key);
      if (!entry) {
        entry = { success: null, failure: null, inflight: null };
        entries.set(key, entry);
      }
      const current = entry;
      if (current.success && now() - current.success.at < ttlMs) return Promise.resolve(current.success.log);
      if (current.failure && now() - current.failure.at < retryMs) return Promise.reject(current.failure.error);
      current.inflight ??= source.fetch(season, teamId).then(
        (log) => {
          current.success = { log, at: now() };
          current.failure = null;
          current.inflight = null;
          return log;
        },
        (error: unknown) => {
          current.failure = { error, at: now() };
          current.inflight = null;
          throw error;
        },
      );
      return current.inflight;
    },
  };
}
```

`src/server/game-log.ts`:

```ts
import "server-only";
import { RECORDS } from "@/config/records";
import { mockGameLog } from "@/data/game-logs";
import { espnAbbr, TEAM_INFO, teamIdByNickname } from "@/data/teams";
import { FeedError } from "@/lib/feed-error";
import { cachedGameLogSource } from "@/lib/game-log/cache";
import { espnScheduleUrl, parseEspnSchedule } from "@/lib/game-log/espn";
import type { GameLogRead, GameLogSource } from "@/lib/game-log/types";
import { seasonEndYear } from "@/lib/records/season";
import type { League, TeamId } from "@/lib/types";
import { fetchFeedJson } from "@/server/feed";

const espnGameLogSource: GameLogSource = {
  name: RECORDS.source,
  async fetch(season, teamId) {
    const payload = await fetchFeedJson(espnScheduleUrl(espnAbbr(teamId), season), {
      source: RECORDS.source,
      timeoutMs: RECORDS.fetchTimeoutMs,
    });
    return parseEspnSchedule(payload, season, teamId, teamIdByNickname);
  },
};

/** The mock dataset's game logs; they add up to the mock records. */
const mockGameLogSource: GameLogSource = {
  name: "Mock data",
  async fetch(season, teamId) {
    const team = TEAM_INFO.find((candidate) => candidate.id === teamId);
    if (!team) throw new FeedError(`No mock games for ${teamId}.`);
    return mockGameLog(team, season);
  },
};

/** ESPN, cached per team; with RECORD_SOURCE=static the mock game logs, to match the mock records. */
export const gameLogSource: GameLogSource =
  process.env.RECORD_SOURCE === "static"
    ? mockGameLogSource
    : cachedGameLogSource(espnGameLogSource, RECORDS.gameLogCacheSeconds * 1000, RECORDS.gameLogRetrySeconds * 1000);

/** A team's game log for the league's season. The demo league uses the mock log. Never rejects. */
export async function readGameLog(league: Pick<League, "isDemo" | "seasonLabel">, teamId: TeamId): Promise<GameLogRead> {
  const source = league.isDemo ? mockGameLogSource : gameLogSource;
  const season = seasonEndYear(league.seasonLabel);
  if (season === null) return { log: null, source: source.name, error: `Unknown season ${league.seasonLabel}.` };
  try {
    return { log: await source.fetch(season, teamId), source: source.name, error: null };
  } catch (error) {
    if (!(error instanceof FeedError)) console.error("Game log read failed", error);
    return {
      log: null,
      source: source.name,
      error: error instanceof FeedError ? error.message : "Game history couldn't be read.",
    };
  }
}
```

`src/server/team-page.ts`:

```ts
import "server-only";
import { LINES } from "@/config/lines";
import { TEAM_IDS } from "@/data/teams";
import { latestMarketLine, type TeamPageData } from "@/lib/team-detail";
import type { League } from "@/lib/types";
import { readGameLog } from "@/server/game-log";
import { teamInfoFor } from "@/server/league";
import { readLines } from "@/server/lines";

/** Everything the team page shows. Null for an unknown team id. A failed feed only empties its own panel. */
export async function loadTeamPage(league: League, rawTeamId: string): Promise<TeamPageData | null> {
  const teamId = rawTeamId.toUpperCase();
  if (!TEAM_IDS.has(teamId)) return null;
  const [teamInfo, gameLog, read] = await Promise.all([teamInfoFor(league), readGameLog(league, teamId), readLines()]);
  const info = teamInfo.find((team) => team.id === teamId);
  if (!info) return null;
  return {
    league,
    info,
    lockedLine: league.lines?.values[teamId] ?? null,
    teamOptions: teamInfo
      .map((team) => ({ id: team.id, label: `${team.city} ${team.name}` }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    gameLog,
    market: latestMarketLine(read, LINES.book, league.seasonLabel, teamId),
  };
}
```

- [ ] **Step 5: Run to see them pass**

Run: `npx vitest run src/data/game-logs.test.ts src/lib/game-log/cache.test.ts`
Expected: PASS.

- [ ] **Step 6: Full checks and commit**

```bash
npm test && npm run lint && npm run typecheck
git add src/config/records.ts src/data/game-logs.ts src/data/game-logs.test.ts src/lib/game-log/cache.ts src/lib/game-log/cache.test.ts src/server/game-log.ts src/server/team-page.ts
git commit -m "feat: team game logs from ESPN (cached per team) or the mock dataset; team page loader

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Team page route, header, stat strip, sportsbook panel and ownership cards

Model: sonnet (UI). Read the reference image `docs/superpowers/specs/2026-10-09-team-detail-page-reference.png` first and match it.

**Files:**
- Create: `src/app/l/[leagueId]/teams/[teamId]/page.tsx`, `src/components/team/TeamDetail.tsx`, `src/components/team/TeamHeader.tsx`, `src/components/team/TeamStatStrip.tsx`, `src/components/team/SportsbookPanel.tsx`, `src/components/team/OwnershipCard.tsx`
- Modify: `src/components/ui/TeamLogo.tsx`, `src/components/ui/TeamBadge.tsx` (prop type only)

**Interfaces:**
- Consumes: `loadTeamPage` (Task 5); `TeamPageData`, `teamOwnership`, `pickStatus`, `pickPoints`, `fadeDisplay`, `lineMovement`, `SideOwnership` (Task 3); `gamesRemaining`, `winsNeededForOver` (Task 2); `getLeagueOrNotFound` (`src/server/league.ts`); UI primitives `Switch`, `Select`, `SignedValue`, `ManagerAvatar`, `Badge`, `TeamLogo`, `PageFallback`.
- Produces: `TeamDetail(props: TeamPageData)` client component. Task 7 adds `SeasonProgressPanel` into its middle row.

- [ ] **Step 1: Let logos take a `TeamInfo`** — in `TeamLogo.tsx` and `TeamBadge.tsx` change the prop type `team: Team` to `team: Pick<TeamInfo, "id" | "nbaId" | "color">` and import `TeamInfo` instead of `Team`. Every existing caller passes a `Team`, which still fits.

- [ ] **Step 2: Route** — `src/app/l/[leagueId]/teams/[teamId]/page.tsx`

```tsx
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { TeamDetail } from "@/components/team/TeamDetail";
import { PageFallback } from "@/components/ui/PageFallback";
import { getLeagueOrNotFound } from "@/server/league";
import { loadTeamPage } from "@/server/team-page";

export default function TeamPage({ params }: PageProps<"/l/[leagueId]/teams/[teamId]">) {
  return (
    <Suspense fallback={<PageFallback label="Loading team…" />}>
      <Team params={params} />
    </Suspense>
  );
}

async function Team({ params }: { params: PageProps<"/l/[leagueId]/teams/[teamId]">["params"] }) {
  const { leagueId, teamId } = await params;
  const data = await loadTeamPage(await getLeagueOrNotFound(leagueId), teamId);
  if (!data) notFound();
  return <TeamDetail {...data} />;
}
```

- [ ] **Step 3: `TeamDetail`** — `src/components/team/TeamDetail.tsx`

```tsx
"use client";

import { useMemo, useState } from "react";
import { teamOwnership, type TeamPageData } from "@/lib/team-detail";
import type { Team } from "@/lib/types";
import { OwnershipCard } from "./OwnershipCard";
import { SportsbookPanel } from "./SportsbookPanel";
import { TeamHeader } from "./TeamHeader";
import { TeamStatStrip } from "./TeamStatStrip";

export function TeamDetail({ league, info, lockedLine, teamOptions, market }: TeamPageData) {
  const [showProjected, setShowProjected] = useState(true);
  const team = useMemo<Team | null>(() => (lockedLine === null ? null : { ...info, line: lockedLine }), [info, lockedLine]);
  const [over, under] = useMemo(() => teamOwnership(league, info.id, team), [league, info.id, team]);
  return (
    <div className="flex flex-col gap-6">
      <TeamHeader
        league={league}
        info={info}
        teamOptions={teamOptions}
        showProjected={showProjected}
        onShowProjectedChange={setShowProjected}
      />
      <TeamStatStrip record={info} lockedLine={lockedLine} showProjected={showProjected} />
      <div className="grid gap-6 xl:grid-cols-3">
        <SportsbookPanel market={market} lockedLine={lockedLine} />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <OwnershipCard ownership={over} record={info} showProjected={showProjected} />
        <OwnershipCard ownership={under} record={info} showProjected={showProjected} />
      </div>
    </div>
  );
}
```

(`gameLog` is used by Task 7.)

- [ ] **Step 4: `TeamHeader`** — `src/components/team/TeamHeader.tsx`

Breadcrumb `{league name} / {city name}` (first item links to `/l/{id}`, `aria-current="page"` on the team), logo (64 px) beside `h1` `{city} {name}` (font-display, `text-3xl sm:text-5xl` bold) and subtitle `{league name} • {season}` (`text-lg sm:text-2xl text-fog-300`). Right side, wrapping below on narrow screens: `Switch` "Show projected" and `Select` (accessible label "Team", options labelled `Team: {city name}`, `className="w-full sm:w-72"`) whose `onChange` calls `router.push(\`/l/${league.id}/teams/${id}\`)` (`useRouter` from `next/navigation`). For the demo league show the app's usual tag (`<span className="text-xs font-semibold uppercase tracking-[0.2em] text-link">Demo data</span>`) above the controls, as `PageHeader` does.

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { TeamLogo } from "@/components/ui/TeamLogo";
import type { TeamOption } from "@/lib/team-detail";
import type { League, TeamInfo } from "@/lib/types";

export function TeamHeader({
  league,
  info,
  teamOptions,
  showProjected,
  onShowProjectedChange,
}: {
  league: League;
  info: TeamInfo;
  teamOptions: TeamOption[];
  showProjected: boolean;
  onShowProjectedChange: (value: boolean) => void;
}) {
  const router = useRouter();
  const fullName = `${info.city} ${info.name}`;
  return (
    <header className="flex flex-col gap-4">
      <nav aria-label="Breadcrumb" className="min-w-0 text-base">
        <ol className="flex min-w-0 items-center gap-2 text-fog-300">
          <li className="min-w-0 truncate">
            <Link href={`/l/${league.id}`} className="text-link hover:underline">
              {league.name}
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li aria-current="page" className="min-w-0 truncate text-fog-50">
            {fullName}
          </li>
        </ol>
      </nav>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 items-center gap-4">
          <TeamLogo team={info} size={64} />
          <div className="min-w-0">
            <h1 className="font-display text-3xl font-bold leading-tight text-fog-50 sm:text-5xl">{fullName}</h1>
            <p className="mt-1 text-lg text-fog-300 sm:text-2xl">
              {league.name} • {league.seasonLabel}
            </p>
          </div>
        </div>
        <div className="flex w-full flex-col items-start gap-3 sm:w-auto sm:items-end">
          {league.isDemo && (
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-link">Demo data</span>
          )}
          <div className="flex w-full flex-wrap items-center gap-x-6 gap-y-3 sm:w-auto">
            <Switch checked={showProjected} onChange={onShowProjectedChange} label="Show projected" />
            <Select
              label="Team"
              value={info.id}
              onChange={(id) => router.push(`/l/${league.id}/teams/${id}`)}
              className="w-full sm:w-72"
              options={teamOptions.map((option) => ({ value: option.id, label: `Team: ${option.label}` }))}
            />
          </div>
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 5: `TeamStatStrip`** — `src/components/team/TeamStatStrip.tsx`

One bordered panel (`rounded-xl border border-ink-700 bg-ink-850/90`) with centred stats separated by thin vertical dividers at `sm+` (`sm:border-l sm:border-ink-700 sm:first:border-l-0`), two columns below `sm`. Grid classes by count: `{2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-4"}`. Each stat: label `text-base text-fog-300`, value `font-display text-4xl font-bold text-fog-50 sm:text-5xl tabular-nums` (a "Not available" value uses `text-2xl` so it fits), sub `text-sm text-fog-300`.

```tsx
import { SCORING } from "@/config/scoring";
import { formatNumber, formatRecord, NOT_AVAILABLE } from "@/lib/format";
import { gamesRemaining, winsNeededForOver } from "@/lib/game-log/progress";
import type { TeamRecord } from "@/lib/records/types";
import { gamesPlayed, projectWins } from "@/lib/scoring";

interface Stat {
  label: string;
  value: string;
  sub?: string;
}

const COLUMNS: Record<number, string> = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-4" };

function versusLine(diff: number): string {
  const text = formatNumber(Math.abs(diff));
  if (text === "0.0") return "On the line";
  return `${text} ${diff > 0 ? "above" : "below"} line`;
}

function remainingText(needed: number, remaining: number): string {
  const games = `${remaining} ${remaining === 1 ? "game" : "games"} remaining`;
  if (needed === 0) return `${games} · Clinched`;
  return needed > remaining ? `${games} · Out of reach` : games;
}

export function TeamStatStrip({
  record,
  lockedLine,
  showProjected,
}: {
  record: TeamRecord;
  lockedLine: number | null;
  showProjected: boolean;
}) {
  const projected = projectWins(record);
  const stats: Stat[] = [
    {
      label: "Record",
      value: formatRecord(record.wins, record.losses),
      sub: `${gamesPlayed(record)} of ${SCORING.seasonGames} games`,
    },
    lockedLine === null
      ? { label: "Locked line", value: "—", sub: "Set at draft start" }
      : { label: "Locked line", value: formatNumber(lockedLine), sub: "Frozen at draft" },
  ];
  if (showProjected) {
    stats.push({
      label: "Projected wins",
      value: projected === null ? NOT_AVAILABLE : formatNumber(projected),
      sub: projected === null || lockedLine === null ? undefined : versusLine(projected - lockedLine),
    });
  }
  if (lockedLine !== null) {
    const needed = winsNeededForOver(lockedLine, record.wins);
    stats.push({ label: "Wins needed for Over", value: String(needed), sub: remainingText(needed, gamesRemaining(record)) });
  }
  return (
    <section aria-label="Season summary" className="rounded-xl border border-ink-700 bg-ink-850/90">
      <dl className={`grid grid-cols-2 gap-y-5 py-5 ${COLUMNS[stats.length]}`}>
        {stats.map((stat) => (
          <div key={stat.label} className="flex min-w-0 flex-col items-center px-3 text-center sm:border-l sm:border-ink-700 sm:first:border-l-0">
            <dt className="text-base text-fog-300">{stat.label}</dt>
            <dd
              className={`font-display font-bold tabular-nums text-fog-50 ${
                stat.value === NOT_AVAILABLE ? "py-2 text-2xl" : "text-4xl sm:text-5xl"
              }`}
            >
              {stat.value}
            </dd>
            {stat.sub && <dd className="text-sm text-fog-300">{stat.sub}</dd>}
          </div>
        ))}
      </dl>
    </section>
  );
}
```

- [ ] **Step 6: `SportsbookPanel`** — `src/components/team/SportsbookPanel.tsx`

Title "Sportsbook line" in `font-display text-3xl font-bold text-accent`; "Source: {book}"; a `dl` of rows separated by `divide-y divide-ink-700` with the label left (`text-lg text-fog-50`) and value right (`font-display text-3xl font-bold tabular-nums`). Movement uses `SignedValue` with suffix "wins" (or "win" at exactly 1). No latest line → the value cell reads "No current {book} market" in `text-base font-sans font-normal text-fog-400` and Movement is left out. Footer notes `text-sm text-fog-300`: "Updated {formatDateTimeET(asOf)}" when `asOf`; "Couldn't refresh: {error}" (`text-fog-400`) when `error`; "League scoring uses the locked {line} line." when locked.

```tsx
import type { ReactNode } from "react";
import { SignedValue } from "@/components/ui/SignedValue";
import { formatDateTimeET, formatNumber } from "@/lib/format";
import { lineMovement, type MarketLine } from "@/lib/team-detail";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <dt className="text-lg text-fog-50">{label}</dt>
      <dd className="min-w-0 text-right font-display text-3xl font-bold tabular-nums text-fog-50">{children}</dd>
    </div>
  );
}

export function SportsbookPanel({
  market,
  lockedLine,
  className = "",
}: {
  market: MarketLine;
  lockedLine: number | null;
  className?: string;
}) {
  const movement = lineMovement(market.line, lockedLine);
  return (
    <section
      aria-labelledby="sportsbook-heading"
      className={`flex min-w-0 flex-col rounded-xl border border-ink-700 bg-ink-850/90 p-5 sm:p-6 ${className}`}
    >
      <h2 id="sportsbook-heading" className="font-display text-3xl font-bold text-accent">
        Sportsbook line
      </h2>
      <p className="mt-1 text-fog-300">Source: {market.book}</p>
      <dl className="mt-4 divide-y divide-ink-700 border-y border-ink-700">
        <Row label="At draft">
          {lockedLine === null ? (
            <span className="font-sans text-base font-normal text-fog-400">Not locked yet</span>
          ) : (
            formatNumber(lockedLine)
          )}
        </Row>
        <Row label="Latest available">
          {market.line === null ? (
            <span className="font-sans text-base font-normal text-fog-400">No current {market.book} market</span>
          ) : (
            formatNumber(market.line)
          )}
        </Row>
        {movement !== null && (
          <Row label="Movement">
            <SignedValue value={movement} suffix={Math.abs(movement) === 1 ? "win" : "wins"} />
          </Row>
        )}
      </dl>
      <div className="mt-4 space-y-1 text-sm text-fog-300">
        {market.asOf && <p>Updated {formatDateTimeET(market.asOf)}</p>}
        {market.error && <p className="text-fog-400">Couldn&apos;t refresh: {market.error}</p>}
        {lockedLine !== null && <p>League scoring uses the locked {formatNumber(lockedLine)} line.</p>}
      </div>
    </section>
  );
}
```

- [ ] **Step 7: `OwnershipCard`** — `src/components/team/OwnershipCard.tsx`

A `<fieldset>` whose `<legend>` ("OVER"/"UNDER", `font-display text-3xl sm:text-4xl font-bold uppercase leading-none`, `px-3 ml-2`) breaks the 2 px coloured border at its vertical midpoint — exactly one border, no extra outline or shadow ring. Over: `border-over text-over bg-over-deep/20`; Under: `border-under text-under bg-under-deep/40`. No arrows and no "Over"/"Under" pill inside the card.

```tsx
import { Users } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { ManagerAvatar } from "@/components/ui/ManagerAvatar";
import { SignedValue } from "@/components/ui/SignedValue";
import { managerLabel } from "@/lib/league/managers";
import type { TeamRecord } from "@/lib/records/types";
import { fadeDisplay, pickPoints, pickStatus, type FadeOnPick, type SideOwnership } from "@/lib/team-detail";
import type { Side } from "@/lib/types";

const SIDE_STYLE: Record<Side, { label: string; frame: string; heading: string }> = {
  OVER: { label: "Over", frame: "border-over bg-over-deep/20", heading: "text-over" },
  UNDER: { label: "Under", frame: "border-under bg-under-deep/40", heading: "text-under" },
};

export function OwnershipCard({
  ownership,
  record,
  showProjected,
}: {
  ownership: SideOwnership;
  record: TeamRecord;
  showProjected: boolean;
}) {
  const style = SIDE_STYLE[ownership.side];
  const points = pickPoints(ownership, showProjected);
  const status = pickStatus(ownership, record, showProjected);
  return (
    <fieldset className={`min-w-0 rounded-xl border-2 px-4 pb-4 sm:px-6 sm:pb-6 ${style.frame}`}>
      <legend className={`ml-2 px-3 font-display text-3xl font-bold uppercase leading-none sm:text-4xl ${style.heading}`}>
        {style.label}
      </legend>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 pt-3">
        {ownership.manager ? (
          <div className="flex min-w-0 items-center gap-3">
            <ManagerAvatar manager={ownership.manager} size="lg" />
            <p className="truncate text-xl font-semibold text-fog-50">{managerLabel(ownership.manager)}</p>
          </div>
        ) : (
          <p className="text-xl font-semibold text-fog-300">Undrafted</p>
        )}
        {(points || status) && (
          <div className="min-w-0 sm:text-right">
            {points && (
              <>
                <p className="text-sm text-fog-300">{points.label}</p>
                <SignedValue value={points.value} digits={2} className="block font-display text-4xl font-bold leading-tight" />
              </>
            )}
            {status && <p className="text-sm text-fog-300">{status.label}</p>}
          </div>
        )}
      </div>
      {ownership.pick && <FadeList fades={ownership.fades} side={ownership.side} showProjected={showProjected} />}
    </fieldset>
  );
}

function FadeList({ fades, side, showProjected }: { fades: FadeOnPick[]; side: Side; showProjected: boolean }) {
  if (fades.length === 0) {
    return (
      <div className="mt-4 flex items-center gap-3 rounded-lg border border-ink-700 bg-ink-900/60 px-4 py-4 text-fog-300">
        <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-full border border-ink-600">
          <Users aria-hidden className="size-5" />
        </span>
        No fades on this pick.
      </div>
    );
  }
  return (
    <ul className="mt-4 divide-y divide-ink-700 rounded-lg border border-ink-700 bg-ink-900/60">
      {fades.map((fade) => {
        const display = fadeDisplay(fade, showProjected);
        return (
          <li key={fade.fade.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <ManagerAvatar manager={fade.manager} size="lg" />
            <p className="min-w-0 flex-1 text-fog-50">
              {managerLabel(fade.manager)} is fading this {SIDE_STYLE[side].label}
            </p>
            {display && (
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Badge tone={display.status.tone}>{display.status.label}</Badge>
                <SignedValue value={display.points} digits={0} suffix={display.pointsLabel} className="text-sm" />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 8: Check it in the browser**

Start the dev server with `preview_start` (name "dev" from `.claude/launch.json`; if the preview reads the main checkout's launch.json, add a temporary config there pointing at this worktree). Open `/l/demo/teams/ORL` at 1440 px and 375 px:
- breadcrumb "National Balla Association / Orlando Magic", no sidebar item highlighted;
- strip shows 4 stats, 3 after turning Show projected off;
- Over card: Manager 1 (demo pick 9) with "Manager 4 is fading this Over" (demo fade f4); Under card: Manager 4 (demo pick 37) with "No fades on this pick.";
- sportsbook panel shows "No current FanDuel market" (demo season 2025–26 differs from the book's season) and "At draft 5x.x";
- the team selector navigates to `/l/demo/teams/BOS`;
- `/l/demo/teams/XYZ` is a 404; no horizontal scroll at 375 px (`document.documentElement.scrollWidth <= innerWidth`).
Compare a 1440 px screenshot with the reference image (top and bottom of the page; the chart arrives in Task 7).

- [ ] **Step 9: Checks and commit**

```bash
npm test && npm run lint && npm run typecheck && npm run build
git add src/app/l/\[leagueId\]/teams src/components/team src/components/ui/TeamLogo.tsx src/components/ui/TeamBadge.tsx
git commit -m "feat: team page with header, season summary, sportsbook line and Over/Under ownership

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Season progress chart

Model: sonnet (UI; the most visual task — if review rounds pile up, escalate to opus). Match the chart in the reference image closely.

**Files:**
- Create: `src/components/team/SeasonProgressPanel.tsx`, `src/components/team/SeasonProgressChart.tsx`
- Modify: `src/components/team/TeamDetail.tsx`, `src/app/globals.css`

**Interfaces:**
- Consumes: `buildChartModel`, `ChartModel`, `ChartPoint` (Task 4); `ChartMode` (`src/lib/chart-window.ts`); `GameLogRead` (Task 1); `formatGameDate`, `formatNumber` (`src/lib/format.ts`); `SegmentedControl`.
- Produces: `SeasonProgressPanel({ gameLog, record, lockedLine, showProjected, teamNames, className })`.

- [ ] **Step 1: Token** — in `src/app/globals.css` `@theme` add `--color-progress: #2f8fff;` (the chart blue). Use `stroke-progress`, `fill-progress`, `fill-progress/10`, `text-progress` classes.

- [ ] **Step 2: Panel** — `src/components/team/SeasonProgressPanel.tsx`

```tsx
"use client";

import { CircleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import type { ChartMode } from "@/lib/chart-window";
import { buildChartModel } from "@/lib/game-log/chart-model";
import type { GameLogRead } from "@/lib/game-log/types";
import type { TeamRecord } from "@/lib/records/types";
import { gamesPlayed } from "@/lib/scoring";
import type { TeamId } from "@/lib/types";
import { SeasonProgressChart } from "./SeasonProgressChart";

export function SeasonProgressPanel({
  gameLog,
  record,
  lockedLine,
  showProjected,
  teamNames,
  className = "",
}: {
  gameLog: GameLogRead;
  record: TeamRecord;
  lockedLine: number | null;
  showProjected: boolean;
  teamNames: Readonly<Record<TeamId, string>>;
  className?: string;
}) {
  // Always opens on the latest window; switching back to "Last 8" recomputes it from games played.
  const [mode, setMode] = useState<ChartMode>("last8");
  const model = useMemo(
    () => buildChartModel({ games: gameLog.log?.games ?? null, record, line: lockedLine, mode, showProjected }),
    [gameLog.log, record, lockedLine, mode, showProjected],
  );
  const played = gamesPlayed(record);
  const notes: string[] = [];
  if (gameLog.log && model.history === "partial") notes.push(`Game log covers ${model.historyGames} of ${played} games.`);
  if (gameLog.log && model.history === "mismatch") notes.push("Game log doesn't match the stored record yet.");
  if (played === 0 && model.hasData) notes.push("No games played yet.");
  if (lockedLine === null) notes.push("The locked-line pace appears once the draft starts.");

  return (
    <section
      aria-labelledby="progress-heading"
      className={`flex min-w-0 flex-col rounded-xl border border-ink-700 bg-ink-850/90 p-5 sm:p-6 ${className}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="progress-heading" className="font-display text-3xl font-bold text-accent">
            Season progress
          </h2>
          <p className="mt-1 text-fog-300">{model.subtitle}</p>
        </div>
        <SegmentedControl
          ariaLabel="Chart range"
          value={mode}
          onChange={setMode}
          options={[
            { value: "last8", label: "Last 8" },
            { value: "full", label: "Full season" },
          ]}
        />
      </div>

      {gameLog.log === null ? (
        <div role="status" className="mt-6 flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-ink-700 bg-ink-900/60 px-4 py-12 text-center">
          <CircleAlert aria-hidden className="size-6 text-fog-400" />
          <p className="font-semibold text-fog-50">Game history unavailable</p>
          {gameLog.error && <p className="text-sm text-fog-300">{gameLog.error}</p>}
          <p className="text-sm text-fog-400">The record and scores above still use the stored standings.</p>
        </div>
      ) : model.hasData ? (
        <>
          <SeasonProgressChart model={model} teamNames={teamNames} />
          <Legend pace={lockedLine !== null} projected={model.showsProjected} />
        </>
      ) : (
        <p className="mt-6 py-12 text-center text-fog-300">No games played yet.</p>
      )}

      {notes.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm text-fog-400">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Legend({ pace, projected }: { pace: boolean; projected: boolean }) {
  return (
    <ul className="mt-2 flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm text-fog-50">
      <LegendItem label="Actual wins" className="stroke-progress" />
      {pace && <LegendItem label="Locked-line pace" className="stroke-fog-300" dash="7 6" />}
      {projected && <LegendItem label="Projected wins" className="stroke-progress" dash="7 6" />}
    </ul>
  );
}

function LegendItem({ label, className, dash }: { label: string; className: string; dash?: string }) {
  return (
    <li className="flex items-center gap-2">
      <svg width="40" height="8" aria-hidden>
        <line x1="0" y1="4" x2="40" y2="4" strokeWidth="3" strokeDasharray={dash} className={className} />
      </svg>
      {label}
    </li>
  );
}
```

- [ ] **Step 3: Chart** — `src/components/team/SeasonProgressChart.tsx`

Requirements (all visible in the reference image):
- Measured width (ResizeObserver), fixed height 300 px (260 px below `sm`), margins `{ top: 34, right: 16, bottom: 46, left: 50 }`. Nothing scrolls; nothing overflows the panel.
- Horizontal grid lines at Y ticks (`stroke-ink-700`), Y tick labels left (`fill-fog-300`, 12 px), Y title "Wins" rotated. In "Last 8" a vertical grid line per game and an X label per game; the current game's label bold in `fill-progress`. In "Full season" X labels at 1, 10, 20, …, 70, 82. X title "Games played".
- Upcoming region ("Last 8", upcoming > 0): rect from halfway between the current and next game to the right edge, `fill-fog-50/[0.04]`, label "Upcoming" (`fill-fog-300`, 12 px) at the top.
- "Now" marker ("Last 8", current ≥ 1 and inside the window): dashed vertical line at the current game (`stroke-progress/70`, dash "4 4"), a small pill label "Now" at the top (`fill-ink-700` rect, `fill-progress` text).
- Actual wins: solid `stroke-progress` 3 px line, soft area under it (`fill-progress/10`), dots (r 5, `fill-progress`, `stroke-ink-850` 2 px) on every actual point in "Last 8"; only the current point's dot in "Full season".
- Locked-line pace: dashed `stroke-fog-300` 2.5 px (dash "7 6"), across the window.
- Projected: dashed `stroke-progress` 2.5 px (dash "7 6") from the current point; dots on future points in "Last 8".
- Interaction: one transparent hit column per game position (`onPointerEnter`, `onPointerDown` set the active game; leaving with a mouse clears it; a tap keeps it). The SVG is focusable (`tabIndex={0}`): focus selects the current game (or the first), ArrowLeft/ArrowRight move, Escape clears, blur clears. Active game: a thin vertical guide and enlarged dots.
- Tooltip (absolutely positioned HTML over the chart, clamped inside the container, `pointer-events-none`, `rounded-lg border border-ink-600 bg-ink-900 px-3 py-2 text-sm shadow-lg`): "Game {n}" plus " · {formatGameDate(date)}" when known; "vs {team}" / "@ {team}" (or the bare team name when home/away is unknown) plus " · Win"/" · Loss" when known; "Actual wins {n}" when available; "Locked-line pace {x.x}" when shown; "Projected wins {x.x}" when shown.
- `role="img"` with an `aria-label` summarising the window, e.g. "Cumulative wins, games 41–50. 30 wins after game 48; locked-line pace 30.1."

```tsx
"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { formatGameDate, formatNumber } from "@/lib/format";
import type { ChartModel, ChartPoint } from "@/lib/game-log/chart-model";
import type { TeamId } from "@/lib/types";

const MARGIN = { top: 34, right: 16, bottom: 46, left: 50 };
const FULL_SEASON_TICKS = [1, 10, 20, 30, 40, 50, 60, 70, 82];
const DASH = "7 6";

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

function linePath(points: Array<[number, number]>): string {
  return points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
}

export function SeasonProgressChart({
  model,
  teamNames,
}: {
  model: ChartModel;
  teamNames: Readonly<Record<TeamId, string>>;
}) {
  const [containerRef, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const { window: range, points, axis, mode } = model;
  const zoomed = mode === "last8";
  const height = width > 0 && width < 640 ? 260 : 300;
  const plotWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const plotHeight = height - MARGIN.top - MARGIN.bottom;
  const steps = Math.max(1, range.last - range.first);
  const x = (game: number) =>
    MARGIN.left + (range.last === range.first ? plotWidth / 2 : ((game - range.first) / steps) * plotWidth);
  const y = (wins: number) => MARGIN.top + (1 - (wins - axis.min) / (axis.max - axis.min)) * plotHeight;
  const column = range.last === range.first ? plotWidth : plotWidth / steps;
  const bottom = MARGIN.top + plotHeight;

  const series = (key: "actual" | "pace" | "projected") =>
    points.filter((point) => point[key] !== null).map((point): [number, number] => [x(point.game), y(point[key]!)]);
  const actual = series("actual");
  const pace = series("pace");
  const projected = series("projected");
  const current = points.find((point) => point.game === range.current) ?? null;
  const showNow = zoomed && range.current >= range.first && range.current >= 1;
  const upcomingStart =
    zoomed && range.upcoming > 0 ? (range.current >= range.first ? x(range.current + 0.5) : MARGIN.left) : null;
  const xTicks = zoomed ? points.map((point) => point.game) : FULL_SEASON_TICKS;
  const activePoint = active === null ? null : (points.find((point) => point.game === active) ?? null);

  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (event.key === "Escape") return setActive(null);
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const start = active ?? Math.max(range.first, Math.min(range.current, range.last));
    const next = start + (event.key === "ArrowRight" ? 1 : -1);
    setActive(Math.min(range.last, Math.max(range.first, next)));
  }

  const summary = describe(model, current);
  return (
    <div ref={containerRef} className="relative mt-4 w-full" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={summary}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onFocus={() => setActive((value) => value ?? Math.max(range.first, Math.min(range.current, range.last)))}
          onBlur={() => setActive(null)}
          onPointerLeave={(event) => event.pointerType === "mouse" && setActive(null)}
          className="block touch-pan-y outline-none focus-visible:outline-2 focus-visible:outline-accent"
        >
          {upcomingStart !== null && (
            <>
              <rect
                x={upcomingStart}
                y={MARGIN.top}
                width={Math.max(0, MARGIN.left + plotWidth - upcomingStart)}
                height={plotHeight}
                className="fill-fog-50/[0.04]"
              />
              <text
                x={(upcomingStart + MARGIN.left + plotWidth) / 2}
                y={MARGIN.top - 12}
                textAnchor="middle"
                fontSize={12}
                className="fill-fog-300"
              >
                Upcoming
              </text>
            </>
          )}

          {axis.ticks.map((tick) => (
            <g key={tick}>
              <line x1={MARGIN.left} x2={MARGIN.left + plotWidth} y1={y(tick)} y2={y(tick)} className="stroke-ink-700" />
              <text x={MARGIN.left - 10} y={y(tick)} dy="0.32em" textAnchor="end" fontSize={12} className="fill-fog-300">
                {formatNumber(tick, 0)}
              </text>
            </g>
          ))}
          {zoomed &&
            points.map((point) => (
              <line key={point.game} x1={x(point.game)} x2={x(point.game)} y1={MARGIN.top} y2={bottom} className="stroke-ink-700/60" />
            ))}
          {xTicks.map((game) => (
            <text
              key={game}
              x={x(game)}
              y={bottom + 18}
              textAnchor="middle"
              fontSize={12}
              fontWeight={zoomed && game === range.current ? 700 : 400}
              className={zoomed && game === range.current ? "fill-progress" : "fill-fog-300"}
            >
              {game}
            </text>
          ))}
          <text x={MARGIN.left + plotWidth / 2} y={height - 4} textAnchor="middle" fontSize={13} className="fill-fog-300">
            Games played
          </text>
          <text
            transform={`translate(14 ${MARGIN.top + plotHeight / 2}) rotate(-90)`}
            textAnchor="middle"
            fontSize={13}
            className="fill-fog-300"
          >
            Wins
          </text>

          {showNow && (
            <g>
              <line x1={x(range.current)} x2={x(range.current)} y1={MARGIN.top - 4} y2={bottom} strokeDasharray="4 4" className="stroke-progress/70" />
              <rect x={x(range.current) - 22} y={MARGIN.top - 26} width={44} height={20} rx={4} className="fill-ink-700" />
              <text x={x(range.current)} y={MARGIN.top - 12} textAnchor="middle" fontSize={12} fontWeight={600} className="fill-progress">
                Now
              </text>
            </g>
          )}

          {actual.length > 1 && (
            <path
              d={`${linePath(actual)}L${actual[actual.length - 1][0].toFixed(1)},${bottom}L${actual[0][0].toFixed(1)},${bottom}Z`}
              className="fill-progress/10"
            />
          )}
          {pace.length > 0 && (
            <path d={linePath(pace)} fill="none" strokeWidth={2.5} strokeDasharray={DASH} className="stroke-fog-300" />
          )}
          {projected.length > 1 && (
            <path d={linePath(projected)} fill="none" strokeWidth={2.5} strokeDasharray={DASH} className="stroke-progress" />
          )}
          {actual.length > 0 && (
            <path d={linePath(actual)} fill="none" strokeWidth={3} strokeLinejoin="round" className="stroke-progress" />
          )}

          {points.map((point) => {
            const showActual = point.actual !== null && (zoomed || point.game === range.current);
            const showProjected = zoomed && point.projected !== null && point.game > range.current;
            const big = point.game === active;
            return (
              <g key={point.game}>
                {showActual && (
                  <circle cx={x(point.game)} cy={y(point.actual!)} r={big ? 7 : 5} strokeWidth={2} className="fill-progress stroke-ink-850" />
                )}
                {showProjected && (
                  <circle cx={x(point.game)} cy={y(point.projected!)} r={big ? 6 : 4.5} strokeWidth={2} className="fill-progress stroke-ink-850" />
                )}
              </g>
            );
          })}

          {activePoint && (
            <line x1={x(activePoint.game)} x2={x(activePoint.game)} y1={MARGIN.top} y2={bottom} className="stroke-fog-400/60" />
          )}

          {points.map((point) => (
            <rect
              key={point.game}
              x={x(point.game) - column / 2}
              y={MARGIN.top}
              width={column}
              height={plotHeight}
              fill="transparent"
              onPointerEnter={() => setActive(point.game)}
              onPointerDown={() => setActive(point.game)}
            />
          ))}
        </svg>
      )}
      {activePoint && width > 0 && (
        <Tooltip point={activePoint} teamNames={teamNames} left={Math.min(Math.max(x(activePoint.game), 90), width - 90)} />
      )}
    </div>
  );
}

function Tooltip({
  point,
  teamNames,
  left,
}: {
  point: ChartPoint;
  teamNames: Readonly<Record<TeamId, string>>;
  left: number;
}) {
  const { detail } = point;
  const opponent = detail?.opponentId ? teamNames[detail.opponentId] : null;
  const where = detail?.home === true ? "vs " : detail?.home === false ? "@ " : "";
  const result = detail?.result === "W" ? "Win" : detail?.result === "L" ? "Loss" : null;
  return (
    <div
      role="status"
      className="pointer-events-none absolute top-0 z-10 w-44 -translate-x-1/2 rounded-lg border border-ink-600 bg-ink-900 px-3 py-2 text-sm shadow-lg"
      style={{ left }}
    >
      <p className="font-semibold text-fog-50">
        Game {point.game}
        {detail?.date && <span className="font-normal text-fog-300"> · {formatGameDate(detail.date)}</span>}
      </p>
      {(opponent || result) && (
        <p className="text-fog-300">{[opponent && `${where}${opponent}`, result].filter(Boolean).join(" · ")}</p>
      )}
      <dl className="mt-1 space-y-0.5">
        {point.actual !== null && <Line label="Actual wins" value={formatNumber(point.actual, 0)} />}
        {point.pace !== null && <Line label="Locked-line pace" value={formatNumber(point.pace)} />}
        {point.projected !== null && <Line label="Projected wins" value={formatNumber(point.projected)} />}
      </dl>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-fog-300">{label}</dt>
      <dd className="font-semibold tabular-nums text-fog-50">{value}</dd>
    </div>
  );
}

function describe(model: ChartModel, current: ChartPoint | null): string {
  const parts = [`Cumulative wins, games ${model.window.first}–${model.window.last}.`];
  if (current?.actual != null) parts.push(`${current.actual} wins after game ${current.game}.`);
  if (current?.pace != null) parts.push(`Locked-line pace ${formatNumber(current.pace)}.`);
  if (current?.projected != null && model.points.at(-1)?.projected != null) {
    parts.push(`Projected ${formatNumber(model.points.at(-1)!.projected!)} by game ${model.window.last}.`);
  }
  return parts.join(" ");
}
```

- [ ] **Step 4: Put the chart in the page** — in `TeamDetail.tsx` destructure `gameLog` too, build `teamNames` from `teamOptions`, and replace the middle row:

```tsx
  const teamNames = useMemo(
    () => Object.fromEntries(teamOptions.map((option) => [option.id, option.label])),
    [teamOptions],
  );
  // …
      <div className="grid gap-6 xl:grid-cols-3">
        <SeasonProgressPanel
          gameLog={gameLog}
          record={info}
          lockedLine={lockedLine}
          showProjected={showProjected}
          teamNames={teamNames}
          className="xl:col-span-2"
        />
        <SportsbookPanel market={market} lockedLine={lockedLine} />
      </div>
```

- [ ] **Step 5: Check it in the browser** (dev server as in Task 6)

On `/l/demo/teams/ORL` (30–18 in the mock data) at 1440 px, compare a screenshot with the reference image side by side:
- default "Last 8": games 41–50, subtitle "8 completed games + 2 upcoming", "Now" at 48, shaded "Upcoming" over 49–50, Y axis zoomed (not from 0), all three series and legend entries;
- hover/tap a dot shows the tooltip; arrow keys move it;
- "Full season": 1–82 from 0, pace to 82, projection to 82; back to "Last 8" restores 41–50;
- Show projected off: projected line, dots and legend entry gone, axis refits;
- a stored league with `RECORD_SOURCE=static LINE_SOURCE=static` (create one from the landing page and run its draft, or reuse one in `.data/pglite`) shows the mock log the same way;
- 375 px: the chart fits, labels readable, tap tooltip works, no page scroll sideways.
Also break ESPN on purpose (temporarily point `espnScheduleUrl` at a bad host in the dev server only, do not commit) to see "Game history unavailable" with the rest of the page intact, then revert.

- [ ] **Step 6: Checks and commit**

```bash
npm test && npm run lint && npm run typecheck && npm run build
git add src/app/globals.css src/components/team
git commit -m "feat: season-progress chart with Last 8 and Full season views, tooltips and unavailable states

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Team links on the overview and Rosters

Model: haiku (mechanical).

**Files:**
- Create: `src/components/ui/TeamLink.tsx`
- Modify: `src/components/rosters/TeamLineSummary.tsx`, `src/components/overview/PicksList.tsx`, `src/components/overview/ClosestCalls.tsx`, `src/components/overview/FadesPanel.tsx`

**Interfaces:**
- Produces: `TeamLink({ teamId, decorative?, className?, children })` — links to `/l/{leagueId}/teams/{teamId}` using the current route's `leagueId`.

- [ ] **Step 1: `TeamLink`** — `src/components/ui/TeamLink.tsx`

```tsx
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import type { TeamId } from "@/lib/types";

/**
 * Links to a team's page in the current league. `decorative` is for a logo next to a named link: same target, but
 * skipped by the keyboard and screen readers so the link isn't announced twice.
 */
export function TeamLink({
  teamId,
  decorative = false,
  className = "",
  children,
}: {
  teamId: TeamId;
  decorative?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const { leagueId } = useParams<{ leagueId: string }>();
  return (
    <Link
      href={`/l/${leagueId}/teams/${teamId}`}
      tabIndex={decorative ? -1 : undefined}
      aria-hidden={decorative || undefined}
      className={decorative ? `shrink-0 ${className}` : `hover:underline focus-visible:underline ${className}`}
    >
      {children}
    </Link>
  );
}
```

- [ ] **Step 2: Use it** — in each place a team logo and name are shown, wrap the logo in `<TeamLink teamId={team.id} decorative>` and the name text in `<TeamLink teamId={team.id}>`, keeping every existing class and layout:
  - `TeamLineSummary.tsx`: the `<TeamLogo team={team} size={36} />` and `{team.name}` inside the `<p className="truncate …">` (this covers Rosters picks and fade targets).
  - `PicksList.tsx`: the table row's logo and `{team.city} {team.name}` span, and the card's logo and name `<p>`.
  - `ClosestCalls.tsx`: the logo and the `{team.city} {team.name}` inside the `h3`.
  - `FadesPanel.tsx`: `<TeamLogo team={target.team} size={32} />` and `{target.team.name}` (use `target.team.id`).

For example, in `TeamLineSummary.tsx`:

```tsx
      <TeamLink teamId={team.id} decorative>
        <TeamLogo team={team} size={36} />
      </TeamLink>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-fog-50">
          <TeamLink teamId={team.id}>{team.name}</TeamLink>
        </p>
```

- [ ] **Step 3: Check in the browser** — on `/l/demo` and `/l/demo/rosters`, clicking a team name or logo opens that team's page; Tab reaches each team name once; layouts unchanged at 375 px and 1440 px.

- [ ] **Step 4: Checks and commit**

```bash
npm test && npm run lint && npm run typecheck && npm run build
git add src/components/ui/TeamLink.tsx src/components/rosters/TeamLineSummary.tsx src/components/overview
git commit -m "feat: team names and logos on the overview and Rosters link to the team page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Docs and final verification

Model: controller (no subagent).

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: CLAUDE.md** — add to Architecture: `src/lib/game-log/` (ESPN schedule parsing, progress math, chart model, per-team cache), `src/lib/chart-window.ts`, `src/lib/team-detail.ts`, `src/data/game-logs.ts` (mock log), `src/server/game-log.ts` and `team-page.ts`. Add to Domain rules: the team page (`/l/{id}/teams/{teamId}`, breadcrumb to the overview, no nav item) reads game history from ESPN's team schedule per team on demand (cached 10 min, 30 s retry; NBA Cup Championship and postponed entries dropped), trims it to the stored record, never stores it; the demo and `RECORD_SOURCE=static` use the mock log; its sportsbook panel shows FanDuel's current line only for the league's season and never feeds scoring. Add `RECORDS` game-log timings to the config list.

- [ ] **Step 2: Full verification**

```bash
npm test && npm run lint && npm run typecheck && npm run build
```

Then in the browser at 1440 px and 375 px: `/l/demo/teams/ORL`, a team with no fades, a team with two fades on one pick (none in the demo: check with a stored league), an undrafted side (demo: e.g. a team with only one side drafted), a stored 2026–27 league before tip-off (0 games: "No games played yet", pace only; real ESPN schedule), and a team from a finished season if available. Compare the 1440 px page with the reference image side by side and fix any visual drift.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: team page, game logs and their sources

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
