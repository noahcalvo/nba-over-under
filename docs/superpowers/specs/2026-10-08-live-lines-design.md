# Live win-total lines — design

Date: 2026-10-08. Status: approved scope from chat; standings updates are out of scope.

## Goal

New leagues draft against real **2026–27** NBA regular-season win totals from **one sportsbook (FanDuel)**, imported
through the existing `LineSource` interface. The commissioner reviews all 30 lines before starting, can type in lines
the book is missing (or correct one), and the lines still freeze into the league when the draft starts.

## Provider research (2026-10-08)

| Option | Win totals for one book | Cost |
|---|---|---|
| The Odds API | No — NBA outrights are "Championship Winner" only | free tier |
| ESPN core API (`sports.core.api.espn.com/.../futures`) | No — DraftKings futures, but no win totals | free, keyless |
| DraftKings public JSON | 403 from scripted requests (bot protection) — not bypassed | — |
| **FanDuel public JSON** (`sbapi.nj.sportsbook.fanduel.com/api/content-managed-page?page=CUSTOM&customPageId=nba`) | **Yes — 30 of 30 markets** `26-27 NBA {Team} Regular Season Wins`, `marketType` `NBA_REGULAR_SEASON_WINS_O/U`, all `OPEN` | free, keyless |
| OpticOdds / SportsDataIO / OddsBlaze | Documented or likely, but paid / sales-gated | paid — rejected |

FanDuel's endpoint is the JSON its own website loads; `_ak` is the public app key that site sends, not a credential.
It is undocumented and unofficial: it can change shape, be geo-restricted or start refusing server traffic, and its
terms may not allow reuse. That is why the commissioner fallback is first-class, not an afterthought.

## Design

- **Source.** `fanDuelLineSource` (`src/lib/fanduel.ts`) parses the payload: one team per open O/U market whose Over
  and Under runners are active and name the same line. The nickname (`Clippers`, `Trail Blazers`) maps to our team.
  It never mixes in another book. `src/server/lines.ts` wraps it in `cachedLineSource` (success reused 5 min, failure
  reused 30 s so a down feed isn't hit every 2 s by polling) and `lineReader` (a failed refresh reports the error
  alongside the last good set). `LINE_SOURCE=static` keeps the mock lines for offline dev and the smoke test.
- **Data.** `LineSet` gains `season` and `manual` (teams the commissioner entered). `League` gains `lineOverrides`
  (commissioner-entered lines before the draft). New columns `lines_season`, `lines_manual`, `line_overrides`.
- **Review.** `LeagueView.lineReview` (null once lines are frozen) holds book, season, as-of, feed error, one row per
  team (feed line, override, effective line) and the missing teams. `LeagueView.teams` before the draft holds only
  teams that have a line.
- **Commissioner edits.** `PUT /api/leagues/{id}/lines` `{ overrides }` replaces the override map (commissioner only,
  not_started only, lines 0.5–81.5 in steps of 0.5). An override wins over the feed. Through `withLockedLeague`.
- **Start.** The start request carries the `lines` the commissioner reviewed. Under the lock the server rebuilds the
  review from the feed it just read plus the stored overrides; any difference fails `lines_changed` (409), any missing
  team fails `lines_unavailable`. The frozen `LineSet` credits the book (`source: "FanDuel"`), lists `manual` teams,
  and uses `source: "Commissioner"` only when every line was entered by hand.
- **UI.** Lobby: a "Lines" panel (book · season · updated time, feed error and missing-team alerts, 30 rows; inputs for
  the commissioner) and a "I've checked all 30 lines" confirmation that gates Start. After start the draft room says
  which book, season and time the frozen lines came from and how many the commissioner entered.
- **Season.** New leagues are labeled `LINES.season` ("2026–27"). The demo league and the mock team records stay on
  2025–26 data; updating records/standings is a separate task.
