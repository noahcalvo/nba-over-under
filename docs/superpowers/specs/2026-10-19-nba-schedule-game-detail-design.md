# NBA Schedule & Game Detail — design

**Status:** approved design, 2026-10-19. Source brief: `courtline-nba-schedule-game-detail-spec.md` (the proposed
feature spec) and the approved dark desktop mockup. Where this document and the brief differ, this document wins; the
differences are listed under "Decisions taken".

## Goal

Give managers a Courtline-native place to see NBA games and records and understand **who benefits if a team wins
tonight** across their leagues. Two read-only screens inside the existing league shell:

1. **NBA schedule** (`/l/{leagueId}/nba/schedule`): one game day's regular-season games, plus conference standings
   with last-5 form.
2. **Game detail** (`/l/{leagueId}/nba/games/{gameId}`): one game, its pre-game moneylines with market-implied win
   chances, and every pick and fade on either team in the viewer's same-season leagues.

Courtline's competition stays full-season team wins. Nothing here changes scoring, drafting, fades, league state or the
guided demo. No spreads or game totals appear anywhere.

## Decisions taken

1. **Moneyline source: DraftKings odds embedded in ESPN's scoreboard and summary payloads**, keyed by the same ESPN
   event id as the game, so odds can never attach to the wrong fixture. Credited as "{provider} via ESPN" (provider name
   read from the payload) with Courtline's read time. FanDuel's NBA page also carries `MONEY_LINE` markets, but it has
   no ESPN id (fixture matching by teams and tip-off), mixes in virtual games ("Chicago Bulls (THOR)") and covers only
   about three days ahead; not used. Both feeds are unofficial and keyless with no published terms of use — the same
   posture the app already takes for records and season lines; accepted by the product owner.
2. **Odds are shown pre-game only.** A live, final, postponed or canceled game shows "Odds closed at tip-off" (live,
   final) or nothing (postponed, canceled), never a win chance.
3. **Hidden in the guided demo.** `/l/demo` has no NBA schedule nav item, and `/l/demo/nba/*` is a 404. The demo's
   simulated season is never connected to real fixtures.
4. **Game day = US Eastern date** (ESPN's and the NBA's game day). Tip-off times show in the viewer's time zone,
   formatted on the client.
5. **"You" is not a colour.** Over and the accent are the same lime (`--color-over` = `--color-accent`), so the brief's
   "lime You" would erase Over/Under meaning. Viewer rows get an accent left border plus a "You" text badge; Over and
   Under keep the existing `SidePill`.
