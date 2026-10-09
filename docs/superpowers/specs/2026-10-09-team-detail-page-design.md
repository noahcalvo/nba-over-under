# Team detail page — design

Date: 2026-10-09. Status: approved in chat. Brief: `docs/superpowers/specs/2026-10-09-team-detail-page-brief.md`. Visual design source of truth:
`docs/superpowers/specs/2026-10-09-team-detail-page-reference.png` (see "Visual design source of truth" under Page;
its team, managers and numbers are illustrative).
Out of scope: redesigning other pages, new league rules, a second sportsbook, storing game history in the database.

## Goal

One page per NBA team inside a league: its record against the league's frozen line, a season-progress chart of
cumulative wins from real game results, the FanDuel line at draft versus now, and who owns and fades each side. Every
score comes from `src/lib/scoring.ts`; the page never re-implements scoring and never lets a current sportsbook line
touch league scores.

## Findings (2026-10-09)

| Question | Answer |
|---|---|
| Game-by-game history today? | No. `team_records` stores only wins and losses per season and team (ESPN standings). |
| Source for history | **ESPN** `site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/{espnAbbr}/schedule?season={endYear}&seasontype=2`: keyless, all regular-season games with date, opponent, home/away, `winner` and `status.type.completed`. `season=2026` returns 82 completed ORL games; `season=2027` already lists 80 upcoming games, none completed. Unofficial, can change shape. |
| FanDuel: preseason only or in-season? | `lineSource` reads whichever `26-27 NBA … Regular Season Wins` markets are **open right now** (cached 5 min, 30 s retry, last good read kept on failure). It is a current read, not a snapshot. Once FanDuel closes a team's market, that team has no latest line. |
| ESPN schedule quirks | The **NBA Cup Championship** is listed as a regular-season event (competition type `CC`) but does not count in the standings (NY 2025–26: 54 wins in the log, 53 in the standings). A **postponed** game is listed twice: once as `STATUS_POSTPONED`, again on its make-up date (GS 2025–26: 83 events). Dropping both gives 82 games whose wins match the standings for ORL (45), NYK (53) and GSW (37). |
| Push | An existing rule: margin 0 is a miss (`margin > 0`), so an integer line needs `line + 1` wins for the Over. `floor(line) + 1 − wins` matches it. |
| Demo league | Season 2025–26, mock records and `STATIC_LINES`. Real ESPN history would not match the mock records. |

## Route and navigation

- `src/app/l/[leagueId]/teams/[teamId]/page.tsx`. It sits at the league's top level next to Rosters, not inside it. An
  unknown team id gets `notFound()`. Reads `params` inside `<Suspense>` like the other pages.
- Breadcrumb: `{league name} / {team city + name}`. The first item links to the league overview (`/l/{id}`). The
  sidebar highlights no item on this page (the existing `isActive` already gives that; nav items are unchanged).
- Team logos and names link to the team page in: Rosters columns (`TeamLineSummary`), the overview's `PicksList` and
  `ClosestCalls`. Nothing else on those pages changes.
- Team selector: `Team: {city name}` built on `Select`, all 30 teams sorted by full name; choosing one does
  `router.push` to that team's page in the same league. It selects the team, not an opponent.

## Data

### Game log — pure, `src/lib/game-log/`

```ts
interface Game {
  /** 1-based game number within the regular season, by date. */
  number: number;
  /** ISO 8601 tip-off time; null when the source has none. */
  date: string | null;
  /** Our team id; null when the opponent is not one of the 30, or unknown (mock data). */
  opponentId: TeamId | null;
  /** Null when unknown (mock data). */
  home: boolean | null;
  /** Null until the game is completed. */
  result: "W" | "L" | null;
}
interface GameLog { season: number; teamId: TeamId; games: Game[] }
```

- `espn.ts`: `espnScheduleUrl(espnAbbr, season)` and `parseEspnSchedule(payload, season, teamId, resolveTeam)`. Keeps
  only events whose `seasonType.type` is 2 (regular season): preseason and playoff events are dropped. Also drops the
  NBA Cup Championship (competition type `CC`) and postponed or canceled events (listed again when made up). Sorts by date,
  numbers 1…n, refuses more than 82 games and a payload for another season (FeedError, like the standings parser). A
  completed game needs exactly one competitor flagged `winner`; otherwise the parse fails. Tested against a trimmed
  saved fixture that mixes in preseason and playoff events.
- ESPN abbreviations differ from ours (NY, GS, NO, SA, UTAH, WSH): a small `espnAbbr` map next to the team data.
  Opponents resolve by nickname with the existing `teamIdByNickname`.

### Progress math — pure, `src/lib/game-log/progress.ts`

- `actualSeries(log, record)`: cumulative wins after each completed game, **trimmed to the stored record's games
  played**, so the chart never runs ahead of the numbers the league scores on. Returns
  `{ points: {game, wins}[], status: "complete" | "partial" | "mismatch" }`: `partial` when the log has fewer
  completed games than the record, `mismatch` when its wins over those games differ from the record's. Never fills
  gaps.
