@AGENTS.md

# Courtline — project conventions

NBA season win-total draft league prototype. Spec: `docs/superpowers/specs/2026-10-19-nba-schedule-game-detail-design.md`
(NBA schedule). Plans in `docs/superpowers/plans/`.
Mockups: `wiremocks/`.

## Production
- Deployed on Vercel from `main`: https://nba-over-under-iota.vercel.app (a deploy takes ~1–2 minutes after a push).
  Real league for checks: https://nba-over-under-iota.vercel.app/l/bgtpyh (e.g. `/l/bgtpyh/teams/ATL`). Read-only
  checks only: never draft, refresh records or claim links there unless the user asks.
- Production prefetches (App Shells); `next dev` never does. Measure navigation speed on production, not locally.
- Load-time work: `docs/perf/log.md` (findings, iterations, ideas) and the `perf-iteration` skill (`scripts/perf.mjs`,
  `scripts/perf-nav.js`). Run it repeatedly with `/loop /perf-iteration`.

## Commands
- `npm run dev` — dev server on :3000 (`.claude/launch.json` → "dev"); `RECORD_SOURCE=static LINE_SOURCE=static npm run dev` works offline
- `npm test` — Vitest unit tests (`npm run test:watch` to watch); database tests run on in-memory PGlite
- `npm run lint`, `npm run typecheck`, `npm run build`
- `npm run db:generate -- --name <change>` after editing `src/db/schema.ts`; commit the new file in `drizzle/`
- `npm run db:migrate` — apply migrations to `DATABASE_URL` (Postgres). PGlite migrates itself on open.
- `TEST_DATABASE_URL=postgres://… npm run test:pg` — row-lock concurrency tests on a real Postgres
- `scripts/smoke.sh http://localhost:3000` — two-browser API smoke test against a running server (challenge saves are skipped when the challenge is locked)
- Before claiming work is done: `npm test && npm run lint && npm run typecheck && npm run build`

## Stack
Next.js 16.4 App Router (`src/app`), React 19, TypeScript strict, Tailwind CSS v4 (tokens in `src/app/globals.css`),
Vitest 4.1 (Node 20; Vitest 5 needs Node ≥ 22.12) with config `vitest.config.mts`, lucide-react, Drizzle ORM 0.45 on
Postgres (`pg` in production, PGlite for local dev and tests). Cache Components is on: wrap anything that reads
`params`, `cookies()` or the database in `<Suspense>` (copy the pattern in existing pages); `getDb()` awaits
`connection()` so queries never run during a prerender. Read `node_modules/next/dist/docs/` before using an unfamiliar
Next API.

## Architecture
- `src/config/` — the only home for tunable numbers: `SCORING` (scoring weights and season award points), `LEAGUE_DEFAULTS` (4 managers,
  11 rounds), `LEAGUE_LIMITS` (2–12 managers, rounds up to ⌊60 ÷ managers⌋), `SEASON` (demo season label and the previous season shown as "wins"),
  `LINES` (book, drafted season, feed cache timings), `RECORDS` (records source, refresh cooldown, fetch timeout, game-log cache timings), `DRAFT_POLL_INTERVAL_MS`, `ACCESS` (session and invite lifetimes),
  `TUTORIAL`, `TUTORIAL_SEASON` and `TOUR` (`tour.ts`: guided demo size and pacing, simulated season, overlay spacing),
  `CHALLENGE` (`challenge.ts`: season and season year, lock minutes before tip-off, schedule check interval, name length, tie tolerance),
  `NBA_SCHEDULE` (`schedule.ts`: schedule season, source, fetch timeout, Central time zone and label, schedule/summary cache and retry timings, form games and hot/cold thresholds, date strip length).
