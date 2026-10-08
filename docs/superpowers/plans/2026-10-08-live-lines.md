# Live lines — implementation plan

Spec: `docs/superpowers/specs/2026-10-08-live-lines-design.md`. Run tasks in order; each ends green on
`npm test && npm run lint && npm run typecheck` (Task 6 also `npm run build`) and in one commit whose message ends with
the `Co-Authored-By` trailer. Don't touch files a task doesn't name.

---

## Task 1 — LineSet season/manual, review helpers, config (src/lib, src/config, src/data)

### 1a. `src/config/lines.ts` (new)

```ts
/** Where live lines come from. One sportsbook for every team: never mix books. */
export const LINES = {
  /** Display name of the sportsbook, shown wherever lines are. */
  book: "FanDuel",
  /** The season new leagues draft. */
  season: "2026–27",
  /** How FanDuel names the season in market names: "26-27 NBA Boston Celtics Regular Season Wins". */
  fanDuelSeason: "26-27",
  /** A successful read is reused this long. */
  cacheSeconds: 300,
  /** After a failed read, wait this long before asking the book again. */
  retrySeconds: 30,
  fetchTimeoutMs: 8000,
} as const;
```

### 1b. `src/lib/types.ts`

Replace the `LineSet` interface with:

```ts
/** Season win-total lines for every team, from one source at one moment. */
export interface LineSet {
  /** teamId → line. */
  values: Readonly<Record<TeamId, number>>;
  /** The sportsbook the lines came from, e.g. "FanDuel"; "Commissioner" when every line was entered by hand. */
  source: string;
  /** The season the lines are for, e.g. "2026–27". */
  season: string;
  /** ISO 8601 timestamp: when the source was read. */
  asOf: string;
  /** Teams whose line the commissioner entered instead of the source's. Sorted; empty for a pure source set. */
  manual: readonly TeamId[];
}
```

In `League`, after `fades: Fade[];` add:

```ts
  /** Lines the commissioner entered before the draft. They replace or fill in the source's lines until the draft starts. */
  lineOverrides: Readonly<Record<TeamId, number>>;
```

Add after `League`:

```ts
/** One team in the pre-draft line review. */
export interface LineReviewRow {
  team: TeamInfo;
  /** The source's line, or null when the source has none. */
  feed: number | null;
  /** The commissioner's line, or null. */
  override: number | null;
  /** What the draft would freeze: the override, else the source's line. Null means missing. */
  line: number | null;
}

/** Lines before the draft starts, for the commissioner to check. */
export interface LineReview {
  /** The sportsbook, e.g. "FanDuel". */
  book: string;
  season: string;
  /** When the source was last read successfully. Null when it never was. */
  asOf: string | null;
  /** Why the latest read failed. Null when it succeeded. */
  feedError: string | null;
  /** One row per team, in team order. */
  rows: LineReviewRow[];
  /** teamId → effective line, for teams that have one. */
  lines: Readonly<Record<TeamId, number>>;
  overrides: Readonly<Record<TeamId, number>>;
  /** Teams with no line yet. The draft can't start until this is empty. */
  missing: TeamId[];
}
```

In `LeagueView`, change the `teams` doc and add `lineReview`:

```ts
  /** Teams with the lines this view scores against: the league's frozen lines, or before the draft the reviewed lines (teams still missing a line are left out). */
  teams: Team[];
  /** Before the draft: the lines to review. Null once lines are frozen. */
  lineReview: LineReview | null;
```

### 1c. `src/lib/lines.ts` (replace whole file)

