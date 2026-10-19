# NBA Schedule & Game Detail — design

**Status:** approved design, 2026-10-19 (revised the same day: player-level routes, every league, challenge stakes). Source brief: `courtline-nba-schedule-game-detail-spec.md` (the proposed
feature spec) and the approved dark desktop mockup. Where this document and the brief differ, this document wins; the
differences are listed under "Decisions taken".

## Goal

Give managers a Courtline-native place to see NBA games and records and understand **who benefits if a team wins
tonight** across all their leagues. Two read-only, player-level screens (not inside any one league):

1. **NBA schedule** (`/nba`): one game day's regular-season games, plus conference standings with last-5 form.
2. **Game detail** (`/nba/games/{gameId}`): one game, its pre-game moneylines with market-implied win chances, every
   pick and fade on either team in every league this browser holds a seat in for the season, and the viewer's own
   30/30 Challenge side.

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
3. **Player-level, not league-level.** The pages live at `/nba`, outside `/l/{leagueId}`, in their own shell (the
   `/challenge` precedent). No league, player or seat id is in the URL: the server identifies the viewer from the
   existing `courtline_session` cookie (httpOnly random token, stored hashed), exactly as the home page's "Your leagues"
   and the challenge's `getViewerEntry` do. No new cookie. The brief's active-league and spectator cases don't exist.
   The guided demo league is never a session seat, so it never appears; its league nav has no NBA schedule item, and the
   demo's simulated season is never connected to real fixtures.
4. **One time zone: US Central (`America/Chicago`).** Most players are in Minnesota. Game days, "Today", and every
   tip-off time and read time use Central time, labelled "CT" (e.g. "7:00 PM CT"). Formatted on the server, so there is
   no client time-zone handling and no hydration mismatch. NBA tip-offs fall between late morning and 9:30 PM CT, so the
   Central date matches ESPN's (Eastern) game day for every regular-season game.
5. **"You" is not a colour.** Over and the accent are the same lime (`--color-over` = `--color-accent`), so the brief's
   "lime You" would erase Over/Under meaning. Viewer rows get an accent left border plus a "You" text badge; Over and
   Under keep the existing `SidePill`.
