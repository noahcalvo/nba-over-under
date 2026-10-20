# NBA Schedule & Game Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Player-level `/nba` schedule and `/nba/games/{id}` pages: ESPN fixtures, standings with form, DraftKings
moneylines as vig-free win chances, and every pick, fade and challenge side the browser's session holds on a game.

**Architecture:** Pure parsers and models in `src/lib/nba-schedule/` (unit tested on captured ESPN payloads); per-instance
cached ESPN reads and session-scoped loaders in `src/server/`; server-rendered pages under `src/app/nba/` in their own
`NbaShell`. Every time is Central and formatted on the server, and tabs are links, so the pages need no client state.

**Tech Stack:** Next.js 16.4 App Router (Cache Components), React 19, TypeScript strict, Tailwind v4 tokens, Vitest 4.1,
Drizzle (read-only use), lucide-react.

**Spec:** `docs/superpowers/specs/2026-10-19-nba-schedule-game-detail-design.md` (read it with this plan).

## Global Constraints

- Season is `NBA_SCHEDULE.season` (= `LINES.season`, "2026–27"); season year via `seasonEndYear` (2027).
- One time zone: `America/Chicago`, labelled `CT`, everywhere (game days, Today, tip-offs, read times). No client
  time-zone code.
- Odds: only `moneyline.{away,home}.close.odds` of the first odds entry; never read spread, total or `open`. Show odds
  only when `status === "scheduled"`. Credit "{book} via ESPN · read {time} CT".
- Win chance: vig removed (`q / (qa + qh)`), whole percentages by largest remainder, always summing to 100. Tooltip copy:
  "Estimated win chance from both moneylines, with sportsbook margin removed."
- Only `draft.picks` (retained) and fades on them; never `voidedPicks`. Only the viewer's own challenge entry.
- No league, player or seat id in any URL. Identity only through `getSession()` (the existing `courtline_session`
  cookie). Pages pass rendered data only; never sessions, tokens or links.
- Never call `prepareChallenge` from NBA code (no schedule sync, no freeze, no FanDuel read).
- Over = lime `SidePill`, Under = purple; "You" = accent left border + "You" text badge, never colour alone.
- Forbidden on these pages: spreads, game totals, the word "seed", invented odds/rankings/freshness, synthetic fixtures.
- Copy (exact): empty day "No regular-season games on {Wed, Oct 21}."; "Next game day: {Thu, Oct 22} →"; "Odds
  unavailable"; "Odds closed at tip-off"; "The draft hasn't started."; "No one in this league has drafted either team's
  Over or Under."; "Join or create a league to see who's on this game."; "Form unavailable"; "Recent games unavailable";
  "Couldn't load this game".
- Tunable numbers live only in `src/config/schedule.ts`.
- Before claiming done: `npm test && npm run lint && npm run typecheck && npm run build`.

**Plan refinements of the spec** (decided while planning):
1. An event whose competitors don't both resolve to our 30 teams is **skipped**, not a feed error, so an exhibition can't
   blank a whole day. Structural problems still throw `FeedError`.
2. `interest.ts` reads `draft.picks` and `fades` directly instead of calling `teamOwnership()`: that needs records and
   computes scores these pages never show.
3. Time formatters are `formatTimeCT`, `formatGameDayShort`, `formatGameDayLong` (the spec's `formatGameDate` name is
   already taken by an Eastern formatter in `format.ts`).
4. Games / Standings and West / East switch through links (`?view=`, `?conf=`) styled like `SegmentedControl`
   (`LinkTabs`), so the pages stay server components.
5. League nav items gain a `group` field instead of returning `{ primary, secondary }`, which keeps the existing call sites.
6. `FeedError` gains an optional HTTP `status`, so an ESPN 404 for an unknown event becomes a page 404.

## Review Focus

1. **An exhibition or All-Star event on a regular-season date** (teams outside our 30): the day still renders its other
   games. Test in Task 3.
2. **A hand-edited `?date=`** (`2026-02-30`, `banana`, `1999-01-01`): garbage falls back to today; a valid
   out-of-season date shows the empty day, not an error. Tests in Tasks 1 and 9.
3. **`/nba/games/abc` or a stale id from last season**: 404 with no crash; non-numeric ids never reach ESPN. Test in
   Task 3, browser check in Task 10.
4. **A league mid-draft (live or paused)**: rows for the picks made so far, against the frozen lines; no fades yet. Test
   in Task 5.
5. **Quotes ESPN marks "EVEN", or with one side missing or suspended**: "EVEN" reads as +100; a missing side gives
   "Odds unavailable", never a one-sided percentage. Tests in Task 2.

---

### Task 1: Config, game days and Central time formatting  *(haiku)*

**Files:**
- Create: `src/config/schedule.ts`, `src/lib/nba-schedule/game-day.ts`, `src/lib/nba-schedule/game-day.test.ts`
- Modify: `src/lib/format.ts`, `src/lib/format.test.ts`