6. **ESPN's `lastFiveGames` is not used**: it isn't season-filtered (before opening night it lists last season's games).
   Form comes from the existing per-team regular-season game logs.
7. **ESPN's scoreboard calendar is not used**: it lists preseason days. "Next game day" comes from the 30 team game logs
   (regular season only), already read for standings form.
8. **No live auto-refresh.** Scores update on reload (60 s cache on the current game days).
9. **Specs and plans** live in `docs/superpowers/` again (recreated after `3aee8cb`).

## Data sources (verified 2026-10-19, the day before opening night)

| Read | URL | Used for |
|---|---|---|
| Scoreboard | `site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=YYYYMMDD` | one game day: games, status, scores, records, venue, broadcasts, odds |
| Summary | `…/nba/summary?event={id}` | one game by id: `header.competitions[0]` (same competitor/status shape), `gameInfo.venue`, `pickcenter` odds |
| Team schedule | existing `gameLogSource` (`espnScheduleUrl`) | last-5 form, next game day |
| Standings | existing stored `team_records` (`teamInfoFor(league)`) | W–L |

Observed shapes:

- `event.id` is a stable string id (e.g. `401909090`). `event.season` = `{ year: 2027, type: 2 }` for the 2026–27
  regular season; preseason is type 1.
- `competition.type.abbreviation` is `"STD"` for a normal game; the NBA Cup championship is `"CC"` (dropped, as the game
  log already does).
- `competition.status.type` has `name` (`STATUS_SCHEDULED`, `STATUS_IN_PROGRESS`, `STATUS_HALFTIME`, `STATUS_FINAL`,
  `STATUS_POSTPONED`, `STATUS_CANCELED`, …), `state` (`pre` / `in` / `post`), `completed`, and `shortDetail` (e.g.
  `"Final"`, `"Q3 4:12"`).
- Competitors: `homeAway`, `team.displayName` (resolved with `teamIdByNickname`, like the game log; ESPN abbreviations
  such as `SA`, `NY`, `WSH` differ from ours), `score` (string; `"0"` before tip-off on the scoreboard, absent in the
  summary), `winner`.
- Odds: `competition.odds[0]` (scoreboard) / `pickcenter[0]` (summary): `provider.name` (`"DraftKings"`) and
  `moneyline.{home,away}.close.odds` as American strings (`"-142"`, `"+120"`). `close` is the current price before
  tip-off; `open` is ignored. The same objects also hold spread and total; never read. Odds appear a few days ahead,
  vanish from the scoreboard once a game ends, and carry no provider timestamp.
- Date-range scoreboard queries (`dates=A-B`) currently return HTTP 400; one request per game day.

## Architecture

Follows the repo's split: pure, tested logic in `src/lib/`, numbers in `src/config/`, server-only glue in `src/server/`,
pages in `src/app/`, UI in `src/components/`.

### `src/config/schedule.ts` — `NBA_SCHEDULE`

`source: "ESPN"`, `fetchTimeoutMs: 8000`, `gameDayTimeZone: "America/New_York"`, `currentDayCacheSeconds: 60` (game days
within one day of today), `otherDayCacheSeconds: 900`, `summaryCacheSeconds: 60`, `retrySeconds: 30`, `formGames: 5`,
`hotWins: 4`, `coldWins: 1`, `dateStripDays: 5`.

### `src/lib/nba-schedule/` (pure, unit tested)

- **`types.ts`**
  - `GameStatus = "scheduled" | "live" | "final" | "postponed" | "canceled"`.
  - `NbaGameSide { teamId: TeamId; score: number | null; winner: boolean }`.
  - `GameOdds { book: string; away: number; home: number }` (American odds, integers, never 0).
  - `NbaGame { id; season; tipoff: string (ISO); gameDay: string (YYYY-MM-DD, Eastern); status; statusDetail: string;
    away: NbaGameSide; home: NbaGameSide; venue: string | null; broadcasts: string[]; odds: GameOdds | null }`.
  - `GameDay { season; day; games: NbaGame[] }` (games sorted by tip-off, then id).
  - Reads for pages never reject: `ScheduleRead { day: GameDay | null; source; readAt: string | null; error: string | null }`,
    `GameRead { game: NbaGame | null; source; readAt; error; notFound: boolean }`.
- **`espn.ts`** — `espnScoreboardUrl(day)`, `espnSummaryUrl(id)`, `parseScoreboard(payload, season, day, resolveTeam)`,
  `parseSummary(payload, season, resolveTeam)`; one shared competition normalizer.
  - Keeps an event only if `season.year === season` and `season.type === 2` and the competition isn't `"CC"`. For the
    summary, a different season or season type is "not found" (the page 404s), not a feed error.
  - Status: name `STATUS_POSTPONED` → postponed, `STATUS_CANCELED` → canceled; else state `in` → live; state `post` with
    `completed` → final; state `pre` → scheduled; anything else → feed error. `statusDetail` = `shortDetail`.
  - Scores only for live and final games; a final game must have exactly one winner.
  - Both competitors must resolve to two different teams of the 30, one home and one away, else `FeedError`.
  - Odds: parsed only when the first odds entry has a provider name and both `close.odds` parse to valid American odds
    (`/^[+-]?\d+$/`, |value| ≥ 100); otherwise `odds: null`. Malformed odds never fail the game.
  - `gameDay` is the Eastern date of `tipoff`. A scoreboard event whose game day differs from the requested day is
    still kept (ESPN's day is authoritative for that request).
  - Malformed payload structure (no `events` array, competition missing, unparseable date) → `FeedError` whose message
    is safe to show, like `parseEspnSchedule`.
- **`odds.ts`**
  - `rawProbability(american)` as in the brief; `winChances(odds)` → `{ away, home }` whole percentages, vig removed
    (`q / (qa + qh)`), rounded by largest remainder so they sum to 100 (a tie in remainders rounds the home side up).
    +110/+110 → 50/50; +130/−155 → 42/58.
  - `displayedOdds(game)` → the odds only when `status === "scheduled"`, else null; with `oddsState(game)` →
    `"open" | "unavailable" | "closed" | "none"` (scheduled with odds / scheduled without / live or final / postponed or
    canceled) so the UI has one place that decides.
  - `formatAmerican(n)` → `"+130"`, `"−155"` (U+2212, via `src/lib/format.ts` conventions).
- **`form.ts`**
  - `recentResults(log, n)` → the last n completed games, newest last: `{ date, opponentId, home, result }[]`.
  - `heat(results)` → `"hot" | "cold" | null`: null with fewer than `formGames` results; hot at ≥ `hotWins` wins; cold at
    ≤ `coldWins` wins. `heatLabel` gives the text ("Hot: 4 wins in last 5").
  - `conferenceTable(teams, conference)` → rows `{ rank, team, wins, losses, pct: number | null }`: sorted by win
    percentage (desc; teams with 0 games after every team with games), then wins (desc), then full team name. `pct` is
    null with 0 games (shown "—"). Rank is the row position, labelled `#`, never "seed".
  - `nextGameDay(logs, afterDay)` → the earliest Eastern game day after `afterDay` across the given game logs, or null.
- **`game-day.ts`** — `gameDayOf(iso)`, `todayGameDay(now)`, `shiftGameDay(day, n)`, `isGameDay(string)` (strict
  `YYYY-MM-DD`), `espnDate(day)` (`YYYYMMDD`), `dateStrip(day, n)` (n consecutive days centred on `day`).
- **`interest.ts`** — who cares about a game, built on `teamOwnership()` from `src/lib/team-detail.ts`.
  - Input: `InterestLeague { league: League; viewerId: string | null }`, the game's two team ids.
  - Per league: `LeagueInterest { leagueId; leagueName; isActive; state: "not_started" | "none" | "rows"; rows }`.
    `not_started` when the draft hasn't started (no frozen lines). `none` when no retained pick of either team exists.
  - `InterestRow { kind: "pick" | "fade"; manager: Manager; teamId; side; line; rootingFor: TeamId; isViewer;
    target?: { manager: Manager; teamId; side; line } }`.
    - Pick: Over on T roots for T; Under on T roots for T's opponent.
    - Fade: roots opposite to its target pick (fading an Over on T roots for T's opponent; fading an Under on T roots
      for T).
  - Only `draft.picks` (retained) count; `voidedPicks` never do; fades whose target is not a retained pick of either
    team never appear. Picks of open seats appear with `managerLabel` ("Manager 3"); a pick whose manager id is not in
    the league is skipped.
  - A person holding interests on both teams (in one league via a pick and a fade, or across leagues) gets every row
    separately; nothing merges or picks a side.
  - Order: active league first, then other leagues in `listViewerLeagues` order; within a league picks before fades,
    then by team (away first), then by manager seat.
  - `rootingSplit(interests, game)` → for each team, the number of rows rooting for it and the distinct managers (for
    "If the Spurs win: 3 interests").
  - `gameInterestSummary(interests)` → `{ managers: { leagueId, manager }[] (distinct), count, viewerInvolved }` for the
    schedule row.

### `src/server/` (server-only)

- **`nba-schedule.ts`**
  - Two per-instance cached sources built on a small generic keyed cache (`src/lib/feed-cache.ts`: success TTL, failure
    retry, shared in-flight read, injectable clock; the same behaviour as `cachedGameLogSource`, which stays as it is).
    Scoreboard keyed by `season:day` with TTL by distance from today; summary keyed by id.
  - `readGameDay(season, day)` → `ScheduleRead`; `readGame(season, id)` → `GameRead` (ESPN 4xx for an unknown id →
    `notFound`). Never reject; `FeedError` messages reach the page, anything else is logged and replaced with a generic
    message. `readAt` is when Courtline read ESPN (shown as freshness; ESPN gives no timestamp).
  - `readTeamForms(league)` → for all 30 teams, `readGameLog` results (existing cached source); used for standings form,
    team context and next game day.
- **`game-interest.ts`** — `loadInterestLeagues(active: League)`: the active league (viewer from `getViewerId`, may be
  null for a spectator) plus each `listViewerLeagues()` league with the same `seasonLabel`, loaded with `findLeague`
  (React `cache`), viewer = that seat's manager id. Never the demo league. Returns only `League` objects already
  readable through their URLs; no sessions, tokens or links.
- **`nba-pages.ts`** — page loaders that return plain data plus promises for the streamed panels, like `loadTeamPage`.

### Routes (`src/app/l/[leagueId]/nba/`)

- `schedule/page.tsx` — `searchParams.date` (invalid or missing → Eastern today). Season from
  `seasonEndYear(league.seasonLabel)`.
- `games/[gameId]/page.tsx` — `searchParams.date` only feeds the back link (missing → the game's own day).
- Both: Suspense pattern from the team page, `unstable_dynamicStaleTime = 60`, demo league → `notFound()`. A game whose
  read says `notFound` → `notFound()`; a failed read → an in-page "Couldn't load this game" alert with the back link.

### Navigation (`src/components/shell/`)

- `navItems(leagueId)` returns `{ primary: NavItem[]; secondary: NavItem[] }`: primary is Overview, Rosters, Settings;
  secondary is Draft room, NBA schedule. `NavItem` gains an optional `activePrefix`; `isActive` also matches any path
  under it. NBA schedule: `href /l/{id}/nba/schedule`,
  label "NBA schedule", short label "NBA", `CalendarDays` icon, `exact: false`, `activePrefix: /l/{id}/nba` (so game pages keep it
  active).
- The demo league id omits the NBA item. The prerendered skeleton (`navItems("")`) shows all five; in the demo the nav
  settles to four once the league streams in.
- Sidebar: primary, separator, secondary. Draft room keeps its Clock trailing icon.
- Bottom nav: column count follows the item count (`grid-cols-4` / `grid-cols-5` as literal classes). Check 320 px and
  375 px for clipping, 44 px touch targets and the safe-area padding.

## UI

Existing tokens and primitives only (`Panel`, `SegmentedControl`, `SidePill`, `ManagerAvatar`, `TeamLogo`, `TeamLink`,
`Badge`, `Alert`). Dark theme. Numbers through `src/lib/format.ts`.

### Schedule page (`src/components/nba/`)

- `PageHeader` "NBA Schedule", subtitle "Games, standings, and who your leagues are rooting for."
- **Date strip**: previous-day and next-day buttons, `dateStripDays` consecutive day chips (selected chip accent), and
  **Today**. All are links (`?date=`), keyboard focusable. Days are consecutive calendar days, not only game days.
- `xl+`: games panel (left, wider) and standings panel (right). Below `xl`: a `SegmentedControl` Games / Standings
  (games first; choice kept in the URL as `?view=standings` so it survives reloads); the date strip stays above both.
- **Games panel**: heading with the long date. One row per game, sorted by tip-off:
  - The row is a link to the game page (`?date=` kept). Team names are `TeamLink`s to the league's team page that never trigger the row link: the row link is a
    stretched overlay and the team links sit above it in the stacking order (no nested anchors, no click handlers).
  - Each team: logo, name, record (from stored records).
  - Time column: local tip-off for scheduled; `statusDetail` plus scores for live (marked "Live") and final; "Postponed"
    / "Canceled" badges.
  - Odds column: `oddsState` "open" → "SAS +130 (42%)" per team, favourite emphasised; "unavailable" → "Odds
    unavailable"; "closed"/"none" → nothing.
  - League interest: up to 3 `ManagerAvatar`s + "+n" from `gameInterestSummary`, with an accessible label ("5 picks and
    fades in your leagues"). A row the viewer is involved in gets the accent border and a "You" marker.
  - Empty day: "No regular-season games on {date}." plus "Next game day: {date} →" when `nextGameDay` finds one.
  - Feed error: `Alert` with the error; the standings still render.
- **Standings panel**: West / East `SegmentedControl` (defaults to West, as in the mockup; kept as `?conf=east`). Columns `#`, team (logo + `TeamLink`), W, L, PCT (`.750` style, "—" with no games), Last 5 (W/L chips with
  text, newest last) and the heat icon with its text label (visually hidden text for screen readers, `title` for
  hover). Form streams in; while loading or on failure the Last 5 cell shows "—" / "Form unavailable" once, and W–L stay.

### Game page

- Back link "← Back to schedule" to `/l/{id}/nba/schedule?date={day}`.
- **Header**: away team left, "at", home team right; each with logo, full name, record and a link to the team page.
  Centre: long date, local tip-off, status (`statusDetail` or score for live/final), venue and broadcasts only when
  present.
- **Odds panel** ("Moneyline · win chance"): two tiles, `+130 (42%)` / `−155 (58%)`, the higher chance emphasised (accent
  border), an info tooltip "Estimated win chance from both moneylines, with sportsbook margin removed.", and
  "DraftKings via ESPN · read 4:12 PM". Other states: "Odds unavailable" / "Odds closed at tip-off" / hidden for
  postponed and canceled.
- **Who's on this game?** (largest panel, full width on mobile, left two-thirds on `xl+`):
  - Intro line: "An Over gains from its team winning; an Under gains from its team losing. A fade roots against the pick
    it fades."
  - One card per league (active first) with a trophy icon, name, and "{n} managers on this game".
  - Each row: avatar, manager name (or "You" badge + name), team logo + name, `SidePill`, frozen line, and "Rooting for
    {Team}". Fade rows: a "Fade" badge and "Fading {Manager}'s {Team} {Over|Under} {line}".
  - Empty states: `not_started` "The draft hasn't started."; `none` "No one in this league has drafted either team's
    Over or Under."; spectator of the active league with no seated leagues → the active league only, no "You"; no
    leagues at all can't happen (the active league always shows).
- **Team context** (right column on `xl+`, below on mobile), one block per team: record, conference position (`#` from
  `conferenceTable`, "3rd in West" style), last 5 chips, heat badge with text, "If the {Team} win: {n} interests"
  from `rootingSplit`, and "Season page →" to the team page. Then **Recent games** with a team switcher: last 5 completed
  games with date, opponent logo, home/away and W/L (no scores: the game log has none). Form failure → "Recent games
  unavailable" here; the rest of the page is unaffected.

### Local time

`LocalTime` client component: renders an Eastern-time string from the server snapshot (with "ET") and the viewer's
local format after hydration via `useSyncExternalStore` (server snapshot ≠ client snapshot is the supported pattern,
no hydration mismatch).

## Error handling

Each feed only empties its own panel:

| Missing | Effect |
|---|---|
| Scoreboard read | games panel alert; standings render |
| Game summary read | "Couldn't load this game" with back link; 404 only for an unknown id or another season |
| Odds | "Odds unavailable"; nothing else changes |
| Game logs (form) | "Form unavailable" / "Recent games unavailable"; W–L, records and interests remain |
| League load for another league | that league is skipped |

No synthetic fixture, invented odds, invented ranking or fake freshness anywhere.

## Testing

- **Fixtures** (`src/lib/nba-schedule/*.fixture.json`, trimmed real payloads captured 2026-10-19): opening-night
  scoreboard (`20261020`), `20261021` (11 games, odds), a final day from March 2026 (`20260315`, scores, no odds), a
  preseason day (`20261012`, all dropped), a pre-game summary and a final summary. Synthetic edits for statuses not yet
  observable (live, postponed, canceled, Cup final, bad odds).
- **Unit**: parsers (season and type filter, Cup final, statuses, scores, two-team checks, odds parsing and rejection,
  malformed payloads), odds maths (+110/+110 → 50/50, +130/−155 → 42/58, sum is always 100, invalid quotes),
  `oddsState`, form and heat thresholds, conference ordering and "—", next game day, game-day helpers (Eastern date
  across midnight UTC and DST), interests (Over/Under rooting both teams, fades on Over and Under, several fades on one
  pick, voided picks excluded, open seats, not started, multi-league, same person conflicting), `feed-cache`, nav items
  (groups, demo omits NBA, active on game pages).
- **UI checks** in the browser pane: date navigation, tabs, active nav on both pages, keyboard focus on rows and team
  links, 375 px and 1440 px with no horizontal scroll, bottom nav at 320/375 px.
- `npm test && npm run lint && npm run typecheck && npm run build`; desktop and mobile screenshots for review.

## Out of scope

Live auto-refresh, play-by-play, player stats, spreads, game totals, injuries, favourites, notifications, official
tiebreakers, new auth, any scoring change, changes to the draft, fades or the guided demo.

## Known limits

- ESPN and its embedded DraftKings odds are unofficial, keyless and can change or disappear without notice.
- ESPN gives no odds timestamp; freshness shown is Courtline's read time (at most `currentDayCacheSeconds` /
  `otherDayCacheSeconds` old).
- Caches are per server instance; standings form costs up to 30 cached team-schedule reads per cold instance.
- Game day is the Eastern date; a viewer far from US time zones may see a game listed under the previous local day.