```ts
import { SCORING } from "@/config/scoring";
import { formatDateTimeET } from "@/lib/format";
import type { TeamLookup } from "@/lib/standings";
import type { LineReview, LineReviewRow, LineSet, Team, TeamId, TeamInfo } from "@/lib/types";

/** Where current lines come from. A live feed and the static mock lines implement it. */
export interface LineSource {
  /** The latest lines. May reject, or return a set missing teams; callers check with isCompleteLineSet. */
  current(): Promise<LineSet>;
}

/** The latest read of a source: the lines (possibly from an earlier read) and, when the latest read failed, why. */
export interface FeedRead {
  lines: LineSet | null;
  error: string | null;
}

/** `source` of a frozen set whose every line the commissioner entered. */
export const MANUAL_SOURCE = "Commissioner";

export function staticLineSource(lines: LineSet): LineSource {
  return { current: async () => lines };
}

/**
 * Reuses a successful read for `ttlMs` and a failure for `retryMs`, so polling clients don't hit the book every few
 * seconds. Concurrent callers share one in-flight read.
 */
export function cachedLineSource(
  source: LineSource,
  ttlMs: number,
  retryMs: number,
  now: () => number = Date.now,
): LineSource {
  let success: { lines: LineSet; at: number } | null = null;
  let failure: { error: unknown; at: number } | null = null;
  let inflight: Promise<LineSet> | null = null;
  return {
    current() {
      if (success && now() - success.at < ttlMs) return Promise.resolve(success.lines);
      if (failure && now() - failure.at < retryMs) return Promise.reject(failure.error);
      inflight ??= source.current().then(
        (lines) => {
          success = { lines, at: now() };
          failure = null;
          inflight = null;
          return lines;
        },
        (error: unknown) => {
          failure = { error, at: now() };
          inflight = null;
          throw error;
        },
      );
      return inflight;
    },
  };
}

/** A message for a failed read, safe to show the commissioner. */
export function describeFeedError(error: unknown): string {
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return "The sportsbook didn't answer in time.";
  }
  return error instanceof Error && error.message ? error.message : "The sportsbook's lines couldn't be read.";
}

/** Reads a source and remembers its last good set: a failed refresh reports the error alongside the older lines. */
export function lineReader(source: LineSource): () => Promise<FeedRead> {
  let lastGood: LineSet | null = null;
  return async () => {
    try {
      lastGood = await source.current();
      return { lines: lastGood, error: null };
    } catch (error) {
      return { lines: lastGood, error: describeFeedError(error) };
    }
  };
}

/** True when every team has a finite line. */
export function isCompleteLineSet(lines: LineSet, teamIds: ReadonlySet<TeamId>): boolean {
  return [...teamIds].every((teamId) => Number.isFinite(lines.values[teamId]));
}

/** A win-total line: a multiple of 0.5 strictly between 0 and the season length. */
export function isValidLine(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    value < SCORING.seasonGames &&
    Number.isInteger(value * 2)
  );
}

/** Validates an untrusted teamId → line map. Null when it isn't an object, names an unknown team or has a bad line. */
export function parseLineValues(input: unknown, teamIds: ReadonlySet<TeamId>): Record<TeamId, number> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const values: Record<TeamId, number> = {};
  for (const [teamId, value] of Object.entries(input)) {
    if (!teamIds.has(teamId) || !isValidLine(value)) return null;
    values[teamId] = value;
  }
  return values;
}

/** True when both maps hold the same teams with the same lines. */
export function sameLineValues(a: Readonly<Record<TeamId, number>>, b: Readonly<Record<TeamId, number>>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((teamId) => b[teamId] === a[teamId]);
}

/**
 * The pre-draft review: the source's lines with the commissioner's overrides on top. `fallback` names the book and
 * season when the source has never been read.
 */
export function buildLineReview(
  teams: readonly TeamInfo[],
  read: FeedRead,
  overrides: Readonly<Record<TeamId, number>>,
  fallback: { book: string; season: string },
): LineReview {
  const fromFeed = read.lines?.values ?? {};
  const rows: LineReviewRow[] = [];
  const lines: Record<TeamId, number> = {};
  const missing: TeamId[] = [];
  for (const team of teams) {
    const feed = Number.isFinite(fromFeed[team.id]) ? fromFeed[team.id] : null;
    const override = Number.isFinite(overrides[team.id]) ? overrides[team.id] : null;
    const line = override ?? feed;
    rows.push({ team, feed, override, line });
    if (line === null) missing.push(team.id);
    else lines[team.id] = line;
  }
  return {
    book: read.lines?.source ?? fallback.book,
    season: read.lines?.season ?? fallback.season,
    asOf: read.lines?.asOf ?? null,
    feedError: read.error,
    rows,
    lines,
    overrides,
    missing,
  };
}

/** The set a draft start freezes, crediting the book and listing the commissioner's lines. Null while any team is missing. */
export function freezeLines(review: LineReview, now: Date): LineSet | null {
  if (review.missing.length > 0) return null;
  const manual = review.rows.filter((row) => row.override !== null).map((row) => row.team.id).sort();
  const allManual = manual.length === review.rows.length;
  return {
    values: review.lines,
    source: allManual ? MANUAL_SOURCE : review.book,
    season: review.season,
    asOf: !allManual && review.asOf ? review.asOf : now.toISOString(),
    manual,
  };
}

/** "FanDuel · 2026–27 · as of Oct 8, 3:42 PM ET", plus how many lines the commissioner entered. */
export function describeLineSet(lines: LineSet): string {
  const parts = [lines.source, lines.season, `as of ${formatDateTimeET(lines.asOf)}`];
  if (lines.manual.length > 0 && lines.source !== MANUAL_SOURCE) {
    parts.push(`${lines.manual.length} entered by the commissioner`);
  }
  return parts.join(" · ");
}

/** Joins team metadata with lines. Throws when a team has no line, so check isCompleteLineSet first. */
export function withLines(teams: readonly TeamInfo[], lines: LineSet): Team[] {
  return teams.map((team) => {
    const line = lines.values[team.id];
    if (!Number.isFinite(line)) throw new Error(`No line for ${team.id}`);
    return { ...team, line };
  });
}

/** Joins team metadata with whatever lines exist, leaving out teams without one (before the draft). */
export function withAvailableLines(teams: readonly TeamInfo[], values: Readonly<Record<TeamId, number>>): Team[] {
  return teams.flatMap((team) => (Number.isFinite(values[team.id]) ? [{ ...team, line: values[team.id] }] : []));
}

export function indexTeams(teams: readonly Team[]): TeamLookup {
  return Object.fromEntries(teams.map((team) => [team.id, team]));
}
```

### 1d. `src/lib/format.ts` — append

```ts
const ET_PARTS = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/New_York",
});

/** "Oct 8, 3:42 PM ET". Fixed to Eastern and built from parts so the server and every browser render the same text. */
export function formatDateTimeET(iso: string): string {
  const part = Object.fromEntries(ET_PARTS.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${part.month} ${part.day}, ${part.hour}:${part.minute} ${part.dayPeriod} ET`;
}
```

Add to `src/lib/format.test.ts` (inside a new `describe("formatDateTimeET")`):

```ts
  it("formats in Eastern time", () => {
    expect(formatDateTimeET("2026-10-08T19:42:00.000Z")).toBe("Oct 8, 3:42 PM ET");
    expect(formatDateTimeET("2026-01-15T05:05:00.000Z")).toBe("Jan 15, 12:05 AM ET");
  });
```

(import `formatDateTimeET` alongside the existing imports).

### 1e. `src/data/static-lines.ts`

Add `season: "2025–26",` after `source: "static",` and `manual: [],` after `asOf`.

### 1f. `src/lib/lines.test.ts` (replace whole file)

```ts
import { describe, expect, it } from "vitest";
import {
  buildLineReview,
  cachedLineSource,
  describeFeedError,
  describeLineSet,
  freezeLines,
  indexTeams,
  isCompleteLineSet,
  isValidLine,
  lineReader,
  parseLineValues,
  sameLineValues,
  staticLineSource,
  withAvailableLines,
  withLines,
  type LineSource,
} from "@/lib/lines";
import type { LineSet, TeamInfo } from "@/lib/types";

const INFO: TeamInfo[] = [
  { id: "MIN", nbaId: 1, city: "Minnesota", name: "Timberwolves", conference: "West", color: "#0C2340", prevWins: 49, wins: 30, losses: 18 },
  { id: "OKC", nbaId: 2, city: "Oklahoma City", name: "Thunder", conference: "West", color: "#007AC1", prevWins: 68, wins: 36, losses: 12 },
];
const LINES: LineSet = {
  source: "FanDuel",
  season: "2026–27",
  asOf: "2026-10-01T00:00:00.000Z",
  values: { MIN: 49.5, OKC: 62.5 },
  manual: [],
};
const FALLBACK = { book: "FanDuel", season: "2026–27" };
const NOW = new Date("2026-10-08T19:42:00.000Z");

describe("withLines", () => {
  it("adds each team's line to its metadata", () => {
    expect(withLines(INFO, LINES).map((team) => [team.id, team.line, team.name])).toEqual([
      ["MIN", 49.5, "Timberwolves"],
      ["OKC", 62.5, "Thunder"],
    ]);
  });

  it("throws when a team has no line", () => {
    expect(() => withLines(INFO, { ...LINES, values: { MIN: 49.5 } })).toThrow("No line for OKC");
  });

  it("withAvailableLines leaves out teams without a line", () => {
    expect(withAvailableLines(INFO, { OKC: 62.5 }).map((team) => team.id)).toEqual(["OKC"]);
  });
});

describe("isCompleteLineSet", () => {
  const ids = new Set(["MIN", "OKC"]);

  it("needs a finite line for every team", () => {
    expect(isCompleteLineSet(LINES, ids)).toBe(true);
    expect(isCompleteLineSet({ ...LINES, values: { MIN: 49.5 } }, ids)).toBe(false);
    expect(isCompleteLineSet({ ...LINES, values: { MIN: 49.5, OKC: Number.NaN } }, ids)).toBe(false);
  });
});