**Interfaces:**
- Produces:
  - `NBA_SCHEDULE` = `{ season: LINES.season, source: "ESPN", fetchTimeoutMs: 8000, timeZone: "America/Chicago",
    timeZoneLabel: "CT", currentDayCacheSeconds: 60, otherDayCacheSeconds: 900, summaryCacheSeconds: 60,
    retrySeconds: 30, formGames: 5, hotWins: 4, coldWins: 1, dateStripDays: 5 } as const`, each with a one-line doc
    comment like `src/config/records.ts`.
  - `game-day.ts`: `gameDayOf(iso: string): string`, `todayGameDay(now: Date): string`,
    `shiftGameDay(day: string, n: number): string`, `daysBetween(a: string, b: string): number` (b − a),
    `isGameDay(value: unknown): value is string`, `espnDate(day: string): string`,
    `dateStrip(day: string, n: number): string[]`. Days are `YYYY-MM-DD`.
  - `format.ts`: `formatTimeCT(iso: string): string`, `formatGameDayShort(day: string): string`,
    `formatGameDayLong(day: string): string`.

- [ ] **Step 1: Write the failing tests**

```ts
// game-day.test.ts
expect(gameDayOf("2026-10-21T01:30Z")).toBe("2026-10-20"); // 8:30 PM CDT
expect(gameDayOf("2026-10-20T04:59Z")).toBe("2026-10-19"); // 11:59 PM CDT
expect(gameDayOf("2026-11-02T05:30Z")).toBe("2026-11-01"); // 11:30 PM CST, after DST ends
expect(todayGameDay(new Date("2026-10-20T03:00Z"))).toBe("2026-10-19");
expect(shiftGameDay("2026-10-31", 1)).toBe("2026-11-01");
expect(shiftGameDay("2026-03-01", -1)).toBe("2026-02-28");
expect(daysBetween("2026-10-19", "2026-10-21")).toBe(2);
expect(isGameDay("2026-10-21")).toBe(true);
for (const bad of ["2026-02-30", "2026-10-1", "banana", "", null, 20261021]) expect(isGameDay(bad)).toBe(false);
expect(espnDate("2026-10-21")).toBe("20261021");
expect(dateStrip("2026-10-21", 5)).toEqual(["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"]);
// format.test.ts
expect(formatTimeCT("2026-10-21T00:00Z")).toBe("7:00 PM CT");
expect(formatTimeCT("2026-12-25T17:00Z")).toBe("11:00 AM CT");
expect(formatGameDayShort("2026-10-21")).toBe("Wed, Oct 21");
expect(formatGameDayLong("2026-10-21")).toBe("Wednesday, Oct 21, 2026");
```

- [ ] **Step 2: Run `npx vitest run src/lib/nba-schedule/game-day.test.ts src/lib/format.test.ts`**: FAIL (missing modules/exports).
- [ ] **Step 3: Implement.** `gameDayOf` and `formatTimeCT` use `Intl.DateTimeFormat` with `NBA_SCHEDULE.timeZone`,
  built from `formatToParts` like `formatDateTimeET` (no U+202F). Day arithmetic is UTC-based on `${day}T12:00:00Z`.
  `isGameDay` checks the regex and that the date round-trips.
- [ ] **Step 4: Re-run**: PASS.
- [ ] **Step 5: Commit** `feat: NBA schedule config, Central game days and time formatting`.

---

### Task 2: Moneyline odds and win chances  *(haiku)*

**Files:** Create `src/lib/nba-schedule/odds.ts`, `src/lib/nba-schedule/odds.test.ts`, `src/lib/nba-schedule/types.ts`

