# 30/30 Challenge — design

Date: 2026-10-13. Status: rules approved in the request of 2026-10-13 (the "Implement Courtline's 30/30 Challenge"
brief, with the approved desktop mockup); the open product decisions below were delegated ("prefer the smallest
reliable solution … and document the choice"). Out of scope: accounts or identity verification, personal sign-in links
for challenge entries, messaging, prizes, payments, per-league changes.

## Goal

A single-player competition next to the leagues. Anyone opens `/challenge`, picks Over or Under for all 30 teams, names
their entry and saves it. They can come back and change picks until one global deadline (30 minutes before the
season's first regular-season tip-off). At the deadline every entry locks and all of them score against one shared,
frozen set of FanDuel lines, using Courtline's existing pick scoring. During the season they follow projected scores;
at the end, final scores. A public leaderboard ranks the entries.

## Reused infrastructure (what exists today)

| Need | Existing piece | Use |
|---|---|---|
| FanDuel win totals | `src/server/lines.ts` `readLines()` (cached 5 min, 30 s retry; `LINE_SOURCE=static` mock) | The challenge's current lines. Unchanged. |
| Scoring | `src/lib/scoring.ts` `evaluateCall`, `projectWins`, `isSettled`, `callPoints` | Every challenge pick score. No new scoring rules. |
| Team records | `team_records` (per season, shared), `loadSeasonRecords`, `withRecords`, daily cron | The challenge reads season 2027's stored records. The cron also refreshes the challenge's season. |
| Schedule | `src/lib/game-log/espn.ts` `parseEspnSchedule`, `src/server/game-log.ts` `gameLogSource` (cached 10 min) | The opening tip-off = earliest regular-season game across the 30 team schedules. |
| Identity | `sessions` + `courtline_session` cookie (`getSession`, `ensureSession`) | An entry is owned by the session that first saved it. |
| HTTP | `src/server/http.ts` (`isSameOrigin`, `readJsonBody`, `errorResponse`), `DomainError` | The save endpoint. |
| Teams | `TEAM_INFO` (`src/data/teams.ts`) | The 30 cards. Divisions are added there as `TEAM_DIVISIONS` (teamId → division). |
| UI | `Panel`, `Button`, `SidePill`, `SignedValue`, `PaceBar`, `TeamLogo`, `Select`, `Badge`, `Alert`, tokens | Every challenge page. |

League frozen lines (`leagues.lines`) are never read or written by challenge code.

## Rules (as approved)

- One side per team; all 30 required for the first save; later saves always carry all 30.
- Changes allowed until the deadline: `deadline = openingTipoff − 30 min`, the opening tip-off being the first
  regular-season game of the whole league, read from ESPN's schedule (never hardcoded).
- At the deadline: entries read-only; the frozen lines are the latest FanDuel lines observed before the deadline; every
  entry scores against them.
- Scoring is `evaluateCall` exactly: +1 / −1 base, ±0.1 per win of margin, push 0, no fades, no awards. Projected =
  pace (`wins ÷ played × 82`), "Not available" at 0 games; final once a team has played 82.
- Entry total = sum of its scored picks. Never counts an unplayed or unsettled team as zero.

## Decisions taken (smallest reliable choice, documented)

1. **Identity: the session.** `challenge_entries.owner_session_id` references `sessions(id)` `ON DELETE SET NULL`, unique
   per season. A browser holds at most one entry per season; it edits only its own (no endpoint takes an entry id for
   writing). When the session ends (cookie cleared, 90 idle days) the entry stays on the leaderboard and counts, but no
   browser can edit it or see it as "yours". **Limitation:** one person can create several entries from several
   browsers; there is no identity verification. Documented on How It Works and in CLAUDE.md. Personal sign-in links for
   entries are a possible follow-up.
2. **Display name** required on the first save (same rule as league names: trimmed, 1–24 characters). Not unique.
   Changeable until the deadline.
3. **Reference line = the server's line when the pick is saved.** On each save the server compares each submitted side
   with the stored one: an unchanged side keeps its `line_at_pick` and `picked_at`; a new or changed side gets the
   server's current FanDuel line for that team (null when FanDuel has none) and the database time. The client never
   supplies lines. Flipping a side and back before saving is unchanged.
4. **A team with no current line can still be picked** (direction is what is chosen; scoring uses the frozen line). Its
   card says "No line posted".
5. **Others' picks are hidden until the lock.** Before the deadline the leaderboard lists entrant names only; viewing
   another entry shows "Picks are revealed when the challenge locks". Your own entry is always visible to you.
6. **Movement colours are neutral** (fog/ink with ▲/▼), unlike the mockup's red/green: the brief says movement must not
   read as favourable or unfavourable, and red/green would.
7. **Unsaved work** is kept as a local draft in `localStorage` (`courtline.challenge.draft.v1.{season}`): all working
   picks plus the name, restored on return with an "Unsaved changes" badge and a Discard action. A draft is never an
   entry; it never reaches the server until Save. `beforeunload` warns while there are unsaved changes. Drafts are
   dropped once the challenge locks.
8. **No schedule → no saving.** Until a deadline has been read at least once, Save is refused (`deadline_unavailable`)
   and the page says why. Selections can still be made (they stay in the local draft).
9. **Once the stored deadline passes, the challenge stays locked**, even if a later schedule read moves the opening
   game. Before that, every successful schedule read (at most every 10 minutes while anyone uses the challenge, plus
   the daily cron) replaces the stored tip-off. If a read moves the opening game earlier into the past, the challenge
   locks at that moment. **Limitation:** saves accepted between the true deadline and that detection stand (bounded by
   the check interval).
10. **Per-team freeze.** For each team the frozen line is its value in the latest snapshot observed strictly before the
    deadline that has a line for it. A team never observed before the deadline has no frozen line: its picks are
    "Unavailable" for every entry, excluded from every total, and the condition is shown on the pages. Nothing is ever
    fabricated or zeroed.
11. **Ranking ties** share a rank (1, 1, 3), comparing unrounded totals with a 1e-9 tolerance; display order among ties
    is name (case-insensitive), then entry id. Before any game: entrants listed by name, no ranks, scores "–".

## Lifecycle

`challengePhase(season, now, teams)` (pure):

| Phase | When | Writes | Lines shown |
|---|---|---|---|
| `schedule_unknown` | no deadline stored yet | refused | live FanDuel |
| `open` (Preseason) | now < deadline | allowed | live FanDuel + movement |
| `locking` | now ≥ deadline, freeze not stored yet | refused | "Locking…" (the request freezes) |
| `locked` | frozen, no team has played | refused | frozen |
| `in_season` | frozen, some games played | refused | frozen; projected scores |
| `final` | frozen, every team has played 82 | refused | frozen; final scores |

Any challenge page render or save after the deadline first runs the freeze (idempotent), so `locking` is momentary.

## Data (migration `0005_challenge`)

```
challenge_seasons
  season smallint PK                       -- end year: 2027 for 2026–27
  opening_tipoff timestamptz null          -- earliest regular-season game
  opening_teams jsonb null                 -- [awayId, homeId] of that game, display only
  deadline timestamptz null                -- opening_tipoff − 30 min
  schedule_checked_at timestamptz null     -- last schedule attempt
  schedule_error text null                 -- why the last attempt failed; null on success
  locked_at timestamptz null               -- when the freeze was stored; null until then
  frozen_lines jsonb null                  -- teamId → line
  frozen_line_times jsonb null             -- teamId → ISO observed time of that line
  frozen_missing jsonb null                -- teamIds with no pre-deadline line
  frozen_source text null                  -- "FanDuel"
  check: locked_at is null or frozen_lines is not null

challenge_line_snapshots
  id serial PK
  season smallint, source text
  observed_at timestamptz                  -- LineSet.asOf of the read that first saw these values
  confirmed_at timestamptz                 -- latest read with identical values
  lines jsonb                              -- teamId → line (only teams with a line)
  index (season, observed_at)

challenge_entries
  id text PK                               -- random public id (12 chars), safe to show
  season smallint not null
  owner_session_id uuid null → sessions(id) on delete set null
  display_name text not null
  created_at timestamptz, saved_at timestamptz   -- first and latest official save
  unique (season, owner_session_id)

challenge_picks
  entry_id text → challenge_entries(id) on delete cascade
  team_id text, side text check in (OVER, UNDER)
  line_at_pick real null                   -- FanDuel line when this side was saved
  picked_at timestamptz not null
  PK (entry_id, team_id)
```

Scores are never stored; they are derived on read from picks, `frozen_lines` and `team_records`.

Snapshots: every successful read of FanDuel made for a challenge page, the save route or the cron is recorded. Identical
values to the latest snapshot only push its `confirmed_at`; different values insert a row with `observed_at = asOf`.
Only the challenge's season (`LINES.season`) is recorded; a read for another season is ignored.

## Server operations (`src/db/challenge.ts`, all on PGlite in tests)

- `recordLineSnapshot(db, season, lineSet)`.
- `syncChallengeSchedule(db, season, read, now)`: locks the season row (creating it); refuses to change a locked season
  or one whose stored deadline has passed; stores tip-off, teams, deadline and `schedule_checked_at`, or only the error
  and time on a failed read.
- `freezeChallenge(db, season)`: locks the season row `FOR UPDATE`; returns the stored freeze when present; does nothing
  before the deadline (database clock); otherwise computes the per-team freeze from snapshots with
  `observed_at < deadline` and stores it with `locked_at`. Idempotent; concurrent calls serialize on the row lock and
  the second sees the first's result.
- `saveChallengeEntry(db, { season, sessionId, displayName, picks, currentLines })`: one transaction. Locks the season
  row `FOR SHARE` (a schedule change or freeze waits), reads `clock_timestamp()` after the lock, refuses unless a
  deadline exists and now < deadline (`challenge_locked`, `deadline_unavailable`), finds or creates the session's entry
  and locks it, applies decision 3, writes the picks, sets `saved_at`. Returns the entry.
- `loadEntryForSession`, `loadEntry(id)`, `listEntries(season)` (entries with picks, no session ids).

`src/server/challenge.ts` orchestrates a page load: refresh the schedule when the last check is older than
`CHALLENGE.scheduleCheckMinutes` (fetches happen outside transactions), read FanDuel and record the snapshot, freeze
when due, load records and the viewer's entry. `/api/cron/challenge` (daily, `CRON_SECRET`) does the same without a
viewer, and the records cron also refreshes the challenge's season.

## API

`PUT /api/challenge/entry` — body `{ displayName: string, picks: [{ teamId, side }] }`. Same-origin only. Validation:
an array of exactly 30 objects, known team ids, `OVER`/`UNDER`, no duplicate team (`invalid_picks`, 400; fewer than 30
distinct teams: `incomplete_entry`, 400), name (`invalid_name`). Then `challenge_locked` (409) or
`deadline_unavailable` (503). Success returns the saved entry (picks with reference lines, `savedAt`). Creates the
session cookie when missing.

## Pages (own shell: sidebar on lg+, bottom tabs below)

Nav: Home (`/`), 30/30 Challenge (`/challenge`), My Picks (`/challenge/my-picks`), Leaderboard
(`/challenge/leaderboard`), How It Works (`/challenge/how-it-works`). The home page gains a "30/30 Challenge" panel;
league navigation is untouched.

- **`/challenge`** — the mockup. Header (title, season, rules in a sentence, "change picks until the deadline"). Filter
  row: All Teams / Unpicked / Eastern Conference / Western Conference (one at a time) plus a "Moved lines only" chip that
  combines with them and clears with ×; Sort by: Conference (A→Z), Team (A→Z), Line (high→low), Line (low→high),
  Line movement (largest). Grid of 30 cards: logo, name, "East • Southeast", current line (large) with the reference
  line struck through and a neutral ▲/▼ size badge when a saved pick's line moved, Over/Under buttons (Over lime,
  Under purple when selected; dashed outline while unpicked). Right rail (stacks below the header on smaller screens):
  deadline countdown with the 30-minute rule and the actual deadline and opening game; Your Progress (X / 30, bar,
  selected, remaining, "Save completed challenge before the deadline"); Line Movement (count of moved saved picks,
  "Your selections are unchanged", Show moved lines only); Scoring Reminder; name field and the Save button ("Save
  Picks", or "Save Picks Against Updated Lines" when a saved pick's line moved), with the saved time or "Unsaved
  changes". Below xl a sticky save bar sits above the bottom tabs. After the deadline: no buttons, the selected side
  only, "Frozen line" labels, a locked banner, links to My Picks and the leaderboard.
- **`/challenge/my-picks`** — no entry: a call to action. Before the lock: the saved picks, latest lines, movement and
  "Edit picks". After: summary (total projected or final score, picks on pace, rank) and per-team rows: side, frozen
  line, record, projected wins, projected points, final points, status. Table → cards by container width.
- **`/challenge/leaderboard`** — before the lock: entrant count and names. Locked, no games: names, "–". In season:
  rank, name, projected score, picks on pace. Final: final scores. The viewer's row is highlighted ("You"). Rows link
  to `/challenge/entries/{id}`.
- **`/challenge/entries/{id}`** — read-only entry (same results view as My Picks), hidden picks before the lock unless
  it is the viewer's own.
- **`/challenge/teams/{teamId}`** — the team page, challenge flavour: the existing `TeamStatStrip` and
  `SeasonProgressPanel` (ESPN game log) against the challenge's frozen line (none before the lock), and the viewer's
  pick with its scores. Team names on My Picks and entry views link here.
- **`/challenge/how-it-works`** — selections, moving lines, the deadline, frozen lines, scoring, the identity
  limitation.

## Error handling

- FanDuel down: the page shows the last good lines with "Couldn't refresh: …"; no snapshot recorded from a failed read.
  No lines ever read: cards show "No line posted"; picking and saving still work.
- ESPN schedule down: the stored deadline stands; the countdown says when the schedule was last checked. Never read:
  `schedule_unknown`, saving refused with a message.
- Records missing: 0–0, so projected "Not available" — never zero points.
- Missing frozen lines: "Unavailable" picks, excluded from totals for everyone, with a banner naming the teams.

## Testing

Pure (`src/lib/challenge/*.test.ts`): save parsing; reference rebasing (unchanged kept, changed rebased, flip-back
unchanged, missing line null); movement and save label; filters and sorts; opening game from logs; deadline; per-team
freeze (post-deadline snapshot ignored, missing team, latest wins); phase; entry scoring (correct/incorrect both sides,
margins, push, zero games, projected vs final, missing frozen line) and ranking (ties, deterministic order, pre-game).
Database (`src/db/challenge.test.ts`, PGlite): first save and update, one entry per session, another session can't
touch it, save before/at/after the deadline, unchanged picks keep references, idempotent freeze, snapshots after the
deadline ignored, schedule sync rules, league lines untouched. API validation via the parser tests. UI verified in the
browser at 1440 px and 375 px: filters, progress, save labels, saved/unsaved state, locked read-only, leaderboard.
Existing suites stay green.