- `lockedPace(line, n) = line × n / 82`.
- `projectedAt(record, n) = wins + (n − played) × projectWins(record) / 82` for `n ≥ played`. Reuses `projectWins`, so
  at game 82 it equals the league's projected wins. Null when nothing has been played.
- `winsNeededForOver(line, wins) = max(0, floor(line) + 1 − wins)`.

### Chart window and bounds — pure, `src/lib/chart-window.ts`

- `chartWindow(played, mode)`:
  - `"last8"`: games `max(1, played − 7)` … `min(82, played + 2)`, with counts of completed and upcoming positions.
    Game 48 → 41–50 (8 + 2); game 3 → 1–5 (3 + 2); game 81 → 74–82 (8 + 1); game 82 → 75–82 (8 + 0); game 0 → 1–2
    (0 + 2).
  - `"full"`: games 1–82.
  - Subtitle text from the counts: "8 completed games + 2 upcoming", "3 completed games + 2 upcoming",
    "8 completed games" (no "+ 0"), "No games played yet · 2 upcoming".
- `yBounds(values, mode)`:
  - Zoomed (`last8`): the visible values' range fills ~70% of the plot height, ~15% padding above and below, a minimum
    span of 4 wins when values are equal or nearly so, never below 0, "nice" ticks (step 1, 2 or 5; 4–6 ticks).
  - `full`: from 0 to the visible maximum plus headroom, rounded up to a nice tick.
  - Values passed in are only the visible series: projected points are included only when Show projected is on.
- Switching back to "Last 8" always recomputes the latest window; there is no other zoom or pan.

### Sources — server, `src/server/game-log.ts`

- `gameLogSource`: ESPN via `fetchFeedJson`, cached per (season, team) like `cachedLineSource` (success reused 10 min,
  failure retried after 30 s). Fetched only when a team page is opened: one ESPN call per team, no cron, no table.
  Timings live in `src/config/records.ts` (`RECORDS.gameLogCacheSeconds`, `RECORDS.gameLogRetrySeconds`).
- `RECORD_SOURCE=static` and the demo league use the **mock game log**: `mockGameLog` in `src/data/game-logs.ts`,
  a fixed order of each team's mock wins and losses (a seeded shuffle per team, the same on every run). Each team's
  completed games add up to its mock record in `src/data/teams.ts`; it lists no upcoming games and no dates, opponents
  or home/away. It is part of the single mock dataset, never shown for a stored league unless
  `RECORD_SOURCE=static`.
- `readGameLog(league, teamId)` never rejects: `{ log: GameLog | null, error: string | null }`.

### Page loader — `src/server/team-page.ts`

Loads in parallel: `toLeagueView(league)`, `readGameLog`, `readLines()`. Returns plain data for the client:

- the team (with the league's line), its record, the league's picks on it (Over and Under) with `evaluateCall` on both
  bases, the fades on each pick with `evaluateFade`, managers;
- the game log result;
- the sportsbook block: `book`, `lockedLine` (`league.lines.values[teamId]`, null before the draft), `latestLine`,
  `asOf`, `error`.

**Latest line rule:** `latestLine` is FanDuel's current value only when the read's `season` equals the league's
`seasonLabel` and FanDuel has an open market for the team. Otherwise null, and the page says no current market is
available. `LINE_SOURCE=static` reports source "static" like everywhere else. A failed read shows its error with the
older read's time; the frozen line is never shown as the latest line.

## Page

### Visual design source of truth

`docs/superpowers/specs/2026-10-09-team-detail-page-reference.png` is the **single source of truth for the page's
visual design**: layout, proportions, spacing, typography scale and weight, colours, borders, the chart's look
(lines, dots, dashes, "Now" marker, shaded "Upcoming" region, legend), the stat strip, the sportsbook panel and the
fieldset-style ownership cards. Every component below must be built and reviewed against that image. Where this spec's
text and the image disagree on a visual point, the image wins, except for these deliberate differences:

- Breadcrumb reads `{league name} / {team}` (not `Rosters / {team}`); no sidebar item is highlighted.
- No "ILLUSTRATIVE DATA" tag and no "Illustrative market snapshot" note; all values are real league data.
- With Show projected off, the projected stat, projected points, projected line and their legend entries are gone and
  the layout closes up (no empty placeholders).
- States the image doesn't show (unavailable history, no market, undrafted side, several fades, before the draft,
  completed season) follow this spec, styled to match the image.
- Colours come from the app's tokens (`over`, `under`, `positive`, `negative`, `accent`, `ink-*`, `fog-*`), picked
  to match the image; no raw hex except team colours.

The image's team, managers, numbers and market values are illustrative and are never hardcoded.

### Header

Logo and `{city} {name}`, then `{league name} • {season}`. Right side: `Show projected` switch (on by default,
component state, like Rosters) and the team selector. Breadcrumb above.

