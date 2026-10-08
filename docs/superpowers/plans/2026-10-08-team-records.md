# Real Team Records Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stored leagues score against real NBA win–loss records from ESPN, stored by team and season, refreshed by the commissioner or a daily cron, with the last successful update shown.

**Architecture:** Pure parsing/validation in `src/lib/records/`, a records repository with a row-locked refresh in `src/db/records.ts`, server glue in `src/server/records.ts` and `src/server/league.ts`, a commissioner route plus a cron route, and a status line with a refresh button on the Overview page. Scores still flow only through `src/lib/scoring.ts` / `src/lib/standings.ts`.

**Tech Stack:** Next.js 16.4 App Router (Cache Components on), TypeScript strict, Drizzle 0.45 on Postgres/PGlite, Vitest 4.1, Tailwind v4 tokens.

**Spec:** `docs/superpowers/specs/2026-10-08-team-records-design.md`

## Global Constraints

- Work in the worktree `/Users/noah/Desktop/projects/nba-over-under-draft/.claude/worktrees/team-records` (branch `claude/team-records`). Never touch the main checkout: another session works there.
- `src/lib/` is pure TypeScript: no React, no `next/*`, no `server-only`, no `@/data` imports. `src/lib` may import `@/config`.
- `src/db/` has no `server-only` and is imported only by `src/server/` and route handlers.
- `src/server/*` starts with `import "server-only";`. To unit test one, `vi.mock("server-only", () => ({}))`.
- Season key = end year (`"2025–26"` → `2026`). ESPN URL: `https://site.api.espn.com/apis/v2/sports/basketball/nba/standings?season={endYear}&seasontype=2`.
- Feed error messages are user-safe sentences ending in a period, e.g. `ESPN didn't respond within 8 s.`
- Demo league (`id "demo"`, `isDemo: true`) never reads or writes record tables.
- Dark-theme tokens only (`text-fog-400`, `bg-ink-850`, …); format numbers/dates at the edge.
- Tests colocated as `*.test.ts`; test-first for `src/lib/`.
- Every commit message ends with a blank line then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- If `npm run typecheck` fails on files named `* 2.*` inside `.next`, delete those duplicates (`find .next -name "* 2*" -delete`) and rerun — it's iCloud sync noise, not your bug.

---

### Task 1: Shared feed seams, records config, ESLint ignore

**Files:**
- Modify: `eslint.config.mjs`
- Create: `src/config/records.ts`
- Create: `src/lib/feed-error.ts`
- Modify: `src/data/teams.ts` (append)
- Create: `src/data/teams.test.ts`
- Create: `src/server/feed.ts`
- Create: `src/server/feed.test.ts`

**Interfaces:**
- Produces: `RECORDS` config; `class FeedError extends Error` (`@/lib/feed-error`); `teamIdByNickname(name: string): TeamId | null` (`@/data/teams`); `fetchFeedJson(url: string, opts: { source: string; timeoutMs: number }): Promise<unknown>` (`@/server/feed`).

- [ ] **Step 1: Ignore worktrees in ESLint.** In `eslint.config.mjs`, add `".claude/**",` to the `globalIgnores([...])` array after `"next-env.d.ts",` with a comment line above it: `// Other sessions' git worktrees.`

- [ ] **Step 2: Config.** Create `src/config/records.ts`:

```ts
/** Where team win–loss records come from and how often they may be fetched. */
export const RECORDS = {
  /** Display name of the records source. */
  source: "ESPN",
  /** A refresh within this long of the last success reuses the stored records instead of calling the source. */
  minRefreshSeconds: 60,
  fetchTimeoutMs: 8000,
} as const;
```

- [ ] **Step 3: FeedError.** Create `src/lib/feed-error.ts`:

```ts
/** A failed read of an outside data feed. The message is written for users and safe to show them. */
export class FeedError extends Error {
  override name = "FeedError";
}
```

- [ ] **Step 4: Write the failing nickname test.** Create `src/data/teams.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { teamIdByNickname } from "@/data/teams";

describe("teamIdByNickname", () => {
  it("matches a nickname, ignoring case and spaces", () => {
    expect(teamIdByNickname("Trail Blazers")).toBe("POR");
    expect(teamIdByNickname("  76ers ")).toBe("PHI");
    expect(teamIdByNickname("timberwolves")).toBe("MIN");
  });

  it("matches a full name that ends in a nickname", () => {
    expect(teamIdByNickname("Los Angeles Clippers")).toBe("LAC");
    expect(teamIdByNickname("LA Clippers")).toBe("LAC");
    expect(teamIdByNickname("Portland Trail Blazers")).toBe("POR");
  });

  it("returns null for anything else", () => {
    expect(teamIdByNickname("")).toBeNull();
    expect(teamIdByNickname("Sonics")).toBeNull();
    expect(teamIdByNickname("Blazers")).toBeNull();
    expect(teamIdByNickname("Clippersx")).toBeNull();
  });
});
```

- [ ] **Step 5: Run it, expect FAIL** (`teamIdByNickname` is not exported): `npx vitest run src/data/teams.test.ts`

- [ ] **Step 6: Implement.** Append to `src/data/teams.ts`:

```ts
/**
 * Our id for a team named by its nickname ("Trail Blazers") or a full name ending in one ("Los Angeles Clippers").
 * Case-insensitive. Shared by every outside feed (ESPN records, FanDuel lines). Null when nothing matches.
 */
export function teamIdByNickname(name: string): TeamId | null {
  const wanted = name.trim().toLowerCase();
  if (wanted === "") return null;
  const team = TEAM_INFO.find((candidate) => {
    const nickname = candidate.name.toLowerCase();
    return wanted === nickname || wanted.endsWith(` ${nickname}`);
  });
  return team?.id ?? null;
}
```

- [ ] **Step 7: Run it, expect PASS.**

- [ ] **Step 8: Write the failing feed test.** Create `src/server/feed.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { FeedError } from "@/lib/feed-error";

vi.mock("server-only", () => ({}));
const { fetchFeedJson } = await import("@/server/feed");

const OPTS = { source: "ESPN", timeoutMs: 8000 };

afterEach(() => vi.unstubAllGlobals());

describe("fetchFeedJson", () => {
  it("returns the parsed body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ a: 1 })));
    await expect(fetchFeedJson("https://example.test/x", OPTS)).resolves.toEqual({ a: 1 });
  });

  it("names the HTTP status of a failed response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 403 })));
    await expect(fetchFeedJson("https://example.test/x", OPTS)).rejects.toThrow(
      new FeedError("ESPN returned HTTP 403."),
    );
  });

  it("explains a timeout", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new DOMException("t", "TimeoutError"))));
    await expect(fetchFeedJson("https://example.test/x", OPTS)).rejects.toThrow("ESPN didn't respond within 8 s.");
  });

  it("explains a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    await expect(fetchFeedJson("https://example.test/x", OPTS)).rejects.toThrow("Couldn't reach ESPN.");
  });

  it("explains a body that isn't JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 200 })));
    await expect(fetchFeedJson("https://example.test/x", OPTS)).rejects.toThrow(
      "ESPN sent a response we couldn't read.",
    );
  });

  it("only throws FeedError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 500 })));
    await expect(fetchFeedJson("https://example.test/x", OPTS)).rejects.toBeInstanceOf(FeedError);
  });
});
```

- [ ] **Step 9: Run it, expect FAIL** (module missing): `npx vitest run src/server/feed.test.ts`