describe("indexTeams and staticLineSource", () => {
  it("indexes teams by id", () => {
    expect(indexTeams(withLines(INFO, LINES)).OKC.line).toBe(62.5);
  });

  it("serves the same lines every time", async () => {
    await expect(staticLineSource(LINES).current()).resolves.toBe(LINES);
  });
});

describe("isValidLine and parseLineValues", () => {
  it("accepts half-win steps strictly inside a season", () => {
    for (const ok of [0.5, 41, 49.5, 81.5]) expect(isValidLine(ok)).toBe(true);
    for (const bad of [0, 82, -1, 49.25, Number.NaN, Infinity, "49.5", null]) expect(isValidLine(bad)).toBe(false);
  });

  it("parses a map of known teams with valid lines", () => {
    const ids = new Set(["MIN", "OKC"]);
    expect(parseLineValues({ MIN: 50.5 }, ids)).toEqual({ MIN: 50.5 });
    expect(parseLineValues({}, ids)).toEqual({});
    expect(parseLineValues({ XXX: 50.5 }, ids)).toBeNull();
    expect(parseLineValues({ MIN: 50.3 }, ids)).toBeNull();
    expect(parseLineValues([1], ids)).toBeNull();
    expect(parseLineValues(null, ids)).toBeNull();
  });

  it("compares line maps", () => {
    expect(sameLineValues({ MIN: 1.5, OKC: 2.5 }, { OKC: 2.5, MIN: 1.5 })).toBe(true);
    expect(sameLineValues({ MIN: 1.5 }, { MIN: 1.5, OKC: 2.5 })).toBe(false);
    expect(sameLineValues({ MIN: 1.5 }, { MIN: 2.5 })).toBe(false);
  });
});

describe("cachedLineSource", () => {
  function counting(results: Array<LineSet | Error>): LineSource & { calls: number } {
    const source = {
      calls: 0,
      async current() {
        const result = results[Math.min(source.calls++, results.length - 1)];
        if (result instanceof Error) throw result;
        return result;
      },
    };
    return source;
  }

  it("reuses a success until the ttl passes", async () => {
    let clock = 0;
    const inner = counting([LINES]);
    const cached = cachedLineSource(inner, 1000, 100, () => clock);
    await cached.current();
    clock = 999;
    await cached.current();
    expect(inner.calls).toBe(1);
    clock = 1000;
    await cached.current();
    expect(inner.calls).toBe(2);
  });

  it("reuses a failure until the retry delay passes", async () => {
    let clock = 0;
    const inner = counting([new Error("down"), LINES]);
    const cached = cachedLineSource(inner, 1000, 100, () => clock);
    await expect(cached.current()).rejects.toThrow("down");
    clock = 50;
    await expect(cached.current()).rejects.toThrow("down");
    expect(inner.calls).toBe(1);
    clock = 100;
    await expect(cached.current()).resolves.toBe(LINES);
  });

  it("shares one in-flight read", async () => {
    const inner = counting([LINES]);
    const cached = cachedLineSource(inner, 1000, 100, () => 0);
    await Promise.all([cached.current(), cached.current()]);
    expect(inner.calls).toBe(1);
  });
});

describe("lineReader", () => {
  it("reports a failed refresh alongside the last good lines", async () => {
    let fail = false;
    const read = lineReader({
      current: async () => {
        if (fail) throw new Error("FanDuel answered 403");
        return LINES;
      },
    });
    expect(await read()).toEqual({ lines: LINES, error: null });
    fail = true;
    expect(await read()).toEqual({ lines: LINES, error: "FanDuel answered 403" });
  });

  it("describes timeouts", () => {
    expect(describeFeedError(new DOMException("t", "TimeoutError"))).toBe("The sportsbook didn't answer in time.");
    expect(describeFeedError("weird")).toBe("The sportsbook's lines couldn't be read.");
  });
});

describe("buildLineReview and freezeLines", () => {
  it("puts overrides on top of the feed and lists missing teams", () => {
    const review = buildLineReview(INFO, { lines: { ...LINES, values: { MIN: 49.5 } }, error: null }, {}, FALLBACK);
    expect(review).toMatchObject({ book: "FanDuel", season: "2026–27", asOf: LINES.asOf, missing: ["OKC"] });
    expect(freezeLines(review, NOW)).toBeNull();

    const fixed = buildLineReview(INFO, { lines: { ...LINES, values: { MIN: 49.5 } }, error: null }, { OKC: 60.5, MIN: 48.5 }, FALLBACK);
    expect(fixed.rows.map((row) => [row.team.id, row.feed, row.override, row.line])).toEqual([
      ["MIN", 49.5, 48.5, 48.5],
      ["OKC", null, 60.5, 60.5],
    ]);
    expect(fixed.missing).toEqual([]);
  });

  it("freezes a pure feed set as the book's", () => {
    const review = buildLineReview(INFO, { lines: LINES, error: null }, {}, FALLBACK);
    expect(freezeLines(review, NOW)).toEqual(LINES);
  });

  it("credits the book and lists the commissioner's lines", () => {
    const review = buildLineReview(INFO, { lines: { ...LINES, values: { MIN: 49.5 } }, error: null }, { OKC: 60.5 }, FALLBACK);
    expect(freezeLines(review, NOW)).toEqual({ ...LINES, values: { MIN: 49.5, OKC: 60.5 }, manual: ["OKC"] });
  });

  it("names the commissioner when the feed never loaded and every line was entered", () => {
    const review = buildLineReview(INFO, { lines: null, error: "FanDuel answered 403" }, { MIN: 49.5, OKC: 60.5 }, FALLBACK);
    expect(review).toMatchObject({ book: "FanDuel", asOf: null, feedError: "FanDuel answered 403" });
    expect(freezeLines(review, NOW)).toEqual({
      values: { MIN: 49.5, OKC: 60.5 },
      source: "Commissioner",
      season: "2026–27",
      asOf: NOW.toISOString(),
      manual: ["MIN", "OKC"],
    });
  });

  it("describes a frozen set", () => {
    expect(describeLineSet({ ...LINES, asOf: NOW.toISOString(), manual: ["OKC"] })).toBe(
      "FanDuel · 2026–27 · as of Oct 8, 3:42 PM ET · 1 entered by the commissioner",
    );
  });
});
```

### 1g. Keep the rest compiling

- `src/lib/league/commands.test.ts`: change `LINES` to
  `{ source: "test", season: "2026–27", asOf: "2026-10-01T00:00:00.000Z", values: { MIN: 49.5, OKC: 62.5, BOS: 41.5 }, manual: [] }`.
- Task 3 adds `lineOverrides`; until then `League` literals fail typecheck. So in this task also add
  `lineOverrides: {},` after `fades: [],` in: `src/lib/league/commands.ts` (createLeague), `src/db/leagues.ts`
  (assemble — Task 4 replaces it with the stored column), `src/data/demo-league.ts`, `src/db/leagues.test.ts`
  (toMatchObject is fine without it; only add where a full `League` literal is typed).
- `src/server/league.ts` `toLeagueView`: add `lineReview: null,` for now (Task 5 fills it in).

Run `npm test && npm run lint && npm run typecheck`. Commit: `feat: line sets carry season and hand-entered teams; review helpers`.

---

## Task 2 — FanDuel source (src/lib/fanduel.ts)

The fixture `src/lib/fanduel-win-totals.fixture.json` already exists (trimmed real response, 2026-10-08: the 30
win-total markets plus two decoy markets). Don't edit it.

### 2a. `src/lib/fanduel.ts` (new)

```ts
import type { LineSource } from "@/lib/lines";
import type { LineSet, TeamId, TeamInfo } from "@/lib/types";