- `src/lib/` — pure TypeScript (no React, no `next/*`, no `server-only`), unit tested. Scoring, standings, season awards
  (`awards.ts`), snake draft, formatting, permissions, league commands (`league/commands.ts`: every mutation's
  decision), tokens and link rules (`access/`), lines (`lines.ts`), team records (`records/`: ESPN parsing and checks),
  game logs (`game-log/`: ESPN schedule parsing, cumulative wins and pace, chart model, per-team cache), chart window
  and Y axis (`chart-window.ts`), team page decisions (`team-detail.ts`: ownership, pick and fade statuses, latest
  market line), feed errors (`feed-error.ts`), league size rules (`league/config.ts`), draft order
  (`league/draft-order.ts`), scripted test drafts (`draft-scenarios.ts`, tests only), environment checks (`env.ts`),
  seeded randomness (`random.ts`), the 30/30 Challenge (`challenge/`: save parsing and reference rebasing `picks.ts`, line
  movement `movement.ts`, card grid filters and sorts `grid.ts`, opening game and deadline `schedule.ts`, per-team freeze
  `freeze.ts`, `phase.ts`, entry scoring and ranking `scoring.ts`, `visibility.ts`, page models `board.ts` / `status.ts`),
  the NBA schedule (`nba-schedule/`: ESPN scoreboard and summary parsing `espn.ts`, vig-free win chances from moneylines `odds.ts`,
  last-5 form, heat and conference tables `form.ts`, Central game days and the date strip `game-day.ts`, who is on a game
  `interest.ts` / `game-stakes.ts` / `summaries.ts`, query params `params.ts`), a keyed success/failure/in-flight read cache
  (`feed-cache.ts`),
  guided demo (`tutorial/`: in-memory league commands, deterministic draft simulation,
  steps, snapshot; the season: `season.ts` simulation, `season-steps.ts` derivation, `season-story.ts` the user's
  numbers, `season-copy.ts` words) and tour layout (`tour/`: target ids, geometry, callout placement).