**Interfaces:**
- Produces in `types.ts` (exactly as the spec's `types.ts` section): `GameStatus`, `NbaGameSide`, `GameOdds`,
  `NbaGame`, `GameDay`, `ScheduleRead`, `GameRead`. Plus `GameTeams = { awayId: TeamId; homeId: TeamId }`.
- Produces in `odds.ts`:
  - `parseAmerican(value: unknown): number | null` — `"+120"`, `"-142"`, `"EVEN"` (→ 100) or an integer number;
    |value| ≥ 100; anything else null.
  - `rawProbability(american: number): number` — throws `Error("Invalid moneyline")` on non-finite or |value| < 100.
  - `winChances(odds: Pick<GameOdds, "away" | "home">): { away: number; home: number }`.
  - `favorite(chances: { away: number; home: number }): "away" | "home" | null` (null when equal).
  - `oddsState(game: Pick<NbaGame, "status" | "odds">): "open" | "unavailable" | "closed" | "none"`.
  - `formatAmerican(n: number): string` — `"+130"`, `"−155"` (U+2212).

- [ ] **Step 1: Write the failing tests**

```ts
expect(winChances({ away: 110, home: 110 })).toEqual({ away: 50, home: 50 });
expect(winChances({ away: 130, home: -155 })).toEqual({ away: 42, home: 58 });
expect(winChances({ away: 100, home: 100 })).toEqual({ away: 50, home: 50 });
for (let a = -1000; a <= 1000; a += 7) for (const h of [-450, -110, 105, 300])
  if (Math.abs(a) >= 100) { const c = winChances({ away: a, home: h }); expect(c.away + c.home).toBe(100); }
expect(rawProbability(-150)).toBeCloseTo(0.6);
expect(() => rawProbability(0)).toThrow("Invalid moneyline");
expect(() => rawProbability(Number.NaN)).toThrow();
expect(parseAmerican("+120")).toBe(120); expect(parseAmerican("-142")).toBe(-142);
expect(parseAmerican("EVEN")).toBe(100); expect(parseAmerican(-110)).toBe(-110);
for (const bad of ["-99", "", "OFF", "1.5", 5.5, null, undefined]) expect(parseAmerican(bad)).toBeNull();
const odds = { book: "DraftKings", away: 130, home: -155 };
expect(oddsState({ status: "scheduled", odds })).toBe("open");
expect(oddsState({ status: "scheduled", odds: null })).toBe("unavailable");
expect(oddsState({ status: "live", odds })).toBe("closed");
expect(oddsState({ status: "final", odds })).toBe("closed");
expect(oddsState({ status: "postponed", odds })).toBe("none");
expect(oddsState({ status: "canceled", odds: null })).toBe("none");
expect(favorite({ away: 42, home: 58 })).toBe("home"); expect(favorite({ away: 50, home: 50 })).toBeNull();
expect(formatAmerican(130)).toBe("+130"); expect(formatAmerican(-155)).toBe("−155");
```

- [ ] **Step 2: Run `npx vitest run src/lib/nba-schedule/odds.test.ts`**: FAIL.
- [ ] **Step 3: Implement.** Rounding: floor both shares ×100, give the remaining point to the larger remainder; on equal
  remainders to home.
- [ ] **Step 4: Re-run**: PASS.
- [ ] **Step 5: Commit** `feat: moneyline win chances with the margin removed`.

---

### Task 3: ESPN scoreboard and summary parsers  *(sonnet)*

**Files:**
- Create: `src/lib/nba-schedule/espn.ts`, `src/lib/nba-schedule/espn.test.ts`, fixtures
  `src/lib/nba-schedule/espn-scoreboard-20261020.fixture.json`, `…-20261021.fixture.json`, `…-20260315.fixture.json`,
  `…-20261012.fixture.json`, `espn-summary-401909834.fixture.json` (pre-game), `espn-summary-401810831.fixture.json` (final)

**Interfaces:**
- Consumes: Task 1 `gameDayOf`, `espnDate`; Task 2 types, `parseAmerican`; `teamIdByNickname` (`src/data/teams.ts`);
  `FeedError`.
- Produces:
  - `espnScoreboardUrl(day: string): string` → `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=YYYYMMDD`
  - `espnSummaryUrl(id: string): string` → `…/nba/summary?event={id}`
  - `isGameId(value: string): boolean` (`/^\d{1,12}$/`)
  - `parseScoreboard(payload: unknown, season: number, day: string, resolveTeam: (name: string) => TeamId | null): GameDay`
  - `parseSummary(payload: unknown, season: number, resolveTeam): NbaGame | null` (null = not this season's regular
    season, or the Cup final → page 404)

- [ ] **Step 1: Capture fixtures.** Copy the 2026-10-19 captures from
  `/private/tmp/claude-501/-Users-noah-Desktop-projects-nba-over-under-draft--claude-worktrees-courtline-nba-game-detail-82ca75/fe0854fe-5d05-4d7d-9793-a4f23de61cad/scratchpad/espn/`
  (`sb-today.json` → 20261020, `sb-1021.json`, `sb-past.json` → 20260315, `sum.json` → 401909834, `sum-past.json` →
  401810831) and fetch `scoreboard?dates=20261012` with `curl --compressed`. Trim with a throwaway node script that
  recursively deletes the keys `links`, `logos`, `logo`, `headlines`, `tickets`, `highlights`, `leaders`, `geoBroadcasts`,
  `footer`, `header` *inside odds objects only*, and, in summaries, keeps only `header`, `gameInfo`, `pickcenter`. Keep
  each fixture under 60 KB and commit no script.
- [ ] **Step 2: Write the failing tests** (`resolve = teamIdByNickname`)

```ts
const oct21 = parseScoreboard(fixture21, 2027, "2026-10-21", resolve);
expect(oct21.games).toHaveLength(11);
expect(oct21.games[0]).toMatchObject({ id: "401909834", tipoff: "2026-10-21T23:00Z", gameDay: "2026-10-21",
  status: "scheduled", away: { teamId: "ATL", score: null, winner: false }, home: { teamId: "ORL", score: null },
  venue: "Kia Center", odds: { book: "DraftKings", away: 120, home: -142 } });
const oct20 = parseScoreboard(fixture20, 2027, "2026-10-20", resolve);
expect(oct20.games.map((g) => [g.id, g.gameDay])).toContainEqual(["401909090", "2026-10-20"]); // 01:30Z = 8:30 PM CT
const march = parseScoreboard(fixture0315, 2026, "2026-03-15", resolve);
expect(march.games.find((g) => g.id === "401810831")).toMatchObject({ status: "final", statusDetail: "Final",
  away: { teamId: "MIN", score: 103, winner: false }, home: { teamId: "OKC", score: 116, winner: true }, odds: null });
expect(parseScoreboard(fixture0315, 2027, "2026-03-15", resolve).games).toEqual([]);   // other season
expect(parseScoreboard(fixture1012, 2027, "2026-10-12", resolve).games).toEqual([]);   // preseason
expect(parseSummary(summaryPre, 2027, resolve)).toMatchObject({ id: "401909834", venue: "Kia Center",
  odds: { book: "DraftKings", away: 120, home: -142 } });
expect(parseSummary(summaryFinal, 2027, resolve)).toBeNull();
expect(parseSummary(summaryFinal, 2026, resolve)).toMatchObject({ status: "final", home: { score: 116, winner: true } });
```

  Synthetic cases (clone `fixture21`, edit one event): `STATUS_IN_PROGRESS`/state `in` → `live` with scores and
  `statusDetail` from `shortDetail`; `STATUS_HALFTIME` → live; `STATUS_POSTPONED` → postponed, scores null;
  `STATUS_CANCELED` → canceled; competition type `CC` → dropped; a competitor named "Team Stephen" → that event skipped,
  the other 10 kept (Review Focus 1); odds with `home.close` missing → `odds: null`, game kept; final with two winners →
  `FeedError`; `events` not an array → `FeedError`; unknown status state → `FeedError`. Games sort by tip-off then id.
  `isGameId("401909834")` true; `"abc"`, `""`, `"1".repeat(13)` false (Review Focus 3).
- [ ] **Step 3: Run `npx vitest run src/lib/nba-schedule/espn.test.ts`**: FAIL.
- [ ] **Step 4: Implement** following `src/lib/game-log/espn.ts` conventions (`isObject`, `problem()` → FeedError
  "ESPN scoreboard … ."). One `normalizeCompetition(event-ish, competition, extras)` shared by both parsers. Season:
  scoreboard `event.season`, summary `header.season`. Venue: scoreboard `competition.venue.fullName`, summary
  `gameInfo.venue.fullName`. Broadcasts: scoreboard `broadcasts[].names[]`, summary header
  `competitions[0].broadcasts[].media.shortName`; de-duplicated. Odds: scoreboard `competition.odds[0]`, summary
  `pickcenter[0]`.
- [ ] **Step 5: Re-run**: PASS.
- [ ] **Step 6: Commit** `feat: ESPN scoreboard and game summary parsers`.

---

### Task 4: Form, heat, conference table, next game day  *(haiku)*

**Files:** Create `src/lib/nba-schedule/form.ts`, `src/lib/nba-schedule/form.test.ts`

**Interfaces:**
- Consumes: `GameLog`, `Game` (`src/lib/game-log/types.ts`), `TeamInfo`, `Conference`; Task 1 `gameDayOf`; `NBA_SCHEDULE`.
- Produces:
  - `recentResults(log: GameLog, n: number): Game[]` (completed games, newest last)
  - `heat(results: readonly Game[]): "hot" | "cold" | null`; `heatLabel(results): string | null` ("Hot: 4 wins in last 5",
    "Cold: 1 win in last 5")
  - `ConferenceRow { rank: number; team: TeamInfo; wins: number; losses: number; pct: number | null }`
  - `conferenceTable(teams: readonly TeamInfo[], conference: Conference): ConferenceRow[]`
  - `conferencePosition(teams, teamId): { rank: number; conference: Conference } | null` (null before any game)
  - `nextGameDay(logs: readonly GameLog[], afterDay: string): string | null`
  - `formatPct(pct: number | null): string` (".750", "1.000", "—")

- [ ] **Step 1: Write the failing tests**: `recentResults` skips unplayed and returns the last 5 played in game order;
  `heat` null with 4 results; WWWWL → hot; WWWLL → null; WLLLL → cold; LLLLL → cold; labels as above (singular "win").
  `conferenceTable`: 15 West rows from `TEAM_INFO` with records overridden; order by pct desc, then wins desc, then
  `${city} ${name}`; a 0–0 team sorts after every team with games and has `pct: null`; all 0–0 → alphabetical with every
  `pct` null; ranks 1..15. `formatPct(0.75)` ".750", `formatPct(1)` "1.000", `formatPct(null)` "—". `nextGameDay` returns
  the earliest Central day strictly after `afterDay` across logs (undated mock games ignored) and null past the last.
- [ ] **Step 2: Run** `npx vitest run src/lib/nba-schedule/form.test.ts`: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Re-run**: PASS.
- [ ] **Step 5: Commit** `feat: last-5 form, hot and cold, conference table`.

---

### Task 5: Who's on this game (leagues and challenge)  *(sonnet)*

**Files:** Create `src/lib/nba-schedule/interest.ts`, `src/lib/nba-schedule/interest.test.ts`

**Interfaces:**
- Consumes: `League`, `Manager`, `Side`, `TeamId` (`src/lib/types.ts`), `findManager`, `managerLabel`
  (`src/lib/league/managers.ts`), `ChallengeEntry`, `FrozenLines` (`src/lib/challenge/types.ts`), Task 2 `GameTeams`.
- Produces:

```ts
export interface InterestLeague { league: League; viewerId: string }
export interface InterestRow { kind: "pick" | "fade"; manager: Manager; teamId: TeamId; side: Side; line: number;
  rootingFor: TeamId; isViewer: boolean; /** The faded pick's manager; null for picks. */ targetManager: Manager | null }
export interface LeagueInterest { leagueId: string; leagueName: string; state: "not_started" | "none" | "rows"; rows: InterestRow[] }
export interface ChallengeStakeInput { entry: ChallengeEntry; frozen: FrozenLines | null }
export interface ChallengeRow { teamId: TeamId; side: Side; line: number | null;
  lineKind: "frozen" | "at_pick" | "unavailable"; rootingFor: TeamId }
export interface ChallengeInterest { entryName: string; rows: ChallengeRow[] }
export interface YourStake { source: { kind: "league"; leagueId: string; leagueName: string } | { kind: "challenge" };
  kind: "pick" | "fade" | "challenge"; teamId: TeamId; side: Side; line: number | null; rootingFor: TeamId;
  targetManager: Manager | null }
export interface InterestSummary { managers: { leagueId: string; manager: Manager }[]; count: number; viewerInvolved: boolean }

export function leagueInterests(leagues: readonly InterestLeague[], game: GameTeams): LeagueInterest[];
export function challengeInterest(stake: ChallengeStakeInput | null, season: number, game: GameTeams): ChallengeInterest | null;
export function yourStakes(leagues: readonly LeagueInterest[], challenge: ChallengeInterest | null): YourStake[];
export function rootingSplit(leagues: readonly LeagueInterest[], challenge: ChallengeInterest | null, game: GameTeams): Record<TeamId, number>;
export function interestSummary(leagues: readonly LeagueInterest[], challenge: ChallengeInterest | null): InterestSummary;
```

  A fade row's `teamId`/`side`/`line` describe the faded pick; `manager` is the fader. Rows in a league: picks before
  fades, then away team first, then manager seat. Leagues keep input order. `interestSummary.managers` is distinct per
  league and manager, in row order; `count` = league rows + challenge rows; `viewerInvolved` = any viewer row or any
  challenge row.

- [ ] **Step 1: Write the failing tests** with a local `league(overrides)` builder (4 managers m1–m4 named Alex, Blake,
  Casey, open seat m4; `lines.values` SAS 40.5, MIN 49.5; status `fades`). Game `{ awayId: "SAS", homeId: "MIN" }`.
  - m1 Over SAS → roots SAS; m2 Under SAS → roots MIN; m3 Over MIN → roots MIN; m4 (open seat) Under MIN → roots SAS,
    manager label "Manager 4".
  - Fades: m2 fades m1's SAS Over → roots MIN, `targetManager` m1; m3 fades m2's SAS Under → roots SAS; m1 and m4 both
    fade m3's MIN Over → two rows, both root SAS.
  - A pick of another team, and a fade on it, never appear; a `voidedPicks` entry for SAS never appears.
  - `status: "not_started"`, `lines: null` → `state: "not_started"`, no rows.
  - Status `live` with two SAS picks and no fades → `state: "rows"`, two rows, lines 40.5 (Review Focus 4).
  - No pick on either team → `state: "none"`.
  - `isViewer` true only for the `viewerId`'s rows (as picker or fader, not as the faded target).
  - Two leagues where the viewer holds SAS Over in one and SAS Under in the other → both rows in `yourStakes`, rooting
    opposite ways; nothing merged.
  - `challengeInterest`: entry picks SAS Over (lineAtPick 41.5) and MIN Under (lineAtPick null); with `frozen` null →
    lines 41.5 `at_pick` and null `unavailable`; with frozen `{ SAS: 40.5, MIN: 48.5 }` → both `frozen`; MIN in
    `frozen.missing` → `unavailable`; entry `season` 2026 with season 2027 → null; null stake → null.
  - `rootingSplit` counts every league row and challenge row per team; `interestSummary` counts and de-duplicates as
    specified.
- [ ] **Step 2: Run** `npx vitest run src/lib/nba-schedule/interest.test.ts`: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Re-run**: PASS.
- [ ] **Step 5: Commit** `feat: who's on a game across leagues and the challenge`.

---

### Task 6: Cached ESPN reads and session loaders  *(sonnet)*

**Files:**
- Create: `src/lib/feed-cache.ts`, `src/lib/feed-cache.test.ts`, `src/server/nba-schedule.ts`, `src/server/game-interest.ts`
- Modify: `src/lib/feed-error.ts` (optional `status`), `src/server/feed.ts` (pass the HTTP status), `src/server/feed.test.ts`

**Interfaces:**
- Consumes: Tasks 1–5; `fetchFeedJson`; `gameLogSource`/`readGameLog`; `listViewerLeagues`, `findLeague`
  (`src/server/league.ts`); `getViewerEntry` (`src/server/challenge.ts`); `loadChallengeSeason` (`src/db/challenge.ts`);
  `getDb`; `CHALLENGE`.
- Produces:
  - `FeedError` constructor `(message: string, options?: { status?: number })`, readonly `status: number | null`.
  - `keyedCache<T>(read: (key: string) => Promise<T>, options: { ttlMs: (key: string) => number; retryMs: number;
    now?: () => number }): (key: string) => Promise<{ value: T; readAt: number }>` (same success/failure/in-flight
    semantics as `cachedGameLogSource`; `readAt` = when the successful read finished).
  - `src/server/nba-schedule.ts` (`import "server-only"`):
    `readGameDay(day: string): Promise<ScheduleRead>`; `readGame(id: string): Promise<GameRead>` (`notFound` for a
    `FeedError` with status 404, or `parseSummary` → null; never fetches when `!isGameId(id)`);
    `readTeamForms(teamIds?: readonly TeamId[]): Promise<TeamForms>` where
    `TeamForms = { logs: Partial<Record<TeamId, GameLog>>; error: string | null }` (all 30 by default; `error` = the
    first failure's message; logs that did read are kept). The scoreboard TTL is `currentDayCacheSeconds` when
    `|daysBetween(today, day)| ≤ 1`, else `otherDayCacheSeconds`. Neither read rejects; non-`FeedError`s are logged and
    replaced with "Games couldn't be read." / "This game couldn't be read.".
  - `src/server/game-interest.ts` (`import "server-only"`): `loadPlayerStakes = cache(async (): Promise<PlayerStakes>)`
    where `PlayerStakes = { leagues: InterestLeague[]; challenge: ChallengeStakeInput | null; seated: { id: string;
    name: string }[] }`: seated leagues filtered to `seasonLabel === NBA_SCHEDULE.season`, each loaded via `findLeague`
    (a failed or missing load is skipped and logged), `viewerId` = the seat's manager id; challenge = `getViewerEntry` +
    `loadChallengeSeason(db, CHALLENGE.seasonYear)` only when `CHALLENGE.seasonYear === seasonEndYear(NBA_SCHEDULE.season)`,
    and a failure there leaves `challenge: null`. No session → all empty, without touching the database.

- [ ] **Step 1: Write the failing tests**: `feed-cache.test.ts` mirrors `src/lib/game-log/cache.test.ts` (reuse within
  TTL, per-key TTL from `ttlMs(key)`, failure reused for `retryMs`, concurrent callers share one read, `readAt` from the
  injected clock). `feed.test.ts`: a 404 response throws `FeedError` with `status` 404.
- [ ] **Step 2: Run** `npx vitest run src/lib/feed-cache.test.ts src/server/feed.test.ts`: FAIL.
- [ ] **Step 3: Implement** the three modules. `readGameDay` builds `ScheduleRead.readAt` as an ISO string.
- [ ] **Step 4: Re-run the tests**: PASS; `npm run typecheck` clean.
- [ ] **Step 5: Commit** `feat: cached ESPN game reads and the viewer's stakes`.

---

### Task 7: League nav item and home link  *(haiku)*

**Files:** Modify `src/components/shell/nav-items.ts`, `nav-items.test.ts`, `SidebarNav.tsx`, `BottomNav.tsx`, `src/app/page.tsx`

**Interfaces:**
- Produces: `NavItem` gains `group: "league" | "more"` and `clock?: true`. `navItems(leagueId)` order: Overview,
  Rosters, Settings (`league`); Draft room (`more`, `clock: true`); NBA schedule (`more`: `href: "/nba"`,
  `label: "NBA schedule"`, `shortLabel: "NBA"`, `icon: CalendarDays`, `ready: true`, `exact: false`) except for
  `DEMO_LEAGUE_ID`.

- [ ] **Step 1: Write the failing tests** (keep the existing three):

```ts
expect(navItems("abc234").map((i) => i.label)).toEqual(["League overview", "Rosters", "League settings", "Draft room", "NBA schedule"]);
expect(navItems("abc234").filter((i) => i.group === "more").map((i) => i.href)).toEqual(["/l/abc234/draft", "/nba"]);
expect(navItems(DEMO_LEAGUE_ID).some((i) => i.href === "/nba")).toBe(false);
expect(isActive(navItems("abc234")[4], "/l/abc234")).toBe(false);
```

- [ ] **Step 2: Run** `npx vitest run src/components/shell/nav-items.test.ts`: FAIL.
- [ ] **Step 3: Implement.** Sidebar: `league` items, `<hr>`, `more` items; the Clock trailing icon goes on `clock`
  items. Bottom nav: `grid-cols-4` / `grid-cols-5` chosen from `items.length` (literal class names). Home page: a
  "NBA schedule" `Panel` after the 30/30 Challenge panel with one line of copy ("Tonight's games, standings, and who in
  your leagues is rooting for whom.") and a link to `/nba`.
- [ ] **Step 4: Re-run**: PASS.
- [ ] **Step 5: Commit** `feat: NBA schedule link in the league nav and on the home page`.

---

### Task 8: NBA shell, routes and fallbacks  *(sonnet)*

**Files:**
- Create: `src/components/nba/nav-items.ts`, `src/components/nba/nav-items.test.ts`, `src/components/nba/NbaNav.tsx`,
  `src/components/nba/NbaShell.tsx`, `src/components/nba/YourLeagues.tsx`, `src/components/nba/LinkTabs.tsx`,
  `src/app/nba/layout.tsx`, `src/app/nba/page.tsx`, `src/app/nba/games/[gameId]/page.tsx`

**Interfaces:**
- Consumes: `listViewerLeagues` (`src/server/league.ts`) for the shell's league list (every season).
- Produces:
  - `nbaNavItems(): NbaNavItem[]` — Home `/` (exact), NBA schedule `/nba` (active on `/nba` and `/nba/games/*`),
    30/30 Challenge `/challenge` (exact: false); `isNbaNavActive(item, pathname)`.
  - `NbaShell({ children })` modelled on `ChallengeShell` (season pill "{NBA_SCHEDULE.season} NBA season"), sidebar nav
    in Suspense like `ChallengeSidebarNav`, then `<Suspense fallback={null}><YourLeagues /></Suspense>` (links to
    `/l/{id}`, hidden when empty), bottom tab bar with three columns (Home / Schedule / Challenge).
  - `LinkTabs({ ariaLabel, options: { label: string; href: string; active: boolean }[] })` — server component with the
    `SegmentedControl` look; links carry `aria-current="page"` when active.
  - Route files: `page.tsx` reads `searchParams` (`date`, `view`, `conf`) and renders
    `<Suspense fallback={<PageFallback label="Loading the schedule" />}>`; the game route the same with
    "Loading the game". Both export `unstable_dynamicStaleTime = 60` and `metadata` titles "NBA schedule" / "NBA game".
    Until Tasks 9–10, the inner component renders the page title only.

- [ ] **Step 1: Write the failing tests**: `isNbaNavActive` lights NBA schedule on `/nba` and `/nba/games/401909834`,
  not on `/`; Home only on `/`; Challenge on `/challenge/leaderboard`.
- [ ] **Step 2: Run** `npx vitest run src/components/nba/nav-items.test.ts`: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Re-run**: PASS; then `npm run build`: compiles with `/nba` and `/nba/games/[gameId]` listed.
- [ ] **Step 5: Commit** `feat: NBA shell and routes`.

---

### Task 9: Schedule page  *(sonnet)*

**Files:**
- Create: `src/lib/nba-schedule/params.ts`, `src/lib/nba-schedule/params.test.ts`, `src/server/nba-pages.ts`,
  `src/components/nba/SchedulePage.tsx`, `DateStrip.tsx`, `GamesPanel.tsx`,
  `GameRow.tsx`, `StandingsPanel.tsx`, `FormChips.tsx`, `HeatBadge.tsx`, `InterestAvatars.tsx`, `OddsPair.tsx`
- Modify: `src/app/nba/page.tsx`

**Interfaces:**
- Consumes: Tasks 1–8; `loadTeamInfo(db, { isDemo: false, seasonLabel: NBA_SCHEDULE.season })`; `TeamLogo`, `Panel`,
  `Badge`, `Alert`, `ManagerAvatar`, `PageHeader`.
- Produces:
  - `params.ts`: `resolveScheduleParams(params: { date?: string; view?: string; conf?: string }, now: Date): { day: string;
    view: "games" | "standings"; conference: Conference }` — invalid date → `todayGameDay(now)`; `conf=east` → East,
    else West; `view=standings` → standings, else games. Tested: `"banana"` → today, `"2026-02-30"` → today,
    `"1999-01-01"` kept (Review Focus 2).
  - `nba-pages.ts`:
  - `loadSchedulePage(params): Promise<SchedulePageData>` with
    `SchedulePageData = { day; today; strip: string[]; view; conference; teams: TeamInfo[];
    games: Promise<ScheduleGames>; forms: Promise<TeamForms> }` and
    `ScheduleGames = { read: ScheduleRead; summaries: Record<string, InterestSummary>; hasStakes: boolean }`
    (summaries built from `loadPlayerStakes` and Task 5 per game; `hasStakes` false when no leagues and no challenge).
- UI (spec "Schedule page"): `PageHeader` "NBA Schedule" + subtitle; `DateStrip` (prev/next arrow links with
  `aria-label` "Previous day"/"Next day", `dateStripDays` chips `formatGameDayShort`, Today link; selected chip
  `aria-current="date"`); `xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]` with both panels; below `xl` `LinkTabs`
  Games / Standings showing one panel. Links preserve the other params.
  - `GameRow`: one `<Link>` to `/nba/games/{id}?date={day}` around the row content with a visible focus ring; per team
    `TeamLogo` (size 28), name, record (`formatRecord`); time cell `formatTimeCT(tipoff)` / "Live · {statusDetail}" /
    "Final" with scores (winner bold) / `Badge` "Postponed" or "Canceled"; `OddsPair` when `oddsState === "open"`
    ("ORL −142 (57%)", favourite in `text-fog-50 font-semibold`, other `text-fog-300`), "Odds unavailable" text for
    `unavailable`; `InterestAvatars` (3 avatars + "+n", `aria-label` "{count} picks and fades in your leagues") when
    `hasStakes`; viewer rows: `border-l-2 border-accent` + `Badge tone="accent"` "You".
  - Empty day: copy from Global Constraints; "Next game day" link computed in a nested Suspense from `forms`
    (`nextGameDay`). Feed error: `Alert` with `read.error`.
  - `StandingsPanel`: `LinkTabs` West/East, table `#`, Team, W, L, PCT (`formatPct`), Last 5 (`FormChips`: five
    `W`/`L` chips with text, `bg-positive/15`/`bg-negative/15`), heat (`HeatBadge`: 🔥/❄️ `aria-hidden` + `sr-only`
    `heatLabel` + `title`). W–L render immediately; form cells stream (Suspense, fallback "—"); a forms error shows one
    "Form unavailable" note under the table. Table switches to compact rows by container width (`@container`), never
    page-level horizontal scroll.

- [ ] **Step 1: Write the failing test** `src/lib/nba-schedule/params.test.ts` (cases above).
- [ ] **Step 2: Run** `npx vitest run src/lib/nba-schedule/params.test.ts`: FAIL.
- [ ] **Step 3: Implement** `params.ts`, then the loader and components.
- [ ] **Step 4: Re-run**: PASS.
- [ ] **Step 5: Browser check** (preview_start "dev"; FanDuel isn't needed): `/nba` shows today (2026-10-19, no games →
  empty state with "Next game day: Tue, Oct 20 →"); `/nba?date=2026-10-21` shows 11 games with odds;
  `/nba?date=2026-10-21&view=standings&conf=east` at 375 px; no horizontal scroll at 375 and 1440
  (`document.documentElement.scrollWidth <= innerWidth`); keyboard Tab reaches strip, rows and tabs with visible focus.
- [ ] **Step 6: Commit** `feat: NBA schedule page with standings and form`.

---

### Task 10: Game page  *(sonnet)*

**Files:**
- Create: `src/components/nba/GamePage.tsx`, `GameHeader.tsx`, `OddsPanel.tsx`, `WhoIsOnPanel.tsx`, `YourStakes.tsx`,
  `LeagueInterestCard.tsx`, `ChallengeInterestCard.tsx`, `TeamContext.tsx`, `RecentGames.tsx`
- Modify: `src/server/nba-pages.ts`, `src/app/nba/games/[gameId]/page.tsx`

**Interfaces:**
- Consumes: Tasks 1–9.
- Produces in `nba-pages.ts`: `loadGamePage(id: string, dateParam: string | undefined): Promise<GamePageResult>` with
  `GamePageResult = { kind: "not_found" } | { kind: "error"; message: string; backDay: string } | { kind: "ok"; data:
  GamePageData }` and `GamePageData = { game: NbaGame; source: string; readAt: string; backDay: string;
  teams: TeamInfo[]; forms: Promise<TeamForms>; stakes: Promise<GameStakes> }`, `GameStakes = { leagues:
  LeagueInterest[]; challenge: ChallengeInterest | null; yours: YourStake[]; split: Record<TeamId, number>;
  seated: { id: string; name: string }[] }`. `backDay` = valid `dateParam` else `game.gameDay` (error case: valid
  `dateParam` else today). The route maps `not_found` → `notFound()`.
- UI (spec "Game page"):
  - Back link `← Back to schedule` → `/nba?date={backDay}`.
  - `GameHeader`: away left, "at", home right (logo 64, city, name, record); centre `formatGameDayLong`, `formatTimeCT`,
    status/score, venue, broadcasts joined by " · ", each only when present.
  - `OddsPanel` "Moneyline · win chance": two tiles `+120 (44%)`, favourite tile `border-accent`; `title` and an
    `Info` icon with the tooltip copy; footer "DraftKings via ESPN · read {formatTimeCT(readAt)}". Other `oddsState`s:
    the exact copy; `none` hides the panel.
  - `WhoIsOnPanel` (main column, `xl:col-span-2`): intro copy from the spec; `YourStakes` list when `yours` is non-empty;
    one `LeagueInterestCard` per league (`Trophy` icon, name linking `/l/{id}`, "{n} managers on this game", rows with
    `ManagerAvatar`, "You" badge when `isViewer`, `TeamLogo` + team name as `TeamLink`-style link to
    `/l/{id}/teams/{teamId}`, `SidePill`, `formatNumber(line)`, "Rooting for {name}"; fade rows "Fade" badge + "Fading
    {managerLabel(targetManager)}'s {name} {Over|Under} {line}"); empty states with the exact copy;
    `ChallengeInterestCard` after the leagues (entry name, rows with "Frozen line" / "Line when picked" / "Line
    unavailable", team links to `/challenge/teams/{teamId}`); no leagues and no challenge → the join prompt linking `/`.
  - `TeamContext` (side column): per team record, `conferencePosition` as "3rd in West" (`formatOrdinal`; hidden when
    null), `FormChips`, `HeatBadge`, "If the {name} win: {split[teamId]} interests", and one "{name} in {league} →" link
    per seated league. `RecentGames`: `LinkTabs`-free two lists (away then home), last 5 completed games: date
    (`formatGameDayShort(gameDayOf(date))`), "vs"/"@" opponent logo + id, W/L chip. Forms error → "Recent games
    unavailable".

- [ ] **Step 1: Implement** the loader and components, keeping each component under ~120 lines.
- [ ] **Step 2: Browser check**: `/nba/games/401909834` (ATL @ ORL, odds +120/−142 → 44%/56%), `/nba/games/401810831`
  → 404 (last season), `/nba/games/abc` → 404, `/nba/games/999999999` → 404; with no session the join prompt shows;
  then claim a seat in a local league with picks on ATL or ORL (create one via the home page, draft with
  `RECORD_SOURCE=static`) and confirm league rows, "You", fades and the challenge card (save a challenge entry locally
  with `CHALLENGE_MOCK_TIPOFF` set in the future). 375 px and 1440 px, no horizontal scroll. Delete `.data/pglite`
  afterwards if records were refreshed with static data.
- [ ] **Step 3: Commit** `feat: NBA game page with odds, stakes and team context`.

---

### Task 11: Docs and full verification  *(sonnet)*

**Files:** Modify `CLAUDE.md`

- [ ] **Step 1: Update CLAUDE.md**: specs list gains the new spec; `src/config/` gains `NBA_SCHEDULE` (`schedule.ts`);
  `src/lib/` gains `nba-schedule/` (ESPN scoreboard/summary parsing, odds, form, interests, game days) and
  `feed-cache.ts`; `src/server/` gains `nba-schedule.ts`, `game-interest.ts`, `nba-pages.ts`; `src/components/nba/`;
  a Domain rules bullet "NBA schedule (`/nba`, `/nba/games/{id}`)" summarising the spec's decisions 1–4, 10–13 in
  three or four lines; the dev note that the schedule always reads ESPN (no static mode) so offline it shows the feed
  error.
- [ ] **Step 2: Run** `npm test && npm run lint && npm run typecheck && npm run build`: all pass (paste the summary
  lines).
- [ ] **Step 3: Screenshots** of `/nba?date=2026-10-21` and `/nba/games/401909834` at 1440 px and 375 px, sent to the
  user.
- [ ] **Step 4: Commit** `docs: NBA schedule and game detail`.