- [ ] **Step 10: Implement.** Create `src/server/feed.ts`:

```ts
import "server-only";
import { FeedError } from "@/lib/feed-error";

/**
 * GETs JSON from an outside feed. Every failure — timeout, network, HTTP status, unreadable body — becomes a FeedError
 * whose message names the source and can be shown to users.
 */
export async function fetchFeedJson(url: string, { source, timeoutMs }: { source: string; timeoutMs: number }): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError");
    throw new FeedError(
      timedOut ? `${source} didn't respond within ${Math.round(timeoutMs / 1000)} s.` : `Couldn't reach ${source}.`,
    );
  }
  if (!response.ok) throw new FeedError(`${source} returned HTTP ${response.status}.`);
  try {
    return await response.json();
  } catch {
    throw new FeedError(`${source} sent a response we couldn't read.`);
  }
}
```

- [ ] **Step 11: Run both test files, expect PASS.** Then `npm run lint && npm run typecheck`.

- [ ] **Step 12: Commit.**

```bash
git add eslint.config.mjs src/config/records.ts src/lib/feed-error.ts src/data/teams.ts src/data/teams.test.ts src/server/feed.ts src/server/feed.test.ts
git commit -m "feat: add shared feed fetch, FeedError and team nickname lookup; ignore worktrees in lint

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Pure records logic (`src/lib/records/`)

**Files:**
- Create: `src/lib/records/types.ts`, `season.ts`, `espn.ts`, `validate.ts`, `static.ts`, `merge.ts`
- Create tests: `src/lib/records/season.test.ts`, `espn.test.ts`, `validate.test.ts`, `merge.test.ts`
- Existing fixtures (already committed? if untracked, add them in this task's commit): `src/lib/records/espn-standings-2026-regular.fixture.json` (final 2025–26: DET 60–22, OKC 64–18, WAS 17–65, all 30 teams, `season: 2026`, `seasonType: 2`) and `src/lib/records/espn-standings-2027-preseason.fixture.json` (`season: 2027`, `seasonType: 1`, ATL 0–1).

**Interfaces:**
- Consumes: `FeedError` (`@/lib/feed-error`), `RECORDS` (`@/config/records`), `SCORING.seasonGames` (`@/config/scoring`, = 82).
- Produces:
  - `TeamRecord { wins: number; losses: number }`, `SeasonRecords = Readonly<Record<TeamId, TeamRecord>>`, `RecordSet { season: number; records: SeasonRecords }`, `RecordSource { readonly name: string; fetch(season: number): Promise<RecordSet> }`, `RecordStatus { seasonLabel: string; source: string; asOf: string | null; error: string | null }` — all from `@/lib/records/types`.
  - `seasonEndYear(label: string): number | null`, `seasonLabelFor(endYear: number): string` — `@/lib/records/season`.
  - `espnStandingsUrl(season: number): string`, `parseEspnStandings(payload: unknown, season: number, resolveTeam: (name: string) => TeamId | null, teamIds: ReadonlySet<TeamId>): RecordSet` — `@/lib/records/espn`.
  - `checkNoRegression(stored: SeasonRecords, next: SeasonRecords): void` — `@/lib/records/validate`.
  - `staticRecordSource(name: string, records: SeasonRecords): RecordSource` — `@/lib/records/static`.
  - `withRecords<T extends TeamRecord & { id: TeamId }>(teams: readonly T[], records: SeasonRecords): T[]` — `@/lib/records/merge`.

- [ ] **Step 1: Types.** Create `src/lib/records/types.ts`:

```ts
import type { TeamId } from "@/lib/types";

export interface TeamRecord {
  wins: number;
  losses: number;
}

/** teamId → regular-season record. */
export type SeasonRecords = Readonly<Record<TeamId, TeamRecord>>;

/** Every team's record for one season, as read from a source. */
export interface RecordSet {
  /** Season end year: 2027 for 2026–27. */
  season: number;
  records: SeasonRecords;
}

/** Where team records come from. `fetch` rejects with a FeedError whose message is safe to show users. */
export interface RecordSource {
  /** Display name, e.g. "ESPN". */
  readonly name: string;
  fetch(season: number): Promise<RecordSet>;
}

/** What a page shows about a league's records. */
export interface RecordStatus {
  seasonLabel: string;
  source: string;
  /** ISO 8601 time of the last successful refresh. Null when records were never loaded. */
  asOf: string | null;
  /** Why the most recent refresh failed. Null when it succeeded or none was tried. */
  error: string | null;
}
```

- [ ] **Step 2: Failing season test.** Create `src/lib/records/season.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { seasonEndYear, seasonLabelFor } from "@/lib/records/season";

describe("seasonEndYear", () => {
  it("reads the end year from a season label with an en dash or hyphen", () => {
    expect(seasonEndYear("2025–26")).toBe(2026);
    expect(seasonEndYear("2026-27")).toBe(2027);
    expect(seasonEndYear("1999–00")).toBe(2000);
  });

  it("rejects anything else", () => {
    expect(seasonEndYear("2025–27")).toBeNull();
    expect(seasonEndYear("2025")).toBeNull();
    expect(seasonEndYear("")).toBeNull();
  });
});

describe("seasonLabelFor", () => {
  it("formats an end year as a season label", () => {
    expect(seasonLabelFor(2027)).toBe("2026–27");
    expect(seasonLabelFor(2000)).toBe("1999–00");
  });
});
```

- [ ] **Step 3: Run, expect FAIL.** `npx vitest run src/lib/records`

- [ ] **Step 4: Implement** `src/lib/records/season.ts`:

```ts
/** "2025–26" (en dash or hyphen) → 2026, the season's end year. Null for anything else. */
export function seasonEndYear(label: string): number | null {
  const match = /^(\d{4})[–-](\d{2})$/.exec(label.trim());
  if (!match) return null;
  const end = Number(match[1]) + 1;
  return end % 100 === Number(match[2]) ? end : null;
}

/** 2027 → "2026–27". */
export function seasonLabelFor(endYear: number): string {
  return `${endYear - 1}–${String(endYear % 100).padStart(2, "0")}`;
}
```

- [ ] **Step 5: Run, expect PASS.**

- [ ] **Step 6: Failing ESPN parser test.** Create `src/lib/records/espn.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { TEAM_IDS, teamIdByNickname } from "@/data/teams";
import { espnStandingsUrl, parseEspnStandings } from "@/lib/records/espn";
import { FeedError } from "@/lib/feed-error";
import regular from "./espn-standings-2026-regular.fixture.json";
import preseason from "./espn-standings-2027-preseason.fixture.json";

type Payload = typeof regular;
const parse = (payload: unknown, season = 2026) => parseEspnStandings(payload, season, teamIdByNickname, TEAM_IDS);
const copy = (): Payload => structuredClone(regular);

describe("espnStandingsUrl", () => {
  it("always asks for the regular season", () => {
    expect(espnStandingsUrl(2027)).toBe(
      "https://site.api.espn.com/apis/v2/sports/basketball/nba/standings?season=2027&seasontype=2",
    );
  });
});

describe("parseEspnStandings", () => {
  it("reads every team's record, keyed by our ids", () => {
    const set = parse(regular);
    expect(set.season).toBe(2026);
    expect(Object.keys(set.records)).toHaveLength(30);
    expect(set.records.DET).toEqual({ wins: 60, losses: 22 });
    expect(set.records.OKC).toEqual({ wins: 64, losses: 18 });
    expect(set.records.WAS).toEqual({ wins: 17, losses: 65 });
    expect(set.records.NYK).toEqual({ wins: 53, losses: 29 });
    expect(set.records.UTA).toEqual({ wins: 22, losses: 60 });
  });

  it("rejects preseason standings", () => {
    expect(() => parse(preseason, 2027)).toThrow(FeedError);
    expect(() => parse(preseason, 2027)).toThrow("ESPN standings were for a different season than 2026–27.");
  });

  it("rejects another season", () => {
    expect(() => parse(regular, 2027)).toThrow("ESPN standings were for a different season than 2026–27.");
  });

  it("rejects a payload in another shape", () => {
    for (const payload of [null, [], {}, { children: [] }, { children: [{}] }, "x"]) {
      expect(() => parse(payload)).toThrow("ESPN standings weren't in the expected format.");
    }
  });

  it("rejects a missing team", () => {
    const payload = copy();
    payload.children[0].standings.entries.pop();
    expect(() => parse(payload)).toThrow(/^ESPN standings were missing [A-Z]{3}\.$/);
  });

  it("rejects an unknown team", () => {
    const payload = copy();
    payload.children[0].standings.entries[0].team.name = "Sonics";
    expect(() => parse(payload)).toThrow("ESPN standings included a team we don't know (Sonics).");
  });

  it("rejects a duplicated team", () => {
    const payload = copy();
    payload.children[0].standings.entries[1].team.name = payload.children[0].standings.entries[0].team.name;
    expect(() => parse(payload)).toThrow(/^ESPN standings listed [A-Z]{3} twice\.$/);
  });

  it("rejects a record that isn't whole, non-negative numbers", () => {
    for (const bad of [-1, 1.5, "60", null]) {
      const payload = copy();
      const stat = payload.children[0].standings.entries[0].stats.find((s) => s.name === "wins")!;
      (stat as { value: unknown }).value = bad;
      expect(() => parse(payload)).toThrow("ESPN standings had no usable record for DET.");
    }
  });

  it("rejects more than 82 games", () => {
    const payload = copy();
    const stat = payload.children[0].standings.entries[0].stats.find((s) => s.name === "wins")!;
    stat.value = 61;
    expect(() => parse(payload)).toThrow("ESPN standings gave DET more than 82 games.");
  });
});
```

Note: the fixture's first East entry is DET. If `tsconfig` lacks `resolveJsonModule`, check it — Next projects enable it by default.

- [ ] **Step 7: Run, expect FAIL.**

- [ ] **Step 8: Implement** `src/lib/records/espn.ts`:

```ts
import { RECORDS } from "@/config/records";
import { SCORING } from "@/config/scoring";
import { FeedError } from "@/lib/feed-error";
import type { TeamId } from "@/lib/types";
import { seasonLabelFor } from "./season";
import type { RecordSet, TeamRecord } from "./types";

// ESPN's public standings JSON (unofficial; keyless). Without seasontype it can return preseason records, so we always
// ask for the regular season and refuse anything else. Teams match by nickname: ESPN's abbreviations differ from ours.

const STANDINGS_URL = "https://site.api.espn.com/apis/v2/sports/basketball/nba/standings";
const REGULAR_SEASON = 2;

export function espnStandingsUrl(season: number): string {
  return `${STANDINGS_URL}?season=${season}&seasontype=${REGULAR_SEASON}`;
}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function problem(detail: string): FeedError {
  return new FeedError(`${RECORDS.source} standings ${detail}.`);
}

function statValue(stats: unknown, name: string): number | null {
  if (!Array.isArray(stats)) return null;
  const stat: unknown = stats.find((candidate) => isObject(candidate) && candidate.name === name);
  const value = isObject(stat) ? stat.value : undefined;
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

/** Every team's regular-season record from ESPN's standings payload. Throws FeedError unless all of it checks out. */
export function parseEspnStandings(
  payload: unknown,
  season: number,
  resolveTeam: (name: string) => TeamId | null,
  teamIds: ReadonlySet<TeamId>,
): RecordSet {
  const groups = isObject(payload) ? payload.children : undefined;
  if (!Array.isArray(groups) || groups.length === 0) throw problem("weren't in the expected format");
  const records: Record<TeamId, TeamRecord> = {};
  for (const group of groups) {
    const standings = isObject(group) ? group.standings : undefined;
    if (!isObject(standings) || !Array.isArray(standings.entries)) throw problem("weren't in the expected format");
    if (standings.season !== season || standings.seasonType !== REGULAR_SEASON) {
      throw problem(`were for a different season than ${seasonLabelFor(season)}`);
    }
    for (const entry of standings.entries) {
      const team = isObject(entry) ? entry.team : undefined;
      const name = isObject(team) && typeof team.name === "string" ? team.name : "unnamed";
      const teamId = resolveTeam(name);
      if (teamId === null || !teamIds.has(teamId)) throw problem(`included a team we don't know (${name})`);
      if (teamId in records) throw problem(`listed ${teamId} twice`);
      const stats = isObject(entry) ? entry.stats : undefined;
      const wins = statValue(stats, "wins");
      const losses = statValue(stats, "losses");
      if (wins === null || losses === null) throw problem(`had no usable record for ${teamId}`);
      if (wins + losses > SCORING.seasonGames) throw problem(`gave ${teamId} more than ${SCORING.seasonGames} games`);
      records[teamId] = { wins, losses };
    }
  }
  const missing = [...teamIds].filter((teamId) => !(teamId in records));
  if (missing.length > 0) throw problem(`were missing ${missing.join(", ")}`);
  return { season, records };
}
```

Note: the test file imports `@/data/teams` — that's fine in a test; only the library module itself must not import `@/data`.

- [ ] **Step 9: Run, expect PASS.**

- [ ] **Step 10: Failing validate + merge tests.** Create `src/lib/records/validate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { FeedError } from "@/lib/feed-error";
import { checkNoRegression } from "@/lib/records/validate";

