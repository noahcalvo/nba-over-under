# Real team records — design

Date: 2026-10-08. Status: approved in chat. Out of scope: sportsbook lines (the live-lines work), real previous-season
wins (`prevWins` stays mock), any scheduling beyond one daily cron.

## Goal

Stored leagues score against real NBA regular-season win–loss records, kept by team and season in the database. The
commissioner can refresh them, a daily cron refreshes them too, and every league shows when records last updated. A
failed refresh never overwrites good records. The demo league keeps its in-code mock records.

## Source (researched 2026-10-08)

| Source | Result |
|---|---|
| **ESPN** `site.api.espn.com/apis/v2/sports/basketball/nba/standings?season={endYear}&seasontype=2` | All 30 teams, keyless, works from a server. `season=2026` returns final 2025–26 records. |
| `cdn.nba.com` static JSON | 403 to scripted requests |
| `stats.nba.com` | Times out; blocks cloud IPs |
| balldontlie | API key required; standings are paid tier |
| SportsDataIO and similar | Paid — rejected |

ESPN's endpoint is unofficial and can change shape. Its default (no `seasontype`) currently returns **2026–27
preseason** records, so we always send `seasontype=2` and reject a payload whose `season` or `seasonType` differs.
ESPN abbreviations differ from ours (NY, GS, NO, SA, UTAH, WSH), so teams match by nickname (`team.name`).

## Season keys

Records key on the season's end year: "2025–26" → 2026, "2026–27" → 2027 (`seasonEndYear` in
`src/lib/records/season.ts`, accepts en dash or hyphen, null for anything else). A league scores against the records
of `league.seasonLabel`.

## Data

- `team_records(season smallint, team_id text, wins smallint, losses smallint, updated_at timestamptz)`, primary key
  `(season, team_id)`, checks `wins >= 0`, `losses >= 0`, `wins + losses <= 82`.
- `record_refreshes(season smallint primary key, source text, succeeded_at timestamptz null, attempted_at timestamptz,
  error text null)`. One row per season: the last success, and the last attempt with its error (null when the last
  attempt succeeded).

## Pure logic — `src/lib/records/`

- `types.ts`: `TeamRecord { wins; losses }`, `RecordSet { season; records: Record<TeamId, TeamRecord> }` (all 30
  teams), `RecordSource { name; fetch(season): Promise<RecordSet> }`,
  `RecordStatus { seasonLabel; source; asOf: string | null; error: string | null }`. Feed problems throw the shared
  `FeedError` (`src/lib/feed-error.ts`), whose message is user-safe.
- `espn.ts`: `espnStandingsUrl(season)` and `parseEspnStandings(payload: unknown, season, resolveTeam)`. Rejects
  (FeedError) on: wrong shape, any conference with `season ≠ requested` or `seasonType ≠ 2`, an unknown team,
  a duplicate team, fewer than 30 teams, non-integer or negative wins/losses, `wins + losses > 82`.
- `validate.ts`: `checkNoRegression(stored, next)` — FeedError when any team's games played would go down.
- `merge.ts`: `withRecords(teams, records)` — replaces each team's wins/losses; missing teams get 0–0.
- `static.ts`: `staticRecordSource(name, records)` for `RECORD_SOURCE=static`.

## Shared feed seams (agreed with the live-lines session)

- `teamIdByNickname(name)` in `src/data/teams.ts`: case-insensitive; matches a nickname ("Trail Blazers") or a full
  name ending in one ("Los Angeles Clippers"). Null when nothing matches.
- `src/server/feed.ts`: `fetchFeedJson(url, { source, timeoutMs })`, throwing `FeedError` with user-safe messages
  ("ESPN didn't respond within 8 s.", "ESPN returned HTTP 403.", "ESPN sent a response we couldn't read.").

## Refresh — `refreshSeasonRecords(db, season, source, options)` in `src/db/records.ts`

1. Cooldown: when the stored last success is younger than `RECORDS.minRefreshSeconds` (60) and `force` is not set,
   return the stored status without calling the source.
2. Fetch and parse **outside** any transaction (no network while holding a lock).
3. Transaction: upsert-and-lock the `record_refreshes` row (`SELECT … FOR UPDATE`), re-read stored records, run
   `checkNoRegression`, upsert all 30 `team_records`, set `succeeded_at = attempted_at = now()`, `error = null`.
4. On any failure in 2–3: nothing in `team_records` changes; record `attempted_at = now()` and `error = message` in
   its own statement, and return the failure.

Returns `{ ok: true; status } | { ok: false; status; message }`.

## Who can refresh

- `refreshLeagueRecords(db, leagueId, sessionId, source)` (`src/db/actions.ts`): demo → `demo_league`; unknown
  league → `not_found`; the session's seat (read from the database, never `getViewerId()`) must be the commissioner →
  else `forbidden`; season label unparsable → `records_unavailable`. Then `refreshSeasonRecords`.
  Records are not league state, so this does not go through `withLockedLeague`; the refresh row lock serializes
  concurrent refreshes of a season.
- `POST /api/leagues/{id}/records/refresh` (same-origin): 200 `{ ok: true, records: RecordStatus }`, or the domain
  error, or 502 `{ error: "records_unavailable", message: <feed reason>, records: RecordStatus }`.
- `GET /api/cron/refresh-records`: requires `Authorization: Bearer ${CRON_SECRET}` (401 otherwise, 503 when
  `CRON_SECRET` is unset). Refreshes (with `force`) every distinct season used by a stored league. Returns per-season
  results. `vercel.json` schedules `0 10 * * *` (10:00 UTC, after the last West Coast game is final).

## Reading records

- `teamInfoFor(league)` (`src/server/league.ts`): demo → `TEAM_INFO` unchanged. Stored league → `TEAM_INFO` with
  `wins`/`losses` replaced from `team_records` for its season; a team with no stored record gets 0–0 (renders
  "Not available"). Stored leagues never show the mock records. The live-lines branch calls this in both its
  pre-draft and post-draft paths.
- Scores still come only from `src/lib/scoring.ts` and `src/lib/standings.ts` with the league's frozen lines.
- `LeagueView.records: RecordStatus | null` (null for the demo).
- `src/server/records.ts`: `recordSource` — ESPN (via `fetchFeedJson`) unless `RECORD_SOURCE=static`, which serves
  `TEAM_INFO`'s mock records for whatever season is asked.

## UI

Overview page, under the header: "Records updated {date, time} · ESPN" (or "Records not updated yet"), for everyone in
a stored league. The commissioner also gets a "Refresh records" button; it POSTs, then `router.refresh()`. A failure
shows an Alert: "Couldn't refresh records: {reason} Showing records from {time}." Hidden entirely on the demo.

## Config

`src/config/records.ts`: `RECORDS = { source: "ESPN", minRefreshSeconds: 60, fetchTimeoutMs: 8000 }`.

## Testing

- Unit (test-first): `seasonEndYear`, `teamIdByNickname`, `parseEspnStandings` against the saved 2025–26 final
  fixture (`espn-standings-2026-regular.fixture.json`) and the preseason fixture (rejected), plus hand-mutated
  payloads; `checkNoRegression`.
- PGlite: refresh success, failure preserves records and records the error, regression rejected, cooldown skips the
  source, `force` bypasses it, commissioner-only, demo refused, `teamInfoFor` merge.
- Smoke: `RECORD_SOURCE=static` — commissioner refresh 200, other seat 403.
