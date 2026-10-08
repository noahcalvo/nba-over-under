@AGENTS.md

# Courtline — project conventions

NBA season win-total draft league prototype. Specs: `docs/superpowers/specs/2026-10-08-courtline-prototype-design.md`,
`docs/superpowers/specs/2026-10-08-durable-storage-sessions-design.md`. Plans in `docs/superpowers/plans/`.
Mockups: `wiremocks/`.

## Commands
- `npm run dev` — dev server on :3000 (`.claude/launch.json` → "dev")
- `npm test` — Vitest unit tests (`npm run test:watch` to watch); database tests run on in-memory PGlite
- `npm run lint`, `npm run typecheck`, `npm run build`
- `npm run db:generate -- --name <change>` after editing `src/db/schema.ts`; commit the new file in `drizzle/`
- `npm run db:migrate` — apply migrations to `DATABASE_URL` (Postgres). PGlite migrates itself on open.
- `TEST_DATABASE_URL=postgres://… npm run test:pg` — row-lock concurrency tests on a real Postgres
- `scripts/smoke.sh http://localhost:3000` — two-browser API smoke test against a running server
- Before claiming work is done: `npm test && npm run lint && npm run typecheck && npm run build`

## Stack
Next.js 16.4 App Router (`src/app`), React 19, TypeScript strict, Tailwind CSS v4 (tokens in `src/app/globals.css`),
Vitest 4.1 (Node 20; Vitest 5 needs Node ≥ 22.12) with config `vitest.config.mts`, lucide-react, Drizzle ORM 0.45 on
Postgres (`pg` in production, PGlite for local dev and tests). Cache Components is on: wrap anything that reads
`params`, `cookies()` or the database in `<Suspense>` (copy the pattern in existing pages); `getDb()` awaits
`connection()` so queries never run during a prerender. Read `node_modules/next/dist/docs/` before using an unfamiliar
Next API.

## Architecture
- `src/config/` — the only home for tunable numbers: `SCORING` (scoring weights), `LEAGUE_DEFAULTS` (4 managers,
  11 rounds), `SEASON`, `DRAFT_POLL_INTERVAL_MS`, `ACCESS` (session and invite lifetimes).
- `src/lib/` — pure TypeScript (no React, no `next/*`, no `server-only`), unit tested. Scoring, standings, snake draft,
  formatting, permissions, league commands (`league/commands.ts`: every mutation's decision), tokens and link rules
  (`access/`), lines (`lines.ts`), environment checks (`env.ts`).
- `src/data/` — the single mock dataset: `teams.ts` (30 teams: prior wins, current record), `static-lines.ts` (the
  mock lines) and `demo-league.ts`. Never add per-page fixtures.
- `src/db/` — Drizzle schema, repositories and `actions.ts` (every league mutation). No `server-only`, so Vitest can
  load it; only `src/server/` imports it. Migrations live in `drizzle/`.
- `src/server/` — server-only glue (`import "server-only"`): database singleton, session cookie, league loading, links,
  line source, HTTP helpers.
- `src/app/api/` — JSON route handlers for every mutation. Pages read through `src/server/` in server components and
  pass plain data to client components.
- `src/components/ui/` shared primitives, `shell/` navigation, then one folder per page area.

## Domain rules
- Every score, standing and displayed total is derived from picks, fades and team records through
  `src/lib/scoring.ts` and `src/lib/standings.ts`. Never hardcode a display total or re-implement scoring in a component.
- Two bases, always shown separately: `projected` (win pace = wins ÷ games played × 82) and `final` (settled once the
  team has played 82 games).
- Zero games played → "Not available". Unsettled pick on the final basis → "Pending".
- Draft: snake order; each team's Over and Under are separate sides; 4 × 11 = 44 picks out of 60 sides.
- A manager holds at most one side of each team (`team_already_held`). A confirm names its `pickNumber`; any other pick
  number is `stale_pick`.
- Lines come from `lineSource` (`src/server/lines.ts`, static for now) and freeze into `League.lines` when the draft
  starts. Components read teams with lines from `LeagueView.teams`, never from `src/data`.
- Commissioner = seat 1. Only the commissioner starts, pauses and resumes, picks for unclaimed seats, manages the
  league invite and resets seats.

## State and identity
- Leagues live in Postgres (`DATABASE_URL`; `DATABASE_URL_UNPOOLED` is used for migrations when present). Without
  `DATABASE_URL`, outside production, PGlite at `.data/pglite` (delete the folder to reset). Production refuses to
  start without `DATABASE_URL` and `LINK_SECRET` (`src/lib/env.ts`, `src/instrumentation.ts`). The demo league
  (`/l/demo`) lives in code, never in the database, and is read-only.
- Every league write goes through `withLockedLeague` (`src/db/leagues.ts`): it locks the league row, re-reads the
  caller's seat and any link under the lock, then runs the pure decision. Never authorize a write with
  `getViewerId()`; it is for rendering.
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