describe("checkNoRegression", () => {
  const stored = { BOS: { wins: 10, losses: 5 }, MIN: { wins: 8, losses: 7 } };

  it("accepts equal or more games, and teams with nothing stored", () => {
    expect(() =>
      checkNoRegression(stored, { BOS: { wins: 10, losses: 5 }, MIN: { wins: 9, losses: 7 }, OKC: { wins: 1, losses: 0 } }),
    ).not.toThrow();
    expect(() => checkNoRegression({}, { BOS: { wins: 0, losses: 0 } })).not.toThrow();
  });

  it("accepts a same-length correction", () => {
    expect(() => checkNoRegression(stored, { BOS: { wins: 9, losses: 6 }, MIN: { wins: 8, losses: 7 } })).not.toThrow();
  });

  it("rejects fewer games played for any team", () => {
    const next = { BOS: { wins: 10, losses: 4 }, MIN: { wins: 8, losses: 7 } };
    expect(() => checkNoRegression(stored, next)).toThrow(FeedError);
    expect(() => checkNoRegression(stored, next)).toThrow(
      "The new standings had fewer games for BOS than the saved ones, so the saved records were kept.",
    );
  });
});
```

Create `src/lib/records/merge.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { withRecords } from "@/lib/records/merge";

describe("withRecords", () => {
  const teams = [
    { id: "BOS", name: "Celtics", wins: 22, losses: 26 },
    { id: "MIN", name: "Timberwolves", wins: 30, losses: 18 },
  ];

  it("replaces each team's record and zeroes teams with none", () => {
    expect(withRecords(teams, { BOS: { wins: 3, losses: 1 } })).toEqual([
      { id: "BOS", name: "Celtics", wins: 3, losses: 1 },
      { id: "MIN", name: "Timberwolves", wins: 0, losses: 0 },
    ]);
  });
});
```

- [ ] **Step 11: Run, expect FAIL.**

- [ ] **Step 12: Implement.** `src/lib/records/validate.ts`:

```ts
import { FeedError } from "@/lib/feed-error";
import type { SeasonRecords } from "./types";