// FanDuel's NBA page payload (the JSON its website loads) lists one over/under market per team:
// marketType "NBA_REGULAR_SEASON_WINS_O/U", marketName "26-27 NBA Boston Celtics Regular Season Wins", runners
// "Boston Celtics Over 50.5 Wins" and "Boston Celtics Under 50.5 Wins". Undocumented; parse defensively.

const MARKET_TYPE = "NBA_REGULAR_SEASON_WINS_O/U";
const RUNNER = /^(.+) (Over|Under) (\d+(?:\.5)?) Wins$/;

interface Market {
  marketName?: unknown;
  marketType?: unknown;
  marketStatus?: unknown;
  runners?: unknown;
}

interface Runner {
  runnerName?: unknown;
  runnerStatus?: unknown;
}

/**
 * teamId → line for every team whose market is open, for the given season, with active Over and Under runners that
 * name the same line. Other teams are left out. Throws when the payload has no markets at all.
 */
export function parseFanDuelWinTotals(
  payload: unknown,
  teams: readonly TeamInfo[],
  marketSeason: string,
): Record<TeamId, number> {
  const markets = (payload as { attachments?: { markets?: unknown } } | null)?.attachments?.markets;
  if (!markets || typeof markets !== "object") throw new Error("FanDuel's response had no markets.");
  const prefix = `${marketSeason} NBA `;
  const suffix = " Regular Season Wins";
  const values: Record<TeamId, number> = {};
  for (const market of Object.values(markets as Record<string, Market>)) {
    if (market?.marketType !== MARKET_TYPE || market.marketStatus !== "OPEN") continue;
    if (typeof market.marketName !== "string") continue;
    const name = market.marketName;
    if (!name.startsWith(prefix) || !name.endsWith(suffix)) continue;
    const teamName = name.slice(prefix.length, -suffix.length);
    const team = teams.find((candidate) => teamName.endsWith(` ${candidate.name}`));
    if (!team || team.id in values) continue;
    const line = agreedLine(market.runners, teamName);
    if (line !== null) values[team.id] = line;
  }
  return values;
}

function agreedLine(runners: unknown, teamName: string): number | null {
  if (!Array.isArray(runners)) return null;
  const lines = new Map<string, number>();
  for (const runner of runners as Runner[]) {
    if (runner?.runnerStatus !== "ACTIVE" || typeof runner.runnerName !== "string") continue;
    const match = RUNNER.exec(runner.runnerName);
    if (match && match[1] === teamName) lines.set(match[2], Number(match[3]));
  }
  const over = lines.get("Over");
  return over !== undefined && over === lines.get("Under") ? over : null;
}

/** FanDuel's win totals as a LineSource. Rejects when the fetch fails or no team has a line. */
export function fanDuelLineSource(options: {
  fetchJson: () => Promise<unknown>;
  teams: readonly TeamInfo[];
  book: string;
  season: string;
  marketSeason: string;
  now?: () => Date;
}): LineSource {
  const now = options.now ?? (() => new Date());
  return {
    async current(): Promise<LineSet> {
      const values = parseFanDuelWinTotals(await options.fetchJson(), options.teams, options.marketSeason);
      if (Object.keys(values).length === 0) {
        throw new Error(`${options.book} has no ${options.season} win totals posted.`);
      }
      return { values, source: options.book, season: options.season, asOf: now().toISOString(), manual: [] };
    },
  };
}
```

### 2b. `src/lib/fanduel.test.ts` (new)

```ts
import { describe, expect, it } from "vitest";
import { TEAM_IDS, TEAM_INFO } from "@/data/teams";
import { fanDuelLineSource, parseFanDuelWinTotals } from "@/lib/fanduel";
import fixture from "./fanduel-win-totals.fixture.json";

type Payload = { attachments: { markets: Record<string, { marketName: string; marketStatus: string; runners: Array<{ runnerName: string; runnerStatus: string }> }> } };

function copy(): Payload {
  return structuredClone(fixture) as Payload;
}

function marketFor(payload: Payload, teamName: string) {
  return Object.values(payload.attachments.markets).find((m) => m.marketName === `26-27 NBA ${teamName} Regular Season Wins`)!;
}

describe("parseFanDuelWinTotals", () => {
  it("reads all 30 teams from the real payload and ignores other markets", () => {
    const values = parseFanDuelWinTotals(fixture, TEAM_INFO, "26-27");
    expect(Object.keys(values).sort()).toEqual([...TEAM_IDS].sort());
    expect(values).toMatchObject({ BOS: 50.5, OKC: 61.5, LAC: 27.5, LAL: 45.5, POR: 41.5, PHI: 49.5, SAC: 20.5 });
  });

  it("leaves out a team whose market is suspended, whose runners disagree, or that is from another season", () => {
    const payload = copy();
    marketFor(payload, "Boston Celtics").marketStatus = "SUSPENDED";
    marketFor(payload, "Utah Jazz").runners[1].runnerName = "Utah Jazz Under 38.5 Wins";
    marketFor(payload, "Miami Heat").runners[0].runnerStatus = "REMOVED";
    const values = parseFanDuelWinTotals(payload, TEAM_INFO, "26-27");
    expect(Object.keys(values)).toHaveLength(27);
    expect(values).not.toHaveProperty("BOS");
    expect(values).not.toHaveProperty("UTA");
    expect(values).not.toHaveProperty("MIA");
    expect(parseFanDuelWinTotals(fixture, TEAM_INFO, "27-28")).toEqual({});
  });

  it("throws on a payload without markets", () => {
    expect(() => parseFanDuelWinTotals({}, TEAM_INFO, "26-27")).toThrow("no markets");
    expect(() => parseFanDuelWinTotals(null, TEAM_INFO, "26-27")).toThrow("no markets");
  });
});