- `src/data/` — the single mock dataset: `teams.ts` (30 teams: prior wins, current record, `TEAM_DIVISIONS`), `schedule.ts` (the mock opening game), `static-lines.ts` (the
  mock lines), `game-logs.ts` (mock game-by-game results that add up to the mock records) `demo-league.ts` and
  `tutorial-league.ts` (the guided demo's fixture: live 4 × 11, empty board). Never add per-page fixtures.
- `src/db/` — Drizzle schema, repositories and `actions.ts` (every league mutation); `challenge.ts` (every challenge write and read:
  snapshots, schedule sync, freeze, entry save). No `server-only`, so Vitest can
  load it; only `src/server/` and `src/app/` (the route handlers) import it, never components. Migrations live in
  `drizzle/`.
- `src/server/` — server-only glue (`import "server-only"`): database singleton, session cookie, league loading, links,
  line source, outside feeds (`feed.ts`), record source (`records.ts`), game-log source (`game-log.ts`), team page
  loader (`team-page.ts`), challenge orchestration (`challenge.ts`: `prepareChallenge`, board loader; `challenge-pages.ts`:
  results, leaderboard and team loaders), NBA schedule (`nba-schedule.ts`: cached ESPN scoreboard, summary and team form reads;
  `game-interest.ts`: the viewer's league and challenge stakes; `nba-pages.ts`: `/nba` and game page loaders), cron auth (`cron.ts`), HTTP helpers.
- `src/app/api/` — JSON route handlers for every mutation. Pages read through `src/server/` in server components and
  pass plain data to client components.
- `src/components/challenge/` the 30/30 Challenge pages (own shell and nav; `challenge-draft.ts` the local draft store, `use-clock.ts` the countdown clock).
- `src/components/nba/` the NBA schedule and game pages (own shell `NbaShell` / `NbaNav`; pages in `src/app/nba/`).
- `src/components/ui/` shared primitives, `shell/` navigation, then one folder per page area. `tour/` reusable
  guided-tour overlay; `tutorial/` the guided draft and season (`tutorial-store.ts` is the one shared demo state). `DraftRoomView` renders from a `DraftRoomDriver`; `DraftRoom` feeds
  it `useLeagueDraft`.

## Domain rules
- Every score, standing and displayed total is derived from picks, fades and team records through
  `src/lib/scoring.ts` and `src/lib/standings.ts`. Never hardcode a display total or re-implement scoring in a component.
- Two bases, always shown separately: `projected` (win pace = wins ÷ games played × 82) and `final` (settled once the
  team has played 82 games).
- Season awards (`src/lib/awards.ts`, decided inside `computeStandings`): Best Pick (`SCORING.bestPickAward`, +2) and
  Worst Pick (`worstPickAward`, −2) go to the owners of the retained picks with the highest and lowest individual pick
  score on the basis, compared unrounded before any award points (1e-9 tolerance for float noise). Every tied pick gets
  the full award; one manager can win both. Voided picks, undrafted sides, picks of non-managers and fades never take
  part, and a pick's own score never includes its award (`awardPoints` is separate; `totalPoints` = calls + fades +
  awards). Pending (no winners, no points) until the draft reaches `fades` and every retained pick is scored on the
  basis: projected once each drafted team has played, final once each has played 82. The overview opens on the final
  basis once final standings are complete. Not configurable per league.
- Push: a margin of exactly 0 (final wins or pace equal the line) earns 0 for the pick and for a fade on it
  (`CallEvaluation.push`).
- Zero games played → "Not available". Unsettled pick on the final basis → "Pending". Before any game the standings and
  summary show "–" and "Not available", never zeros ranked by seat. A settled team page shows "Final wins".
- Draft: snake order; each team's Over and Under are separate sides (60). The commissioner sets 2–12 managers and
  1–⌊60 ÷ managers⌋ rounds before the start (`PUT /api/leagues/{id}/config`, `decideLeagueConfig`; seats are added or
  removed at the end, never a claimed one); default 4 × 11 = 44 picks.
- Draft order: `managers.seat` is the order (round 1 in seat order, the snake reverses after). Before the start the
  commissioner reorders or randomizes it in the draft lobby and saves (`PUT /api/leagues/{id}/order`,
  `decideDraftOrder`): every manager id exactly once (`invalid_order`), refused once the draft starts
  (`order_locked`). Reordering renumbers seats only; ids, names, links and sessions stay. Randomize is a client-side
  Fisher–Yates over `crypto.getRandomValues` into the unsaved order. Seats are removed from the end of the order; a
  new seat takes the smallest unused id `m{n}`. Labels, initials and avatar colors follow the id (`managerNumber`),
  never the position.
- A manager holds at most one side of each team (`team_already_held`). A confirm names its `pickNumber`; any other pick
  number is `stale_pick`.
- Early end: after each pick, if the manager on the clock for the next pick has no eligible side (every open side is
  the other side of a team they hold), regular drafting ends for everyone in the same write: only completed rounds are
  kept (`draft.picks`), the cut-short round's picks move to `draft.voidedPicks` (stored as `picks.voided`, shown on the
  board as Voided, never scored or faded; `voided_pick`) and `draft.blockedPick` records where it stopped. The
  configured last pick always finishes normally. 4 × 11 can never end early.
- Fade stage: the last pick (or an early end) moves the draft to `fades` (not `complete`). Each manager submits one fade
  (`{ type: "fade", managerId, targetPickNumber }` on the draft endpoint) on another manager's pick, in any order; several
  may share a target. The commissioner also fades for unclaimed seats. A stored fade is locked (`fade_locked`; table
  `fades`, one row per manager). The last manager's fade completes the draft. Rules in `src/lib/fades.ts`.
- Lines come from `lineSource` (`src/server/lines.ts`): FanDuel's public NBA JSON (one book, never mixed; unofficial
  and keyless, so it can break), cached 5 min, failures retried after 30 s; `LINE_SOURCE=static` serves the mock
  lines. Before the draft `LeagueView.lineReview` shows each team's book line plus the commissioner's overrides
  (`PUT /api/leagues/{id}/lines`); the start request names the reviewed lines (`lines_changed` if they moved) and
  freezes them into `League.lines` with `season` and the `manual` teams. Components read teams with lines from
  `LeagueView.teams`, never from `src/data`.