6. **ESPN's `lastFiveGames` is not used**: it isn't season-filtered (before opening night it lists last season's games).
   Form comes from the existing per-team regular-season game logs.
7. **ESPN's scoreboard calendar is not used**: it lists preseason days. "Next game day" comes from the 30 team game logs
   (regular season only), already read for standings form.
8. **No live auto-refresh.** Scores update on reload (60 s cache on the current game days).
9. **Specs and plans** live in `docs/superpowers/` again (recreated after `3aee8cb`).
10. **Season** = `LINES.season` (the season new leagues draft and the challenge runs; 2026–27), as `NBA_SCHEDULE.season`.
    Leagues with another `seasonLabel` are left out (their picks are about other games).
11. **Everyone in your leagues, you highlighted.** Each league card lists every retained pick and fade on either team,
    with the viewer's own rows marked "You", plus a "Your stakes" summary of only the viewer's rows across leagues and
    the challenge.
12. **The 30/30 Challenge counts.** The viewer's own saved challenge side on either team appears as its own group. Only
    the viewer's entry, never other entrants'.
13. **Team links** go to a page that belongs to where the position is: in a league card, that league's team page
    (`/l/{id}/teams/{team}`); in the challenge group, `/challenge/teams/{team}`. Team names in the schedule, standings
    and game header are plain text (no league to link into).

## Data sources (verified 2026-10-19, the day before opening night)

| Read | URL | Used for |
|---|---|---|
| Scoreboard | `site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=YYYYMMDD` | one game day: games, status, scores, records, venue, broadcasts, odds |
| Summary | `…/nba/summary?event={id}` | one game by id: `header.competitions[0]` (same competitor/status shape), `gameInfo.venue`, `pickcenter` odds |
| Team schedule | existing `gameLogSource` (`espnScheduleUrl`) | last-5 form, next game day |
| Standings | existing stored `team_records` (`loadTeamInfo(db, { isDemo: false, seasonLabel })`) | W–L |

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

`season: LINES.season`, `source: "ESPN"`, `fetchTimeoutMs: 8000`, `timeZone: "America/Chicago"`, `timeZoneLabel: "CT"`, `currentDayCacheSeconds: 60` (game days
within one day of today), `otherDayCacheSeconds: 900`, `summaryCacheSeconds: 60`, `retrySeconds: 30`, `formGames: 5`,
`hotWins: 4`, `coldWins: 1`, `dateStripDays: 5`.

### `src/lib/nba-schedule/` (pure, unit tested)

- **`types.ts`**
  - `GameStatus = "scheduled" | "live" | "final" | "postponed" | "canceled"`.
  - `NbaGameSide { teamId: TeamId; score: number | null; winner: boolean }`.
  - `GameOdds { book: string; away: number; home: number }` (American odds, integers, never 0).
  - `NbaGame { id; season; tipoff: string (ISO); gameDay: string (YYYY-MM-DD, Central); status; statusDetail: string;
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
  - `gameDay` is the Central date of `tipoff`. A scoreboard event whose game day differs from the requested day is
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
  - `nextGameDay(logs, afterDay)` → the earliest Central game day after `afterDay` across the given game logs, or null.
- **`game-day.ts`** — `gameDayOf(iso)`, `todayGameDay(now)`, `shiftGameDay(day, n)`, `isGameDay(string)` (strict
  `YYYY-MM-DD`), `espnDate(day)` (`YYYYMMDD`), `dateStrip(day, n)` (n consecutive days centred on `day`).
- **`interest.ts`** — who cares about a game, built on `teamOwnership()` from `src/lib/team-detail.ts`.
  - Input: `InterestLeague { league: League; viewerId: string }` (the viewer always holds a seat), the game's two team
    ids, and optionally the viewer's `ChallengeStake`.
  - Per league: `LeagueInterest { leagueId; leagueName; state: "not_started" | "none" | "rows"; rows }`.
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
  - Order: leagues in `listViewerLeagues` order (most recently joined first); within a league picks before fades, then
    by team (away first), then by manager seat.
  - Challenge: `challengeInterest(entry, season, game)` → `ChallengeInterest { entryName; rows: { teamId; side; line:
    number | null; lineKind: "frozen" | "at_pick" | "unavailable"; rootingFor }[] }`, one row per team of the game the
    entry picked (always both, since entries cover all 30). Line: the frozen line once `season.frozen` is stored (a team
    in `frozen.missing` → "unavailable"); before that, the entry's `lineAtPick` ("at_pick"; null → "unavailable").
    Rooting as for a pick. No entry, or an entry for another season → no challenge group.
  - `yourStakes(interests, challenge)` → only the viewer's rows (league picks, league fades, challenge sides), each with
    where it lives, for the summary at the top of the panel.
  - `rootingSplit(interests, game)` → for each team, the number of rows rooting for it and the distinct managers (for
    "If the Spurs win: 3 interests").
  - `gameInterestSummary(interests, challenge)` → `{ managers: { leagueId, manager }[] (distinct), count,
    viewerInvolved }` for the schedule row (the challenge side counts toward `viewerInvolved` and `count`).

### `src/server/` (server-only)

- **`nba-schedule.ts`**
  - Two per-instance cached sources built on a small generic keyed cache (`src/lib/feed-cache.ts`: success TTL, failure
    retry, shared in-flight read, injectable clock; the same behaviour as `cachedGameLogSource`, which stays as it is).
    Scoreboard keyed by `season:day` with TTL by distance from today; summary keyed by id.
  - `readGameDay(season, day)` → `ScheduleRead`; `readGame(season, id)` → `GameRead` (ESPN 4xx for an unknown id →
    `notFound`). Never reject; `FeedError` messages reach the page, anything else is logged and replaced with a generic
    message. `readAt` is when Courtline read ESPN (shown as freshness; ESPN gives no timestamp).
  - `readTeamForms()` → for all 30 teams, `readGameLog({ isDemo: false, seasonLabel: NBA_SCHEDULE.season }, team)`
    (existing cached source); used for standings form, team context and next game day.
- **`game-interest.ts`**
  - `loadInterestLeagues()`: each `listViewerLeagues()` league whose `seasonLabel` is `NBA_SCHEDULE.season`, loaded
    with `findLeague` (React `cache`), viewer = that seat's manager id. A league that fails to load is skipped. Returns
    only `League` objects the viewer can already open; no sessions, tokens or links reach the client.
  - `loadChallengeStake()`: `getViewerEntry(db)` plus `loadChallengeSeason(db, CHALLENGE.seasonYear)` — read-only.
    It never calls `prepareChallenge` (no schedule sync, no freeze, no FanDuel read). Skipped when
    `CHALLENGE.seasonYear` isn't the schedule's season.
  - One React-`cache`d loader per request; the schedule page and game page both use it.
- **`nba-pages.ts`** — page loaders that return plain data plus promises for the streamed panels, like `loadTeamPage`.

### Routes (`src/app/nba/`)

- `layout.tsx` — `NbaShell`.
- `page.tsx` (the schedule) — `searchParams.date` (invalid or missing → today in Central time), `view`, `conf`.
- `games/[gameId]/page.tsx` — `searchParams.date` only feeds the back link (missing → the game's own day).
- Both: the Suspense pattern from the team page, `unstable_dynamicStaleTime = 60`. A game whose read says `notFound` →
  `notFound()`; a failed read → an in-page "Couldn't load this game" alert with the back link.

### Shell and navigation

- **`NbaShell`** (`src/components/nba/NbaShell.tsx`, modelled on `ChallengeShell`): fixed `lg+` sidebar with the logo,
  the season label, and nav: Home (`/`), NBA schedule (`/nba`, active on every `/nba` path), 30/30 Challenge
  (`/challenge`); then a **Your leagues** list (streamed, `listViewerLeagues`, each linking to `/l/{id}`; hidden when
  empty). Below `lg`: the sticky top bar with the compact logo, and a bottom tab bar Home / Schedule / Challenge (3
  columns). The frame itself reads no data, so it prerenders; only the league list streams.
- **League shell** (`src/components/shell/`): `navItems(leagueId)` returns `{ primary: NavItem[]; secondary: NavItem[] }`:
  primary is Overview, Rosters, Settings; secondary is Draft room and **NBA schedule** (`href: "/nba"`, label "NBA
  schedule", short label "NBA", `CalendarDays` icon). It is a link out of the league shell, so it is never active there.
  The sidebar renders primary, separator, secondary (Draft room keeps its Clock trailing icon). The demo league id omits
  the NBA item; the prerendered skeleton (`navItems("")`) shows all five, and in the demo the nav settles to four once
  the league streams in.
- Bottom nav: column count follows the item count (`grid-cols-4` / `grid-cols-5` as literal classes). Check 320 px and
  375 px for clipping, 44 px touch targets and the safe-area padding.
- **Home page**: an "NBA schedule" link panel next to the 30/30 Challenge panel.

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
  - The whole row is one link to the game page (`?date=` kept); team names are plain text.
  - Each team: logo, name, record (from stored records).
  - Time column: tip-off in CT for scheduled; `statusDetail` plus scores for live (marked "Live") and final; "Postponed"
    / "Canceled" badges.
  - Odds column: `oddsState` "open" → "SAS +130 (42%)" per team, favourite emphasised; "unavailable" → "Odds
    unavailable"; "closed"/"none" → nothing.
  - League interest: up to 3 `ManagerAvatar`s + "+n" from `gameInterestSummary`, with an accessible label ("5 picks and
    fades in your leagues"). A row the viewer is involved in (league or challenge) gets the accent border and a "You"
    marker. Hidden when the viewer has no leagues and no challenge entry.
  - Empty day: "No regular-season games on {date}." plus "Next game day: {date} →" when `nextGameDay` finds one.
  - Feed error: `Alert` with the error; the standings still render.
- **Standings panel**: West / East `SegmentedControl` (defaults to West, as in the mockup; kept as `?conf=east`). Columns `#`, team (logo + name), W, L, PCT (`.750` style, "—" with no games), Last 5 (W/L chips with
  text, newest last) and the heat icon with its text label (visually hidden text for screen readers, `title` for
  hover). Form streams in; while loading or on failure the Last 5 cell shows "—" / "Form unavailable" once, and W–L stay.