describe("fanDuelLineSource", () => {
  const options = { teams: TEAM_INFO, book: "FanDuel", season: "2026–27", marketSeason: "26-27", now: () => new Date("2026-10-08T19:42:00.000Z") };

  it("returns a FanDuel line set", async () => {
    const lines = await fanDuelLineSource({ ...options, fetchJson: async () => fixture }).current();
    expect(lines).toMatchObject({ source: "FanDuel", season: "2026–27", asOf: "2026-10-08T19:42:00.000Z", manual: [] });
    expect(Object.keys(lines.values)).toHaveLength(30);
  });

  it("rejects when nothing is posted or the fetch fails", async () => {
    await expect(fanDuelLineSource({ ...options, fetchJson: async () => ({ attachments: { markets: {} } }) }).current()).rejects.toThrow(
      "FanDuel has no 2026–27 win totals posted.",
    );
    await expect(
      fanDuelLineSource({ ...options, fetchJson: async () => Promise.reject(new Error("FanDuel answered 403")) }).current(),
    ).rejects.toThrow("FanDuel answered 403");
  });
});
```

Before writing the test, check the fixture's runner order for Utah and Miami (`runners[0]` is Over, `[1]` Under) and the
expected values above against the fixture; fix the test, not the fixture, if a value differs.

Commit: `feat: FanDuel win-total line source`.

---

## Task 3 — commands: overrides, reviewed start, errors (src/lib/league)

### 3a. `src/lib/draft.ts`

Change the start variant of `DraftAction` to:

```ts
  /** `lines` are the lines the commissioner reviewed; the start fails with lines_changed if they no longer match. */
  | { type: "start"; lines?: Readonly<Record<TeamId, number>> }