- Team records come from ESPN's standings JSON (`RECORD_SOURCE=static` uses the mock records), stored per season (end
  year) and team in `team_records`; every stored league in a season shares them. A refresh saves all 30 or nothing and
  never lets games played go down. The commissioner refreshes from the Overview; `/api/cron/refresh-records` runs daily
  at 10:00 UTC with `CRON_SECRET`. The demo league keeps its mock records in code. `prevWins` (`src/data/teams.ts`) holds the real 2025–26 final wins
  (`SEASON.previousLabel`); update it with `SEASON` each season.
  A refresh with `RECORD_SOURCE=static` stores mock records under the real season; games played may never go down, so
  later ESPN refreshes of it then fail. Delete `.data/pglite` (or those `team_records` rows) after testing with it.
- Team page (`/l/{id}/teams/{teamId}`; breadcrumb to the overview, no nav item highlighted; team names and logos on the
  Overview and Rosters link to it via `TeamLink`). Game history comes from ESPN's team schedule JSON, read per team when
  the page opens (cached 10 min, failures retried after 30 s, never stored); the NBA Cup Championship and postponed
  entries are dropped. The chart trims the log to the stored record's games played and says so when the log is short or
  disagrees. The demo league and `RECORD_SOURCE=static` use the mock log. A failed game log or line read only empties
  its own panel. The sportsbook panel shows FanDuel's current line only for the league's season, never in scoring;
  locked-line pace and wins needed use the frozen line.
- Guided demo (`/l/demo/draft`, replacing the code-built demo's draft room): an in-memory league (`tutorial`, never
  stored, `isDemo: false` so the rules run) in a real `DraftRoomView`; every command, simulated or not, goes through
  `decideDraftAction` (`applyTutorialCommand`). The step is derived from league state alone (`tutorialStep`): no
  draft step waits on a Continue; the user's pick, fade and the simulations move it. Tag tour targets
  with `tourTarget(id)` from `src/lib/tour/targets.ts`, never by class or text. State lives in `sessionStorage`
  (`courtline.tutorial.v1`) as a replayable snapshot (draft commands, season progress), read and
  written only through `tutorial-store.ts` (`useSyncExternalStore`), never per-page state or effects: Next keeps left
  routes mounted but hidden (`<Activity>`) and restores their state, so a per-page copy goes stale. ESLint forbids
  server, database and `fetch` use in the demo folders.
- Guided season (`/l/demo`, `/l/demo/rosters`, `/l/demo/teams/{id}`; `DemoSeason`): the real Overview, Rosters and team
  page fed the completed demo draft (shown as id `demo`, `isDemo: true`), or "Finish the demo draft first". Three
  checkpoints (Draft complete, Midseason at 41 games, Final results at 82) advanced by `SeasonControl`, which first plays
  the games for a moment (progress bar, `PLAYING_LINES`; only that animation is local state). Awards are
  introduced at Midseason, once there are leaders (`mid-awards`), and settled at Final results (`final-awards`); the
  spotlit awards panel shows the winners and the callout only says whether they changed who leads
  (`awardImpactStory`). Final results opens on the user's own pick and fade and
  closes on the final standings (`final-finish`). One synthetic
  82-game W/L sequence per team, seeded by the draft's picks (`simulateSeason`; strength = line + normal spread, never
  favouring anyone); a checkpoint is a prefix of it. The team page gets that log (no dates or opponents, upcoming games
  unplayed), no sportsbook panel, and a "Simulated demo season" note. The step is `seasonStep(progress, page)`: the
  required team-name click is recognised by the team page opening, the way back by the overview. Scores only through
  `computeStandings` / `evaluateCall`.