/** Games played only go up during a season. A feed that goes backwards is stale or broken: keep what we have. */
export function checkNoRegression(stored: SeasonRecords, next: SeasonRecords): void {
  for (const [teamId, before] of Object.entries(stored)) {
    const after = next[teamId];
    if (after && after.wins + after.losses < before.wins + before.losses) {
      throw new FeedError(
        `The new standings had fewer games for ${teamId} than the saved ones, so the saved records were kept.`,
      );
    }
  }
}
```

`src/lib/records/merge.ts`:

```ts
import type { TeamId } from "@/lib/types";
import type { SeasonRecords, TeamRecord } from "./types";

/** Teams with their records replaced from `records`. A team with no record has played no games (0–0). */
export function withRecords<T extends TeamRecord & { id: TeamId }>(teams: readonly T[], records: SeasonRecords): T[] {
  return teams.map((team) => {
    const record = records[team.id];
    return { ...team, wins: record?.wins ?? 0, losses: record?.losses ?? 0 };
  });
}
```

`src/lib/records/static.ts`:

```ts
import type { RecordSource, SeasonRecords } from "./types";

/** Serves the same records for any season. For offline development and the smoke test (RECORD_SOURCE=static). */
export function staticRecordSource(name: string, records: SeasonRecords): RecordSource {
  return { name, fetch: async (season) => ({ season, records }) };
}
```

- [ ] **Step 13: Run `npx vitest run src/lib/records`, expect PASS.** Then `npm run lint && npm run typecheck`.

- [ ] **Step 14: Commit** (include both fixture JSON files).

```bash
git add src/lib/records
git commit -m "feat: parse and validate ESPN regular-season standings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Records tables and the locked refresh (`src/db/records.ts`)

**Files:**
- Modify: `src/db/schema.ts` (append two tables)
- Create: `drizzle/0001_team_records.sql` + `drizzle/meta/*` via `npm run db:generate -- --name team_records`
- Create: `src/db/records.ts`, `src/db/records.test.ts`

**Interfaces:**
- Consumes: Task 2 types, `checkNoRegression`, `FeedError`, `RECORDS`.
- Produces (from `@/db/records`):
  - `interface StoredRefresh { source: string; succeededAt: Date | null; attemptedAt: Date; error: string | null }`
  - `loadSeasonRecords(db: Db, season: number): Promise<Record<TeamId, TeamRecord>>`
  - `loadRefresh(db: Db, season: number): Promise<StoredRefresh | null>`
  - `type RefreshOutcome = { ok: true; refresh: StoredRefresh; fetched: boolean } | { ok: false; refresh: StoredRefresh; message: string }`
  - `refreshSeasonRecords(db: Db, season: number, source: RecordSource, options?: { force?: boolean; now?: Date }): Promise<RefreshOutcome>`
  - `recordStatus(seasonLabel: string, refresh: StoredRefresh | null): RecordStatus`
  - `seasonsInUse(db: Db): Promise<string[]>` (distinct `leagues.season_label`, sorted)

- [ ] **Step 1: Schema.** Append to `src/db/schema.ts`:

```ts
/** Regular-season records by season (end year: 2027 for 2026–27) and team. Shared by every league in the season. */
export const teamRecords = pgTable(
  "team_records",
  {
    season: smallint("season").notNull(),
    teamId: text("team_id").notNull(),
    wins: smallint("wins").notNull(),
    losses: smallint("losses").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "team_records_pkey", columns: [t.season, t.teamId] }),
    check("team_records_wins_check", sql`${t.wins} >= 0`),
    check("team_records_losses_check", sql`${t.losses} >= 0`),
    check("team_records_games_check", sql`${t.wins} + ${t.losses} <= 82`),
  ],
);

/** One row per season: the last successful refresh, and the last attempt with its error. Locked during a refresh. */
export const recordRefreshes = pgTable("record_refreshes", {
  season: smallint("season").primaryKey(),
  source: text("source").notNull(),
  succeededAt: timestamp("succeeded_at", { withTimezone: true }),
  attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull(),
  /** Why the last attempt failed; null when it succeeded. */
  error: text("error"),
});
```

- [ ] **Step 2: Generate the migration.** `npm run db:generate -- --name team_records`. Expect `drizzle/0001_team_records.sql` creating both tables with the checks, plus updated `drizzle/meta/_journal.json` and a new snapshot. Read the SQL to confirm.

- [ ] **Step 3: Failing tests.** Create `src/db/records.test.ts`:

```ts
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { loadRefresh, loadSeasonRecords, recordStatus, refreshSeasonRecords, seasonsInUse } from "@/db/records";
import { createLeagueFor } from "@/db/actions";
import { createSession } from "@/db/sessions";
import { recordRefreshes } from "@/db/schema";
import { createTestDb } from "@/db/test-db";
import { FeedError } from "@/lib/feed-error";
import type { RecordSource, SeasonRecords } from "@/lib/records/types";

const SEASON = 2027;
const T0 = new Date("2026-11-01T10:00:00.000Z");
const later = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

function source(records: SeasonRecords | Error): RecordSource & { calls: number } {
  const s = {
    name: "ESPN",
    calls: 0,
    async fetch(season: number) {
      s.calls++;
      if (records instanceof Error) throw records;
      return { season, records };
    },
  };
  return s;
}

let db: Db;
beforeEach(async () => {
  db = await createTestDb();
});

describe("refreshSeasonRecords", () => {
  it("stores every team's record and the success time", async () => {
    const outcome = await refreshSeasonRecords(db, SEASON, source({ BOS: { wins: 3, losses: 1 }, MIN: { wins: 2, losses: 2 } }), { now: T0 });
    expect(outcome).toMatchObject({ ok: true, fetched: true });
    expect(await loadSeasonRecords(db, SEASON)).toEqual({ BOS: { wins: 3, losses: 1 }, MIN: { wins: 2, losses: 2 } });
    expect(await loadRefresh(db, SEASON)).toEqual({ source: "ESPN", succeededAt: T0, attemptedAt: T0, error: null });
    expect(await loadSeasonRecords(db, 2026)).toEqual({});
  });

  it("keeps the stored records and saves the reason when the source fails", async () => {
    await refreshSeasonRecords(db, SEASON, source({ BOS: { wins: 3, losses: 1 } }), { now: T0 });
    const outcome = await refreshSeasonRecords(db, SEASON, source(new FeedError("ESPN returned HTTP 503.")), { now: later(120) });
    expect(outcome).toMatchObject({ ok: false, message: "ESPN returned HTTP 503." });
    expect(await loadSeasonRecords(db, SEASON)).toEqual({ BOS: { wins: 3, losses: 1 } });
    expect(await loadRefresh(db, SEASON)).toEqual({ source: "ESPN", succeededAt: T0, attemptedAt: later(120), error: "ESPN returned HTTP 503." });
  });

  it("records a failure even when nothing was ever stored", async () => {
    const outcome = await refreshSeasonRecords(db, SEASON, source(new FeedError("Couldn't reach ESPN.")), { now: T0 });
    expect(outcome.ok).toBe(false);
    expect(outcome.refresh).toEqual({ source: "ESPN", succeededAt: null, attemptedAt: T0, error: "Couldn't reach ESPN." });
  });

  it("hides unexpected errors behind a generic message", async () => {
    const outcome = await refreshSeasonRecords(db, SEASON, source(new Error("connection reset by peer at 10.0.0.1")), { now: T0 });
    expect(outcome).toMatchObject({ ok: false, message: "Something went wrong while refreshing records." });
  });

  it("rejects standings with fewer games than stored", async () => {
    await refreshSeasonRecords(db, SEASON, source({ BOS: { wins: 3, losses: 1 } }), { now: T0 });
    const outcome = await refreshSeasonRecords(db, SEASON, source({ BOS: { wins: 2, losses: 1 } }), { now: later(120) });
    expect(outcome.ok).toBe(false);
    expect(await loadSeasonRecords(db, SEASON)).toEqual({ BOS: { wins: 3, losses: 1 } });
  });

  it("clears the last error after a success", async () => {
    await refreshSeasonRecords(db, SEASON, source(new FeedError("Couldn't reach ESPN.")), { now: T0 });
    await refreshSeasonRecords(db, SEASON, source({ BOS: { wins: 1, losses: 0 } }), { now: later(5) });
    expect((await loadRefresh(db, SEASON))?.error).toBeNull();
  });

  it("reuses a success from the last minute without calling the source, unless forced", async () => {
    await refreshSeasonRecords(db, SEASON, source({ BOS: { wins: 1, losses: 0 } }), { now: T0 });
    const second = source({ BOS: { wins: 2, losses: 0 } });
    expect(await refreshSeasonRecords(db, SEASON, second, { now: later(59) })).toMatchObject({ ok: true, fetched: false });
    expect(second.calls).toBe(0);
    expect(await refreshSeasonRecords(db, SEASON, second, { now: later(59), force: true })).toMatchObject({ fetched: true });
    expect(await refreshSeasonRecords(db, SEASON, second, { now: later(200) })).toMatchObject({ fetched: true });
    expect(second.calls).toBe(2);
  });

  it("refuses impossible records at the database", async () => {
    const outcome = await refreshSeasonRecords(db, SEASON, source({ BOS: { wins: 80, losses: 3 } }), { now: T0 });
    expect(outcome.ok).toBe(false);
    expect(await loadSeasonRecords(db, SEASON)).toEqual({});
  });
});

describe("recordStatus", () => {
  it("describes a season's refresh state", () => {
    expect(recordStatus("2026–27", null)).toEqual({ seasonLabel: "2026–27", source: "ESPN", asOf: null, error: null });
    expect(recordStatus("2026–27", { source: "ESPN", succeededAt: T0, attemptedAt: later(9), error: "x." })).toEqual({
      seasonLabel: "2026–27",
      source: "ESPN",
      asOf: T0.toISOString(),
      error: "x.",
    });
  });
});

describe("seasonsInUse", () => {
  it("lists each stored league's season once", async () => {
    expect(await seasonsInUse(db)).toEqual([]);
    const session = await createSession(db, "hash-a");
    await createLeagueFor(db, session, { displayName: "Ana" });
    await createLeagueFor(db, session, { displayName: "Ana" });
    const seasons = await seasonsInUse(db);
    expect(seasons).toHaveLength(1);
    expect(seasons[0]).toMatch(/^\d{4}–\d{2}$/);
  });
});
```