### Summary strip

One panel of four centred stats with dividers (a new `TeamStatStrip`; `StatCard` has icons and a different layout).
Numbers through `src/lib/format.ts`.

| Stat | Value | Under it |
|---|---|---|
| Record | `30–18` | `48 of 82 games` |
| Locked line | `51.5` | `Frozen at draft` |
| Projected wins (only when Show projected is on) | `51.3` or "Not available" | `0.2 below line` / `above line` / `on the line` |
| Wins needed for Over | `22` | `34 games remaining`; "Out of reach" added when needed > remaining; "Clinched" when 0 |

With Show projected off the strip has three stats. Before the draft (no frozen lines) the locked line reads "Set at
draft start" and "Wins needed" is left out.

### Season progress chart

`SeasonProgressChart`, a client component drawing its own SVG (no chart library). Scales to its container's width at
a fixed height.

- Series: actual wins (solid blue, dots, through the current game), locked-line pace (gray dashed, across the whole
  window), projected wins (blue dashed from the current actual total, only with Show projected on).
- `SegmentedControl` with "Last 8" (default) and "Full season". In "Last 8": a subtle dashed vertical line with a
  "Now" label at the current game, the future region lightly shaded and labelled "Upcoming".
- Axes: X "Games played" (game number), Y "Wins" (cumulative). Legend lists only the series shown.
- Tooltip on hover, focus and tap: invisible hit column per game position. Shows game number; date, opponent
  (vs/@) and result when known; actual wins where available; locked-line pace; projected wins where shown.
- States:
  - Game log unavailable → a "Game history unavailable" panel with the feed error; the rest of the page loads.
  - `partial` / `mismatch` → chart of what the log has, plus "Game log covers N of M games" or "Game log doesn't
    match the stored record yet".
  - No games played → pace only, "No games played yet."
  - Before the draft → no pace series (no frozen line).
  - Season complete → "Last 8" shows games 75–82, no Upcoming region; projected equals actual.

### Sportsbook line panel

Source (`FanDuel`), "At draft" (locked line), "Latest available", "Movement" (latest − locked, signed, coloured by
sign and written with "wins"), "Updated {time}" from the read's `asOf`, and "League scoring uses the locked {line}
line." No latest line → "No current {book} market" in place of the value; movement is left out; the locked line
stays. Before the draft "At draft" reads "Not locked yet".

### Ownership cards

`OwnershipCard`, one for OVER (lime, `over`) and one for UNDER (purple, `under`): a `<fieldset>` whose `<legend>`
heading breaks the coloured border at its midpoint. No arrows; the card does not repeat its side.

- Manager avatar and name (`ManagerAvatar`), or "Undrafted".
- Points via `SignedValue` (positive green, negative red, independent of side):
  - season settled (82 games) → "Final points" and final status "Hit" / "Missed";
  - otherwise with Show projected on → "Projected points" and "On track to hit" / "On track to miss" with the
    projected wins versus the line; zero games played → "Not available";
  - otherwise with Show projected off → no points; status only when the outcome is already decided by the record
    ("Clinched" when the side can no longer lose, "Can no longer hit" when it can no longer win). This is display
    arithmetic, not a scoring rule.
- Fades below the card, one row per fading manager (several allowed): avatar, "{name} is fading this {Over|Under}",
  and with Show projected on the `fadeStatus` label ("On track" / "Off track") and "+2 projected pts" / "0 projected
  pts" from `evaluateFade`. Settled seasons show the final fade status. No fades → "No fades on this pick."
  An undrafted side shows no fade section.

### Layout

`xl+`: header, strip, then chart (2/3) beside the sportsbook panel (1/3), then the two ownership cards side by side.
Below `xl`: one column in that order; the strip wraps to two columns below `sm`. No horizontal page scroll at 375 px or
1440 px; the chart never scrolls.

## Edge cases not defined by the brief

- **Integer lines (push):** the existing rule (push = miss) is kept; wins needed uses `floor(line) + 1`.
- **Record versus log disagree:** the chart trims to the record and notes the gap; scores always use the record.
- **Postponed games:** ESPN lists them without a result; they stay upcoming and keep their game-number order by date.

## Testing

- Test-first: `parseEspnSchedule` (fixture with preseason, playoff, completed and upcoming events; bad season;
  > 82 games), `actualSeries` (complete, partial, mismatch, zero games), `projectedAt`, `winsNeededForOver` (half and
  integer lines), `chartWindow` (0, 3, 48, 81, 82 games; both modes), `yBounds` (padding, minimum span, never below
  0, full-season headroom).
- Mock data: every team's mock game log adds up to its mock record.
- `npm test && npm run lint && npm run typecheck && npm run build`; check the page at 375 px and 1440 px on the demo
  league and on a stored league (`RECORD_SOURCE=static LINE_SOURCE=static`).
- Visual check: screenshot the page at 1440 px and compare it side by side with the reference image; every UI task's
  review includes that comparison.
