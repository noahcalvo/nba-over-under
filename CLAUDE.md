@AGENTS.md

# Courtline — project conventions

NBA season win-total draft league prototype. Spec: `docs/superpowers/specs/2026-10-08-courtline-prototype-design.md`.
Plan: `docs/superpowers/plans/2026-10-08-courtline-prototype.md`. Mockups: `wiremocks/`.

## Commands
- `npm run dev` — dev server on :3000 (`.claude/launch.json` → "dev")
- `npm test` — Vitest unit tests (`npm run test:watch` to watch)
- `npm run lint`, `npm run typecheck`, `npm run build`
- Before claiming work is done: `npm test && npm run lint && npm run typecheck && npm run build`

## Stack
Next.js 16.4 App Router (`src/app`), React 19, TypeScript strict, Tailwind CSS v4 (tokens in `src/app/globals.css`),
Vitest 4.1 (Node 20; Vitest 5 needs Node ≥ 22.12) with config `vitest.config.mts`, lucide-react. Cache Components is on: wrap anything that reads `params`, `cookies()` or the league store in
`<Suspense>` (copy the pattern in existing pages). Read `node_modules/next/dist/docs/` before using an unfamiliar Next API.

## Architecture
- `src/config/` — the only home for tunable numbers: `SCORING` (scoring weights), `LEAGUE_DEFAULTS` (4 managers,
  11 rounds), `SEASON`, `DRAFT_POLL_INTERVAL_MS`.
- `src/lib/` — pure TypeScript (no React, no `next/*`, no `server-only`), unit tested. Scoring, standings, snake draft,
  formatting, permissions, league store.
- `src/data/` — the single mock dataset: `teams.ts` (30 teams: line, prior wins, current record) and
  `demo-league.ts`. Never add per-page fixtures.
- `src/server/` — server-only glue (`import "server-only"`): store singleton, cookie identity, HTTP helpers.
- `src/app/api/` — JSON route handlers for every mutation. Pages read the store directly in server components and pass
  plain data to client components.
- `src/components/ui/` shared primitives, `shell/` navigation, then one folder per page area.

## Domain rules
- Every score, standing and displayed total is derived from picks, fades and team records through
  `src/lib/scoring.ts` and `src/lib/standings.ts`. Never hardcode a display total or re-implement scoring in a component.
- Two bases, always shown separately: `projected` (win pace = wins ÷ games played × 82) and `final` (settled once the
  team has played 82 games).
- Zero games played → "Not available". Unsettled pick on the final basis → "Pending".
- Draft: snake order; each team's Over and Under are separate sides; 4 × 11 = 44 picks out of 60 sides.
- Commissioner = seat 1. Only the commissioner starts, pauses and resumes, and they pick for unclaimed seats.

## State and identity
- Leagues live in server memory (`src/server/store.ts`, a `globalThis` singleton). A restart wipes them; the seeded
  demo league (`/l/demo`) always exists. Works on a single long-running Node process only.
- Identity cookie `courtline_seats` = `leagueId:managerId|…`. No auth — prototype only.

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