- 30/30 Challenge (`/challenge`, spec `docs/superpowers/specs/2026-10-13-30-30-challenge-design.md`, whose "Decisions taken" list
  is the source of truth): a single-player competition beside the leagues. One side for each of the 30 teams, one entry per
  browser session per season (`CHALLENGE.seasonYear`), editable until one global deadline.
  - Deadline = the season's first regular-season tip-off minus `lockMinutesBeforeTipoff` (30), read from ESPN's team
    schedules (earliest game across the 30; `src/lib/challenge/schedule.ts`), unless `CHALLENGE.deadlineOverride` (an ISO
    time; 2026–27: 2026-10-25 00:00 CT) replaces it. A future override is written by the next challenge request
    (`overrideChallengeDeadline`): it reopens a season that already locked, dropping its freeze, which is taken again at
    the new deadline from the snapshots before it. No deadline read yet →
    saving is refused (`deadline_unavailable`). Before the stored deadline, each schedule read (at most every
    `scheduleCheckMinutes` while the challenge is used, plus the daily cron) replaces the tip-off; once the stored deadline
    has passed the challenge stays locked, even if a later read moves the opening game. A read that puts the opening game
    in the past locks at that moment, so saves between the true deadline and that detection stand. The decision is
    `scheduleCheck`: a stale check with a future deadline already stored runs after the response (`after()`, one read per
    instance at a time); with no deadline yet it runs inline, and the cron forces one.
  - Lines: every successful FanDuel read for the challenge season is recorded as a snapshot (`challenge_line_snapshots`;
    identical values only push `confirmed_at`). The freeze (`freezeChallenge`, idempotent, run first by any challenge
    page render or save after the deadline) stores, per team, its value in the latest snapshot observed strictly before the
    deadline. A team never observed has no frozen line: its picks are "Unavailable" for everyone and excluded from totals,
    never zero. Once frozen no request reads FanDuel (current lines are only used before the lock). League lines
    (`leagues.lines`) are never read or written by challenge code. Known limits: a snapshot write de-duplicates against the
    newest snapshot only, so in a rare race between server instances writing out of order the freeze can take an
    intermediate line; and "observed before the deadline" uses the app server's clock (`lines.asOf`), so its skew bounds how
    late a pre-deadline observation can be.
  - Reference line: on each save the server gives a new or changed side the current FanDuel line (null when none) and the
    database time; an unchanged side keeps both. The client never sends lines. Movement is shown with neutral ▲/▼, not
    red/green. A team with no line can still be picked.
  - Scoring is `evaluateCall` against the frozen line (no new rules, no fades, no awards), derived on read from picks,
    `frozen_lines` and `team_records` (season 2027, kept fresh by the records cron, which also refreshes the challenge's
    season), never stored. Entry total = sum of scored picks; unplayed or unsettled teams are never counted as zero.
    Phases (`challengePhase`): `schedule_unknown`, `open`, `locking`, `locked`, `in_season`, `final`.
  - Others' picks stay hidden until the freeze is stored, not on the app clock's `locking` phase (the leaderboard lists
    names, linked only once frozen; `visibleEntry`); your own entry is always visible to you. Before the freeze pages only
    count or list entrants (`countEntries`, `listEntrants`), never load or score picks; `prepareChallenge` runs once per
    request (React `cache`; the cron's `refreshChallenge` is uncached). Ranking: tied totals (unrounded, `tieTolerance`) share a rank (1, 1, 3); display order among ties is name
    (case-insensitive) then entry id; before any game there are no ranks and scores read "–".
  - Identity limitation: the entry belongs to the session (`challenge_entries.owner_session_id`, `ON DELETE SET NULL`);
    there is no verification, so one person can enter from several browsers, and when the session ends (cleared cookies,
    or `ACCESS.sessionIdleDays` idle) the entry stays on the leaderboard but nobody can edit it. Name required (1–24 characters, not unique), changeable until the deadline.
    No endpoint takes an entry id for writing (`PUT /api/challenge/entry` saves the caller's own).
  - Unsaved work is a local draft only (`localStorage` `courtline.challenge.draft.v1.{season}`: picks and name, dropped
    once locked; memory when storage refuses a write, until one succeeds); it never reaches the server until Save.
  - Local testing: with `RECORD_SOURCE=static` the opening game is the mock one (`src/data/schedule.ts`);
    `CHALLENGE_MOCK_TIPOFF=<ISO time>` overrides it to try the open and locked states. Delete `.data/pglite` between
    tries: a passed deadline cannot be moved back.
  - Cron: `GET /api/cron/challenge` (daily 16:00 UTC, `CRON_SECRET`) re-reads the schedule, records the lines and freezes when due.
- NBA schedule (`/nba`, `/nba/games/{id}`): player-level, read-only pages in their own shell; the viewer comes only from the `courtline_session`
  cookie. ESPN scoreboard/summary, DraftKings moneylines shown pre-game only as vig-free win chances; all times US Central ("CT").
  Interests = every same-season league the session holds a seat in (all picks and fades on either team, the viewer's rows marked "You") plus
  the viewer's own challenge side (`getViewerEntry`, never `prepareChallenge`); league rows link to that league's team page, challenge rows to
  `/challenge/teams/{id}`, schedule and standings names are plain text. Hidden in the demo. Always reads ESPN (no static mode): offline shows the feed error.
- Commissioner = `m1` (`commissionerId`), wherever they sit in the draft order. Only the commissioner starts, pauses and
  resumes, picks for unclaimed seats, manages the league invite and resets seats.

## State and identity
- Leagues live in Postgres (`DATABASE_URL`; `DATABASE_URL_UNPOOLED` is used for migrations when present). Without
  `DATABASE_URL`, outside production, PGlite at `.data/pglite` (delete the folder to reset). A production server
  without `DATABASE_URL` or `LINK_SECRET` still boots, but `register()` (`src/instrumentation.ts`, checks in
  `src/lib/env.ts`) logs what is missing and every request returns 500. The demo league
  (`/l/demo`) lives in code, never in the database, and is read-only.
- Every league write goes through `withLockedLeague` (`src/db/leagues.ts`): it locks the league row, re-reads the
  caller's seat and any link under the lock, then runs the pure decision. Never authorize a write with
  `getViewerId()`; it is for rendering.
- Challenge tables (`challenge_seasons`, `challenge_line_snapshots`, `challenge_entries`, `challenge_picks`; migration
  `0005_challenge`) are separate from leagues. Saves lock the season row `FOR SHARE` and read `clock_timestamp()` after the lock;
  the freeze and schedule changes lock it `FOR UPDATE`, so they serialize with saves.
- Identity: cookie `courtline_session` holds a random token; the database stores only its SHA-256. A session holds one
  seat per league (`session_seats`). No accounts. The old `courtline_seats` cookie grants nothing and is deleted the next
  time a route handler sets the session cookie.
- Links (`/i/{token}`, HMAC-signed with `LINK_SECRET`): one shared league invite (claims any open seat), a single-use
  seat invite (issued by a seat reset; the seat stays claimed), and a personal link per manager (signs in another
  browser). Opening a link never changes anything; only the claim POST does.

## UI conventions
- Dark theme only. Use tokens (`bg-ink-850`, `text-fog-400`, `text-accent`, `bg-under-deep`, …), not raw hex — team
  colors from data are the exception.
- Format numbers at the edge with `src/lib/format.ts` (one decimal, U+2212 minus, en-dash records). Compare unrounded.
- Rosters page: points, totals and pace show two decimals (lines stay one); a pick whose team has not played is
  projected at 0 points (`projectedPoints` in `src/lib/rosters.ts`). The overview keeps "Not available".
- Over = lime (`over`), Under = purple (`under`); positive = `positive`, negative = `negative`.
- Logos: `TeamLogo` loads `https://cdn.nba.com/logos/nba/{nbaId}/global/D/logo.svg` and falls back to `TeamBadge`.
  NBA logos are trademarks — licensing check required before any public launch.
- Unfinished pages render `NotBuiltYet`; their nav items show "Soon".
- Responsive: `lg+` sidebar, below `lg` a bottom tab bar; `xl+` two-column panels; tables switch to cards by container
  width (`@container`, `@xl:` / `@2xl:`). Wide content (the draft board) scrolls inside its own container. The page
  must never scroll horizontally — check 375px and 1440px.

## Workflow
- Task-driven: plans in `docs/superpowers/plans/`, executed one task at a time by subagents on the lightest model that
  fits (haiku when the plan has complete code, sonnet for UI/integration). The controller reviews every task and notes
  when a stronger model would have saved review rounds.
- Test-first for `src/lib/`. Tests are colocated as `*.test.ts`.
- One commit (or a few) per task; messages end with the `Co-Authored-By` trailer.