```

### 3b. `src/lib/league/parse-action.ts`

Replace the `if (type === "start" || …` line with:

```ts
  if (type === "pause" || type === "resume") return { type };
  if (type === "start") {
    const { lines } = input as Record<string, unknown>;
    if (lines === undefined) return { type };
    if (!lines || typeof lines !== "object" || Array.isArray(lines)) return null;
    if (!Object.values(lines).every((value) => typeof value === "number" && Number.isFinite(value))) return null;
    return { type, lines: lines as Record<string, number> };
  }
```

Add to its test file: start with `lines: { BOS: 50.5 }` parses with the lines; `lines: "x"`, `lines: [1]`,
`lines: { BOS: "50.5" }` return null; plain `{ type: "start" }` still parses.

### 3c. `src/lib/league/errors.ts`

Add to `DomainError` (after `"lines_unavailable"`): `| "lines_changed" | "lines_locked" | "invalid_line"`. Replace the
`lines_unavailable` message and add the three new ones:

```ts
  lines_unavailable: "Every team needs a line before the draft can start. Enter the missing lines first.",
  lines_changed: "The lines changed since you checked them. Look them over again, then start.",
  lines_locked: "Lines are locked once the draft starts.",
  invalid_line: "Lines must be between 0.5 and 81.5, in steps of 0.5.",
```

### 3d. `src/lib/league/commands.ts`

- Imports: `import { LINES } from "@/config/lines";`, `import { TEAM_INFO } from "@/data/teams";` and from
  `@/lib/lines` import `buildLineReview, freezeLines, sameLineValues` (drop `isCompleteLineSet`).
  (`src/lib` already imports `src/data` in tests; importing `TEAM_INFO` here is fine — it is pure data.)
- `createLeague`: `seasonLabel: LINES.season,` (drop `SEASON` from the config import if now unused) and keep
  `lineOverrides: {},`.
- `decideDraftAction`: rename the last parameter to `sourceLines: LineSet | null` and add `now: Date = new Date()`.
  Update its doc: "Start freezes the source's lines with the commissioner's overrides on top; when the start names the
  lines it reviewed, any difference fails with lines_changed." Replace the last two lines with:

```ts
  if (action.type !== "start") return succeed({ ...league, draft: result.state });
  const review = buildLineReview(
    TEAM_INFO.filter((team) => teamIds.has(team.id)),
    { lines: sourceLines, error: null },
    league.lineOverrides,
    { book: LINES.book, season: LINES.season },
  );
  if (action.lines && !sameLineValues(action.lines, review.lines)) return fail("lines_changed");
  const lines = freezeLines(review, now);
  if (!lines) return fail("lines_unavailable");
  return succeed({ ...league, draft: result.state, lines });
```

  Note the test file's `TEAM_IDS` is `{MIN, OKC, BOS}`: filtering `TEAM_INFO` by `teamIds` keeps the review to the
  teams the caller plays with.

- Add after `decideDraftAction`:

```ts
/** Replaces the commissioner's line overrides. Commissioner only, before the draft starts. Validate values first. */
export function decideLineOverrides(
  league: League,
  actorId: string | null,
  overrides: Readonly<Record<TeamId, number>>,
): Result<League> {
  if (league.isDemo) return fail("demo_league");
  if (!canControlDraft(league, actorId)) return fail("forbidden");
  if (league.draft.status !== "not_started") return fail("lines_locked");
  return succeed({ ...league, lineOverrides: overrides });
}
```

### 3e. `src/lib/league/commands.test.ts`

- `newLeague()` result now has `lineOverrides: {}` and `seasonLabel: "2026–27"`: add both to the first
  `toMatchObject`.
- In "freezes complete lines…": `expect(must(act(league, "m1", { type: "start" })).lines).toEqual(LINES);`.
- In "keeps the frozen lines…": `toEqual(LINES)`.
- New tests:

```ts
  it("fills and replaces source lines with the commissioner's overrides at start", () => {
    const partial = { ...LINES, values: { MIN: 49.5, OKC: 62.5 } };
    let league = must(decideLineOverrides(newLeague(), "m1", { BOS: 40.5, MIN: 50.5 }));
    league = must(decideDraftAction(league, "m1", { type: "start" }, TEAM_IDS, partial));
    expect(league.lines).toEqual({ ...LINES, values: { MIN: 50.5, OKC: 62.5, BOS: 40.5 }, manual: ["BOS", "MIN"] });
  });

  it("fails with lines_changed when the reviewed lines no longer match", () => {
    const league = newLeague();
    const reviewed = { MIN: 49.5, OKC: 62.5, BOS: 41.5 };
    expect(must(act(league, "m1", { type: "start", lines: reviewed })).lines).toEqual(LINES);
    expect(act(league, "m1", { type: "start", lines: { ...reviewed, BOS: 42.5 } })).toEqual({ ok: false, error: "lines_changed" });
  });

  it("starts from hand-entered lines alone when the source is down", () => {
    const league = must(decideLineOverrides(newLeague(), "m1", { MIN: 49.5, OKC: 62.5, BOS: 41.5 }));
    const now = new Date("2026-10-08T19:42:00.000Z");
    expect(must(decideDraftAction(league, "m1", { type: "start" }, TEAM_IDS, null, now)).lines).toEqual({
      values: { MIN: 49.5, OKC: 62.5, BOS: 41.5 },
      source: "Commissioner",
      season: "2026–27",
      asOf: now.toISOString(),
      manual: ["BOS", "MIN", "OKC"],
    });
  });

  it("lets only the commissioner set overrides, and only before the draft", () => {
    const league = join(newLeague(), "m2", "Ben");
    expect(decideLineOverrides(league, "m2", {})).toEqual({ ok: false, error: "forbidden" });
    expect(decideLineOverrides(league, null, {})).toEqual({ ok: false, error: "forbidden" });
    const started = must(act(league, "m1", { type: "start" }));
    expect(decideLineOverrides(started, "m1", {})).toEqual({ ok: false, error: "lines_locked" });
  });
```

(add `decideLineOverrides` to the import list). Check that `LINES` in this file has `source: "test"`: the frozen set
keeps the source's name, so `toEqual(LINES)` holds.

Commit: `feat: commissioner line overrides and reviewed draft start`.

---

## Task 4 — persistence (src/db, drizzle/)

### 4a. `src/db/schema.ts` — in `leagues`, after `linesAsOf`:

```ts
    linesSeason: text("lines_season"),
    /** Teams whose frozen line the commissioner entered. */
    linesManual: jsonb("lines_manual").$type<string[]>(),
    /** Commissioner-entered lines before the draft starts (teamId → line). */
    lineOverrides: jsonb("line_overrides").$type<Record<string, number>>().notNull().default({}),
```

Run `npm run db:generate -- --name line_review` and keep the generated `drizzle/0001_line_review.sql` + meta changes.
Open the SQL and confirm it only adds the three columns (`line_overrides` with `DEFAULT '{}'::jsonb NOT NULL`).

### 4b. `src/db/leagues.ts`

- `assemble`: `lineOverrides: row.lineOverrides,` and the lines object becomes
  `{ values: row.lines, source: row.linesSource, season: row.linesSeason ?? row.seasonLabel, asOf: row.linesAsOf.toISOString(), manual: row.linesManual ?? [] }`.
- `insertLeague` values: add `lineOverrides: league.lineOverrides,`.
- `saveLeague` `.set({...})`: add
  `linesSeason: after.lines?.season ?? null, linesManual: after.lines ? [...after.lines.manual] : null, lineOverrides: after.lineOverrides,`.

### 4c. `src/db/actions.ts`

- `runDraftAction`: rename `lines` → `sourceLines` in the signature and the call; update the doc comment to "Fetch the
  source's lines before calling (no network calls while holding the lock); the decision adds the stored overrides."
- Add (import `decideLineOverrides` and `TeamId`):

```ts
/** Replaces the commissioner's line overrides. Validate the values (parseLineValues) before calling. */
export function setLineOverrides(
  db: Db,
  leagueId: string,
  sessionId: string | null,
  overrides: Readonly<Record<TeamId, number>>,
): Promise<Result<DraftOutcome>> {
  return withLockedLeague(db, leagueId, sessionId, async ({ tx, league, actorId }) => {
    const decided = decideLineOverrides(league, actorId, overrides);
    if (!decided.ok) return fail(decided.error);
    return succeed({ league: await saveLeague(tx, league, decided.value), actorId });
  });
}
```

### 4d. Tests

In `src/db/leagues.test.ts` (or `actions.test.ts`, whichever already has the commissioner session helper `ana` and a
second seat), add:

```ts
  it("stores overrides and freezes them with the season and manual teams", async () => {
    const partial = { ...STATIC_LINES, values: { ...STATIC_LINES.values } };
    delete (partial.values as Record<string, number>).BOS;
    expect((await setLineOverrides(db, "lg0001", ana, { BOS: 44.5 })).ok).toBe(true);
    expect((await loadLeague(db, "lg0001"))!.lineOverrides).toEqual({ BOS: 44.5 });
    await runDraftAction(db, "lg0001", ana, { type: "start" }, partial);
    const lines = (await loadLeague(db, "lg0001"))!.lines!;
    expect(lines).toMatchObject({ source: "static", season: "2025–26", manual: ["BOS"] });
    expect(lines.values.BOS).toBe(44.5);
  });

  it("refuses overrides from a non-commissioner and after the draft starts", async () => {
    // use the file's non-commissioner session helper if there is one; otherwise just check null
    expect(await setLineOverrides(db, "lg0001", null, {})).toEqual({ ok: false, error: "forbidden" });
    await runDraftAction(db, "lg0001", ana, { type: "start" }, STATIC_LINES);
    expect(await setLineOverrides(db, "lg0001", ana, {})).toEqual({ ok: false, error: "lines_locked" });
  });
```

Adapt league ids / helpers to the file you put them in (`LEAGUE` in actions.test.ts). The existing "round-trips frozen
lines" test must still pass unchanged.

Commit: `feat: persist line overrides, season and hand-entered teams`.

---

## Task 5 — server and API (src/server, src/app/api)

### 5a. `src/server/lines.ts` (replace whole file)

```ts
import "server-only";
import { LINES } from "@/config/lines";
import { STATIC_LINES } from "@/data/static-lines";
import { TEAM_INFO } from "@/data/teams";
import { fanDuelLineSource } from "@/lib/fanduel";
import { cachedLineSource, lineReader, staticLineSource, type LineSource } from "@/lib/lines";

// The JSON FanDuel's own NBA page loads. `_ak` is the public app key that page sends, not a secret. Undocumented:
// when it breaks, the review shows the error and the commissioner enters lines by hand.
const FANDUEL_NBA_URL =
  "https://sbapi.nj.sportsbook.fanduel.com/api/content-managed-page?page=CUSTOM&customPageId=nba&_ak=FhMFpcPWXMeyZxOx&timezone=America%2FNew_York";

async function fetchFanDuel(): Promise<unknown> {
  const response = await fetch(FANDUEL_NBA_URL, {
    cache: "no-store",
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(LINES.fetchTimeoutMs),
  });
  if (!response.ok) throw new Error(`${LINES.book} answered ${response.status}.`);
  return response.json();
}

/** FanDuel, cached. LINE_SOURCE=static serves the mock lines instead (offline dev, smoke tests). */
export const lineSource: LineSource =
  process.env.LINE_SOURCE === "static"
    ? staticLineSource(STATIC_LINES)
    : cachedLineSource(
        fanDuelLineSource({
          fetchJson: fetchFanDuel,
          teams: TEAM_INFO,
          book: LINES.book,
          season: LINES.season,
          marketSeason: LINES.fanDuelSeason,
        }),
        LINES.cacheSeconds * 1000,
        LINES.retrySeconds * 1000,
      );

/** The latest lines and, when the latest read failed, why (alongside the last good lines). Never rejects. */
export const readLines = lineReader(lineSource);
```

### 5b. `src/server/league.ts`

- Imports: `import { LINES } from "@/config/lines";`, from `@/lib/lines` import
  `buildLineReview, withAvailableLines, withLines`, `import type { League, LeagueView, LineReview } from "@/lib/types";`,
  `import { readLines } from "@/server/lines";` (drop `lineSource`, `Team` if unused).
- Replace `teamsFor` and `toLeagueView` with:

```ts
/** Before the draft: the source's lines with the commissioner's overrides on top. */
export async function reviewLines(league: League): Promise<LineReview> {
  return buildLineReview(TEAM_INFO, await readLines(), league.lineOverrides, { book: LINES.book, season: LINES.season });
}

/** Pass viewerId when it is already known (e.g. the actor a mutation read under the lock). */
export async function toLeagueView(league: League, viewerId?: string | null): Promise<LeagueView> {
  const lineReview = league.lines ? null : await reviewLines(league);
  return {
    league,
    viewerId: viewerId === undefined ? await getViewerId(league.id) : viewerId,
    teams: league.lines ? withLines(TEAM_INFO, league.lines) : withAvailableLines(TEAM_INFO, lineReview!.lines),
    lineReview,
  };
}
```

  `grep -rn teamsFor src` first; if anything else uses it, keep a `teamsFor` that returns `(await toLeagueView(league)).teams`.

### 5c. `src/server/http.ts` — add statuses: `lines_changed: 409, lines_locked: 409, invalid_line: 400,`.

### 5d. `src/app/api/leagues/[leagueId]/draft/route.ts`

Replace the `currentLinesOrNull` import with `import { readLines } from "@/server/lines";` and the fetch line with:

```ts
  // Read the source before taking the league lock: no network calls while holding it.
  const sourceLines = action.type === "start" ? (await readLines()).lines : null;
```

and pass `sourceLines` to `runDraftAction`.

### 5e. `src/app/api/leagues/[leagueId]/lines/route.ts` (new)

```ts
import { TEAM_IDS } from "@/data/teams";
import { setLineOverrides } from "@/db/actions";
import { parseLineValues } from "@/lib/lines";
import { getDb } from "@/server/db";
import { errorResponse, isSameOrigin, readJsonBody } from "@/server/http";
import { toLeagueView } from "@/server/league";
import { getSession } from "@/server/session";

/** Replace the commissioner's line overrides: `{ overrides: { BOS: 50.5, … } }`. An empty map clears them. */
export async function PUT(request: Request, ctx: RouteContext<"/api/leagues/[leagueId]/lines">) {
  if (!isSameOrigin(request)) return errorResponse("forbidden");
  const { leagueId } = await ctx.params;
  const overrides = parseLineValues((await readJsonBody(request)).overrides, TEAM_IDS);
  if (!overrides) return errorResponse("invalid_line");
  const session = await getSession();
  const result = await setLineOverrides(await getDb(), leagueId, session?.id ?? null, overrides);
  if (!result.ok) return errorResponse(result.error);
  return Response.json(await toLeagueView(result.value.league, result.value.actorId));
}
```

### 5f. `scripts/smoke.sh`

The start check expects `'"source":"static"'`; change it to `'"season":"'` so it passes against either source. Add,
before the start check, a commissioner `PUT /api/leagues/$LEAGUE/lines '{"overrides":{"BOS":44.5}}'` expecting 200 and
`'"BOS":44.5'`, and a non-commissioner (`ben`) attempt expecting 403. Look at how `call`/`check` are defined and match
them (add a PUT if `call` only knows GET/POST).

Run the gates plus `npm run build`. Commit: `feat: FanDuel line feed, line review in the league view, overrides API`.

---

## Task 6 — UI (src/components/draft)

### 6a. `use-league-draft.ts`

Generalize the POST into a `send(url, method, body)` helper used by `dispatch`, and add:

```ts
  const saveLineOverrides = useCallback(
    (overrides: Record<string, number>) => send(`/api/leagues/${initial.league.id}/lines`, "PUT", { overrides }),
    [send, initial.league.id],
  );
```

`send` keeps today's behavior (pending, error message from the response, refresh on failure, `accept` on success,
returns boolean). Return `saveLineOverrides` from the hook.

### 6b. `LineReviewPanel.tsx` (new)

```tsx
"use client";

import { ListChecks } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { formatDateTimeET, formatNumber } from "@/lib/format";
import { isValidLine, sameLineValues } from "@/lib/lines";
import type { LineReview, TeamId } from "@/lib/types";

function toDrafts(overrides: Readonly<Record<TeamId, number>>): Record<TeamId, string> {
  return Object.fromEntries(Object.entries(overrides).map(([teamId, line]) => [teamId, String(line)]));
}

/** Empty boxes mean "use the book's line". */
function parseDrafts(drafts: Record<TeamId, string>): { values: Record<TeamId, number>; invalid: Set<TeamId> } {
  const values: Record<TeamId, number> = {};
  const invalid = new Set<TeamId>();
  for (const [teamId, text] of Object.entries(drafts)) {
    if (text.trim() === "") continue;
    const value = Number(text);
    if (isValidLine(value)) values[teamId] = value;
    else invalid.add(teamId);
  }
  return { values, invalid };
}

/**
 * Before the draft: every team's line from the book, with the commissioner's lines on top. Remount it (key) when the
 * saved overrides change so the boxes reset to what was saved.
 */
export function LineReviewPanel({
  review,
  canEdit,
  pending,
  onSave,
  onDirtyChange,
}: {
  review: LineReview;
  canEdit: boolean;
  pending: boolean;
  onSave: (overrides: Record<TeamId, number>) => Promise<boolean>;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [drafts, setDrafts] = useState(() => toDrafts(review.overrides));
  const { values, invalid } = parseDrafts(drafts);
  const dirty = invalid.size > 0 || !sameLineValues(values, review.overrides);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const missingNames = review.rows.filter((row) => row.line === null).map((row) => row.team.name);

  return (
    <Panel
      title="Lines"
      icon={<ListChecks aria-hidden className="size-5 text-fog-300" />}
      bodyClassName="flex flex-col"
      actions={
        <p className="text-sm text-fog-300">
          {review.book} · {review.season} win totals ·{" "}
          {review.asOf ? `updated ${formatDateTimeET(review.asOf)}` : "not loaded"}
        </p>
      }
    >
      <div className="flex flex-col gap-3 px-4 pt-4 sm:px-5">
        {review.feedError && (
          <Alert>
            Couldn&apos;t refresh {review.book} lines: {review.feedError}{" "}
            {review.asOf
              ? `Showing the lines from ${formatDateTimeET(review.asOf)}.`
              : canEdit
                ? "Enter the lines by hand below to draft without them."
                : "The commissioner can enter them by hand."}
          </Alert>
        )}
        {missingNames.length > 0 && (
          <Alert>
            No line yet for {missingNames.length === review.rows.length ? "any team" : missingNames.join(", ")}.{" "}
            {canEdit ? "Enter the missing lines to start the draft." : "The commissioner needs to enter them."}
          </Alert>
        )}
        <p className="text-sm text-fog-400">
          Lines lock when the draft starts.{" "}
          {canEdit && `Leave a box empty to use the ${review.book} line; anything you type replaces it.`}
        </p>
      </div>

      <div className="@container mt-3">
        <div className="grid grid-cols-[minmax(0,1fr)_4rem_5.5rem] gap-3 border-y border-ink-700 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-fog-400 sm:px-5">
          <span>Team</span>
          <span className="text-right">{review.book}</span>
          <span className="text-right">Line</span>
        </div>
        <ul className="divide-y divide-ink-700/70">
          {review.rows.map((row) => {
            const id = row.team.id;
            const label = `${row.team.city} ${row.team.name}`;
            return (
              <li key={id} className="grid grid-cols-[minmax(0,1fr)_4rem_5.5rem] items-center gap-3 px-4 py-2 sm:px-5">
                <div className="min-w-0">
                  <p className="truncate font-medium">{label}</p>
                  {row.line === null ? (
                    <p className="text-xs text-negative">Missing</p>
                  ) : row.override !== null ? (
                    <p className="text-xs text-accent">Entered by the commissioner</p>
                  ) : null}
                </div>
                <span className="text-right tabular-nums text-fog-300">
                  {row.feed === null ? "—" : formatNumber(row.feed)}
                </span>
                {canEdit ? (
                  <input
                    inputMode="decimal"
                    aria-label={`${label} line`}
                    aria-invalid={invalid.has(id)}
                    placeholder={row.feed === null ? "Enter" : formatNumber(row.feed)}
                    value={drafts[id] ?? ""}
                    onChange={(event) => setDrafts((current) => ({ ...current, [id]: event.target.value }))}
                    className="h-9 w-full rounded-md border border-ink-600 bg-ink-900 px-2 text-right font-semibold tabular-nums text-fog-50 placeholder:font-normal placeholder:text-fog-400 focus-visible:outline-2 focus-visible:outline-accent aria-[invalid=true]:border-negative"
                  />
                ) : (
                  <span className="text-right font-semibold tabular-nums">
                    {row.line === null ? "—" : formatNumber(row.line)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-3 border-t border-ink-700 px-4 py-3 sm:px-5">
          <Button onClick={() => void onSave(values)} disabled={!dirty || invalid.size > 0 || pending}>
            Save lines
          </Button>
          <Button variant="ghost" onClick={() => setDrafts(toDrafts(review.overrides))} disabled={!dirty || pending}>
            Discard changes
          </Button>
          {invalid.size > 0 && (
            <p className="text-sm text-negative">Lines must be between 0.5 and 81.5, in steps of 0.5.</p>
          )}
        </div>
      )}
    </Panel>
  );
}
```

### 6c. `DraftLobby.tsx`

Add props `startBlocker: string | null`, `reviewed: boolean`, `onReviewedChange: (reviewed: boolean) => void`. Replace
the commissioner's Start button with:

```tsx
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2 text-sm text-fog-50">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(event) => onReviewedChange(event.target.checked)}
              className="size-4 accent-accent"
            />
            I&apos;ve checked all 30 lines.
          </label>
          <Button size="lg" onClick={onStart} disabled={pending || startBlocker !== null} className="self-start">
            Start draft
          </Button>
          {startBlocker && <p className="text-sm text-fog-400">{startBlocker}</p>}
        </div>
```

(30 = `TEAM_INFO.length`; use `review.rows.length` passed in if you prefer not to hardcode — add a `teamCount` prop.)

### 6d. `DraftRoom.tsx`

- From the hook take `saveLineOverrides` too.
- State: `const [linesDirty, setLinesDirty] = useState(false);` and a reviewed flag that resets when the lines change:

```tsx
  const review = view.lineReview;
  const linesKey = review ? JSON.stringify(review.lines) : "";
  const [reviewedKey, setReviewedKey] = useState<string | null>(null);
  const reviewed = reviewedKey === linesKey;
  const startBlocker = !review
    ? null
    : review.missing.length > 0
      ? `Enter lines for the ${review.missing.length} team${review.missing.length === 1 ? "" : "s"} still missing one.`
      : linesDirty
        ? "Save or discard your line changes first."
        : !reviewed
          ? "Check the lines below, then tick the box."
          : null;
```

- Lobby: pass `startBlocker`, `reviewed`, `onReviewedChange={(checked) => setReviewedKey(checked ? linesKey : null)}`,
  and `onStart={() => run({ type: "start", lines: review?.lines })}`.
- Right after the lobby (still inside the `not_started` branch — wrap lobby + panel in a fragment), render:

```tsx
          {review && (
            <LineReviewPanel
              key={JSON.stringify(review.overrides)}
              review={review}
              canEdit={canControl}
              pending={pending}
              onSave={saveLineOverrides}
              onDirtyChange={setLinesDirty}
            />
          )}
```

- Footer info line: replace the "Lines locked when the draft started." text with
  `` `Lines locked when the draft started: ${describeLineSet(league.lines)}.` `` when `league.lines` is set (import
  `describeLineSet` from `@/lib/lines`). Keep "Lines lock when the draft starts." before the start.

### 6e. Verify (controller does this)

`npm test && npm run lint && npm run typecheck && npm run build`, then the browser at 375px and 1440px: create a league,
see 30 FanDuel lines with the updated time, type a line, save, tick the box, start; check the footer line and that the
page never scrolls horizontally.

Commit: `feat: commissioner line review before the draft`.

---

## Task 7 — docs

Update `CLAUDE.md`: in Domain rules replace the "Lines come from `lineSource`…" bullet with:

```
- Lines come from `lineSource` (`src/server/lines.ts`): FanDuel's public NBA JSON (one book, never mixed), cached 5 min,
  failures retried after 30 s; `LINE_SOURCE=static` serves the mock lines. Before the draft `LeagueView.lineReview`
  shows every team's book line plus the commissioner's overrides (`PUT /api/leagues/{id}/lines`); the start request
  names the reviewed lines (`lines_changed` if they moved) and freezes them into `League.lines` with `season` and the
  `manual` teams. Components read teams with lines from `LeagueView.teams`, never from `src/data`.
```

and add `LINES` (book, season, cache timings) to the `src/config/` bullet. Commit: `docs: live lines`.