(If `createSession`'s signature differs, read `src/db/sessions.ts` and adapt the call; the unused `eq`/`recordRefreshes` imports can be removed if lint complains.)

- [ ] **Step 4: Run, expect FAIL.** `npx vitest run src/db/records.test.ts`

- [ ] **Step 5: Implement** `src/db/records.ts`:

```ts
import { asc, eq, sql } from "drizzle-orm";
import { RECORDS } from "@/config/records";
import { FeedError } from "@/lib/feed-error";
import type { RecordSource, RecordStatus, TeamRecord } from "@/lib/records/types";
import { checkNoRegression } from "@/lib/records/validate";
import type { TeamId } from "@/lib/types";
import type { Db } from "./client";
import { leagues, recordRefreshes, teamRecords } from "./schema";

export interface StoredRefresh {
  source: string;
  succeededAt: Date | null;
  attemptedAt: Date;
  error: string | null;
}

export type RefreshOutcome =
  | { ok: true; refresh: StoredRefresh; fetched: boolean }
  | { ok: false; refresh: StoredRefresh; message: string };

const UNEXPECTED = "Something went wrong while refreshing records.";

export async function loadSeasonRecords(db: Db, season: number): Promise<Record<TeamId, TeamRecord>> {
  const rows = await db.select().from(teamRecords).where(eq(teamRecords.season, season));
  return Object.fromEntries(rows.map((row) => [row.teamId, { wins: row.wins, losses: row.losses }]));
}

export async function loadRefresh(db: Db, season: number): Promise<StoredRefresh | null> {
  const [row] = await db.select().from(recordRefreshes).where(eq(recordRefreshes.season, season));
  return row ? { source: row.source, succeededAt: row.succeededAt, attemptedAt: row.attemptedAt, error: row.error } : null;
}

/**
 * Reads a season's records from `source` and stores them. The fetch happens before any transaction (no network while
 * holding a lock). Saving locks the season's record_refreshes row, so refreshes of one season run one at a time, and
 * rechecks that no team's games played went down. On any failure the stored records stay as they were; only the
 * attempt time and the reason are saved. A success within RECORDS.minRefreshSeconds is reused unless `force`.
 */
export async function refreshSeasonRecords(
  db: Db,
  season: number,
  source: RecordSource,
  options: { force?: boolean; now?: Date } = {},
): Promise<RefreshOutcome> {
  const now = options.now ?? new Date();
  const current = await loadRefresh(db, season);
  if (
    !options.force &&
    current?.succeededAt &&
    now.getTime() - current.succeededAt.getTime() < RECORDS.minRefreshSeconds * 1000
  ) {
    return { ok: true, refresh: current, fetched: false };
  }
  try {
    const set = await source.fetch(season);
    const refresh = await db.transaction(async (tx) => {
      await tx.insert(recordRefreshes).values({ season, source: source.name, attemptedAt: now }).onConflictDoNothing();
      await tx.select().from(recordRefreshes).where(eq(recordRefreshes.season, season)).for("update");
      checkNoRegression(await loadSeasonRecords(tx, season), set.records);
      const rows = Object.entries(set.records).map(([teamId, record]) => ({
        season,
        teamId,
        wins: record.wins,
        losses: record.losses,
        updatedAt: now,
      }));
      if (rows.length > 0) {
        await tx
          .insert(teamRecords)
          .values(rows)
          .onConflictDoUpdate({
            target: [teamRecords.season, teamRecords.teamId],
            set: { wins: sql`excluded.wins`, losses: sql`excluded.losses`, updatedAt: sql`excluded.updated_at` },
          });
      }
      const [row] = await tx
        .update(recordRefreshes)
        .set({ source: source.name, succeededAt: now, attemptedAt: now, error: null })
        .where(eq(recordRefreshes.season, season))
        .returning();
      return { source: row.source, succeededAt: row.succeededAt, attemptedAt: row.attemptedAt, error: row.error };
    });
    return { ok: true, refresh, fetched: true };
  } catch (error) {
    const message = error instanceof FeedError ? error.message : UNEXPECTED;
    if (!(error instanceof FeedError)) console.error("Team record refresh failed", error);
    await db
      .insert(recordRefreshes)
      .values({ season, source: source.name, attemptedAt: now, error: message })
      .onConflictDoUpdate({ target: recordRefreshes.season, set: { attemptedAt: now, error: message } });
    return { ok: false, refresh: (await loadRefresh(db, season))!, message };
  }
}

export function recordStatus(seasonLabel: string, refresh: StoredRefresh | null): RecordStatus {
  return {
    seasonLabel,
    source: refresh?.source ?? RECORDS.source,
    asOf: refresh?.succeededAt?.toISOString() ?? null,
    error: refresh?.error ?? null,
  };
}

/** Every season some stored league plays in. */
export async function seasonsInUse(db: Db): Promise<string[]> {
  const rows = await db.selectDistinct({ seasonLabel: leagues.seasonLabel }).from(leagues).orderBy(asc(leagues.seasonLabel));
  return rows.map((row) => row.seasonLabel);
}
```

Note: the "refuses impossible records" test relies on the `team_records_games_check` constraint raising inside the transaction; that error is not a FeedError, so the message is the generic one and the stored records are untouched.

- [ ] **Step 6: Run, expect PASS.** Then the full suite `npm test`, `npm run lint`, `npm run typecheck`.

- [ ] **Step 7: Commit.**

```bash
git add src/db/schema.ts src/db/records.ts src/db/records.test.ts drizzle
git commit -m "feat: store team records by season with a locked, all-or-nothing refresh

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Commissioner refresh action, record source and route

**Files:**
- Modify: `src/lib/league/errors.ts` (add `records_unavailable`)
- Modify: `src/server/http.ts` (status 502)
- Modify: `src/lib/league/permissions.ts` + `permissions.test.ts` (add `canRefreshRecords`)
- Modify: `src/db/actions.ts` + `src/db/actions.test.ts` (add `refreshLeagueRecords`)
- Create: `src/server/records.ts`
- Create: `src/app/api/leagues/[leagueId]/records/refresh/route.ts`

**Interfaces:**
- Consumes: Task 1 `fetchFeedJson`, `teamIdByNickname`, `RECORDS`; Task 2 `espnStandingsUrl`, `parseEspnStandings`, `staticRecordSource`, `seasonEndYear`; Task 3 `refreshSeasonRecords`, `recordStatus`.
- Produces:
  - `canRefreshRecords(league: Pick<League, "isDemo" | "commissionerId">, actorId: string | null): boolean`
  - `type RecordRefreshResult = { ok: true; status: RecordStatus } | { ok: false; status: RecordStatus; message: string }` and `refreshLeagueRecords(db: Db, leagueId: string, sessionId: string | null, source: RecordSource): Promise<Result<RecordRefreshResult>>` in `@/db/actions`
  - `recordSource: RecordSource` in `@/server/records`
  - `POST /api/leagues/{id}/records/refresh` → 200 `{ ok: true, records: RecordStatus }` | 502 `{ error: "records_unavailable", message, records }` | domain error JSON.

- [ ] **Step 1: Error code.** In `src/lib/league/errors.ts` add `| "records_unavailable"` to `DomainError` (after `"lines_unavailable"`) and to `ERROR_MESSAGES`: `records_unavailable: "Team records couldn't be refreshed. Try again in a minute.",`. In `src/server/http.ts` `STATUS` add `records_unavailable: 502,`.

- [ ] **Step 2: Permission, test-first.** Add to `src/lib/league/permissions.test.ts` a `describe("canRefreshRecords")` asserting: commissioner on a stored league → true; another seat → false; null actor → false; demo league (`isDemo: true`) with the commissioner id → false. Follow the existing `canManageSeats` tests' fixtures in that file. Run, FAIL. Then add to `permissions.ts`:

```ts
/** Refreshing team records belongs to the commissioner. The demo league is read-only. */
export function canRefreshRecords(league: Pick<League, "isDemo" | "commissionerId">, actorId: string | null): boolean {
  return !league.isDemo && actorId !== null && actorId === league.commissionerId;
}
```

Run, PASS.

- [ ] **Step 3: Action tests.** Append to `src/db/actions.test.ts` (reuse its `beforeEach` setup where `ana` is the commissioner session of league `LEAGUE` and `ben` a second session; read the top of the file to see how they are created and whether `ben` holds a seat — use `joinAs` if needed):

```ts
describe("refreshLeagueRecords", () => {
  const records = { BOS: { wins: 1, losses: 0 } };
  const ok: RecordSource = { name: "ESPN", fetch: async (season) => ({ season, records }) };
  const down: RecordSource = { name: "ESPN", fetch: async () => { throw new FeedError("ESPN returned HTTP 503."); } };

  it("lets the commissioner refresh the league's season", async () => {
    const result = await refreshLeagueRecords(db, LEAGUE, ana, ok);
    expect(result).toMatchObject({ ok: true, value: { ok: true, status: { source: "ESPN", error: null } } });
    const league = (await loadLeague(db, LEAGUE))!;
    expect(await loadSeasonRecords(db, seasonEndYear(league.seasonLabel)!)).toEqual(records);
  });

  it("reports a feed failure with the reason and keeps the status", async () => {
    const result = await refreshLeagueRecords(db, LEAGUE, ana, down);
    expect(result).toMatchObject({ ok: true, value: { ok: false, message: "ESPN returned HTTP 503." } });
  });

  it("refuses everyone but the commissioner, the demo league and unknown leagues", async () => {
    await joinAs(ben, "m2", "Ben");
    expect(await refreshLeagueRecords(db, LEAGUE, ben, ok)).toEqual({ ok: false, error: "forbidden" });
    expect(await refreshLeagueRecords(db, LEAGUE, null, ok)).toEqual({ ok: false, error: "forbidden" });
    expect(await refreshLeagueRecords(db, "demo", ana, ok)).toEqual({ ok: false, error: "demo_league" });
    expect(await refreshLeagueRecords(db, "nope00", ana, ok)).toEqual({ ok: false, error: "not_found" });
  });
});
```

Add the needed imports (`refreshLeagueRecords`, `loadSeasonRecords` from `@/db/records`, `FeedError`, `seasonEndYear`, `type RecordSource`). Run, FAIL.

- [ ] **Step 4: Implement the action.** Append to `src/db/actions.ts` (add imports: `eq` from `drizzle-orm`, `DEMO_LEAGUE_ID` from `@/data/demo-league`, `canRefreshRecords`, `seasonEndYear`, `RecordSource`/`RecordStatus` types, `leagues` from `./schema`, `seatInLeague` from `./sessions`, `recordStatus`/`refreshSeasonRecords` from `./records`):

```ts
export type RecordRefreshResult =
  | { ok: true; status: RecordStatus }
  | { ok: false; status: RecordStatus; message: string };

/**
 * Commissioner: refresh team records for the league's season (shared by every league in that season). Records are not
 * league state, so this doesn't take the league lock; the seat is still read from the database, never the cookie
 * alone, and refreshSeasonRecords serializes refreshes of a season with its own row lock. Call with no lock held.
 */
export async function refreshLeagueRecords(
  db: Db,
  leagueId: string,
  sessionId: string | null,
  source: RecordSource,
): Promise<Result<RecordRefreshResult>> {
  if (leagueId === DEMO_LEAGUE_ID) return fail("demo_league");
  const [row] = await db
    .select({ commissionerId: leagues.commissionerId, seasonLabel: leagues.seasonLabel })
    .from(leagues)
    .where(eq(leagues.id, leagueId));
  if (!row) return fail("not_found");
  const actorId = sessionId ? await seatInLeague(db, sessionId, leagueId) : null;
  if (!canRefreshRecords({ isDemo: false, commissionerId: row.commissionerId }, actorId)) return fail("forbidden");
  const season = seasonEndYear(row.seasonLabel);
  if (season === null) return fail("records_unavailable");
  const outcome = await refreshSeasonRecords(db, season, source);
  const status = recordStatus(row.seasonLabel, outcome.refresh);
  return succeed(outcome.ok ? { ok: true, status } : { ok: false, status, message: outcome.message });
}
```

Run, PASS.

- [ ] **Step 5: Record source.** Create `src/server/records.ts`:

```ts
import "server-only";
import { RECORDS } from "@/config/records";
import { TEAM_IDS, TEAM_INFO, teamIdByNickname } from "@/data/teams";
import { espnStandingsUrl, parseEspnStandings } from "@/lib/records/espn";
import { staticRecordSource } from "@/lib/records/static";
import type { RecordSource } from "@/lib/records/types";
import { fetchFeedJson } from "@/server/feed";

const espnRecordSource: RecordSource = {
  name: RECORDS.source,
  async fetch(season) {
    const payload = await fetchFeedJson(espnStandingsUrl(season), {
      source: RECORDS.source,
      timeoutMs: RECORDS.fetchTimeoutMs,
    });
    return parseEspnStandings(payload, season, teamIdByNickname, TEAM_IDS);
  },
};

/** ESPN, or with RECORD_SOURCE=static the mock records from src/data/teams.ts (offline dev, smoke test). */
export const recordSource: RecordSource =
  process.env.RECORD_SOURCE === "static"
    ? staticRecordSource(
        "Mock data",
        Object.fromEntries(TEAM_INFO.map((team) => [team.id, { wins: team.wins, losses: team.losses }])),
      )
    : espnRecordSource;
```

- [ ] **Step 6: Route.** Create `src/app/api/leagues/[leagueId]/records/refresh/route.ts`:

```ts
import { refreshLeagueRecords } from "@/db/actions";
import { getDb } from "@/server/db";
import { errorResponse, isSameOrigin } from "@/server/http";
import { recordSource } from "@/server/records";
import { getSession } from "@/server/session";

/** Commissioner: refresh team records for this league's season. */
export async function POST(request: Request, ctx: RouteContext<"/api/leagues/[leagueId]/records/refresh">) {
  if (!isSameOrigin(request)) return errorResponse("forbidden");
  const { leagueId } = await ctx.params;
  const session = await getSession();
  const result = await refreshLeagueRecords(await getDb(), leagueId, session?.id ?? null, recordSource);
  if (!result.ok) return errorResponse(result.error);
  const { value } = result;
  if (!value.ok) {
    return Response.json({ error: "records_unavailable", message: value.message, records: value.status }, { status: 502 });
  }
  return Response.json({ ok: true, records: value.status });
}
```

- [ ] **Step 7: Verify.** `npm test && npm run lint && npm run typecheck && npm run build`. (`RouteContext` types are generated by `next typegen`, which `npm run typecheck` runs.)

- [ ] **Step 8: Commit.**

```bash
git add -A src
git commit -m "feat: let the commissioner refresh team records from ESPN

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Scores from stored records, status line and refresh button

**Files:**
- Modify: `src/lib/types.ts` (`LeagueView.records`)
- Modify: `src/server/league.ts` (`teamInfoFor`, `teamsFor`, `toLeagueView`)
- Modify: `src/lib/format.ts` + `format.test.ts` (`formatUpdatedAt`)
- Create: `src/components/overview/RecordsStatus.tsx`
- Modify: `src/components/overview/LeagueOverview.tsx`, `src/app/l/[leagueId]/page.tsx`
- Modify any other `LeagueView` constructor typecheck flags (e.g. `src/components/draft/use-league-draft.ts` if it builds one).

**Interfaces:**
- Consumes: `loadSeasonRecords`, `loadRefresh`, `recordStatus` (Task 3); `withRecords`, `seasonEndYear`, `RecordStatus` (Task 2); `canRefreshRecords` (Task 4); route from Task 4; `sendJson` (`src/components/access/send-json.ts`).
- Produces: `teamInfoFor(league: League): Promise<TeamInfo[]>` exported from `@/server/league` (the live-lines branch will call it); `LeagueView.records: RecordStatus | null`; `formatUpdatedAt(iso: string, timeZone?: string): string`.

- [ ] **Step 1: Date format, test-first.** Add to `src/lib/format.test.ts`:

```ts
describe("formatUpdatedAt", () => {
  it("shows month, day and time", () => {
    expect(formatUpdatedAt("2026-11-01T10:02:00.000Z", "UTC")).toBe("Nov 1, 10:02 AM");
    expect(formatUpdatedAt("2026-11-01T10:02:00.000Z", "America/New_York")).toBe("Nov 1, 6:02 AM");
  });
});
```

Run, FAIL. Implement in `src/lib/format.ts`:

```ts
/** "Nov 1, 6:02 AM" in the viewer's time zone (or `timeZone`). */
export function formatUpdatedAt(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone }).format(
    new Date(iso),
  );
}
```

If Node's ICU emits a narrow no-break space (U+202F) before "AM", normalize it with `.replace(/ /g, " ")`. Run, PASS.

- [ ] **Step 2: View type.** In `src/lib/types.ts` add `import type { RecordStatus } from "@/lib/records/types";` and to `LeagueView`:

```ts
  /** When this league's season records last updated. Null for the demo league, whose records are mock data. */
  records: RecordStatus | null;
```

- [ ] **Step 3: Server wiring.** In `src/server/league.ts`:

```ts
/** Team metadata with this league's records: mock records for the demo, stored season records otherwise (0–0 until loaded). */
export async function teamInfoFor(league: League): Promise<TeamInfo[]> {
  if (league.isDemo) return [...TEAM_INFO];
  const season = seasonEndYear(league.seasonLabel);
  return withRecords(TEAM_INFO, season === null ? {} : await loadSeasonRecords(await getDb(), season));
}

async function recordStatusFor(league: League): Promise<RecordStatus | null> {
  if (league.isDemo) return null;
  const season = seasonEndYear(league.seasonLabel);
  return recordStatus(league.seasonLabel, season === null ? null : await loadRefresh(await getDb(), season));
}
```

Change `teamsFor` to `withLines(await teamInfoFor(league), league.lines ?? (await lineSource.current()))`, and `toLeagueView` to compute `teams` and `records` with `Promise.all` and include `records`. Fix every other place `npm run typecheck` reports a `LeagueView` missing `records` (the draft route builds views via `toLeagueView`; a client-side copy in `use-league-draft.ts` may spread an existing view — keep its `records`).

- [ ] **Step 4: Server-side test for teamInfoFor.** Server modules are `server-only`; instead cover the merge through `withRecords` (Task 2) and the DB reads (Task 3). No new test here — but run `npm test`.

- [ ] **Step 5: Component.** Create `src/components/overview/RecordsStatus.tsx`:

```tsx
"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { sendJson } from "@/components/access/send-json";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { formatUpdatedAt } from "@/lib/format";
import type { RecordStatus } from "@/lib/records/types";

/** "Records updated …" for everyone; the commissioner can refresh. */
export function RecordsStatus({ leagueId, status, canRefresh }: { leagueId: string; status: RecordStatus; canRefresh: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function refresh() {
    setPending(true);
    setFailure(null);
    const result = await sendJson(`/api/leagues/${leagueId}/records/refresh`, "POST");
    setPending(false);
    if (!result.ok) setFailure(result.message);
    router.refresh();
  }

  const reason = failure ?? (canRefresh ? status.error : null);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-fog-400">
        <p>
          {status.asOf ? (
            <>
              Records updated{" "}
              <time dateTime={status.asOf} suppressHydrationWarning className="text-fog-200">
                {formatUpdatedAt(status.asOf)}
              </time>{" "}
              · {status.source}
            </>
          ) : (
            "Records not updated yet"
          )}
        </p>
        {canRefresh && (
          <Button variant="secondary" size="sm" disabled={pending} onClick={refresh}>
            <RefreshCw aria-hidden className={`size-4 ${pending ? "animate-spin" : ""}`} />
            {pending ? "Refreshing…" : "Refresh records"}
          </Button>
        )}
      </div>
      {reason && (
        <Alert onDismiss={failure ? () => setFailure(null) : undefined}>
          Couldn&apos;t refresh records: {reason}{" "}
          {status.asOf ? `Showing records from ${formatUpdatedAt(status.asOf)}.` : "No records are loaded yet."}
        </Alert>
      )}
    </div>
  );
}
```

Check `text-fog-200` exists in `src/app/globals.css`; if not, use the nearest existing light fog token (e.g. `text-fog-50` or `text-fog-300`).

- [ ] **Step 6: Wire into the overview.** `LeagueOverview` gains a `records: RecordStatus | null` prop and renders, right after `<PageHeader … />`:

```tsx
{records && (
  <RecordsStatus leagueId={league.id} status={records} canRefresh={canRefreshRecords(league, viewerId)} />
)}
```

`src/app/l/[leagueId]/page.tsx` passes `records={view.records}`.

- [ ] **Step 7: Verify in the browser.** Start the dev server (`.claude/launch.json` lives in the main checkout; per project memory, for a worktree add a temporary config — or run `npm run dev -- -p 3100` from this worktree in the background with Bash and open `http://localhost:3100`). Create a league from the landing page (you become commissioner), open its Overview, click "Refresh records": the line should read "Records updated … · ESPN" and the standings should reflect real records (league season label is SEASON.label, e.g. 2025–26 → final 82-game records, so the Final basis is available once picks exist). Check `/l/demo` shows no records line. Check 375 px and 1440 px widths: no horizontal scroll. Stop the server after.

- [ ] **Step 8: Full verification.** `npm test && npm run lint && npm run typecheck && npm run build`.

- [ ] **Step 9: Commit.**

```bash
git add -A src
git commit -m "feat: score stored leagues on stored records; show last update and a commissioner refresh

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Daily cron, docs and smoke test

**Files:**
- Create: `src/app/api/cron/refresh-records/route.ts`
- Modify: `vercel.json`
- Modify: `scripts/smoke.sh`
- Modify: `CLAUDE.md`, and `README.md` if it documents env vars

**Interfaces:**
- Consumes: `seasonsInUse`, `refreshSeasonRecords` (Task 3); `seasonEndYear` (Task 2); `recordSource` (Task 4); `getDb`.

- [ ] **Step 1: Cron route.** Create `src/app/api/cron/refresh-records/route.ts`:

```ts
import { timingSafeEqual } from "node:crypto";
import { refreshSeasonRecords, seasonsInUse } from "@/db/records";
import { seasonEndYear } from "@/lib/records/season";
import { getDb } from "@/server/db";
import { recordSource } from "@/server/records";

function authorized(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Daily (vercel.json): refresh records for every season a stored league plays in. Vercel sends CRON_SECRET. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET is not set." }, { status: 503 });
  if (!authorized(request.headers.get("authorization"), secret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = await getDb();
  const results: { season: string; ok: boolean; message?: string }[] = [];
  for (const label of await seasonsInUse(db)) {
    const season = seasonEndYear(label);
    if (season === null) {
      results.push({ season: label, ok: false, message: "Unrecognized season label." });
      continue;
    }
    const outcome = await refreshSeasonRecords(db, season, recordSource, { force: true });
    results.push(outcome.ok ? { season: label, ok: true } : { season: label, ok: false, message: outcome.message });
  }
  return Response.json({ results }, { status: results.every((result) => result.ok) ? 200 : 502 });
}
```

- [ ] **Step 2: Schedule.** `vercel.json` gains:

```json
  "crons": [{ "path": "/api/cron/refresh-records", "schedule": "0 10 * * *" }]
```

(10:00 UTC — after the last West Coast game is final.)

- [ ] **Step 3: Smoke test.** In `scripts/smoke.sh`, after the league is created and a second browser (`ben`) has claimed a seat, add:

```bash
call ana POST "/api/leagues/$LEAGUE/records/refresh"
check "commissioner refreshes records" 200 '"records"'
call ben POST "/api/leagues/$LEAGUE/records/refresh"
check "another seat can't refresh records" 403
call ana POST "/api/leagues/demo/records/refresh"
check "demo records are read-only" 403
call ana GET "/api/cron/refresh-records"
check "cron needs its secret" 401
```

Read the script first to find the right spot and jar names. The cron check expects 401 when `CRON_SECRET` is set and 503 when not: make it `check … "$([ -n "${CRON_SECRET:-}" ] && echo 401 || echo 503)"` — or simpler, drop the cron check if it complicates the script. Run the smoke against a dev server started with `RECORD_SOURCE=static` (so it doesn't hit ESPN) and confirm all PASS.

- [ ] **Step 4: Docs.** In `CLAUDE.md`:
  - Architecture, `src/config/`: add `RECORDS` (records source, refresh cooldown, fetch timeout).
  - `src/lib/`: add "team records (`records/`: ESPN parsing and checks)", and note `src/lib/feed-error.ts`.
  - `src/server/`: add "outside feeds (`feed.ts`), record source (`records.ts`)".
  - Domain rules: "Team records come from ESPN's standings JSON (`RECORD_SOURCE=static` uses the mock records), stored per season (end year) and team in `team_records`; every stored league in a season shares them. A refresh saves all 30 or nothing and never lets games played go down. The commissioner refreshes from the Overview; `/api/cron/refresh-records` runs daily at 10:00 UTC with `CRON_SECRET`. The demo league keeps its mock records in code. `prevWins` is still mock."
  - Commands: `RECORD_SOURCE=static npm run dev` for offline work.
  Add `CRON_SECRET` and `RECORD_SOURCE` wherever env vars are documented (README or CLAUDE.md "State and identity").

- [ ] **Step 5: Verify.** `npm test && npm run lint && npm run typecheck && npm run build`.

- [ ] **Step 6: Commit.**

```bash
git add -A src vercel.json scripts/smoke.sh CLAUDE.md README.md
git commit -m "feat: refresh team records daily by cron; document records and smoke-test the refresh

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