### Game page

- Back link "← Back to schedule" to `/nba?date={day}`.
- **Header**: away team left, "at", home team right; each with logo, full name and record.
  Centre: long date, tip-off in CT, status (`statusDetail` or score for live/final), venue and broadcasts only when
  present.
- **Odds panel** ("Moneyline · win chance"): two tiles, `+130 (42%)` / `−155 (58%)`, the higher chance emphasised (accent
  border), an info tooltip "Estimated win chance from both moneylines, with sportsbook margin removed.", and
  "DraftKings via ESPN · read 4:12 PM". Other states: "Odds unavailable" / "Odds closed at tip-off" / hidden for
  postponed and canceled.
- **Who's on this game?** (largest panel, full width on mobile, left two-thirds on `xl+`):
  - Intro line: "An Over gains from its team winning; an Under gains from its team losing. A fade roots against the pick
    it fades."
  - **Your stakes** (top, only when the viewer has any): one compact line per viewer row, e.g. "Spurs Over 40.5 · Alex's
    League → rooting for Spurs", "Fading Jordan's Wolves Under 47.5 · Roto Kings → rooting for Wolves", "Spurs Under
    41.5 · 30/30 Challenge → rooting for Wolves". Conflicting stakes are all listed; nothing is netted.
  - One card per league (most recently joined first) with a trophy icon, the league name linking to `/l/{id}`, and "{n}
    managers on this game".
  - Each row: avatar, manager name (or "You" badge + name), team logo + name (linking to that league's team page),
    `SidePill`, that league's frozen line, and "Rooting for {Team}". Fade rows: a "Fade" badge and "Fading {Manager}'s
    {Team} {Over|Under} {line}".
  - **30/30 Challenge** card (after the leagues, when the viewer has an entry): the entry name, and per team the
    `SidePill`, the line labelled "Frozen line" / "Line when picked" / "Line unavailable", "Rooting for {Team}", and
    the team linking to `/challenge/teams/{team}`.
  - Empty states: per league, `not_started` "The draft hasn't started." and `none` "No one in this league has drafted
    either team's Over or Under."; no same-season leagues and no challenge entry → "Join or create a league to see
    who's on this game." with a link to `/`.
- **Team context** (right column on `xl+`, below on mobile), one block per team: record, conference position (`#` from
  `conferenceTable`, "3rd in West" style), last 5 chips, heat badge with text, "If the {Team} win: {n} interests"
  from `rootingSplit`, and the team's season page in each of the viewer's leagues ("Spurs in Alex's League →"; none
  without leagues). Then **Recent games** with a team switcher: last 5 completed
  games with date, opponent logo, home/away and W/L (no scores: the game log has none). Form failure → "Recent games
  unavailable" here; the rest of the page is unaffected.

### Times

`src/lib/format.ts` gains `formatGameTime(iso)` ("7:00 PM CT"), `formatGameDate(day)` ("Fri, Oct 31") and
`formatReadTime(iso)`, all with `Intl.DateTimeFormat` fixed to `NBA_SCHEDULE.timeZone`. Server-rendered; no client
time-zone code.

## Error handling

Each feed only empties its own panel:

| Missing | Effect |
|---|---|
| Scoreboard read | games panel alert; standings render |
| Game summary read | "Couldn't load this game" with back link; 404 only for an unknown id or another season |
| Odds | "Odds unavailable"; nothing else changes |
| Game logs (form) | "Form unavailable" / "Recent games unavailable"; W–L, records and interests remain |
| One league's load | that league is skipped |
| No session, or no seats this season | schedule, standings and odds as usual; interests show the join prompt |
| Challenge read | the challenge card is left out; leagues unaffected |

No synthetic fixture, invented odds, invented ranking or fake freshness anywhere.

## Testing

- **Fixtures** (`src/lib/nba-schedule/*.fixture.json`, trimmed real payloads captured 2026-10-19): opening-night
  scoreboard (`20261020`), `20261021` (11 games, odds), a final day from March 2026 (`20260315`, scores, no odds), a
  preseason day (`20261012`, all dropped), a pre-game summary and a final summary. Synthetic edits for statuses not yet
  observable (live, postponed, canceled, Cup final, bad odds).
- **Unit**: parsers (season and type filter, Cup final, statuses, scores, two-team checks, odds parsing and rejection,
  malformed payloads), odds maths (+110/+110 → 50/50, +130/−155 → 42/58, sum is always 100, invalid quotes),
  `oddsState`, form and heat thresholds, conference ordering and "—", next game day, game-day helpers (Central date
  across midnight UTC and DST), time formatting in CT, interests (Over/Under rooting both teams, fades on Over and Under, several fades on one
  pick, voided picks excluded, open seats, not started, multi-league, same person conflicting), challenge stakes
  (frozen, before the freeze, missing frozen line, null line at pick, other season), your stakes, `feed-cache`, league
  nav items (groups, NBA links to `/nba`, demo omits it), NBA shell nav (active on `/nba` and game pages).
- **UI checks** in the browser pane: date navigation, tabs, active nav on both pages, a browser with no session (no
  interests), a browser with two seated leagues and a challenge entry, keyboard focus on rows and team
  links, 375 px and 1440 px with no horizontal scroll, bottom nav at 320/375 px.
- `npm test && npm run lint && npm run typecheck && npm run build`; desktop and mobile screenshots for review.

## Out of scope

Live auto-refresh, play-by-play, player stats, spreads, game totals, injuries, favourites, notifications, official
tiebreakers, new auth, any scoring change, changes to the draft, fades, the challenge or the guided demo. Other
entrants' challenge picks. Leagues from other seasons.

## Known limits

- ESPN and its embedded DraftKings odds are unofficial, keyless and can change or disappear without notice.
- ESPN gives no odds timestamp; freshness shown is Courtline's read time (at most `currentDayCacheSeconds` /
  `otherDayCacheSeconds` old).
- Caches are per server instance; standings form costs up to 30 cached team-schedule reads per cold instance.
- Every time is Central; a viewer elsewhere converts in their head (the label says CT).
- Interests follow the browser session, like everything else in Courtline: another browser of the same person sees
  only the seats claimed there.
