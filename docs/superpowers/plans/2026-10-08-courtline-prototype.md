# Courtline Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Next.js prototype of Courtline (NBA win-total Over/Under draft league) with a working League overview and Draft room, league create/join, and derived scoring.

**Architecture:** Pure, unit-tested domain logic in `src/lib` (scoring, standings, snake draft, league store) driven by one mock dataset in `src/data`. Leagues live in server memory behind JSON route handlers in `src/app/api`; pages read the store in server components and hand plain data to client components. Identity is a cookie mapping league → seat.

**Tech Stack:** Next.js 16.4.0 (App Router, Cache Components on), React 19.3, TypeScript (strict), Tailwind CSS v4, Vitest, lucide-react, server-only.

**Spec:** `docs/superpowers/specs/2026-10-08-courtline-prototype-design.md`

## Global Constraints

- Project root: `/Users/noah/Desktop/projects/nba-over-under-draft`. Source in `src/`, import alias `@/*` → `./src/*`.
- Next.js `16.4.0` scaffolded by `create-next-app@16.4.0`. Cache Components is ON: any server component that reads `params`, `cookies()` or the league store must sit inside `<Suspense>`. `cookies()`, `params` and route-handler `ctx.params` are async. Bundled docs: `node_modules/next/dist/docs/`.
- Only these dependencies are added beyond the scaffold: `lucide-react`, `server-only`, `vitest` (dev).
- Scoring weights (exact): correct call `+1`, missed call `-1`, margin weight `0.1`, fade hit `+2`, fade miss `0`, season length `82` — all in `SCORING` in `src/config/scoring.ts`. No other file hardcodes them.
- Signed margin: Over → `wins − line`; Under → `line − wins`. Correct ⇔ margin > 0.
- Projected wins = `wins ÷ gamesPlayed × 82`; zero games played → `null`, displayed as `Not available`.
- A pick is settled when its team has played `82` games. Unsettled on the final basis → `Pending`, no final points.
- League defaults: `4` managers, `11` rounds → `44` picks. `30` teams × 2 sides = `60` sides.
- Snake order: odd rounds seat 0→3, even rounds seat 3→0.
- Cookie name `courtline_seats`, value format `leagueId:managerId|leagueId:managerId`.
- Logo URL: `https://cdn.nba.com/logos/nba/{nbaId}/global/L/logo.svg`, with abbreviation-badge fallback.
- Exact UI copy: `Not available`, `Available when results are final.`, `Partial results`, `On track`, `Off track`, `Pending`, `Lines lock when drafted.`, `Not built yet`, `Soon`, `Win pace`, `Final results`, `Confirm pick`, `Clear selection`.
- Number formatting: one decimal, U+2212 `−` for negatives, `+` for positives, en dash in records (`30–18`), `•` between league and season in subtitles.
- Breakpoints: `lg` (1024px) sidebar ↔ bottom tab bar; `xl` (1280px) two-column panels; tables ↔ cards by **container** width (`@container`); the page itself never scrolls horizontally (check 375px and 1440px).
- Dark theme only. Use the theme tokens defined in Task 1 (`ink-*`, `fog-*`, `accent`, `over`, `under`, `positive`, `negative`, `link`, `seat-*`).
- Every commit message ends with a blank line then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (use a second `-m`).
- Work happens on branch `feat/courtline-prototype` (the controller creates it before Task 1).

## Model guidance

| Task | Model | Why |
|---|---|---|
| 1 Scaffold | haiku | Commands + given file contents |
| 2 Scoring | haiku | Complete code and tests given |
| 3 Draft logic | haiku | Complete code and tests given |
| 4 Data + standings | haiku | Complete code, data tables and tests given |
| 5 League store + API | sonnet | Multi-file integration, API smoke test |
| 6 Shared UI + shell | sonnet | Many files, layout judgement |
| 7 Overview | sonnet | UI integration |
| 8 Draft room | sonnet | Largest UI integration, polling |
| 9 Verification | controller | Browser checks |

## File map

```
src/config/scoring.ts          SCORING weights
src/config/league.ts           LEAGUE_DEFAULTS, SEASON, DRAFT_POLL_INTERVAL_MS
src/lib/types.ts               Team, Manager, DraftPick, DraftState, Fade, League, LeagueView
src/lib/scoring.ts             projectWins, signedMargin, callPoints, evaluateCall, evaluateFade
src/lib/format.ts              formatNumber, formatSigned, formatOrdinal, formatRecord, NOT_AVAILABLE
src/lib/draft.ts               snake order + applyDraftAction reducer
src/lib/standings.ts           computeStandings, closestCalls
src/lib/draft-filters.ts       filterTeams, availableSideCount, SIDES, SideRef
src/lib/fade-status.ts         fadeStatus label/tone
src/lib/nba-logo.ts            teamLogoUrl
src/lib/league/managers.ts     managerLabel, managerInitials, findManager, openSeats
src/lib/league/permissions.ts  canControlDraft, canPickNow
src/lib/league/turn.ts         describeTurn
src/lib/league/seats-cookie.ts parseSeats, serializeSeats, withSeat
src/lib/league/parse-action.ts parseDraftAction
src/lib/league/errors.ts       ApiError, ERROR_MESSAGES
src/lib/league/store.ts        createLeagueStore (pure, Map-backed)
src/data/teams.ts              TEAMS, TEAMS_BY_ID, TEAM_IDS, TOTAL_SIDES
src/data/demo-league.ts        DEMO_LEAGUE_ID, buildDemoLeague
src/server/store.ts            leagueStore singleton (server-only)
src/server/viewer.ts           readSeats, writeSeats, getViewerId, toLeagueView
src/server/league.ts           getLeagueOrNotFound, listSeatLeagues
src/server/http.ts             errorResponse, readJsonBody
src/app/api/leagues/route.ts                        POST create
src/app/api/leagues/[leagueId]/join/route.ts        POST join
src/app/api/leagues/[leagueId]/draft/route.ts       GET view, POST action
src/app/page.tsx, not-found.tsx, layout.tsx, globals.css
src/app/l/[leagueId]/layout.tsx, page.tsx, draft/page.tsx, join/page.tsx, rosters/page.tsx, settings/page.tsx
src/components/ui/*            Panel, Button, Badge, SidePill, TeamLogo, TeamBadge, ManagerAvatar, PaceBar,
                               SignedValue, StatCard, SegmentedControl, Select, Alert, NotBuiltYet, PageFallback
src/components/icons/BallIcon.tsx
src/components/shell/*         AppShell, nav-items, SidebarNav, BottomNav, LeagueSwitcher, Logo, PageHeader
src/components/landing/CreateLeagueForm.tsx
src/components/join/JoinForm.tsx
src/components/overview/*      LeagueOverview, ManagerPicker, PicksPanel, PicksList, StandingsPanel, FadesPanel,
                               SummaryStats, ClosestCalls
src/components/draft/*         DraftRoom, use-league-draft, DraftStatusBar, DraftLobby, InviteLink, DraftBoard,
                               AvailablePicks, SideButton, SelectionPreview, ManagerPicks, SelectionBar
```

---

### Task 1: Scaffold, tooling, theme, conventions

**Files:**
- Create (via scaffold): `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `next-env.d.ts`, `AGENTS.md`, `.gitignore`, `src/app/*`, `public/`
- Create: `vitest.config.ts`, `CLAUDE.md`
- Modify: `next.config.ts`, `package.json` (name, scripts), `src/app/globals.css`, `src/app/layout.tsx`, `src/app/page.tsx`, `.claude/launch.json`, `.gitignore`

**Interfaces:**
- Produces: theme tokens (Tailwind classes) `bg-ink-950|900|850|800`, `border-ink-700|600`, `text-fog-50|300|400`, `accent`, `accent-strong`, `accent-ink`, `over`, `over-deep`, `under`, `under-deep`, `under-ink`, `positive`, `negative`, `link`, `seat-1..4`, `font-display`; npm scripts `dev`, `build`, `start`, `lint`, `test`, `test:watch`, `typecheck`.

- [ ] **Step 1: Scaffold into a scratch folder** (the project folder is not empty, so create-next-app can't target it directly)

```bash
SCRATCH=/private/tmp/claude-501/-Users-noah-Desktop-projects-nba-over-under-draft/d5d380a9-ea95-4bcd-801a-b506f0a8231e/scratchpad
rm -rf "$SCRATCH/scaffold" && mkdir -p "$SCRATCH/scaffold"
cd "$SCRATCH/scaffold" && npx --yes create-next-app@16.4.0 courtline --ts --tailwind --app --src-dir --eslint --import-alias "@/*" --use-npm --turbopack --yes --disable-git
```

Expected: `Success! Created courtline at …/scaffold/courtline`.

- [ ] **Step 2: Copy into the project and install**

```bash
cd /Users/noah/Desktop/projects/nba-over-under-draft
rsync -a --exclude node_modules --exclude .next "$SCRATCH/scaffold/courtline/" ./
rm -f public/file.svg public/globe.svg public/next.svg public/vercel.svg public/window.svg
npm install
npm install lucide-react server-only
npm install -D vitest
```

- [ ] **Step 3: package.json name and scripts**

Set `"name": "courtline"` and make `scripts` exactly:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "test": "vitest run",
  "test:watch": "vitest",
  "typecheck": "next typegen && tsc --noEmit"
}
```

- [ ] **Step 4: `vitest.config.ts`**

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    passWithNoTests: true,
  },
});
```

If Vitest rejects this config, read `node_modules/vitest/README.md` / its types and adapt minimally; report what changed.

- [ ] **Step 5: `next.config.ts`** — keep everything the scaffold generated and add `images`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "cdn.nba.com", pathname: "/logos/nba/**" }],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
```

(If the generated file differs from the `cacheComponents`/`partialPrefetching`/`turbopack` block above, keep the generated values and only add `images`.)

- [ ] **Step 6: `src/app/globals.css`** (replace the file)

```css
@import "tailwindcss";

@theme {
  --color-ink-950: #060d19;
  --color-ink-900: #0a1424;
  --color-ink-850: #0d1a2e;
  --color-ink-800: #12223a;
  --color-ink-700: #1b2d4a;
  --color-ink-600: #2a3f62;
  --color-fog-50: #f2f6fc;
  --color-fog-300: #b4c2d8;
  --color-fog-400: #8596b0;
  --color-accent: #86f53c;
  --color-accent-strong: #a4ff5c;
  --color-accent-ink: #0b1a05;
  --color-over: #86f53c;
  --color-over-deep: #17320c;
  --color-under: #9b6bff;
  --color-under-deep: #2b1a5c;
  --color-under-ink: #e2d8ff;
  --color-positive: #86f53c;
  --color-negative: #ff4d6d;
  --color-link: #b39dff;
  --color-seat-1: #2463d6;
  --color-seat-2: #12a15b;
  --color-seat-3: #1f8fe5;
  --color-seat-4: #6b35c9;
}

@theme inline {
  --font-sans: var(--font-barlow), ui-sans-serif, system-ui, sans-serif;
  --font-display: var(--font-barlow-condensed), var(--font-barlow), ui-sans-serif, sans-serif;
}

:root {
  color-scheme: dark;
}

body {
  background: var(--color-ink-950);
  color: var(--color-fog-50);
}
```

- [ ] **Step 7: `src/app/layout.tsx`** (replace)

```tsx
import type { Metadata } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import "./globals.css";

const barlow = Barlow({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  title: "Courtline",
  description: "Draft Overs and Unders on every NBA win total.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${barlow.variable} ${barlowCondensed.variable} h-full antialiased`}>
      <body className="min-h-full bg-ink-950 font-sans text-fog-50">{children}</body>
    </html>
  );
}
```

- [ ] **Step 8: `src/app/page.tsx`** (temporary; Task 6 replaces it)

```tsx
export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="font-display text-5xl font-bold text-accent">COURTLINE</h1>
      <p className="mt-2 text-fog-300">Prototype scaffold.</p>
    </main>
  );
}
```

- [ ] **Step 9: `.claude/launch.json`** — keep the existing `static` entry, add `dev`:

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "static",
      "runtimeExecutable": "python3",
      "runtimeArgs": ["-m", "http.server", "8765"],
      "port": 8765
    },
    {
      "name": "dev",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "port": 3000
    }
  ]
}
```

- [ ] **Step 10: `.gitignore`** — append these lines (keep everything the scaffold wrote):

```
# subagent-driven-development scratch
.superpowers/
```

- [ ] **Step 11: `CLAUDE.md`** (create; `AGENTS.md` from the scaffold stays as is)

```markdown
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
Vitest, lucide-react. Cache Components is on: wrap anything that reads `params`, `cookies()` or the league store in
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
- Logos: `TeamLogo` loads `https://cdn.nba.com/logos/nba/{nbaId}/global/L/logo.svg` and falls back to `TeamBadge`.
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
```

- [ ] **Step 12: Verify the toolchain**

```bash
npm test && npm run lint && npm run typecheck && npm run build
```

Expected: vitest reports no test files and exits 0 (passWithNoTests); lint clean; typecheck clean; build succeeds with routes `/` and `/_not-found`.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js 16.4 app with Tailwind theme, Vitest and conventions" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Domain types, scoring config, scoring and formatting

**Files:**
- Create: `src/lib/types.ts`, `src/config/scoring.ts`, `src/lib/scoring.ts`, `src/lib/format.ts`
- Test: `src/lib/scoring.test.ts`, `src/lib/format.test.ts`

**Interfaces:**
- Produces (used by every later task):
  - types: `TeamId`, `Side`, `Conference`, `Team`, `Manager`, `DraftPick`, `DraftStatus`, `DraftState`, `Fade`, `League`, `LeagueView`
  - `SCORING: ScoringConfig`
  - `gamesPlayed(record) → number`, `projectWins(record, config?) → number | null`, `isSettled(record, config?) → boolean`, `signedMargin(side, line, wins) → number`, `callPoints(margin, config?) → number`
  - `type Basis = "projected" | "final"`, `type EvaluationStatus = "scored" | "not_available" | "pending"`
  - `evaluateCall(side, team, basis, config?) → CallEvaluation` (`{ basis, status, wins, margin, correct, points }`)
  - `evaluateFade(target: CallEvaluation, config?) → FadeEvaluation` (`{ basis, status, targetMissed, points }`)
  - `NOT_AVAILABLE`, `formatNumber(value, digits = 1)`, `formatSigned(value, digits = 1)`, `formatOrdinal(n)`, `formatRecord(wins, losses)`

- [ ] **Step 1: `src/lib/types.ts`**

```ts
/** NBA tricode, e.g. "MIN". */
export type TeamId = string;
export type Side = "OVER" | "UNDER";
export type Conference = "East" | "West";

export interface Team {
  id: TeamId;
  /** NBA stats team id, used for the CDN logo URL. */
  nbaId: number;
  city: string;
  name: string;
  conference: Conference;
  /** Primary color (hex) for the abbreviation-badge fallback. */
  color: string;
  /** Season win-total line. Always ends in .5. */
  line: number;
  /** Previous regular-season wins. */
  prevWins: number;
  /** Current-season wins so far. */
  wins: number;
  /** Current-season losses so far. */
  losses: number;
}

export interface Manager {
  /** "m1".."m4". */
  id: string;
  /** 0-based draft seat; round 1 picks in seat order. */
  seat: number;
  /** Set when a person claims the seat. Null means an open seat. */
  displayName: string | null;
}

export interface DraftPick {
  /** 1-based overall pick number. */
  pickNumber: number;
  managerId: string;
  teamId: TeamId;
  side: Side;
}

export type DraftStatus = "not_started" | "live" | "paused" | "complete";

export interface DraftState {
  status: DraftStatus;
  rounds: number;
  /** Manager ids in seat order. */
  seatOrder: string[];
  /** Picks in pick-number order. */
  picks: DraftPick[];
}

export interface Fade {
  id: string;
  /** Manager who placed the fade. */
  managerId: string;
  /** Overall pick number of the opponent pick being faded. */
  targetPickNumber: number;
}

export interface League {
  id: string;
  name: string;
  seasonLabel: string;
  isDemo: boolean;
  commissionerId: string;
  /** Incremented on every mutation; clients ignore responses older than what they hold. */
  version: number;
  managers: Manager[];
  draft: DraftState;
  fades: Fade[];
}

/** What the server hands a client: the league plus who is looking at it. */
export interface LeagueView {
  league: League;
  viewerId: string | null;
}
```

- [ ] **Step 2: `src/config/scoring.ts`**

```ts
export interface ScoringConfig {
  /** Points for a call on the right side of the line. */
  correctCall: number;
  /** Points for a call on the wrong side of the line. */
  missedCall: number;
  /** Multiplier applied to each call's signed margin. */
  marginWeight: number;
  /** Bonus when a faded opponent pick misses. */
  fadeHit: number;
  /** Bonus when a faded opponent pick hits. */
  fadeMiss: number;
  /** Regular-season length, used for win pace and settlement. */
  seasonGames: number;
}

export const SCORING: ScoringConfig = {
  correctCall: 1,
  missedCall: -1,
  marginWeight: 0.1,
  fadeHit: 2,
  fadeMiss: 0,
  seasonGames: 82,
};
```

- [ ] **Step 3: Write the failing scoring tests — `src/lib/scoring.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { SCORING, type ScoringConfig } from "@/config/scoring";
import {
  callPoints,
  evaluateCall,
  evaluateFade,
  gamesPlayed,
  isSettled,
  projectWins,
  signedMargin,
} from "@/lib/scoring";
import type { Team } from "@/lib/types";

function team(overrides: Partial<Team> = {}): Team {
  return {
    id: "MIN",
    nbaId: 1610612750,
    city: "Minnesota",
    name: "Timberwolves",
    conference: "West",
    color: "#0C2340",
    line: 49.5,
    prevWins: 49,
    wins: 30,
    losses: 18,
    ...overrides,
  };
}

describe("gamesPlayed", () => {
  it("adds wins and losses", () => {
    expect(gamesPlayed({ wins: 30, losses: 18 })).toBe(48);
  });
});

describe("projectWins", () => {
  it("scales the win rate to an 82-game season", () => {
    expect(projectWins({ wins: 30, losses: 18 })).toBeCloseTo(51.25);
  });

  it("returns null when no games have been played", () => {
    expect(projectWins({ wins: 0, losses: 0 })).toBeNull();
  });

  it("uses the configured season length", () => {
    expect(projectWins({ wins: 10, losses: 10 }, { ...SCORING, seasonGames: 72 })).toBe(36);
  });
});

describe("isSettled", () => {
  it("is false before the regular season ends", () => {
    expect(isSettled({ wins: 50, losses: 31 })).toBe(false);
  });

  it("is true once 82 games are played", () => {
    expect(isSettled({ wins: 50, losses: 32 })).toBe(true);
  });
});

describe("signedMargin", () => {
  it("is wins minus line for an Over", () => {
    expect(signedMargin("OVER", 49.5, 51.25)).toBeCloseTo(1.75);
  });

  it("is line minus wins for an Under", () => {
    expect(signedMargin("UNDER", 41.5, 37.5)).toBeCloseTo(4);
  });
});

describe("callPoints", () => {
  it("adds +1 and a tenth of the margin for a correct call", () => {
    expect(callPoints(1.75)).toBeCloseTo(1.175);
  });

  it("adds −1 and a tenth of the negative margin for a missed call", () => {
    expect(callPoints(-3.4)).toBeCloseTo(-1.34);
  });

  it("reads every weight from the config", () => {
    const config: ScoringConfig = { ...SCORING, correctCall: 3, missedCall: -2, marginWeight: 0.5 };
    expect(callPoints(2, config)).toBeCloseTo(4);
    expect(callPoints(-2, config)).toBeCloseTo(-3);
  });
});

describe("evaluateCall", () => {
  it("scores a projected call from win pace", () => {
    const result = evaluateCall("OVER", team(), "projected");
    expect(result.status).toBe("scored");
    expect(result.wins).toBeCloseTo(51.25);
    expect(result.margin).toBeCloseTo(1.75);
    expect(result.correct).toBe(true);
    expect(result.points).toBeCloseTo(1.175);
  });

  it("marks a projected Under as missed when the pace beats the line", () => {
    const result = evaluateCall("UNDER", team(), "projected");
    expect(result.correct).toBe(false);
    expect(result.margin).toBeCloseTo(-1.75);
    expect(result.points).toBeCloseTo(-1.175);
  });

  it("is not available when the team has played zero games", () => {
    expect(evaluateCall("OVER", team({ wins: 0, losses: 0 }), "projected")).toEqual({
      basis: "projected",
      status: "not_available",
      wins: null,
      margin: null,
      correct: null,
      points: null,
    });
  });

  it("is pending on the final basis until the team finishes the season", () => {
    expect(evaluateCall("OVER", team(), "final")).toEqual({
      basis: "final",
      status: "pending",
      wins: null,
      margin: null,
      correct: null,
      points: null,
    });
  });

  it("scores a settled final call from actual wins", () => {
    const result = evaluateCall("OVER", team({ wins: 52, losses: 30 }), "final");
    expect(result).toMatchObject({ basis: "final", status: "scored", wins: 52, correct: true });
    expect(result.margin).toBeCloseTo(2.5);
    expect(result.points).toBeCloseTo(1.25);
  });
});

describe("evaluateFade", () => {
  it("earns the fade bonus when the targeted pick misses", () => {
    // 36–12 paces to 61.5 wins, under a 62.5 line, so the Over misses.
    const target = evaluateCall("OVER", team({ line: 62.5, wins: 36, losses: 12 }), "projected");
    expect(evaluateFade(target)).toEqual({ basis: "projected", status: "scored", targetMissed: true, points: 2 });
  });

  it("earns nothing when the targeted pick hits", () => {
    const target = evaluateCall("OVER", team(), "projected");
    expect(evaluateFade(target)).toEqual({ basis: "projected", status: "scored", targetMissed: false, points: 0 });
  });

  it("inherits not available and pending from its target", () => {
    expect(evaluateFade(evaluateCall("OVER", team({ wins: 0, losses: 0 }), "projected")).status).toBe("not_available");
    expect(evaluateFade(evaluateCall("OVER", team(), "final")).status).toBe("pending");
  });

  it("reads the bonus from the config", () => {
    const target = evaluateCall("UNDER", team(), "projected");
    expect(evaluateFade(target, { ...SCORING, fadeHit: 5 }).points).toBe(5);
  });
});
```

- [ ] **Step 4: Run — expect failure**

Run: `npx vitest run src/lib/scoring.test.ts`
Expected: FAIL — cannot resolve `@/lib/scoring`.

- [ ] **Step 5: Implement `src/lib/scoring.ts`**

```ts
import { SCORING, type ScoringConfig } from "@/config/scoring";
import type { Side, Team } from "@/lib/types";

export type Basis = "projected" | "final";
export type EvaluationStatus = "scored" | "not_available" | "pending";

type RecordLike = Pick<Team, "wins" | "losses">;

export function gamesPlayed(record: RecordLike): number {
  return record.wins + record.losses;
}

/** Wins ÷ games played × season length. Null when no games have been played. */
export function projectWins(record: RecordLike, config: ScoringConfig = SCORING): number | null {
  const played = gamesPlayed(record);
  if (played === 0) return null;
  return (record.wins / played) * config.seasonGames;
}

/** A pick settles once its team has completed the regular season. */
export function isSettled(record: RecordLike, config: ScoringConfig = SCORING): boolean {
  return gamesPlayed(record) >= config.seasonGames;
}

/** Over: wins − line. Under: line − wins. Positive means the call is on the right side. */
export function signedMargin(side: Side, line: number, wins: number): number {
  return side === "OVER" ? wins - line : line - wins;
}

export function callPoints(margin: number, config: ScoringConfig = SCORING): number {
  const base = margin > 0 ? config.correctCall : config.missedCall;
  return base + margin * config.marginWeight;
}

export interface CallEvaluation {
  basis: Basis;
  status: EvaluationStatus;
  /** Projected wins (projected basis) or final wins (final basis). Null unless scored. */
  wins: number | null;
  margin: number | null;
  correct: boolean | null;
  points: number | null;
}

export function evaluateCall(
  side: Side,
  team: Team,
  basis: Basis,
  config: ScoringConfig = SCORING,
): CallEvaluation {
  let wins: number | null;
  if (basis === "projected") {
    wins = projectWins(team, config);
    if (wins === null) return unscored(basis, "not_available");
  } else {
    if (!isSettled(team, config)) return unscored(basis, "pending");
    wins = team.wins;
  }
  const margin = signedMargin(side, team.line, wins);
  return { basis, status: "scored", wins, margin, correct: margin > 0, points: callPoints(margin, config) };
}

function unscored(basis: Basis, status: Exclude<EvaluationStatus, "scored">): CallEvaluation {
  return { basis, status, wins: null, margin: null, correct: null, points: null };
}

export interface FadeEvaluation {
  basis: Basis;
  status: EvaluationStatus;
  /** True when the targeted pick misses. Null unless scored. */
  targetMissed: boolean | null;
  points: number | null;
}

/** A fade scores off its target: the bonus when the target misses, nothing when it hits. */
export function evaluateFade(target: CallEvaluation, config: ScoringConfig = SCORING): FadeEvaluation {
  if (target.status !== "scored") {
    return { basis: target.basis, status: target.status, targetMissed: null, points: null };
  }
  const targetMissed = target.correct === false;
  return {
    basis: target.basis,
    status: "scored",
    targetMissed,
    points: targetMissed ? config.fadeHit : config.fadeMiss,
  };
}
```

- [ ] **Step 6: Run — expect pass**

Run: `npx vitest run src/lib/scoring.test.ts`
Expected: all tests PASS.

- [ ] **Step 7: Write the failing format tests — `src/lib/format.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { formatNumber, formatOrdinal, formatRecord, formatSigned, NOT_AVAILABLE } from "@/lib/format";

describe("formatSigned", () => {
  it("prefixes positives with +", () => {
    expect(formatSigned(1.75)).toBe("+1.8");
  });

  it("uses a true minus sign for negatives", () => {
    expect(formatSigned(-3.4)).toBe("−3.4");
  });

  it("shows values that round to zero without a sign", () => {
    expect(formatSigned(0)).toBe("0.0");
    expect(formatSigned(-0.04)).toBe("0.0");
  });

  it("supports other precisions", () => {
    expect(formatSigned(1.234, 2)).toBe("+1.23");
    expect(formatSigned(2, 0)).toBe("+2");
  });
});

describe("formatNumber", () => {
  it("rounds to one decimal by default", () => {
    expect(formatNumber(51.25)).toBe("51.3");
    expect(formatNumber(49.5)).toBe("49.5");
  });

  it("uses a true minus sign and supports zero decimals", () => {
    expect(formatNumber(-1.5)).toBe("−1.5");
    expect(formatNumber(41, 0)).toBe("41");
  });
});

describe("formatOrdinal", () => {
  it("handles st, nd, rd, th and the teens", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(formatOrdinal)).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd",
    ]);
  });
});

describe("formatRecord", () => {
  it("joins wins and losses with an en dash", () => {
    expect(formatRecord(30, 18)).toBe("30–18");
  });
});

describe("NOT_AVAILABLE", () => {
  it("is the copy for zero games played", () => {
    expect(NOT_AVAILABLE).toBe("Not available");
  });
});
```

- [ ] **Step 8: Run — expect failure**

Run: `npx vitest run src/lib/format.test.ts`
Expected: FAIL — cannot resolve `@/lib/format`.

- [ ] **Step 9: Implement `src/lib/format.ts`**

```ts
const MINUS = "−";

export const NOT_AVAILABLE = "Not available";

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function formatNumber(value: number, digits = 1): string {
  const rounded = roundTo(value, digits);
  const text = Math.abs(rounded).toFixed(digits);
  return rounded < 0 ? `${MINUS}${text}` : text;
}

/** "+1.8", "−3.4", or "0.0" when the value rounds to zero. */
export function formatSigned(value: number, digits = 1): string {
  const rounded = roundTo(value, digits);
  const text = Math.abs(rounded).toFixed(digits);
  if (rounded === 0) return text;
  return rounded > 0 ? `+${text}` : `${MINUS}${text}`;
}

export function formatOrdinal(n: number): string {
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export function formatRecord(wins: number, losses: number): string {
  return `${wins}–${losses}`;
}
```

- [ ] **Step 10: Run — expect pass, then the full suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: all PASS, no type errors.

- [ ] **Step 11: Commit**

```bash
git add src/lib src/config
git commit -m "feat: add domain types, scoring config, scoring and formatting" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Snake draft order and draft actions

**Files:**
- Create: `src/config/league.ts`, `src/lib/draft.ts`
- Test: `src/lib/draft.test.ts`

**Interfaces:**
- Consumes: `DraftPick`, `DraftState`, `Side`, `TeamId` from `@/lib/types`.
- Produces:
  - `LEAGUE_DEFAULTS = { managerCount: 4, rounds: 11 }`, `SEASON = { label: "2025–26", previousLabel: "2024–25" }`, `DRAFT_POLL_INTERVAL_MS = 2000`
  - `totalPicks(managerCount, rounds)`, `roundOf(pickNumber, managerCount)`, `seatForPick(pickNumber, managerCount)` (0-based seat), `pickNumberFor(round, seat, managerCount)`
  - `createDraftState(seatOrder, rounds) → DraftState` (status `not_started`)
  - `draftTotalPicks(state)`, `currentPickNumber(state) → number | null`, `managerOnTheClock(state) → string | null`, `managerUpNext(state) → string | null`, `findPickForSide(state, teamId, side) → DraftPick | undefined`, `picksForManager(state, managerId) → DraftPick[]`
  - `type DraftAction = { type: "start" } | { type: "pause" } | { type: "resume" } | { type: "confirm"; teamId: TeamId; side: Side }`
  - `type DraftError = "invalid_transition" | "not_live" | "side_taken" | "unknown_team"`
  - `applyDraftAction(state, action, teamIds: ReadonlySet<TeamId>) → { ok: true; state } | { ok: false; error: DraftError }`

- [ ] **Step 1: `src/config/league.ts`**

```ts
export const LEAGUE_DEFAULTS = {
  managerCount: 4,
  rounds: 11,
} as const;

export const SEASON = {
  label: "2025–26",
  previousLabel: "2024–25",
} as const;

/** How often the draft room asks the server for new picks. */
export const DRAFT_POLL_INTERVAL_MS = 2000;
```

- [ ] **Step 2: Write the failing tests — `src/lib/draft.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import {
  applyDraftAction,
  createDraftState,
  currentPickNumber,
  findPickForSide,
  managerOnTheClock,
  managerUpNext,
  pickNumberFor,
  picksForManager,
  roundOf,
  seatForPick,
  totalPicks,
  type DraftAction,
} from "@/lib/draft";
import type { DraftState } from "@/lib/types";

const SEATS = ["m1", "m2", "m3", "m4"];
const TEAM_IDS = new Set(["MIN", "OKC", "BOS", "CLE"]);

function mustApply(state: DraftState, action: DraftAction, teamIds: ReadonlySet<string> = TEAM_IDS): DraftState {
  const result = applyDraftAction(state, action, teamIds);
  if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
  return result.state;
}

function liveDraft(seats = SEATS, rounds = 11): DraftState {
  return mustApply(createDraftState(seats, rounds), { type: "start" });
}

describe("snake order", () => {
  it("runs seats forward in odd rounds and backward in even rounds", () => {
    const order = Array.from({ length: 12 }, (_, i) => seatForPick(i + 1, 4));
    expect(order).toEqual([0, 1, 2, 3, 3, 2, 1, 0, 0, 1, 2, 3]);
  });

  it("gives four managers 11 picks each across 11 rounds", () => {
    expect(totalPicks(4, 11)).toBe(44);
    const counts = [0, 0, 0, 0];
    for (let pick = 1; pick <= 44; pick++) counts[seatForPick(pick, 4)]++;
    expect(counts).toEqual([11, 11, 11, 11]);
  });

  it("ends round 11 with the last seat", () => {
    expect(roundOf(44, 4)).toBe(11);
    expect(seatForPick(44, 4)).toBe(3);
  });

  it("pickNumberFor inverts seatForPick", () => {
    for (let pick = 1; pick <= 44; pick++) {
      expect(pickNumberFor(roundOf(pick, 4), seatForPick(pick, 4), 4)).toBe(pick);
    }
  });
});

describe("draft state", () => {
  it("starts not started with seat 1 first", () => {
    const state = createDraftState(SEATS, 11);
    expect(state).toEqual({ status: "not_started", rounds: 11, seatOrder: SEATS, picks: [] });
    expect(currentPickNumber(state)).toBe(1);
    expect(managerOnTheClock(state)).toBe("m1");
    expect(managerUpNext(state)).toBe("m2");
  });
});

describe("applyDraftAction", () => {
  it("records a confirmed pick for the manager on the clock and advances the turn", () => {
    const state = mustApply(liveDraft(), { type: "confirm", teamId: "MIN", side: "OVER" });
    expect(state.picks).toEqual([{ pickNumber: 1, managerId: "m1", teamId: "MIN", side: "OVER" }]);
    expect(currentPickNumber(state)).toBe(2);
    expect(managerOnTheClock(state)).toBe("m2");
    expect(managerUpNext(state)).toBe("m3");
  });

  it("keeps the other side of a drafted team available", () => {
    let state = mustApply(liveDraft(), { type: "confirm", teamId: "MIN", side: "OVER" });
    state = mustApply(state, { type: "confirm", teamId: "MIN", side: "UNDER" });
    expect(state.picks[1]).toEqual({ pickNumber: 2, managerId: "m2", teamId: "MIN", side: "UNDER" });
    expect(findPickForSide(state, "MIN", "UNDER")?.managerId).toBe("m2");
  });

  it("rejects a side that is already drafted", () => {
    const state = mustApply(liveDraft(), { type: "confirm", teamId: "MIN", side: "OVER" });
    expect(applyDraftAction(state, { type: "confirm", teamId: "MIN", side: "OVER" }, TEAM_IDS)).toEqual({
      ok: false,
      error: "side_taken",
    });
  });

  it("rejects unknown teams", () => {
    expect(applyDraftAction(liveDraft(), { type: "confirm", teamId: "XXX", side: "OVER" }, TEAM_IDS)).toEqual({
      ok: false,
      error: "unknown_team",
    });
  });

  it("blocks picks unless the draft is live", () => {
    const pick: DraftAction = { type: "confirm", teamId: "MIN", side: "OVER" };
    expect(applyDraftAction(createDraftState(SEATS, 11), pick, TEAM_IDS)).toEqual({ ok: false, error: "not_live" });
    const paused = mustApply(liveDraft(), { type: "pause" });
    expect(applyDraftAction(paused, pick, TEAM_IDS)).toEqual({ ok: false, error: "not_live" });
  });

  it("pauses and resumes, rejecting invalid transitions", () => {
    const paused = mustApply(liveDraft(), { type: "pause" });
    expect(paused.status).toBe("paused");
    expect(mustApply(paused, { type: "resume" }).status).toBe("live");
    expect(applyDraftAction(paused, { type: "pause" }, TEAM_IDS)).toEqual({ ok: false, error: "invalid_transition" });
    expect(applyDraftAction(liveDraft(), { type: "start" }, TEAM_IDS)).toEqual({
      ok: false,
      error: "invalid_transition",
    });
    expect(applyDraftAction(createDraftState(SEATS, 11), { type: "resume" }, TEAM_IDS)).toEqual({
      ok: false,
      error: "invalid_transition",
    });
  });

  it("snakes across the round boundary", () => {
    let state = liveDraft();
    const sides: Array<[string, "OVER" | "UNDER"]> = [
      ["MIN", "OVER"], ["OKC", "OVER"], ["BOS", "UNDER"], ["CLE", "OVER"], ["MIN", "UNDER"], ["OKC", "UNDER"],
    ];
    for (const [teamId, side] of sides) state = mustApply(state, { type: "confirm", teamId, side });
    expect(state.picks.map((p) => p.managerId)).toEqual(["m1", "m2", "m3", "m4", "m4", "m3"]);
    expect(managerOnTheClock(state)).toBe("m2");
    expect(picksForManager(state, "m4").map((p) => p.pickNumber)).toEqual([4, 5]);
  });

  it("completes after the final pick", () => {
    let state = liveDraft(["m1", "m2"], 2);
    const sides: Array<[string, "OVER" | "UNDER"]> = [
      ["MIN", "OVER"], ["MIN", "UNDER"], ["OKC", "OVER"], ["OKC", "UNDER"],
    ];
    for (const [teamId, side] of sides) state = mustApply(state, { type: "confirm", teamId, side });
    expect(state.status).toBe("complete");
    expect(currentPickNumber(state)).toBeNull();
    expect(managerOnTheClock(state)).toBeNull();
    expect(managerUpNext(state)).toBeNull();
    expect(applyDraftAction(state, { type: "confirm", teamId: "BOS", side: "OVER" }, TEAM_IDS)).toEqual({
      ok: false,
      error: "not_live",
    });
  });
});
```

- [ ] **Step 3: Run — expect failure**

Run: `npx vitest run src/lib/draft.test.ts`
Expected: FAIL — cannot resolve `@/lib/draft`.

- [ ] **Step 4: Implement `src/lib/draft.ts`**

```ts
import type { DraftPick, DraftState, Side, TeamId } from "@/lib/types";

export function totalPicks(managerCount: number, rounds: number): number {
  return managerCount * rounds;
}

/** 1-based round for a 1-based overall pick number. */
export function roundOf(pickNumber: number, managerCount: number): number {
  return Math.ceil(pickNumber / managerCount);
}

/** 0-based seat on the clock for a 1-based overall pick. Odd rounds run forward, even rounds backward. */
export function seatForPick(pickNumber: number, managerCount: number): number {
  const indexInRound = (pickNumber - 1) % managerCount;
  return roundOf(pickNumber, managerCount) % 2 === 1 ? indexInRound : managerCount - 1 - indexInRound;
}

/** Overall pick number for a 1-based round and a 0-based seat. Inverse of seatForPick. */
export function pickNumberFor(round: number, seat: number, managerCount: number): number {
  const indexInRound = round % 2 === 1 ? seat : managerCount - 1 - seat;
  return (round - 1) * managerCount + indexInRound + 1;
}

export function createDraftState(seatOrder: string[], rounds: number): DraftState {
  return { status: "not_started", rounds, seatOrder, picks: [] };
}

export function draftTotalPicks(state: DraftState): number {
  return totalPicks(state.seatOrder.length, state.rounds);
}

/** The pick being made now, or null once every pick is in. */
export function currentPickNumber(state: DraftState): number | null {
  const next = state.picks.length + 1;
  return next > draftTotalPicks(state) ? null : next;
}

function managerForPick(state: DraftState, pickNumber: number): string | null {
  if (pickNumber > draftTotalPicks(state)) return null;
  return state.seatOrder[seatForPick(pickNumber, state.seatOrder.length)];
}

export function managerOnTheClock(state: DraftState): string | null {
  const pickNumber = currentPickNumber(state);
  return pickNumber === null ? null : managerForPick(state, pickNumber);
}

export function managerUpNext(state: DraftState): string | null {
  const pickNumber = currentPickNumber(state);
  return pickNumber === null ? null : managerForPick(state, pickNumber + 1);
}

export function findPickForSide(state: DraftState, teamId: TeamId, side: Side): DraftPick | undefined {
  return state.picks.find((pick) => pick.teamId === teamId && pick.side === side);
}

export function picksForManager(state: DraftState, managerId: string): DraftPick[] {
  return state.picks.filter((pick) => pick.managerId === managerId);
}

export type DraftAction =
  | { type: "start" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "confirm"; teamId: TeamId; side: Side };

export type DraftError = "invalid_transition" | "not_live" | "side_taken" | "unknown_team";

export type DraftResult = { ok: true; state: DraftState } | { ok: false; error: DraftError };

/**
 * Applies one draft action. Who is allowed to act is decided by the caller (see league/permissions);
 * this only enforces draft rules: status transitions, side availability and snake order.
 */
export function applyDraftAction(state: DraftState, action: DraftAction, teamIds: ReadonlySet<TeamId>): DraftResult {
  switch (action.type) {
    case "start":
      return state.status === "not_started" ? ok({ ...state, status: "live" }) : fail("invalid_transition");
    case "pause":
      return state.status === "live" ? ok({ ...state, status: "paused" }) : fail("invalid_transition");
    case "resume":
      return state.status === "paused" ? ok({ ...state, status: "live" }) : fail("invalid_transition");
    case "confirm": {
      if (state.status !== "live") return fail("not_live");
      if (!teamIds.has(action.teamId)) return fail("unknown_team");
      if (findPickForSide(state, action.teamId, action.side)) return fail("side_taken");
      const pickNumber = state.picks.length + 1;
      const managerId = managerForPick(state, pickNumber);
      if (managerId === null) return fail("not_live");
      const picks = [...state.picks, { pickNumber, managerId, teamId: action.teamId, side: action.side }];
      return ok({ ...state, picks, status: picks.length === draftTotalPicks(state) ? "complete" : "live" });
    }
  }
}

function ok(state: DraftState): DraftResult {
  return { ok: true, state };
}

function fail(error: DraftError): DraftResult {
  return { ok: false, error };
}
```

- [ ] **Step 5: Run — expect pass**

Run: `npm test && npm run typecheck`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/draft.ts src/lib/draft.test.ts src/config/league.ts
git commit -m "feat: add snake draft order and draft action reducer" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Mock dataset and standings

**Files:**
- Create: `src/data/teams.ts`, `src/data/demo-league.ts`, `src/lib/standings.ts`
- Test: `src/lib/standings.test.ts`, `src/data/demo-league.test.ts`

**Interfaces:**
- Consumes: types (Task 2), `evaluateCall`, `evaluateFade`, `Basis` (Task 2), `seatForPick`, `totalPicks` (Task 3), `LEAGUE_DEFAULTS`, `SEASON` (Task 3).
- Produces:
  - `TEAMS: readonly Team[]` (30), `TEAMS_BY_ID: Readonly<Record<TeamId, Team>>`, `TEAM_IDS: ReadonlySet<TeamId>`, `TOTAL_SIDES` (60)
  - `DEMO_LEAGUE_ID = "demo"`, `buildDemoLeague(): League`
  - `type TeamLookup`, `type ScoringInput = Pick<League, "managers" | "draft" | "fades">`
  - `ScoredCall { pick; team; evaluation }`, `ScoredFade { fade; target: ScoredCall; evaluation }`
  - `ManagerResult { managerId; calls; fades; callPoints; fadePoints; totalPoints; totalMargin; correctCalls; scoredCalls; pendingItems }`
  - `StandingRow extends ManagerResult { rank; gapToFirst }`
  - `Standings { basis; rows; complete; anyScored }`
  - `computeStandings(input, teams, basis, config?) → Standings`, `closestCalls(result, count = 3) → ScoredCall[]`

- [ ] **Step 1: `src/data/teams.ts`** — exact values (line = 2025–26 win total, prevWins = 2024–25 wins, wins/losses = current mid-season record)

```ts
import type { Team, TeamId } from "@/lib/types";

export const TEAMS: readonly Team[] = [
  { id: "ATL", nbaId: 1610612737, city: "Atlanta", name: "Hawks", conference: "East", color: "#C8102E", line: 46.5, prevWins: 40, wins: 25, losses: 24 },
  { id: "BOS", nbaId: 1610612738, city: "Boston", name: "Celtics", conference: "East", color: "#007A33", line: 41.5, prevWins: 61, wins: 22, losses: 26 },
  { id: "BKN", nbaId: 1610612751, city: "Brooklyn", name: "Nets", conference: "East", color: "#2A2A2A", line: 20.5, prevWins: 26, wins: 13, losses: 35 },
  { id: "CHA", nbaId: 1610612766, city: "Charlotte", name: "Hornets", conference: "East", color: "#1D1160", line: 26.5, prevWins: 19, wins: 17, losses: 30 },
  { id: "CHI", nbaId: 1610612741, city: "Chicago", name: "Bulls", conference: "East", color: "#CE1141", line: 32.5, prevWins: 39, wins: 21, losses: 27 },
  { id: "CLE", nbaId: 1610612739, city: "Cleveland", name: "Cavaliers", conference: "East", color: "#860038", line: 56.5, prevWins: 64, wins: 33, losses: 15 },
  { id: "DET", nbaId: 1610612765, city: "Detroit", name: "Pistons", conference: "East", color: "#1D42BA", line: 46.5, prevWins: 44, wins: 31, losses: 17 },
  { id: "IND", nbaId: 1610612754, city: "Indiana", name: "Pacers", conference: "East", color: "#002D62", line: 38.5, prevWins: 50, wins: 18, losses: 30 },
  { id: "MIA", nbaId: 1610612748, city: "Miami", name: "Heat", conference: "East", color: "#98002E", line: 37.5, prevWins: 37, wins: 24, losses: 25 },
  { id: "MIL", nbaId: 1610612749, city: "Milwaukee", name: "Bucks", conference: "East", color: "#00471B", line: 43.5, prevWins: 48, wins: 22, losses: 26 },
  { id: "NYK", nbaId: 1610612752, city: "New York", name: "Knicks", conference: "East", color: "#006BB6", line: 53.5, prevWins: 51, wins: 31, losses: 16 },
  { id: "ORL", nbaId: 1610612753, city: "Orlando", name: "Magic", conference: "East", color: "#0077C0", line: 51.5, prevWins: 41, wins: 30, losses: 18 },
  { id: "PHI", nbaId: 1610612755, city: "Philadelphia", name: "76ers", conference: "East", color: "#ED174C", line: 43.5, prevWins: 24, wins: 25, losses: 23 },
  { id: "TOR", nbaId: 1610612761, city: "Toronto", name: "Raptors", conference: "East", color: "#CE1141", line: 37.5, prevWins: 30, wins: 26, losses: 22 },
  { id: "WAS", nbaId: 1610612764, city: "Washington", name: "Wizards", conference: "East", color: "#002B5C", line: 20.5, prevWins: 18, wins: 10, losses: 38 },
  { id: "DAL", nbaId: 1610612742, city: "Dallas", name: "Mavericks", conference: "West", color: "#00538C", line: 40.5, prevWins: 39, wins: 20, losses: 28 },
  { id: "DEN", nbaId: 1610612743, city: "Denver", name: "Nuggets", conference: "West", color: "#0E2240", line: 54.5, prevWins: 50, wins: 34, losses: 14 },
  { id: "GSW", nbaId: 1610612744, city: "Golden State", name: "Warriors", conference: "West", color: "#1D428A", line: 47.5, prevWins: 48, wins: 25, losses: 23 },
  { id: "HOU", nbaId: 1610612745, city: "Houston", name: "Rockets", conference: "West", color: "#CE1141", line: 52.5, prevWins: 52, wins: 31, losses: 18 },
  { id: "LAC", nbaId: 1610612746, city: "LA", name: "Clippers", conference: "West", color: "#C8102E", line: 47.5, prevWins: 50, wins: 23, losses: 25 },
  { id: "LAL", nbaId: 1610612747, city: "Los Angeles", name: "Lakers", conference: "West", color: "#552583", line: 49.5, prevWins: 50, wins: 30, losses: 18 },
  { id: "MEM", nbaId: 1610612763, city: "Memphis", name: "Grizzlies", conference: "West", color: "#5D76A9", line: 40.5, prevWins: 48, wins: 21, losses: 27 },
  { id: "MIN", nbaId: 1610612750, city: "Minnesota", name: "Timberwolves", conference: "West", color: "#0C2340", line: 49.5, prevWins: 49, wins: 30, losses: 18 },
  { id: "NOP", nbaId: 1610612740, city: "New Orleans", name: "Pelicans", conference: "West", color: "#85714D", line: 33.5, prevWins: 21, wins: 12, losses: 37 },
  { id: "OKC", nbaId: 1610612760, city: "Oklahoma City", name: "Thunder", conference: "West", color: "#007AC1", line: 62.5, prevWins: 68, wins: 36, losses: 12 },
  { id: "PHX", nbaId: 1610612756, city: "Phoenix", name: "Suns", conference: "West", color: "#1D1160", line: 31.5, prevWins: 36, wins: 24, losses: 24 },
  { id: "POR", nbaId: 1610612757, city: "Portland", name: "Trail Blazers", conference: "West", color: "#E03A3E", line: 33.5, prevWins: 36, wins: 21, losses: 27 },
  { id: "SAC", nbaId: 1610612758, city: "Sacramento", name: "Kings", conference: "West", color: "#5A2D81", line: 35.5, prevWins: 40, wins: 16, losses: 32 },
  { id: "SAS", nbaId: 1610612759, city: "San Antonio", name: "Spurs", conference: "West", color: "#4B5257", line: 44.5, prevWins: 34, wins: 31, losses: 17 },
  { id: "UTA", nbaId: 1610612762, city: "Utah", name: "Jazz", conference: "West", color: "#753BBD", line: 18.5, prevWins: 17, wins: 14, losses: 34 },
];

export const TEAMS_BY_ID: Readonly<Record<TeamId, Team>> = Object.fromEntries(TEAMS.map((team) => [team.id, team]));

export const TEAM_IDS: ReadonlySet<TeamId> = new Set(TEAMS.map((team) => team.id));

/** Every team has a separately draftable Over and Under. */
export const TOTAL_SIDES = TEAMS.length * 2;
```

- [ ] **Step 2: `src/data/demo-league.ts`** — the completed demo draft. Pick managers are derived from snake order, so they can't drift. The first 8 picks match `wiremocks/draft-room.png`.

```ts
import { LEAGUE_DEFAULTS, SEASON } from "@/config/league";
import { seatForPick } from "@/lib/draft";
import type { League, Side, TeamId } from "@/lib/types";

export const DEMO_LEAGUE_ID = "demo";

const DEMO_SEATS = ["m1", "m2", "m3", "m4"];

/** Completed 11-round draft, in pick order. */
const DEMO_DRAFT: ReadonlyArray<readonly [TeamId, Side]> = [
  ["MIN", "OVER"], ["OKC", "OVER"], ["BOS", "UNDER"], ["CLE", "OVER"],
  ["BKN", "UNDER"], ["LAL", "OVER"], ["DEN", "OVER"], ["CHI", "UNDER"],
  ["ORL", "OVER"], ["HOU", "OVER"], ["NYK", "OVER"], ["WAS", "UNDER"],
  ["DET", "OVER"], ["IND", "UNDER"], ["SAS", "OVER"], ["CLE", "UNDER"],
  ["UTA", "UNDER"], ["SAC", "UNDER"], ["PHX", "OVER"], ["MIL", "UNDER"],
  ["GSW", "OVER"], ["NOP", "UNDER"], ["ATL", "OVER"], ["MEM", "UNDER"],
  ["TOR", "OVER"], ["DAL", "UNDER"], ["LAC", "UNDER"], ["PHI", "OVER"],
  ["MIA", "OVER"], ["CHA", "UNDER"], ["POR", "UNDER"], ["BOS", "OVER"],
  ["HOU", "UNDER"], ["MIA", "UNDER"], ["OKC", "UNDER"], ["MIN", "UNDER"],
  ["ORL", "UNDER"], ["DET", "UNDER"], ["IND", "OVER"], ["ATL", "UNDER"],
  ["PHI", "UNDER"], ["CHI", "OVER"], ["SAC", "OVER"], ["LAL", "UNDER"],
];

export function buildDemoLeague(): League {
  const managerCount = DEMO_SEATS.length;
  const picks = DEMO_DRAFT.map(([teamId, side], index) => {
    const pickNumber = index + 1;
    return { pickNumber, managerId: DEMO_SEATS[seatForPick(pickNumber, managerCount)], teamId, side };
  });

  return {
    id: DEMO_LEAGUE_ID,
    name: "National Balla Association",
    seasonLabel: SEASON.label,
    isDemo: true,
    commissionerId: "m1",
    version: 1,
    managers: DEMO_SEATS.map((id, seat) => ({ id, seat, displayName: null })),
    draft: { status: "complete", rounds: LEAGUE_DEFAULTS.rounds, seatOrder: [...DEMO_SEATS], picks },
    fades: [
      { id: "f1", managerId: "m1", targetPickNumber: 2 },
      { id: "f2", managerId: "m2", targetPickNumber: 6 },
      { id: "f3", managerId: "m3", targetPickNumber: 13 },
      { id: "f4", managerId: "m4", targetPickNumber: 9 },
    ],
  };
}
```

- [ ] **Step 3: Write the failing standings tests — `src/lib/standings.test.ts`**

Fixture arithmetic (82-game pace): P = 24–24 → 41.0 wins; Q = 25–23 → 42.708; line 40.5 for both.
Q OVER: margin +2.208, points +1.2208. P UNDER: margin −0.5, points −1.05. P OVER: +0.5 → +1.05. Q UNDER: −2.208 → −1.2208.

```ts
import { describe, expect, it } from "vitest";
import { SCORING } from "@/config/scoring";
import { closestCalls, computeStandings, type ScoringInput } from "@/lib/standings";
import type { DraftStatus, Manager, Side, Team, TeamId } from "@/lib/types";

function team(id: string, line: number, wins: number, losses: number): Team {
  return { id, nbaId: 0, city: id, name: id, conference: "East", color: "#000000", line, prevWins: 40, wins, losses };
}

const TEAMS: Record<TeamId, Team> = {
  P: team("P", 40.5, 24, 24), // pace 41.0
  Q: team("Q", 40.5, 25, 23), // pace 42.708
  Z: team("Z", 30.5, 0, 0), // no games played
  F: team("F", 45.5, 50, 32), // settled: 50 wins
  G: team("G", 45.5, 40, 42), // settled: 40 wins
};

const MANAGERS: Manager[] = [
  { id: "m1", seat: 0, displayName: "Ann" },
  { id: "m2", seat: 1, displayName: "Bo" },
];

function input(
  picks: Array<[string, TeamId, Side]>,
  fades: Array<[string, number]> = [],
  status: DraftStatus = "complete",
): ScoringInput {
  return {
    managers: MANAGERS,
    draft: {
      status,
      rounds: 2,
      seatOrder: ["m1", "m2"],
      picks: picks.map(([managerId, teamId, side], index) => ({ pickNumber: index + 1, managerId, teamId, side })),
    },
    fades: fades.map(([managerId, targetPickNumber], index) => ({ id: `f${index + 1}`, managerId, targetPickNumber })),
  };
}

// m1: Q OVER (hit) + P UNDER (miss). m2: P OVER (hit) + Q UNDER (miss), and fades m1's P UNDER (pick 4).
const MIXED = input(
  [
    ["m1", "Q", "OVER"],
    ["m2", "P", "OVER"],
    ["m2", "Q", "UNDER"],
    ["m1", "P", "UNDER"],
  ],
  [["m2", 4]],
);

describe("computeStandings — projected", () => {
  it("sums each manager's call points and margins from the underlying picks", () => {
    const m1 = computeStandings(MIXED, TEAMS, "projected").rows.find((row) => row.managerId === "m1")!;
    expect(m1.callPoints).toBeCloseTo(0.17083, 4);
    expect(m1.totalMargin).toBeCloseTo(1.70833, 4);
    expect(m1.correctCalls).toBe(1);
    expect(m1.scoredCalls).toBe(2);
    expect(m1.calls.map((call) => call.pick.pickNumber)).toEqual([1, 4]);
  });

  it("adds projected fade bonuses and ranks by total points, not margin", () => {
    const { rows } = computeStandings(MIXED, TEAMS, "projected");
    expect(rows.map((row) => row.managerId)).toEqual(["m2", "m1"]);
    const [m2, m1] = rows;
    expect(m2.fadePoints).toBe(2);
    expect(m2.totalPoints).toBeCloseTo(1.82917, 4);
    expect(m2.totalMargin).toBeLessThan(m1.totalMargin);
    expect(m2.rank).toBe(1);
    expect(m2.gapToFirst).toBe(0);
    expect(m1.rank).toBe(2);
    expect(m1.gapToFirst).toBeCloseTo(1.65833, 4);
  });

  it("breaks ties on points by margin, using the configured weights", () => {
    const tied = input([
      ["m2", "P", "OVER"],
      ["m1", "Q", "OVER"],
    ]);
    const { rows } = computeStandings(tied, TEAMS, "projected", { ...SCORING, marginWeight: 0 });
    expect(rows.map((row) => row.totalPoints)).toEqual([1, 1]);
    expect(rows.map((row) => row.managerId)).toEqual(["m1", "m2"]);
  });

  it("leaves zero-games teams out of totals", () => {
    const withZ = input([
      ["m1", "Q", "OVER"],
      ["m2", "P", "OVER"],
      ["m2", "Z", "OVER"],
    ]);
    const m2 = computeStandings(withZ, TEAMS, "projected").rows.find((row) => row.managerId === "m2")!;
    expect(m2.calls[1].evaluation.status).toBe("not_available");
    expect(m2.callPoints).toBeCloseTo(1.05);
    expect(m2.scoredCalls).toBe(1);
    expect(m2.pendingItems).toBe(1);
  });
});

describe("computeStandings — final", () => {
  it("scores only settled picks and fades, and reports partial results", () => {
    const partial = input(
      [
        ["m1", "F", "OVER"],
        ["m2", "P", "OVER"],
        ["m2", "G", "UNDER"],
        ["m1", "P", "UNDER"],
      ],
      [["m2", 4]],
    );
    const standings = computeStandings(partial, TEAMS, "final");
    expect(standings.anyScored).toBe(true);
    expect(standings.complete).toBe(false);
    const [first, second] = standings.rows;
    expect(first.managerId).toBe("m2");
    expect(first.totalPoints).toBeCloseTo(1.55);
    expect(first.fades[0].evaluation.status).toBe("pending");
    expect(first.pendingItems).toBe(2);
    expect(second.totalPoints).toBeCloseTo(1.45);
  });

  it("reports nothing scored before any team finishes", () => {
    const standings = computeStandings(input([["m1", "P", "OVER"]]), TEAMS, "final");
    expect(standings.anyScored).toBe(false);
    expect(standings.complete).toBe(false);
    expect(standings.rows.every((row) => row.totalPoints === 0)).toBe(true);
  });

  it("is complete once the draft is done and every pick and fade is settled", () => {
    const settled = input(
      [
        ["m1", "F", "OVER"],
        ["m2", "G", "UNDER"],
      ],
      [["m1", 2]],
    );
    const standings = computeStandings(settled, TEAMS, "final");
    expect(standings.complete).toBe(true);
    expect(standings.rows.find((row) => row.managerId === "m1")!.fadePoints).toBe(0);
    expect(computeStandings({ ...settled, draft: { ...settled.draft, status: "live" } }, TEAMS, "final").complete).toBe(
      false,
    );
  });
});

describe("closestCalls", () => {
  it("returns scored calls ordered by smallest absolute margin", () => {
    const league = input([
      ["m1", "Q", "OVER"],
      ["m2", "P", "OVER"],
      ["m2", "Q", "UNDER"],
      ["m1", "P", "UNDER"],
      ["m1", "Z", "OVER"],
    ]);
    const m1 = computeStandings(league, TEAMS, "projected").rows.find((row) => row.managerId === "m1")!;
    expect(closestCalls(m1).map((call) => `${call.team.id} ${call.pick.side}`)).toEqual(["P UNDER", "Q OVER"]);
    expect(closestCalls(m1, 1)).toHaveLength(1);
  });
});
```

- [ ] **Step 4: Run — expect failure**

Run: `npx vitest run src/lib/standings.test.ts`
Expected: FAIL — cannot resolve `@/lib/standings`.

- [ ] **Step 5: Implement `src/lib/standings.ts`**

```ts
import { SCORING, type ScoringConfig } from "@/config/scoring";
import { evaluateCall, evaluateFade, type Basis, type CallEvaluation, type FadeEvaluation } from "@/lib/scoring";
import type { DraftPick, Fade, League, Team, TeamId } from "@/lib/types";

export type TeamLookup = Readonly<Record<TeamId, Team>>;
export type ScoringInput = Pick<League, "managers" | "draft" | "fades">;

export interface ScoredCall {
  pick: DraftPick;
  team: Team;
  evaluation: CallEvaluation;
}

export interface ScoredFade {
  fade: Fade;
  target: ScoredCall;
  evaluation: FadeEvaluation;
}

export interface ManagerResult {
  managerId: string;
  /** In pick order. */
  calls: ScoredCall[];
  fades: ScoredFade[];
  callPoints: number;
  fadePoints: number;
  totalPoints: number;
  /** Sum of signed margins over scored calls. */
  totalMargin: number;
  /** Scored calls on the right side of the line. */
  correctCalls: number;
  scoredCalls: number;
  /** Calls and fades that are not scored yet (pending or not available). */
  pendingItems: number;
}

export interface StandingRow extends ManagerResult {
  rank: number;
  gapToFirst: number;
}

export interface Standings {
  basis: Basis;
  /** Ranked by total points, then total margin, then seat. */
  rows: StandingRow[];
  /** The draft is complete and every pick and fade is scored. Final standings are "Partial results" until then. */
  complete: boolean;
  /** At least one call is scored on this basis. */
  anyScored: boolean;
}

export function computeStandings(
  input: ScoringInput,
  teams: TeamLookup,
  basis: Basis,
  config: ScoringConfig = SCORING,
): Standings {
  const callsByPick = new Map<number, ScoredCall>();
  for (const pick of input.draft.picks) {
    const team = teams[pick.teamId];
    if (!team) throw new Error(`Unknown team ${pick.teamId} at pick ${pick.pickNumber}`);
    callsByPick.set(pick.pickNumber, { pick, team, evaluation: evaluateCall(pick.side, team, basis, config) });
  }

  const results = input.managers.map((manager): ManagerResult & { seat: number } => {
    const calls = input.draft.picks
      .filter((pick) => pick.managerId === manager.id)
      .map((pick) => callsByPick.get(pick.pickNumber)!);
    const fades = input.fades
      .filter((fade) => fade.managerId === manager.id)
      .flatMap((fade): ScoredFade[] => {
        const target = callsByPick.get(fade.targetPickNumber);
        return target ? [{ fade, target, evaluation: evaluateFade(target.evaluation, config) }] : [];
      });
    const scored = calls.filter((call) => call.evaluation.status === "scored");
    const callPoints = sum(scored.map((call) => call.evaluation.points ?? 0));
    const fadePoints = sum(fades.map((fade) => fade.evaluation.points ?? 0));
    return {
      managerId: manager.id,
      seat: manager.seat,
      calls,
      fades,
      callPoints,
      fadePoints,
      totalPoints: callPoints + fadePoints,
      totalMargin: sum(scored.map((call) => call.evaluation.margin ?? 0)),
      correctCalls: scored.filter((call) => call.evaluation.correct).length,
      scoredCalls: scored.length,
      pendingItems:
        calls.length - scored.length + fades.filter((fade) => fade.evaluation.status !== "scored").length,
    };
  });

  results.sort((a, b) => b.totalPoints - a.totalPoints || b.totalMargin - a.totalMargin || a.seat - b.seat);
  const leaderPoints = results[0]?.totalPoints ?? 0;
  const rows = results.map(({ seat: _seat, ...result }, index) => ({
    ...result,
    rank: index + 1,
    gapToFirst: leaderPoints - result.totalPoints,
  }));

  const allCalls = [...callsByPick.values()];
  return {
    basis,
    rows,
    complete: input.draft.status === "complete" && rows.every((row) => row.pendingItems === 0),
    anyScored: allCalls.some((call) => call.evaluation.status === "scored"),
  };
}

/** Scored calls closest to flipping, by smallest absolute margin. */
export function closestCalls(result: ManagerResult, count = 3): ScoredCall[] {
  return result.calls
    .filter((call) => call.evaluation.status === "scored")
    .sort(
      (a, b) =>
        Math.abs(a.evaluation.margin ?? 0) - Math.abs(b.evaluation.margin ?? 0) || a.pick.pickNumber - b.pick.pickNumber,
    )
    .slice(0, count);
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
```

If ESLint flags the unused `_seat` destructure, replace that `map` with one that builds the row object explicitly without `seat` (do not disable the rule).

- [ ] **Step 6: Run — expect pass**

Run: `npx vitest run src/lib/standings.test.ts`
Expected: PASS.

- [ ] **Step 7: Write the dataset consistency tests — `src/data/demo-league.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { LEAGUE_DEFAULTS } from "@/config/league";
import { buildDemoLeague, DEMO_LEAGUE_ID } from "@/data/demo-league";
import { TEAM_IDS, TEAMS, TEAMS_BY_ID, TOTAL_SIDES } from "@/data/teams";
import { seatForPick, totalPicks } from "@/lib/draft";
import { computeStandings } from "@/lib/standings";

describe("TEAMS", () => {
  it("has 30 unique teams, 15 per conference, and 60 sides", () => {
    expect(TEAMS).toHaveLength(30);
    expect(TEAM_IDS.size).toBe(30);
    expect(new Set(TEAMS.map((team) => team.nbaId)).size).toBe(30);
    expect(TEAMS.filter((team) => team.conference === "East")).toHaveLength(15);
    expect(TOTAL_SIDES).toBe(60);
  });

  it("uses half-point lines and valid mid-season records", () => {
    for (const team of TEAMS) {
      expect(team.line % 1).toBe(0.5);
      expect(team.wins + team.losses).toBeGreaterThan(0);
      expect(team.wins + team.losses).toBeLessThan(82);
      expect(team.color).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
});

describe("buildDemoLeague", () => {
  const league = buildDemoLeague();

  it("is a completed 4-manager, 11-round draft", () => {
    expect(league.id).toBe(DEMO_LEAGUE_ID);
    expect(league.isDemo).toBe(true);
    expect(league.managers).toHaveLength(LEAGUE_DEFAULTS.managerCount);
    expect(league.draft.rounds).toBe(LEAGUE_DEFAULTS.rounds);
    expect(league.draft.status).toBe("complete");
    expect(league.draft.picks).toHaveLength(totalPicks(4, 11));
  });

  it("follows snake order with unique, real sides", () => {
    const sides = new Set<string>();
    league.draft.picks.forEach((pick, index) => {
      expect(pick.pickNumber).toBe(index + 1);
      expect(pick.managerId).toBe(league.draft.seatOrder[seatForPick(pick.pickNumber, 4)]);
      expect(TEAMS_BY_ID[pick.teamId]).toBeDefined();
      sides.add(`${pick.teamId}:${pick.side}`);
    });
    expect(sides.size).toBe(44);
  });

  it("opens with the same eight picks as the draft room mockup", () => {
    expect(league.draft.picks.slice(0, 8).map((p) => `${p.managerId} ${p.teamId} ${p.side}`)).toEqual([
      "m1 MIN OVER",
      "m2 OKC OVER",
      "m3 BOS UNDER",
      "m4 CLE OVER",
      "m4 BKN UNDER",
      "m3 LAL OVER",
      "m2 DEN OVER",
      "m1 CHI UNDER",
    ]);
  });

  it("gives each manager one fade on an opponent's pick", () => {
    expect(league.fades).toHaveLength(4);
    for (const fade of league.fades) {
      const target = league.draft.picks.find((pick) => pick.pickNumber === fade.targetPickNumber);
      expect(target).toBeDefined();
      expect(target!.managerId).not.toBe(fade.managerId);
    }
    expect(new Set(league.fades.map((fade) => fade.managerId)).size).toBe(4);
  });

  it("derives a projected order where points, not margin, decide the ranking", () => {
    const standings = computeStandings(league, TEAMS_BY_ID, "projected");
    expect(standings.rows.map((row) => row.managerId)).toEqual(["m3", "m1", "m4", "m2"]);
    const m2 = standings.rows.find((row) => row.managerId === "m2")!;
    const m4 = standings.rows.find((row) => row.managerId === "m4")!;
    expect(m2.totalMargin).toBeGreaterThan(m4.totalMargin);
    const fadeStatus = Object.fromEntries(
      standings.rows.flatMap((row) => row.fades.map((fade) => [row.managerId, fade.evaluation.targetMissed])),
    );
    expect(fadeStatus).toEqual({ m1: true, m2: false, m3: false, m4: true });
  });

  it("has no settled picks yet, so final results are unavailable", () => {
    expect(computeStandings(league, TEAMS_BY_ID, "final").anyScored).toBe(false);
  });
});
```

- [ ] **Step 8: Run everything**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add src/data src/lib/standings.ts src/lib/standings.test.ts
git commit -m "feat: add mock teams, demo league and derived standings" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: League store, permissions, cookie identity and JSON API

**Files:**
- Create: `src/lib/league/managers.ts`, `src/lib/league/permissions.ts`, `src/lib/league/seats-cookie.ts`, `src/lib/league/parse-action.ts`, `src/lib/league/errors.ts`, `src/lib/league/store.ts`
- Create: `src/server/store.ts`, `src/server/viewer.ts`, `src/server/league.ts`, `src/server/http.ts`
- Create: `src/app/api/leagues/route.ts`, `src/app/api/leagues/[leagueId]/join/route.ts`, `src/app/api/leagues/[leagueId]/draft/route.ts`
- Test: `src/lib/league/permissions.test.ts`, `src/lib/league/seats-cookie.test.ts`, `src/lib/league/parse-action.test.ts`, `src/lib/league/store.test.ts`

**Interfaces:**
- Consumes: types; `createDraftState`, `applyDraftAction`, `managerOnTheClock`, `DraftAction`, `DraftError`; `LEAGUE_DEFAULTS`, `SEASON`; `TEAM_IDS`; `buildDemoLeague`.
- Produces:
  - `managerLabel(manager)` → `displayName ?? "Manager {seat+1}"`; `managerInitials(manager)` → `"M{seat+1}"`; `findManager(managers, id)`; `openSeats(managers)`
  - `canControlDraft(league, actorId)`, `canPickNow(league, actorId)`, `type DraftAccess`
  - `SEATS_COOKIE`, `type SeatMap`, `parseSeats(raw)`, `serializeSeats(seats)`, `withSeat(seats, leagueId, managerId)`
  - `parseDraftAction(input: unknown) → DraftAction | null`
  - `type StoreError`, `type StoreResult<T>`, `type LeagueStore { get, create, join, act }`, `createLeagueStore(options)`, `normalizeName`, `DISPLAY_NAME_MAX = 24`, `LEAGUE_NAME_MAX = 32`, `DEFAULT_LEAGUE_NAME = "My League"`
  - `type ApiError = StoreError | "invalid_request"`, `ERROR_MESSAGES`
  - server: `leagueStore`, `readSeats()`, `writeSeats(seats)`, `getViewerId(league)`, `toLeagueView(league)`, `getLeagueOrNotFound(id)`, `listSeatLeagues(seats)`, `errorResponse(error)`, `readJsonBody(request)`
  - HTTP: `POST /api/leagues` `{ leagueName?, displayName }` → 201 `{ leagueId, managerId }` + cookie; `POST /api/leagues/{id}/join` `{ managerId, displayName }` → 200 `{ leagueId, managerId }` + cookie; `GET /api/leagues/{id}/draft` → `LeagueView`; `POST /api/leagues/{id}/draft` `DraftAction` → `LeagueView`. Errors → `{ error, message }` with status from `src/server/http.ts`.

- [ ] **Step 1: `src/lib/league/managers.ts`**

```ts
import type { Manager } from "@/lib/types";

export function managerLabel(manager: Pick<Manager, "seat" | "displayName">): string {
  return manager.displayName ?? `Manager ${manager.seat + 1}`;
}

export function managerInitials(manager: Pick<Manager, "seat">): string {
  return `M${manager.seat + 1}`;
}

export function findManager(managers: readonly Manager[], id: string | null | undefined): Manager | undefined {
  return id ? managers.find((manager) => manager.id === id) : undefined;
}

export function openSeats(managers: readonly Manager[]): Manager[] {
  return managers.filter((manager) => manager.displayName === null);
}
```

- [ ] **Step 2: Write failing tests — `src/lib/league/permissions.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { canControlDraft, canPickNow, type DraftAccess } from "@/lib/league/permissions";
import type { DraftStatus, Manager } from "@/lib/types";

const MANAGERS: Manager[] = [
  { id: "m1", seat: 0, displayName: "Ana" },
  { id: "m2", seat: 1, displayName: "Ben" },
  { id: "m3", seat: 2, displayName: null },
  { id: "m4", seat: 3, displayName: null },
];
const SEATS = ["m1", "m2", "m3", "m4"];
const TEAMS = ["MIN", "OKC", "BOS", "CLE"];

function league(status: DraftStatus, pickCount = 0, isDemo = false): DraftAccess {
  return {
    isDemo,
    commissionerId: "m1",
    managers: MANAGERS,
    draft: {
      status,
      rounds: 2,
      seatOrder: SEATS,
      picks: Array.from({ length: pickCount }, (_, i) => ({
        pickNumber: i + 1,
        managerId: SEATS[i],
        teamId: TEAMS[i],
        side: "OVER" as const,
      })),
    },
  };
}

describe("canControlDraft", () => {
  it("allows only the commissioner, never in the demo league", () => {
    expect(canControlDraft(league("live"), "m1")).toBe(true);
    expect(canControlDraft(league("live"), "m2")).toBe(false);
    expect(canControlDraft(league("live"), null)).toBe(false);
    expect(canControlDraft(league("live", 0, true), "m1")).toBe(false);
  });
});

describe("canPickNow", () => {
  it("lets the manager on the clock pick", () => {
    expect(canPickNow(league("live"), "m1")).toBe(true);
    expect(canPickNow(league("live", 1), "m2")).toBe(true);
  });

  it("blocks other claimed managers and spectators", () => {
    expect(canPickNow(league("live"), "m2")).toBe(false);
    expect(canPickNow(league("live"), null)).toBe(false);
  });

  it("lets the commissioner pick for an open seat, but not for a claimed one", () => {
    expect(canPickNow(league("live", 2), "m1")).toBe(true); // m3 is open
    expect(canPickNow(league("live", 2), "m2")).toBe(false);
    expect(canPickNow(league("live", 1), "m1")).toBe(false); // m2 is claimed
  });

  it("blocks everyone unless the draft is live", () => {
    expect(canPickNow(league("paused"), "m1")).toBe(false);
    expect(canPickNow(league("not_started"), "m1")).toBe(false);
    expect(canPickNow(league("live", 0, true), "m1")).toBe(false);
  });
});
```

- [ ] **Step 3: Run — expect failure**, then implement `src/lib/league/permissions.ts`

Run: `npx vitest run src/lib/league/permissions.test.ts` → FAIL (module missing).

```ts
import { managerOnTheClock } from "@/lib/draft";
import type { League } from "@/lib/types";

export type DraftAccess = Pick<League, "isDemo" | "commissionerId" | "managers" | "draft">;

/** Start, pause and resume belong to the commissioner. The demo league is read-only. */
export function canControlDraft(league: Pick<League, "isDemo" | "commissionerId">, actorId: string | null): boolean {
  return !league.isDemo && actorId !== null && actorId === league.commissionerId;
}

/** The manager on the clock picks; the commissioner picks for an unclaimed seat. */
export function canPickNow(league: DraftAccess, actorId: string | null): boolean {
  if (league.isDemo || actorId === null || league.draft.status !== "live") return false;
  const onClockId = managerOnTheClock(league.draft);
  if (onClockId === null) return false;
  if (onClockId === actorId) return true;
  const onClock = league.managers.find((manager) => manager.id === onClockId);
  return actorId === league.commissionerId && onClock !== undefined && onClock.displayName === null;
}
```

Run again → PASS.

- [ ] **Step 4: Write failing tests — `src/lib/league/seats-cookie.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { parseSeats, SEATS_COOKIE, serializeSeats, withSeat } from "@/lib/league/seats-cookie";

describe("seats cookie", () => {
  it("is named courtline_seats", () => {
    expect(SEATS_COOKIE).toBe("courtline_seats");
  });

  it("parses leagueId:managerId pairs", () => {
    expect(parseSeats("abc123:m1|demo:m2")).toEqual({ abc123: "m1", demo: "m2" });
  });

  it("returns an empty map for missing or malformed input", () => {
    expect(parseSeats(undefined)).toEqual({});
    expect(parseSeats("")).toEqual({});
    expect(parseSeats("bad|x:y:z|ok1:m3|UPPER:m1|abc:mx")).toEqual({ ok1: "m3" });
  });

  it("round-trips through serialize", () => {
    const seats = { abc123: "m1", zz9: "m4" };
    expect(parseSeats(serializeSeats(seats))).toEqual(seats);
  });

  it("adds or replaces one league's seat without touching the others", () => {
    expect(withSeat({ a1: "m1", b2: "m2" }, "b2", "m3")).toEqual({ a1: "m1", b2: "m3" });
  });
});
```

Run → FAIL. Implement `src/lib/league/seats-cookie.ts`:

```ts
export const SEATS_COOKIE = "courtline_seats";

/** leagueId → managerId for every league this browser holds a seat in. */
export type SeatMap = Readonly<Record<string, string>>;

const ENTRY = /^([a-z0-9]{1,32}):(m\d{1,2})$/;

export function parseSeats(raw: string | undefined): SeatMap {
  if (!raw) return {};
  const seats: Record<string, string> = {};
  for (const entry of raw.split("|")) {
    const match = ENTRY.exec(entry);
    if (match) seats[match[1]] = match[2];
  }
  return seats;
}

export function serializeSeats(seats: SeatMap): string {
  return Object.entries(seats)
    .map(([leagueId, managerId]) => `${leagueId}:${managerId}`)
    .join("|");
}

export function withSeat(seats: SeatMap, leagueId: string, managerId: string): SeatMap {
  return { ...seats, [leagueId]: managerId };
}
```

Run → PASS.

- [ ] **Step 5: Write failing tests — `src/lib/league/parse-action.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { parseDraftAction } from "@/lib/league/parse-action";

describe("parseDraftAction", () => {
  it("accepts control actions", () => {
    expect(parseDraftAction({ type: "start" })).toEqual({ type: "start" });
    expect(parseDraftAction({ type: "pause" })).toEqual({ type: "pause" });
    expect(parseDraftAction({ type: "resume" })).toEqual({ type: "resume" });
  });

  it("accepts a confirm with a team and side, dropping extra fields", () => {
    expect(parseDraftAction({ type: "confirm", teamId: "MIN", side: "OVER", extra: 1 })).toEqual({
      type: "confirm",
      teamId: "MIN",
      side: "OVER",
    });
  });

  it("rejects anything else", () => {
    expect(parseDraftAction(null)).toBeNull();
    expect(parseDraftAction("start")).toBeNull();
    expect(parseDraftAction({ type: "confirm", teamId: "MIN", side: "SIDEWAYS" })).toBeNull();
    expect(parseDraftAction({ type: "confirm", side: "OVER" })).toBeNull();
    expect(parseDraftAction({ type: "delete" })).toBeNull();
  });
});
```

Run → FAIL. Implement `src/lib/league/parse-action.ts`:

```ts
import type { DraftAction } from "@/lib/draft";

/** Validates an untrusted request body into a DraftAction. */
export function parseDraftAction(input: unknown): DraftAction | null {
  if (!input || typeof input !== "object") return null;
  const { type, teamId, side } = input as Record<string, unknown>;
  if (type === "start" || type === "pause" || type === "resume") return { type };
  if (type === "confirm" && typeof teamId === "string" && (side === "OVER" || side === "UNDER")) {
    return { type, teamId, side };
  }
  return null;
}
```

Run → PASS.

- [ ] **Step 6: Write failing tests — `src/lib/league/store.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { createLeagueStore, type LeagueStore } from "@/lib/league/store";
import type { League } from "@/lib/types";

const TEAM_IDS = new Set(["MIN", "OKC", "BOS"]);

const DEMO: League = {
  id: "demo",
  name: "Demo",
  seasonLabel: "2025–26",
  isDemo: true,
  commissionerId: "m1",
  version: 1,
  managers: [{ id: "m1", seat: 0, displayName: null }],
  draft: { status: "complete", rounds: 1, seatOrder: ["m1"], picks: [] },
  fades: [],
};

function newStore(): LeagueStore {
  const ids = ["abc123", "def456", "ghi789"];
  return createLeagueStore({ teamIds: TEAM_IDS, seed: [DEMO], generateId: () => ids.shift() ?? "zzz999" });
}

function createdLeague(store: LeagueStore): League {
  const result = store.create({ leagueName: "  Hoop   Dreams ", displayName: " Ana " });
  if (!result.ok) throw new Error(result.error);
  return result.value.league;
}

describe("create", () => {
  it("creates a fresh 4-seat, 11-round league with the creator as commissioner in seat 1", () => {
    const store = newStore();
    const result = store.create({ leagueName: "  Hoop   Dreams ", displayName: " Ana " });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { league, managerId } = result.value;
    expect(managerId).toBe("m1");
    expect(league).toMatchObject({
      id: "abc123",
      name: "Hoop Dreams",
      isDemo: false,
      commissionerId: "m1",
      version: 1,
      fades: [],
      draft: { status: "not_started", rounds: 11, seatOrder: ["m1", "m2", "m3", "m4"], picks: [] },
    });
    expect(league.managers.map((m) => m.displayName)).toEqual(["Ana", null, null, null]);
    expect(store.get("abc123")).toEqual(league);
  });

  it("defaults the league name and validates names", () => {
    const store = newStore();
    const named = store.create({ displayName: "Ana" });
    expect(named.ok && named.value.league.name).toBe("My League");
    expect(store.create({ displayName: "   " })).toEqual({ ok: false, error: "invalid_name" });
    expect(store.create({ displayName: "x".repeat(25) })).toEqual({ ok: false, error: "invalid_name" });
    expect(store.create({ displayName: "Ana", leagueName: "x".repeat(33) })).toEqual({
      ok: false,
      error: "invalid_league_name",
    });
  });
});

describe("join", () => {
  it("claims an open seat with a display name", () => {
    const store = newStore();
    const league = createdLeague(store);
    const result = store.join(league.id, { managerId: "m3", displayName: "Cal", currentManagerId: null });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.managerId).toBe("m3");
    expect(result.value.league.managers[2].displayName).toBe("Cal");
    expect(result.value.league.version).toBe(2);
  });

  it("rejects taken seats, repeat joins, unknown seats, bad names and the demo league", () => {
    const store = newStore();
    const league = createdLeague(store);
    expect(store.join(league.id, { managerId: "m1", displayName: "Cal", currentManagerId: null })).toEqual({
      ok: false,
      error: "seat_taken",
    });
    expect(store.join(league.id, { managerId: "m2", displayName: "Cal", currentManagerId: "m1" })).toEqual({
      ok: false,
      error: "already_joined",
    });
    expect(store.join(league.id, { managerId: "m9", displayName: "Cal", currentManagerId: null })).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(store.join(league.id, { managerId: "m2", displayName: "", currentManagerId: null })).toEqual({
      ok: false,
      error: "invalid_name",
    });
    expect(store.join("demo", { managerId: "m1", displayName: "Cal", currentManagerId: null })).toEqual({
      ok: false,
      error: "demo_league",
    });
    expect(store.join("nope", { managerId: "m2", displayName: "Cal", currentManagerId: null })).toEqual({
      ok: false,
      error: "not_found",
    });
  });
});

describe("act", () => {
  it("lets only the commissioner start, pause and resume", () => {
    const store = newStore();
    const league = createdLeague(store);
    store.join(league.id, { managerId: "m2", displayName: "Ben", currentManagerId: null });
    expect(store.act(league.id, "m2", { type: "start" })).toEqual({ ok: false, error: "forbidden" });
    const started = store.act(league.id, "m1", { type: "start" });
    expect(started.ok && started.value.draft.status).toBe("live");
    const paused = store.act(league.id, "m1", { type: "pause" });
    expect(paused.ok && paused.value.draft.status).toBe("paused");
    expect(store.act(league.id, "m1", { type: "confirm", teamId: "MIN", side: "OVER" })).toEqual({
      ok: false,
      error: "not_live",
    });
  });

  it("enforces turns, open-seat picking and side availability", () => {
    const store = newStore();
    const league = createdLeague(store);
    store.join(league.id, { managerId: "m2", displayName: "Ben", currentManagerId: null });
    store.act(league.id, "m1", { type: "start" });

    expect(store.act(league.id, "m2", { type: "confirm", teamId: "MIN", side: "OVER" })).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(store.act(league.id, "m1", { type: "confirm", teamId: "MIN", side: "OVER" }).ok).toBe(true);
    expect(store.act(league.id, "m2", { type: "confirm", teamId: "MIN", side: "OVER" })).toEqual({
      ok: false,
      error: "side_taken",
    });
    expect(store.act(league.id, "m2", { type: "confirm", teamId: "MIN", side: "UNDER" }).ok).toBe(true);

    // Pick 3 belongs to open seat m3: the commissioner picks for it.
    const third = store.act(league.id, "m1", { type: "confirm", teamId: "OKC", side: "OVER" });
    expect(third.ok && third.value.draft.picks[2]).toEqual({
      pickNumber: 3,
      managerId: "m3",
      teamId: "OKC",
      side: "OVER",
    });
  });

  it("hands a seat over when someone joins mid-draft", () => {
    const store = newStore();
    const league = createdLeague(store);
    store.act(league.id, "m1", { type: "start" });
    store.act(league.id, "m1", { type: "confirm", teamId: "MIN", side: "OVER" });
    store.join(league.id, { managerId: "m2", displayName: "Ben", currentManagerId: null });
    expect(store.act(league.id, "m1", { type: "confirm", teamId: "OKC", side: "OVER" })).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(store.act(league.id, "m2", { type: "confirm", teamId: "OKC", side: "OVER" }).ok).toBe(true);
  });

  it("bumps the version on every successful change", () => {
    const store = newStore();
    const league = createdLeague(store);
    const started = store.act(league.id, "m1", { type: "start" });
    expect(started.ok && started.value.version).toBe(2);
    store.act(league.id, "m2", { type: "pause" }); // forbidden: no change
    expect(store.get(league.id)!.version).toBe(2);
  });

  it("rejects unknown leagues, the demo league and unknown teams", () => {
    const store = newStore();
    const league = createdLeague(store);
    store.act(league.id, "m1", { type: "start" });
    expect(store.act("nope", "m1", { type: "start" })).toEqual({ ok: false, error: "not_found" });
    expect(store.act("demo", "m1", { type: "pause" })).toEqual({ ok: false, error: "demo_league" });
    expect(store.act(league.id, "m1", { type: "confirm", teamId: "XXX", side: "OVER" })).toEqual({
      ok: false,
      error: "unknown_team",
    });
  });
});
```

Run: `npx vitest run src/lib/league/store.test.ts` → FAIL (module missing).

- [ ] **Step 7: Implement `src/lib/league/store.ts`**

```ts
import { LEAGUE_DEFAULTS, SEASON } from "@/config/league";
import { applyDraftAction, createDraftState, type DraftAction, type DraftError } from "@/lib/draft";
import { canControlDraft, canPickNow } from "@/lib/league/permissions";
import type { League, Manager, TeamId } from "@/lib/types";

export type StoreError =
  | "not_found"
  | "forbidden"
  | "invalid_name"
  | "invalid_league_name"
  | "seat_taken"
  | "already_joined"
  | "demo_league"
  | DraftError;

export type StoreResult<T> = { ok: true; value: T } | { ok: false; error: StoreError };

export const DISPLAY_NAME_MAX = 24;
export const LEAGUE_NAME_MAX = 32;
export const DEFAULT_LEAGUE_NAME = "My League";

const LEAGUE_ID_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const LEAGUE_ID_LENGTH = 6;

export interface LeagueStore {
  get(leagueId: string): League | undefined;
  create(input: { leagueName?: unknown; displayName: unknown }): StoreResult<{ league: League; managerId: string }>;
  join(
    leagueId: string,
    input: { managerId: unknown; displayName: unknown; currentManagerId: string | null },
  ): StoreResult<{ league: League; managerId: string }>;
  act(leagueId: string, actorId: string | null, action: DraftAction): StoreResult<League>;
}

export interface LeagueStoreOptions {
  teamIds: ReadonlySet<TeamId>;
  seed?: readonly League[];
  generateId?: () => string;
}

/** Trims and collapses whitespace; null when empty or longer than max. */
export function normalizeName(raw: unknown, max: number): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim().replace(/\s+/g, " ");
  return name.length > 0 && name.length <= max ? name : null;
}

export function randomLeagueId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(LEAGUE_ID_LENGTH));
  return Array.from(bytes, (byte) => LEAGUE_ID_ALPHABET[byte % LEAGUE_ID_ALPHABET.length]).join("");
}

export function createLeagueStore({
  teamIds,
  seed = [],
  generateId = randomLeagueId,
}: LeagueStoreOptions): LeagueStore {
  const leagues = new Map<string, League>(seed.map((league) => [league.id, league]));

  function save(league: League): League {
    const next = { ...league, version: league.version + 1 };
    leagues.set(next.id, next);
    return next;
  }

  function uniqueId(): string {
    for (let attempt = 0; attempt < 10; attempt++) {
      const id = generateId();
      if (!leagues.has(id)) return id;
    }
    throw new Error("Could not generate a unique league id");
  }

  return {
    get: (leagueId) => leagues.get(leagueId),

    create({ leagueName, displayName }) {
      const name = normalizeName(displayName, DISPLAY_NAME_MAX);
      if (!name) return fail("invalid_name");
      const requested = typeof leagueName === "string" && leagueName.trim() !== "" ? leagueName : DEFAULT_LEAGUE_NAME;
      const title = normalizeName(requested, LEAGUE_NAME_MAX);
      if (!title) return fail("invalid_league_name");

      const seatOrder = Array.from({ length: LEAGUE_DEFAULTS.managerCount }, (_, seat) => `m${seat + 1}`);
      const managers: Manager[] = seatOrder.map((id, seat) => ({ id, seat, displayName: seat === 0 ? name : null }));
      const league: League = {
        id: uniqueId(),
        name: title,
        seasonLabel: SEASON.label,
        isDemo: false,
        commissionerId: seatOrder[0],
        version: 1,
        managers,
        draft: createDraftState(seatOrder, LEAGUE_DEFAULTS.rounds),
        fades: [],
      };
      leagues.set(league.id, league);
      return succeed({ league, managerId: seatOrder[0] });
    },

    join(leagueId, { managerId, displayName, currentManagerId }) {
      const league = leagues.get(leagueId);
      if (!league) return fail("not_found");
      if (league.isDemo) return fail("demo_league");
      const alreadySeated = league.managers.some((m) => m.id === currentManagerId && m.displayName !== null);
      if (alreadySeated) return fail("already_joined");
      const seat = league.managers.find((m) => m.id === managerId);
      if (!seat) return fail("not_found");
      if (seat.displayName !== null) return fail("seat_taken");
      const name = normalizeName(displayName, DISPLAY_NAME_MAX);
      if (!name) return fail("invalid_name");
      const managers = league.managers.map((m) => (m.id === seat.id ? { ...m, displayName: name } : m));
      return succeed({ league: save({ ...league, managers }), managerId: seat.id });
    },

    act(leagueId, actorId, action) {
      const league = leagues.get(leagueId);
      if (!league) return fail("not_found");
      if (league.isDemo) return fail("demo_league");
      if (action.type === "confirm") {
        if (league.draft.status !== "live") return fail("not_live");
        if (!canPickNow(league, actorId)) return fail("forbidden");
      } else if (!canControlDraft(league, actorId)) {
        return fail("forbidden");
      }
      const result = applyDraftAction(league.draft, action, teamIds);
      if (!result.ok) return fail(result.error);
      return succeed(save({ ...league, draft: result.state }));
    },
  };
}

function succeed<T>(value: T): StoreResult<T> {
  return { ok: true, value };
}

function fail<T>(error: StoreError): StoreResult<T> {
  return { ok: false, error };
}
```

Run: `npx vitest run src/lib/league` → all PASS.

- [ ] **Step 8: `src/lib/league/errors.ts`**

```ts
import type { StoreError } from "@/lib/league/store";

export type ApiError = StoreError | "invalid_request";

export const ERROR_MESSAGES: Record<ApiError, string> = {
  not_found: "That league or seat doesn't exist.",
  forbidden: "You can't do that right now.",
  invalid_name: "Enter your name (1–24 characters).",
  invalid_league_name: "League names can be up to 32 characters.",
  seat_taken: "That seat was just claimed. Pick another.",
  already_joined: "You already have a seat in this league.",
  demo_league: "The demo league is read-only.",
  not_live: "The draft isn't live.",
  side_taken: "That side was just drafted.",
  unknown_team: "Unknown team.",
  invalid_transition: "The draft can't do that from its current state.",
  invalid_request: "Invalid request.",
};
```

- [ ] **Step 9: Server modules**

`src/server/store.ts`:

```ts
import "server-only";
import { buildDemoLeague } from "@/data/demo-league";
import { TEAM_IDS } from "@/data/teams";
import { createLeagueStore, type LeagueStore } from "@/lib/league/store";

// One store per server process. globalThis keeps it alive across dev hot reloads and shared between route bundles.
const globalForStore = globalThis as unknown as { __courtlineStore?: LeagueStore };

export const leagueStore: LeagueStore = (globalForStore.__courtlineStore ??= createLeagueStore({
  teamIds: TEAM_IDS,
  seed: [buildDemoLeague()],
}));
```

`src/server/viewer.ts`:

```ts
import "server-only";
import { cookies } from "next/headers";
import { parseSeats, SEATS_COOKIE, serializeSeats, type SeatMap } from "@/lib/league/seats-cookie";
import type { League, LeagueView } from "@/lib/types";

const SEATS_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export async function readSeats(): Promise<SeatMap> {
  const store = await cookies();
  return parseSeats(store.get(SEATS_COOKIE)?.value);
}

/** Only callable from route handlers (cookies can't be set while rendering). */
export async function writeSeats(seats: SeatMap): Promise<void> {
  const store = await cookies();
  store.set(SEATS_COOKIE, serializeSeats(seats), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SEATS_COOKIE_MAX_AGE,
  });
}

/** The viewer's manager id in this league, if their cookie points at a claimed seat. */
export async function getViewerId(league: League): Promise<string | null> {
  const managerId = (await readSeats())[league.id];
  const manager = league.managers.find((m) => m.id === managerId);
  return manager && manager.displayName !== null ? manager.id : null;
}

export async function toLeagueView(league: League): Promise<LeagueView> {
  return { league, viewerId: await getViewerId(league) };
}
```

`src/server/league.ts`:

```ts
import "server-only";
import { notFound } from "next/navigation";
import type { SeatMap } from "@/lib/league/seats-cookie";
import type { League } from "@/lib/types";
import { leagueStore } from "@/server/store";

export function getLeagueOrNotFound(leagueId: string): League {
  const league = leagueStore.get(leagueId);
  if (!league) notFound();
  return league;
}

export interface SeatLeague {
  league: League;
  managerId: string;
}

/** Leagues from the viewer's cookie that still exist on this server. */
export function listSeatLeagues(seats: SeatMap): SeatLeague[] {
  return Object.entries(seats).flatMap(([leagueId, managerId]) => {
    const league = leagueStore.get(leagueId);
    return league ? [{ league, managerId }] : [];
  });
}
```

`src/server/http.ts`:

```ts
import "server-only";
import { ERROR_MESSAGES, type ApiError } from "@/lib/league/errors";

const STATUS: Record<ApiError, number> = {
  not_found: 404,
  forbidden: 403,
  demo_league: 403,
  invalid_name: 400,
  invalid_league_name: 400,
  invalid_request: 400,
  unknown_team: 400,
  seat_taken: 409,
  already_joined: 409,
  side_taken: 409,
  not_live: 409,
  invalid_transition: 409,
};

export function errorResponse(error: ApiError): Response {
  return Response.json({ error, message: ERROR_MESSAGES[error] }, { status: STATUS[error] });
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
```

- [ ] **Step 10: Route handlers**

`src/app/api/leagues/route.ts`:

```ts
import { withSeat } from "@/lib/league/seats-cookie";
import { errorResponse, readJsonBody } from "@/server/http";
import { leagueStore } from "@/server/store";
import { readSeats, writeSeats } from "@/server/viewer";

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  const result = leagueStore.create({ leagueName: body.leagueName, displayName: body.displayName });
  if (!result.ok) return errorResponse(result.error);
  const { league, managerId } = result.value;
  await writeSeats(withSeat(await readSeats(), league.id, managerId));
  return Response.json({ leagueId: league.id, managerId }, { status: 201 });
}
```

`src/app/api/leagues/[leagueId]/join/route.ts`:

```ts
import { withSeat } from "@/lib/league/seats-cookie";
import { errorResponse, readJsonBody } from "@/server/http";
import { leagueStore } from "@/server/store";
import { readSeats, writeSeats } from "@/server/viewer";

export async function POST(request: Request, ctx: RouteContext<"/api/leagues/[leagueId]/join">) {
  const { leagueId } = await ctx.params;
  const body = await readJsonBody(request);
  const seats = await readSeats();
  const result = leagueStore.join(leagueId, {
    managerId: body.managerId,
    displayName: body.displayName,
    currentManagerId: seats[leagueId] ?? null,
  });
  if (!result.ok) return errorResponse(result.error);
  const { managerId } = result.value;
  await writeSeats(withSeat(seats, leagueId, managerId));
  return Response.json({ leagueId, managerId });
}
```

`src/app/api/leagues/[leagueId]/draft/route.ts`:

```ts
import { parseDraftAction } from "@/lib/league/parse-action";
import type { LeagueView } from "@/lib/types";
import { errorResponse, readJsonBody } from "@/server/http";
import { leagueStore } from "@/server/store";
import { getViewerId, toLeagueView } from "@/server/viewer";

export async function GET(_request: Request, ctx: RouteContext<"/api/leagues/[leagueId]/draft">) {
  const { leagueId } = await ctx.params;
  const league = leagueStore.get(leagueId);
  if (!league) return errorResponse("not_found");
  return Response.json(await toLeagueView(league), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, ctx: RouteContext<"/api/leagues/[leagueId]/draft">) {
  const { leagueId } = await ctx.params;
  const action = parseDraftAction(await readJsonBody(request));
  if (!action) return errorResponse("invalid_request");
  const league = leagueStore.get(leagueId);
  if (!league) return errorResponse("not_found");
  const viewerId = await getViewerId(league);
  const result = leagueStore.act(leagueId, viewerId, action);
  if (!result.ok) return errorResponse(result.error);
  const view: LeagueView = { league: result.value, viewerId };
  return Response.json(view);
}
```

- [ ] **Step 11: Verify unit tests, lint, types, build**

Run: `npm test && npm run lint && npm run typecheck && npm run build`
Expected: all PASS; build lists `ƒ /api/leagues`, `ƒ /api/leagues/[leagueId]/join`, `ƒ /api/leagues/[leagueId]/draft`.

- [ ] **Step 12: API smoke test with two browsers' worth of cookies**

Start the production server in the background, run the script, then stop it:

```bash
npx next start -p 3100 > /tmp/courtline-smoke.log 2>&1 &
for i in $(seq 1 40); do curl -s -o /dev/null http://localhost:3100/ && break; sleep 0.5; done
A=$(mktemp); B=$(mktemp); H='content-type: application/json'; API=http://localhost:3100/api/leagues
ID=$(curl -s -c $A -b $A -X POST $API -H "$H" -d '{"leagueName":"Smoke League","displayName":"Ana"}' | jq -r .leagueId); echo "league $ID"
curl -s -c $B -b $B -X POST $API/$ID/join -H "$H" -d '{"managerId":"m2","displayName":"Ben"}'; echo
curl -s -o /dev/null -w "B start: %{http_code}\n" -b $B -X POST $API/$ID/draft -H "$H" -d '{"type":"start"}'
curl -s -o /dev/null -w "A start: %{http_code}\n" -b $A -X POST $API/$ID/draft -H "$H" -d '{"type":"start"}'
curl -s -o /dev/null -w "B early pick: %{http_code}\n" -b $B -X POST $API/$ID/draft -H "$H" -d '{"type":"confirm","teamId":"MIN","side":"OVER"}'
curl -s -o /dev/null -w "A pick 1: %{http_code}\n" -b $A -X POST $API/$ID/draft -H "$H" -d '{"type":"confirm","teamId":"MIN","side":"OVER"}'
curl -s -o /dev/null -w "B same side: %{http_code}\n" -b $B -X POST $API/$ID/draft -H "$H" -d '{"type":"confirm","teamId":"MIN","side":"OVER"}'
curl -s -o /dev/null -w "B pick 2: %{http_code}\n" -b $B -X POST $API/$ID/draft -H "$H" -d '{"type":"confirm","teamId":"MIN","side":"UNDER"}'
curl -s -o /dev/null -w "A pick 3 for open seat: %{http_code}\n" -b $A -X POST $API/$ID/draft -H "$H" -d '{"type":"confirm","teamId":"OKC","side":"OVER"}'
curl -s -b $B $API/$ID/draft | jq -c '{viewer: .viewerId, version: .league.version, picks: [.league.draft.picks[] | "\(.pickNumber) \(.managerId) \(.teamId) \(.side)"]}'
curl -s -o /dev/null -w "demo pause: %{http_code}\n" -b $A -X POST $API/demo/draft -H "$H" -d '{"type":"pause"}'
curl -s -o /dev/null -w "bad body: %{http_code}\n" -b $A -X POST $API/$ID/draft -H "$H" -d '{"type":"explode"}'
pkill -f "next start -p 3100"
```

Expected output, in order: a league id; `{"leagueId":"…","managerId":"m2"}`; `B start: 403`; `A start: 200`; `B early pick: 403`; `A pick 1: 200`; `B same side: 409`; `B pick 2: 200`; `A pick 3 for open seat: 200`; `{"viewer":"m2","version":6,"picks":["1 m1 MIN OVER","2 m2 MIN UNDER","3 m3 OKC OVER"]}`; `demo pause: 403`; `bad body: 400`. Paste the actual output into your report.

- [ ] **Step 13: Commit**

```bash
git add src/lib/league src/server src/app/api
git commit -m "feat: add in-memory league store, cookie identity and draft API" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Shared UI primitives, app shell, landing, join and placeholder pages

**Files:**
- Create: `src/lib/nba-logo.ts`, `src/components/icons/BallIcon.tsx`
- Create: `src/components/ui/{Panel,Button,Badge,SidePill,TeamBadge,TeamLogo,ManagerAvatar,PaceBar,SignedValue,StatCard,SegmentedControl,Select,Alert,NotBuiltYet,PageFallback}.tsx`
- Create: `src/components/shell/{nav-items.ts,Logo.tsx,SidebarNav.tsx,BottomNav.tsx,LeagueSwitcher.tsx,AppShell.tsx,PageHeader.tsx}`
- Create: `src/components/landing/CreateLeagueForm.tsx`, `src/components/join/JoinForm.tsx`
- Create: `src/app/not-found.tsx`, `src/app/l/[leagueId]/layout.tsx`, `src/app/l/[leagueId]/join/page.tsx`, `src/app/l/[leagueId]/rosters/page.tsx`, `src/app/l/[leagueId]/settings/page.tsx`
- Modify: `src/app/page.tsx` (landing)

**Interfaces:**
- Consumes: Task 2–5 exports (`Team`, `Side`, `Manager`, `League`, `formatNumber`, `formatSigned`, `NOT_AVAILABLE`, `managerLabel`, `managerInitials`, `openSeats`, `findManager`, `readSeats`, `getViewerId`, `getLeagueOrNotFound`, `listSeatLeagues`, `DEMO_LEAGUE_ID`).
- Produces (used by Tasks 7–8):
  - `<Panel title? icon? actions? className? bodyClassName?>`
  - `<Button variant?="primary"|"secondary"|"ghost" size?="sm"|"md"|"lg" …buttonProps>`, `buttonClasses(variant?, size?)`
  - `<Badge tone?="neutral"|"accent"|"danger"|"soon">`
  - `<SidePill side size?="sm"|"md">`, `<TeamBadge team size?>`, `<TeamLogo team size?>`, `<ManagerAvatar manager size?="sm"|"md"|"lg" className?>`
  - `<PaceBar value line side max?>`, `<SignedValue value digits? empty? className?>`, `<StatCard icon label value sub?>`
  - `<SegmentedControl options value onChange ariaLabel>`, `<Select label value onChange options className?>`
  - `<Alert onDismiss?>`, `<NotBuiltYet title description>`, `<PageFallback label>`, `<PageHeader title subtitle tag?>`, `<BallIcon className?>`
  - League layout renders `AppShell` around every `/l/[leagueId]/*` page.

The `/l/[leagueId]` overview and `/l/[leagueId]/draft` pages are built in Tasks 7 and 8; their nav links 404 until then.

- [ ] **Step 1: Small libs and icon**

`src/lib/nba-logo.ts`:

```ts
export function teamLogoUrl(nbaId: number): string {
  return `https://cdn.nba.com/logos/nba/${nbaId}/global/L/logo.svg`;
}
```

`src/components/icons/BallIcon.tsx`:

```tsx
export function BallIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden
      className={className}
    >
      <circle cx="16" cy="16" r="13" />
      <path d="M3 16h26M16 3v26M7 6.5c4 3 6 6 6 9.5s-2 6.5-6 9.5M25 6.5c-4 3-6 6-6 9.5s2 6.5 6 9.5" />
    </svg>
  );
}
```

- [ ] **Step 2: UI primitives**

`src/components/ui/Panel.tsx`:

```tsx
import type { ReactNode } from "react";

export function Panel({
  title,
  icon,
  actions,
  className = "",
  bodyClassName = "",
  children,
}: {
  title?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={`min-w-0 rounded-xl border border-ink-700 bg-ink-850/90 ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-700 px-4 py-3 sm:px-5">
          {title && (
            <h2 className="flex min-w-0 items-center gap-2 font-display text-xl font-semibold text-fog-50">
              {icon}
              {title}
            </h2>
          )}
          {actions}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
```

`src/components/ui/Button.tsx`:

```tsx
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent-strong",
  secondary: "border border-ink-600 bg-ink-900 text-fog-50 hover:border-fog-400",
  ghost: "text-fog-300 hover:text-fog-50",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-5 text-base",
};

/** Shared with links styled as buttons. */
export function buttonClasses(variant: Variant = "primary", size: Size = "md"): string {
  return `inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 ${VARIANTS[variant]} ${SIZES[size]}`;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button type={type} className={`${buttonClasses(variant, size)} ${className}`} {...props} />;
}
```

`src/components/ui/Badge.tsx`:

```tsx
import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "accent" | "danger" | "soon";

const TONES: Record<BadgeTone, string> = {
  neutral: "border-ink-600 text-fog-300",
  accent: "border-accent/60 bg-accent/10 text-accent",
  danger: "border-negative/60 bg-negative/10 text-negative",
  soon: "border-ink-600 text-fog-400",
};

export function Badge({ tone = "neutral", className = "", children }: { tone?: BadgeTone; className?: string; children: ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
```

`src/components/ui/SidePill.tsx`:

```tsx
import type { Side } from "@/lib/types";

const STYLES: Record<Side, string> = {
  OVER: "border-over/70 bg-over-deep text-over",
  UNDER: "border-under/70 bg-under-deep text-under-ink",
};

export function SidePill({ side, size = "md", className = "" }: { side: Side; size?: "sm" | "md"; className?: string }) {
  const sizing = size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm";
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-md border font-display font-bold tracking-wide ${sizing} ${STYLES[side]} ${className}`}
    >
      {side}
    </span>
  );
}
```

`src/components/ui/TeamBadge.tsx`:

```tsx
import type { Team } from "@/lib/types";

export function TeamBadge({ team, size = 32, className = "" }: { team: Team; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-md font-display font-bold text-white ${className}`}
      style={{ width: size, height: size, backgroundColor: team.color, fontSize: Math.max(10, Math.round(size * 0.36)) }}
    >
      {team.id}
    </span>
  );
}
```

`src/components/ui/TeamLogo.tsx`:

```tsx
"use client";

import Image from "next/image";
import { useState } from "react";
import { TeamBadge } from "@/components/ui/TeamBadge";
import { teamLogoUrl } from "@/lib/nba-logo";
import type { Team } from "@/lib/types";

/** Official logo from NBA's CDN; falls back to the abbreviation badge if it can't load. Decorative: the team name is always shown beside it. */
export function TeamLogo({ team, size = 32, className = "" }: { team: Team; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <TeamBadge team={team} size={size} className={className} />;
  return (
    <Image
      src={teamLogoUrl(team.nbaId)}
      alt=""
      width={size}
      height={size}
      unoptimized
      onError={() => setFailed(true)}
      className={`shrink-0 object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
```

`src/components/ui/ManagerAvatar.tsx`:

```tsx
import { managerInitials } from "@/lib/league/managers";
import type { Manager } from "@/lib/types";

const SEAT_BG = ["bg-seat-1", "bg-seat-2", "bg-seat-3", "bg-seat-4"];
const SIZES = { sm: "size-7 text-xs", md: "size-9 text-sm", lg: "size-12 text-lg" };

export function ManagerAvatar({
  manager,
  size = "md",
  className = "",
}: {
  manager: Manager;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold text-white ${SEAT_BG[manager.seat % SEAT_BG.length]} ${SIZES[size]} ${className}`}
    >
      {managerInitials(manager)}
    </span>
  );
}
```

`src/components/ui/PaceBar.tsx`:

```tsx
import { formatNumber } from "@/lib/format";
import type { Side } from "@/lib/types";

/** Fill = projected wins, tick = the line, both on a 0–82 scale. */
export function PaceBar({
  value,
  line,
  side,
  max = 82,
  className = "",
}: {
  value: number | null;
  line: number;
  side: Side;
  max?: number;
  className?: string;
}) {
  const percent = (n: number) => `${Math.min(100, Math.max(0, (n / max) * 100))}%`;
  const label =
    value === null
      ? `Win pace not available; line ${formatNumber(line)}`
      : `Win pace ${formatNumber(value)} against a line of ${formatNumber(line)}`;
  return (
    <div role="img" aria-label={label} className={`relative h-2 w-full min-w-16 rounded-full bg-ink-700 ${className}`}>
      {value !== null && (
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${side === "OVER" ? "bg-over" : "bg-under"}`}
          style={{ width: percent(value) }}
        />
      )}
      <div
        aria-hidden
        className="absolute -top-1 h-4 w-0.5 -translate-x-1/2 rounded bg-fog-50"
        style={{ left: percent(line) }}
      />
    </div>
  );
}
```

`src/components/ui/SignedValue.tsx`:

```tsx
import type { ReactNode } from "react";
import { formatSigned, NOT_AVAILABLE } from "@/lib/format";

export function SignedValue({
  value,
  digits = 1,
  empty = NOT_AVAILABLE,
  className = "",
}: {
  value: number | null;
  digits?: number;
  /** Shown when value is null. */
  empty?: ReactNode;
  className?: string;
}) {
  if (value === null) return <span className={`text-fog-400 ${className}`}>{empty}</span>;
  const text = formatSigned(value, digits);
  const tone = text.startsWith("+") ? "text-positive" : text.startsWith("−") ? "text-negative" : "text-fog-300";
  return <span className={`tabular-nums ${tone} ${className}`}>{text}</span>;
}
```

`src/components/ui/StatCard.tsx`:

```tsx
import type { ReactNode } from "react";

export function StatCard({ icon, label, value, sub }: { icon: ReactNode; label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-4 rounded-xl border border-ink-700 bg-ink-850/90 px-4 py-4 sm:px-5">
      <span aria-hidden className="shrink-0 text-accent">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm text-fog-300">{label}</p>
        <p className="font-display text-2xl font-bold text-fog-50 sm:text-3xl">{value}</p>
        {sub && <p className="truncate text-xs text-fog-400">{sub}</p>}
      </div>
    </div>
  );
}
```

`src/components/ui/SegmentedControl.tsx`:

```tsx
"use client";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex rounded-lg border border-ink-700 bg-ink-900 p-1">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={`rounded-md px-4 py-1.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              active ? "bg-accent text-accent-ink" : "text-fog-300 hover:text-fog-50"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
```

`src/components/ui/Select.tsx`:

```tsx
"use client";

import { ChevronDown } from "lucide-react";

export function Select<T extends string>({
  label,
  value,
  onChange,
  options,
  className = "",
}: {
  /** Accessible label (visually hidden). */
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
  className?: string;
}) {
  return (
    <label className={`relative inline-flex min-w-0 items-center ${className}`}>
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="h-10 w-full min-w-0 appearance-none rounded-lg border border-ink-600 bg-ink-900 pl-3 pr-9 text-sm text-fog-50 focus:border-accent focus:outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-3 size-4 text-fog-400" />
    </label>
  );
}
```

`src/components/ui/Alert.tsx`:

```tsx
"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";

export function Alert({ children, onDismiss }: { children: ReactNode; onDismiss?: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-3 rounded-lg border border-negative/50 bg-negative/10 px-4 py-3 text-sm text-fog-50"
    >
      <p>{children}</p>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="text-fog-300 hover:text-fog-50">
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
```

`src/components/ui/NotBuiltYet.tsx`:

```tsx
import { Construction } from "lucide-react";
import { Badge } from "@/components/ui/Badge";

export function NotBuiltYet({ title, description }: { title: string; description: string }) {
  return (
    <div className="mx-auto mt-6 max-w-xl rounded-xl border border-dashed border-ink-600 bg-ink-850/60 p-8 text-center">
      <Construction aria-hidden className="mx-auto size-10 text-fog-400" />
      <Badge tone="soon" className="mt-4">
        Not built yet
      </Badge>
      <h1 className="mt-3 font-display text-3xl font-bold">{title}</h1>
      <p className="mt-2 text-fog-300">{description}</p>
    </div>
  );
}
```

`src/components/ui/PageFallback.tsx`:

```tsx
export function PageFallback({ label }: { label: string }) {
  return (
    <p role="status" className="py-16 text-center text-fog-400">
      {label}
    </p>
  );
}
```

- [ ] **Step 3: Shell**

`src/components/shell/nav-items.ts`:

```ts
import { ClipboardList, House, Settings, UserRound, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  /** False for unfinished pages; they show "Soon". */
  ready: boolean;
  /** Match the path exactly (the overview is the league root). */
  exact: boolean;
}

export function navItems(leagueId: string): NavItem[] {
  const base = `/l/${leagueId}`;
  return [
    { href: base, label: "League overview", shortLabel: "Overview", icon: House, ready: true, exact: true },
    { href: `${base}/rosters`, label: "Rosters", shortLabel: "Rosters", icon: UserRound, ready: false, exact: false },
    { href: `${base}/settings`, label: "League settings", shortLabel: "Settings", icon: Settings, ready: false, exact: false },
    { href: `${base}/draft`, label: "Draft room", shortLabel: "Draft", icon: ClipboardList, ready: true, exact: false },
  ];
}

export function isActive(item: NavItem, pathname: string): boolean {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}
```

`src/components/shell/Logo.tsx`:

```tsx
import Link from "next/link";
import { BallIcon } from "@/components/icons/BallIcon";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2 text-accent" aria-label="Courtline home">
      <BallIcon className={compact ? "size-7" : "size-10"} />
      <span className={`font-display font-bold tracking-wide text-fog-50 ${compact ? "text-xl" : "text-3xl"}`}>
        COURTLINE
      </span>
    </Link>
  );
}
```

`src/components/shell/SidebarNav.tsx`:

```tsx
"use client";

import { Clock } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { isActive, navItems } from "./nav-items";

export function SidebarNav({ leagueId }: { leagueId: string }) {
  const pathname = usePathname();
  const items = navItems(leagueId);
  const draft = items[items.length - 1];
  const league = items.slice(0, -1);

  const link = (item: (typeof items)[number], trailing?: React.ReactNode) => {
    const active = isActive(item, pathname);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-3 rounded-lg border-l-2 px-3 py-2.5 text-base transition-colors ${
          active
            ? "border-accent bg-accent/10 font-semibold text-accent"
            : "border-transparent text-fog-300 hover:bg-ink-800 hover:text-fog-50"
        }`}
      >
        <Icon aria-hidden className="size-5 shrink-0" />
        <span className="flex-1">{item.label}</span>
        {!item.ready && <Badge tone="soon">Soon</Badge>}
        {trailing}
      </Link>
    );
  };

  return (
    <nav aria-label="League" className="flex flex-col gap-1">
      {league.map((item) => link(item))}
      <hr className="my-3 border-ink-700" />
      {link(draft, <Clock aria-hidden className="size-4 shrink-0" />)}
    </nav>
  );
}
```

`src/components/shell/BottomNav.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActive, navItems } from "./nav-items";

export function BottomNav({ leagueId }: { leagueId: string }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="League"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-700 bg-ink-900/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="grid grid-cols-4">
        {navItems(leagueId).map((item) => {
          const active = isActive(item, pathname);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-16 flex-col items-center justify-center gap-0.5 text-xs ${
                  active ? "font-semibold text-accent" : "text-fog-300"
                }`}
              >
                <Icon aria-hidden className="size-5" />
                <span>{item.shortLabel}</span>
                {!item.ready && <span className="text-[9px] uppercase tracking-wider text-fog-400">Soon</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

`src/components/shell/LeagueSwitcher.tsx`:

```tsx
"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export interface LeagueSummary {
  id: string;
  name: string;
  seasonLabel: string;
}

export function LeagueSwitcher({
  league,
  otherLeagues,
  compact = false,
}: {
  league: LeagueSummary;
  otherLeagues: LeagueSummary[];
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative min-w-0">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((value) => !value)}
        className={`flex w-full min-w-0 items-center gap-2 rounded-lg border border-ink-700 bg-ink-850 text-left ${
          compact ? "px-3 py-1.5" : "px-4 py-3"
        }`}
      >
        <span className="min-w-0 flex-1">
          <span className={`block truncate font-semibold ${compact ? "text-sm" : "text-base"}`}>{league.name}</span>
          {!compact && <span className="block text-sm text-fog-300">{league.seasonLabel}</span>}
        </span>
        <ChevronDown aria-hidden className="size-4 shrink-0 text-fog-300" />
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-64 rounded-lg border border-ink-600 bg-ink-900 p-2 shadow-xl">
          {otherLeagues.length > 0 && (
            <ul className="mb-2 border-b border-ink-700 pb-2">
              {otherLeagues.map((other) => (
                <li key={other.id}>
                  <Link
                    href={`/l/${other.id}`}
                    onClick={() => setOpen(false)}
                    className="block truncate rounded-md px-3 py-2 text-sm hover:bg-ink-800"
                  >
                    {other.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/"
            onClick={() => setOpen(false)}
            className="block rounded-md px-3 py-2 text-sm font-semibold text-link hover:bg-ink-800"
          >
            All leagues &amp; create league
          </Link>
        </div>
      )}
    </div>
  );
}
```

`src/components/shell/AppShell.tsx`:

```tsx
import type { ReactNode } from "react";
import { BottomNav } from "./BottomNav";
import { LeagueSwitcher, type LeagueSummary } from "./LeagueSwitcher";
import { Logo } from "./Logo";
import { SidebarNav } from "./SidebarNav";

export function AppShell({
  league,
  otherLeagues,
  children,
}: {
  league: LeagueSummary;
  otherLeagues: LeagueSummary[];
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-6 border-r border-ink-700 bg-ink-900 px-4 py-6 lg:flex">
        <Logo />
        <LeagueSwitcher league={league} otherLeagues={otherLeagues} />
        <SidebarNav leagueId={league.id} />
      </aside>
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-ink-700 bg-ink-900/95 px-4 py-2.5 backdrop-blur lg:hidden">
        <Logo compact />
        <div className="w-44 min-w-0 sm:w-56">
          <LeagueSwitcher league={league} otherLeagues={otherLeagues} compact />
        </div>
      </header>
      <main className="min-w-0 px-4 pb-28 pt-5 sm:px-6 lg:ml-64 lg:px-8 lg:pb-10 lg:pt-8">{children}</main>
      <BottomNav leagueId={league.id} />
    </div>
  );
}
```

`src/components/shell/PageHeader.tsx`:

```tsx
import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, tag }: { title: string; subtitle: ReactNode; tag?: string }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-display text-3xl font-bold leading-tight text-fog-50 sm:text-5xl">{title}</h1>
        <p className="mt-1 text-lg text-link sm:text-2xl">{subtitle}</p>
      </div>
      {tag && <span className="pt-2 text-xs font-semibold uppercase tracking-[0.2em] text-link">{tag}</span>}
    </header>
  );
}
```

- [ ] **Step 4: League layout and placeholder pages**

`src/app/l/[leagueId]/layout.tsx`:

```tsx
import { Suspense, type ReactNode } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { getLeagueOrNotFound, listSeatLeagues } from "@/server/league";
import { readSeats } from "@/server/viewer";

export default function LeagueLayout({ params, children }: LayoutProps<"/l/[leagueId]">) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-ink-950" aria-busy="true" />}>
      <LeagueShell params={params}>{children}</LeagueShell>
    </Suspense>
  );
}

async function LeagueShell({
  params,
  children,
}: {
  params: LayoutProps<"/l/[leagueId]">["params"];
  children: ReactNode;
}) {
  const { leagueId } = await params;
  const league = getLeagueOrNotFound(leagueId);
  const otherLeagues = listSeatLeagues(await readSeats())
    .filter((seat) => seat.league.id !== league.id)
    .map(({ league: other }) => ({ id: other.id, name: other.name, seasonLabel: other.seasonLabel }));
  return (
    <AppShell league={{ id: league.id, name: league.name, seasonLabel: league.seasonLabel }} otherLeagues={otherLeagues}>
      {children}
    </AppShell>
  );
}
```

`src/app/l/[leagueId]/rosters/page.tsx`:

```tsx
import { NotBuiltYet } from "@/components/ui/NotBuiltYet";

export default function RostersPage() {
  return (
    <NotBuiltYet
      title="Rosters"
      description="Every manager's full roster of Overs, Unders and fades will live here. This page isn't part of the prototype yet."
    />
  );
}
```

`src/app/l/[leagueId]/settings/page.tsx`:

```tsx
import { NotBuiltYet } from "@/components/ui/NotBuiltYet";

export default function SettingsPage() {
  return (
    <NotBuiltYet
      title="League settings"
      description="Scoring weights, round count and seat management will be configurable here. This page isn't part of the prototype yet."
    />
  );
}
```

`src/app/not-found.tsx`:

```tsx
import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="font-display text-4xl font-bold">League not found</h1>
      <p className="text-fog-300">
        Leagues live in server memory in this prototype, so a server restart clears them. Create a new one or open the
        demo league.
      </p>
      <Link href="/" className={buttonClasses("primary")}>
        Back to Courtline
      </Link>
    </main>
  );
}
```

- [ ] **Step 5: Landing page**

`src/components/landing/CreateLeagueForm.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";

const inputClasses =
  "h-11 w-full rounded-lg border border-ink-600 bg-ink-900 px-3 text-fog-50 placeholder:text-fog-400 focus:border-accent focus:outline-none";

export function CreateLeagueForm() {
  const router = useRouter();
  const [leagueName, setLeagueName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/leagues", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ leagueName, displayName }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(typeof data?.message === "string" ? data.message : "Couldn't create the league.");
        return;
      }
      router.push(`/l/${data.leagueId}/draft`);
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          League name <span className="font-normal text-fog-400">Optional</span>
          <input
            value={leagueName}
            onChange={(event) => setLeagueName(event.target.value)}
            maxLength={32}
            placeholder="National Balla Association"
            className={inputClasses}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Your name
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            maxLength={24}
            required
            placeholder="Manager 1"
            className={inputClasses}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending} className="self-start">
        {pending ? "Creating…" : "Create league"}
      </Button>
      <p className="text-sm text-fog-400">
        You'll be Manager 1 and the commissioner. Share the invite link from the draft room with three friends.
      </p>
    </form>
  );
}
```

`src/app/page.tsx` (replace):

```tsx
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { CreateLeagueForm } from "@/components/landing/CreateLeagueForm";
import { Logo } from "@/components/shell/Logo";
import { Panel } from "@/components/ui/Panel";
import { DEMO_LEAGUE_ID } from "@/data/demo-league";
import { findManager, managerLabel } from "@/lib/league/managers";
import { listSeatLeagues } from "@/server/league";
import { readSeats } from "@/server/viewer";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:py-16">
      <Logo />
      <section>
        <h1 className="font-display text-4xl font-bold sm:text-5xl">Draft the season.</h1>
        <p className="mt-2 max-w-xl text-fog-300">
          Four managers snake-draft Overs and Unders on every NBA win total, then score on how the season plays out.
        </p>
      </section>
      <Panel title="Create league" bodyClassName="p-4 sm:p-5">
        <CreateLeagueForm />
      </Panel>
      <Suspense fallback={null}>
        <YourLeagues />
      </Suspense>
      <Panel title="Just looking?" bodyClassName="p-4 sm:p-5">
        <Link
          href={`/l/${DEMO_LEAGUE_ID}`}
          className="inline-flex items-center gap-2 font-semibold text-link hover:text-fog-50"
        >
          Open the demo league <ArrowRight aria-hidden className="size-4" />
        </Link>
        <p className="mt-1 text-sm text-fog-400">A finished draft and a half-played season, read-only.</p>
      </Panel>
    </main>
  );
}

async function YourLeagues() {
  const leagues = listSeatLeagues(await readSeats());
  if (leagues.length === 0) return null;
  return (
    <Panel title="Your leagues">
      <ul className="divide-y divide-ink-700">
        {leagues.map(({ league, managerId }) => {
          const manager = findManager(league.managers, managerId);
          return (
            <li key={league.id}>
              <Link href={`/l/${league.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-ink-800 sm:px-5">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{league.name}</span>
                  <span className="block text-sm text-fog-400">
                    {manager ? managerLabel(manager) : "Spectator"}
                    {league.commissionerId === managerId ? " · Commissioner" : ""}
                  </span>
                </span>
                <ArrowRight aria-hidden className="size-4 shrink-0 text-fog-400" />
              </Link>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
```

- [ ] **Step 6: Join page**

`src/components/join/JoinForm.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { ManagerAvatar } from "@/components/ui/ManagerAvatar";
import { findManager, managerLabel, openSeats } from "@/lib/league/managers";
import type { League } from "@/lib/types";

export function JoinForm({ league, viewerId }: { league: League; viewerId: string | null }) {
  const router = useRouter();
  const seats = openSeats(league.managers);
  const [managerId, setManagerId] = useState(seats[0]?.id ?? "");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const viewer = findManager(league.managers, viewerId);
  if (league.isDemo) {
    return <JoinMessage league={league} text="The demo league is read-only. Create your own league to draft." />;
  }
  if (viewer) {
    return <JoinMessage league={league} text={`You're already in this league as ${managerLabel(viewer)}.`} />;
  }
  if (seats.length === 0) {
    return <JoinMessage league={league} text="This league is full." />;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/leagues/${league.id}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ managerId, displayName }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(typeof data?.message === "string" ? data.message : "Couldn't join the league.");
        return;
      }
      router.push(`/l/${league.id}/draft`);
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">Pick an open seat</legend>
        {league.managers.map((manager) => {
          const open = manager.displayName === null;
          return (
            <label
              key={manager.id}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
                managerId === manager.id ? "border-accent/60 bg-accent/10" : "border-ink-700"
              } ${open ? "cursor-pointer" : "opacity-60"}`}
            >
              <input
                type="radio"
                name="seat"
                value={manager.id}
                checked={managerId === manager.id}
                disabled={!open}
                onChange={() => setManagerId(manager.id)}
                className="accent-[var(--color-accent)]"
              />
              <ManagerAvatar manager={manager} size="sm" />
              <span className="flex-1">{open ? `Seat ${manager.seat + 1} · open` : managerLabel(manager)}</span>
            </label>
          );
        })}
      </fieldset>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Your name
        <input
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          maxLength={24}
          required
          className="h-11 rounded-lg border border-ink-600 bg-ink-900 px-3 text-fog-50 focus:border-accent focus:outline-none"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending || !managerId} className="self-start">
        {pending ? "Joining…" : "Join league"}
      </Button>
    </form>
  );
}

function JoinMessage({ league, text }: { league: League; text: string }) {
  return (
    <div className="flex flex-col items-start gap-4">
      <p className="text-fog-300">{text}</p>
      <div className="flex flex-wrap gap-2">
        <Link href={`/l/${league.id}/draft`} className={buttonClasses("secondary")}>
          Go to the draft room
        </Link>
        <Link href="/" className={buttonClasses("ghost")}>
          All leagues
        </Link>
      </div>
    </div>
  );
}
```

`src/app/l/[leagueId]/join/page.tsx`:

```tsx
import { Suspense } from "react";
import { JoinForm } from "@/components/join/JoinForm";
import { PageHeader } from "@/components/shell/PageHeader";
import { PageFallback } from "@/components/ui/PageFallback";
import { Panel } from "@/components/ui/Panel";
import { getLeagueOrNotFound } from "@/server/league";
import { getViewerId } from "@/server/viewer";

export default function JoinPage({ params }: PageProps<"/l/[leagueId]/join">) {
  return (
    <Suspense fallback={<PageFallback label="Loading league…" />}>
      <JoinContent params={params} />
    </Suspense>
  );
}

async function JoinContent({ params }: { params: PageProps<"/l/[leagueId]/join">["params"] }) {
  const { leagueId } = await params;
  const league = getLeagueOrNotFound(leagueId);
  const viewerId = await getViewerId(league);
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <PageHeader title="Join league" subtitle={`${league.name} • ${league.seasonLabel}`} />
      <Panel bodyClassName="p-4 sm:p-5">
        <JoinForm league={league} viewerId={viewerId} />
      </Panel>
    </div>
  );
}
```

- [ ] **Step 7: Verify**

Run: `npm test && npm run lint && npm run typecheck && npm run build`
Expected: all PASS; build lists `/`, `/l/[leagueId]/join`, `/l/[leagueId]/rosters`, `/l/[leagueId]/settings`.

Then start `npx next start -p 3100` in the background and check with curl:
- `curl -s localhost:3100/ | grep -c "Create league"` → ≥ 1
- `curl -s localhost:3100/l/demo/rosters | grep -c "Not built yet"` → ≥ 1
- `curl -s localhost:3100/l/demo/join | grep -c "read-only"` → ≥ 1
- `curl -s localhost:3100/l/nope/rosters | grep -c "League not found"` → ≥ 1
Stop the server afterwards (`pkill -f "next start -p 3100"`).

- [ ] **Step 8: Commit**

```bash
git add src
git commit -m "feat: add shared UI, app shell with bottom nav, landing, join and placeholder pages" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: League overview

**Files:**
- Create: `src/lib/fade-status.ts`, test `src/lib/fade-status.test.ts`
- Create: `src/components/overview/{LeagueOverview,ManagerPicker,PicksPanel,PicksList,StandingsPanel,FadesPanel,SummaryStats,ClosestCalls}.tsx`
- Create: `src/app/l/[leagueId]/page.tsx`

**Interfaces:**
- Consumes: `computeStandings`, `closestCalls`, `Standings`, `StandingRow`, `ScoredCall` (Task 4); `Basis`, `FadeEvaluation` (Task 2); `TEAMS_BY_ID` (Task 4); `SCORING`; format helpers; Task 6 UI primitives; `findManager`, `managerLabel`; `getLeagueOrNotFound`, `getViewerId`.
- Produces: `fadeStatus(evaluation) → { label, tone: "accent" | "danger" | "neutral" }`; the `/l/[leagueId]` page.

Behavior (from the spec):
- Manager picker defaults to the viewer's seat, else the first manager, and drives picks, stats and fades. Clicking a standings row also selects that manager.
- Basis toggle `Win pace` / `Final results`. `Final results` is disabled with the visible note `Available when results are final.` until `final.anyScored`. In Final mode the standings badge reads `Partial results` until `final.complete`.
- Picks: first 5 by pick order; `View all N picks` toggles the rest in place (`Show fewer` to collapse).
- Picks table at container width `@2xl+`, cards below.
- Closest calls only in Win pace mode.

- [ ] **Step 1: Write the failing test — `src/lib/fade-status.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { fadeStatus } from "@/lib/fade-status";
import type { FadeEvaluation } from "@/lib/scoring";

const scored = (basis: "projected" | "final", targetMissed: boolean, points: number): FadeEvaluation => ({
  basis,
  status: "scored",
  targetMissed,
  points,
});

describe("fadeStatus", () => {
  it("is On track when the target is projected to miss, Off track otherwise", () => {
    expect(fadeStatus(scored("projected", true, 2))).toEqual({ label: "On track", tone: "accent" });
    expect(fadeStatus(scored("projected", false, 0))).toEqual({ label: "Off track", tone: "danger" });
  });

  it("shows the earned bonus or no bonus once final", () => {
    expect(fadeStatus(scored("final", true, 2))).toEqual({ label: "+2 earned", tone: "accent" });
    expect(fadeStatus(scored("final", false, 0))).toEqual({ label: "No bonus", tone: "neutral" });
  });

  it("passes through not available and pending", () => {
    const base = { targetMissed: null, points: null };
    expect(fadeStatus({ ...base, basis: "projected", status: "not_available" })).toEqual({
      label: "Not available",
      tone: "neutral",
    });
    expect(fadeStatus({ ...base, basis: "final", status: "pending" })).toEqual({ label: "Pending", tone: "neutral" });
  });
});
```

Run: `npx vitest run src/lib/fade-status.test.ts` → FAIL.

- [ ] **Step 2: Implement `src/lib/fade-status.ts`**

```ts
import { formatSigned, NOT_AVAILABLE } from "@/lib/format";
import type { FadeEvaluation } from "@/lib/scoring";

export type StatusTone = "accent" | "danger" | "neutral";

export interface FadeStatus {
  label: string;
  tone: StatusTone;
}

export function fadeStatus(evaluation: FadeEvaluation): FadeStatus {
  if (evaluation.status === "not_available") return { label: NOT_AVAILABLE, tone: "neutral" };
  if (evaluation.status === "pending") return { label: "Pending", tone: "neutral" };
  if (evaluation.basis === "projected") {
    return evaluation.targetMissed ? { label: "On track", tone: "accent" } : { label: "Off track", tone: "danger" };
  }
  return evaluation.targetMissed
    ? { label: `${formatSigned(evaluation.points ?? 0, 0)} earned`, tone: "accent" }
    : { label: "No bonus", tone: "neutral" };
}
```

Run → PASS.

- [ ] **Step 3: `src/components/overview/ManagerPicker.tsx`**

```tsx
"use client";

import { ManagerAvatar } from "@/components/ui/ManagerAvatar";
import { Select } from "@/components/ui/Select";
import { managerLabel } from "@/lib/league/managers";
import type { Manager } from "@/lib/types";

export function ManagerPicker({
  managers,
  selected,
  viewerId,
  onSelect,
}: {
  managers: Manager[];
  selected: Manager;
  viewerId: string | null;
  onSelect: (managerId: string) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <ManagerAvatar manager={selected} />
      <Select
        label="Manager"
        value={selected.id}
        onChange={onSelect}
        className="w-52"
        options={managers.map((manager) => ({
          value: manager.id,
          label: manager.id === viewerId ? `${managerLabel(manager)} (you)` : managerLabel(manager),
        }))}
      />
    </div>
  );
}
```

- [ ] **Step 4: `src/components/overview/PicksList.tsx`** — table (container `@2xl+`) and cards (below)

```tsx
import { Badge } from "@/components/ui/Badge";
import { PaceBar } from "@/components/ui/PaceBar";
import { SidePill } from "@/components/ui/SidePill";
import { SignedValue } from "@/components/ui/SignedValue";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { formatNumber, formatRecord, NOT_AVAILABLE } from "@/lib/format";
import type { Basis, CallEvaluation } from "@/lib/scoring";
import type { ScoredCall } from "@/lib/standings";

function WinPace({ call }: { call: ScoredCall }) {
  const { evaluation, team, pick } = call;
  if (evaluation.wins === null) return <span className="text-fog-400">{NOT_AVAILABLE}</span>;
  return (
    <div className="flex items-center gap-3">
      <span className="w-10 font-semibold tabular-nums">{formatNumber(evaluation.wins)}</span>
      <PaceBar value={evaluation.wins} line={team.line} side={pick.side} className="max-w-32" />
    </div>
  );
}

function FinalWins({ evaluation }: { evaluation: CallEvaluation }) {
  return evaluation.wins === null ? (
    <span className="text-fog-400">Pending</span>
  ) : (
    <span className="font-semibold tabular-nums">{formatNumber(evaluation.wins, 0)}</span>
  );
}

function Result({ evaluation }: { evaluation: CallEvaluation }) {
  if (evaluation.status !== "scored") return <Badge>Pending</Badge>;
  return evaluation.correct ? <Badge tone="accent">Correct</Badge> : <Badge tone="danger">Missed</Badge>;
}

export function PicksTable({ calls, basis }: { calls: ScoredCall[]; basis: Basis }) {
  const projected = basis === "projected";
  return (
    <table className="hidden w-full text-sm @2xl:table">
      <thead className="text-left text-xs uppercase tracking-wider text-fog-400">
        <tr className="border-b border-ink-700">
          <th scope="col" className="px-5 py-3 font-semibold">Team</th>
          <th scope="col" className="px-3 py-3 text-center font-semibold">Pick</th>
          <th scope="col" className="px-3 py-3 text-right font-semibold">Line</th>
          <th scope="col" className="px-3 py-3 text-center font-semibold">Record</th>
          {projected ? (
            <>
              <th scope="col" className="px-3 py-3 font-semibold">Win pace</th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">Proj. margin</th>
              <th scope="col" className="px-5 py-3 text-right font-semibold">Proj. pts</th>
            </>
          ) : (
            <>
              <th scope="col" className="px-3 py-3 text-right font-semibold">Final wins</th>
              <th scope="col" className="px-3 py-3 text-center font-semibold">Result</th>
              <th scope="col" className="px-5 py-3 text-right font-semibold">Points</th>
            </>
          )}
        </tr>
      </thead>
      <tbody>
        {calls.map((call) => {
          const { pick, team, evaluation } = call;
          return (
            <tr key={pick.pickNumber} className="border-b border-ink-700/70 last:border-0">
              <td className="px-5 py-3">
                <div className="flex items-center gap-3">
                  <TeamLogo team={team} size={32} />
                  <span className="font-medium">
                    {team.city} {team.name}
                  </span>
                </div>
              </td>
              <td className="px-3 py-3 text-center">
                <SidePill side={pick.side} />
              </td>
              <td className="px-3 py-3 text-right font-semibold tabular-nums">{formatNumber(team.line)}</td>
              <td className="px-3 py-3 text-center tabular-nums text-fog-300">{formatRecord(team.wins, team.losses)}</td>
              {projected ? (
                <>
                  <td className="px-3 py-3">
                    <WinPace call={call} />
                  </td>
                  <td className="px-3 py-3 text-right text-base font-semibold">
                    <SignedValue value={evaluation.margin} empty="—" />
                  </td>
                  <td className="px-5 py-3 text-right text-base font-semibold">
                    <SignedValue value={evaluation.points} empty="—" />
                  </td>
                </>
              ) : (
                <>
                  <td className="px-3 py-3 text-right">
                    <FinalWins evaluation={evaluation} />
                  </td>
                  <td className="px-3 py-3 text-center">
                    <Result evaluation={evaluation} />
                  </td>
                  <td className="px-5 py-3 text-right text-base font-semibold">
                    <SignedValue value={evaluation.points} empty="—" />
                  </td>
                </>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function PickCards({ calls, basis }: { calls: ScoredCall[]; basis: Basis }) {
  const projected = basis === "projected";
  return (
    <ul className="divide-y divide-ink-700 @2xl:hidden">
      {calls.map((call) => {
        const { pick, team, evaluation } = call;
        return (
          <li key={pick.pickNumber} className="px-4 py-4">
            <div className="flex items-center gap-3">
              <TeamLogo team={team} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {team.city} {team.name}
                </p>
                <p className="text-xs text-fog-400">
                  Pick {pick.pickNumber} · {formatRecord(team.wins, team.losses)}
                </p>
              </div>
              <SidePill side={pick.side} size="sm" />
              <span className="font-semibold tabular-nums">{formatNumber(team.line)}</span>
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
              {projected ? (
                <>
                  <div className="min-w-0">
                    <dt className="text-xs text-fog-400">Win pace</dt>
                    <dd className="mt-1">
                      {evaluation.wins === null ? (
                        <span className="text-fog-400">{NOT_AVAILABLE}</span>
                      ) : (
                        <>
                          <span className="font-semibold tabular-nums">{formatNumber(evaluation.wins)}</span>
                          <PaceBar value={evaluation.wins} line={team.line} side={pick.side} className="mt-1.5" />
                        </>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-fog-400">Proj. margin</dt>
                    <dd className="mt-1 font-semibold">
                      <SignedValue value={evaluation.margin} empty="—" />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-fog-400">Proj. pts</dt>
                    <dd className="mt-1 font-semibold">
                      <SignedValue value={evaluation.points} empty="—" />
                    </dd>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <dt className="text-xs text-fog-400">Final wins</dt>
                    <dd className="mt-1">
                      <FinalWins evaluation={evaluation} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-fog-400">Result</dt>
                    <dd className="mt-1">
                      <Result evaluation={evaluation} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-fog-400">Points</dt>
                    <dd className="mt-1 font-semibold">
                      <SignedValue value={evaluation.points} empty="—" />
                    </dd>
                  </div>
                </>
              )}
            </dl>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 5: `src/components/overview/PicksPanel.tsx`**

```tsx
"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SCORING } from "@/config/scoring";
import { managerLabel } from "@/lib/league/managers";
import type { Basis } from "@/lib/scoring";
import type { StandingRow } from "@/lib/standings";
import type { Manager } from "@/lib/types";
import { ManagerPicker } from "./ManagerPicker";
import { PickCards, PicksTable } from "./PicksList";

const COLLAPSED_COUNT = 5;

export function PicksPanel({
  leagueId,
  managers,
  manager,
  viewerId,
  row,
  onSelectManager,
  basis,
  onBasisChange,
  finalAvailable,
  draftComplete,
}: {
  leagueId: string;
  managers: Manager[];
  manager: Manager;
  viewerId: string | null;
  row: StandingRow;
  onSelectManager: (managerId: string) => void;
  basis: Basis;
  onBasisChange: (basis: Basis) => void;
  finalAvailable: boolean;
  draftComplete: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const calls = expanded ? row.calls : row.calls.slice(0, COLLAPSED_COUNT);
  const title = manager.id === viewerId ? "My picks" : `${managerLabel(manager)}'s picks`;

  return (
    <Panel bodyClassName="flex flex-col @container">
      <div className="flex flex-col gap-4 border-b border-ink-700 p-4 sm:p-5">
        <ManagerPicker managers={managers} selected={manager} viewerId={viewerId} onSelect={onSelectManager} />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="font-display text-2xl font-semibold">{title}</h2>
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <SegmentedControl
              ariaLabel="Scoring basis"
              value={basis}
              onChange={onBasisChange}
              options={[
                { value: "projected", label: "Win pace" },
                { value: "final", label: "Final results", disabled: !finalAvailable },
              ]}
            />
            {!finalAvailable && <p className="text-xs text-fog-400">Available when results are final.</p>}
          </div>
        </div>
      </div>

      {row.calls.length === 0 ? (
        <div className="flex flex-col items-start gap-3 px-4 py-8 sm:px-5">
          <p className="text-fog-300">No picks yet.</p>
          {!draftComplete && (
            <Link href={`/l/${leagueId}/draft`} className={buttonClasses("secondary", "sm")}>
              Go to the draft room
            </Link>
          )}
        </div>
      ) : (
        <>
          <PicksTable calls={calls} basis={basis} />
          <PickCards calls={calls} basis={basis} />
        </>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-700 px-4 py-3 text-sm text-fog-300 sm:px-5">
        <p>
          {basis === "projected"
            ? `Win pace = wins ÷ games played × ${SCORING.seasonGames}. Margin is relative to the pick.`
            : `Picks settle when the team finishes its ${SCORING.seasonGames}-game regular season.`}
        </p>
        {row.calls.length > COLLAPSED_COUNT && (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
            className="inline-flex items-center gap-1 font-semibold text-link hover:text-fog-50"
          >
            {expanded ? "Show fewer" : `View all ${row.calls.length} picks`}
            <ArrowRight aria-hidden className="size-4" />
          </button>
        )}
      </footer>
    </Panel>
  );
}
```

- [ ] **Step 6: `src/components/overview/StandingsPanel.tsx`**

```tsx
"use client";

import { ChartColumn } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { ManagerAvatar } from "@/components/ui/ManagerAvatar";
import { Panel } from "@/components/ui/Panel";
import { SignedValue } from "@/components/ui/SignedValue";
import { formatSigned } from "@/lib/format";
import { findManager, managerLabel } from "@/lib/league/managers";
import type { Standings } from "@/lib/standings";
import type { Manager } from "@/lib/types";

export function StandingsPanel({
  standings,
  managers,
  selectedId,
  viewerId,
  onSelect,
}: {
  standings: Standings;
  managers: Manager[];
  selectedId: string;
  viewerId: string | null;
  onSelect: (managerId: string) => void;
}) {
  const projected = standings.basis === "projected";
  const badge = projected ? "Projected" : standings.complete ? "Final" : "Partial results";
  return (
    <Panel
      title="League standings"
      icon={<ChartColumn aria-hidden className="size-5 text-fog-300" />}
      actions={<Badge tone={!projected && standings.complete ? "accent" : "neutral"}>{badge}</Badge>}
    >
      <div className="grid grid-cols-[2rem_minmax(0,1fr)_auto] gap-x-3 px-4 pt-3 text-xs uppercase tracking-wider text-fog-400 sm:px-5">
        <span>#</span>
        <span>Manager</span>
        <span className="text-right">{projected ? "Projected points" : "Final points"}</span>
      </div>
      <ol className="flex flex-col gap-1 p-2 sm:p-3">
        {standings.rows.map((row) => {
          const manager = findManager(managers, row.managerId)!;
          const selected = row.managerId === selectedId;
          return (
            <li key={row.managerId}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => onSelect(row.managerId)}
                className={`grid w-full grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-3 rounded-lg border px-2 py-2 text-left transition-colors sm:px-3 ${
                  selected ? "border-accent/60 bg-accent/10" : "border-transparent hover:bg-ink-800"
                }`}
              >
                <span className="font-display text-lg font-bold text-fog-300">{row.rank}</span>
                <span className="flex min-w-0 items-center gap-3">
                  <ManagerAvatar manager={manager} size="sm" />
                  <span className="truncate font-medium">{managerLabel(manager)}</span>
                  {row.managerId === viewerId && <Badge tone="accent">You</Badge>}
                </span>
                <span className="text-right">
                  <SignedValue value={row.totalPoints} className="block font-display text-xl font-bold" />
                  <span className="block text-xs text-fog-400">Margin {formatSigned(row.totalMargin)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
```

- [ ] **Step 7: `src/components/overview/FadesPanel.tsx`**

```tsx
import { ArrowRight, Crosshair } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Panel";
import { SidePill } from "@/components/ui/SidePill";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { fadeStatus } from "@/lib/fade-status";
import { formatNumber } from "@/lib/format";
import { findManager, managerLabel } from "@/lib/league/managers";
import type { StandingRow } from "@/lib/standings";
import type { Manager } from "@/lib/types";

export function FadesPanel({ row, managers }: { row: StandingRow; managers: Manager[] }) {
  return (
    <Panel title="Fade picks" icon={<Crosshair aria-hidden className="size-5 text-fog-300" />}>
      {row.fades.length === 0 ? (
        <p className="px-4 py-5 text-sm text-fog-400 sm:px-5">No fades for this manager.</p>
      ) : (
        <ul className="divide-y divide-ink-700">
          {row.fades.map(({ fade, target, evaluation }) => {
            const from = findManager(managers, fade.managerId)!;
            const to = findManager(managers, target.pick.managerId)!;
            const status = fadeStatus(evaluation);
            return (
              <li key={fade.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
                <div className="text-xs text-fog-300">
                  <p className="font-semibold text-fog-50">{managerLabel(from)}</p>
                  <p className="flex items-center gap-1">
                    <ArrowRight aria-label="fading" className="size-3" />
                    {managerLabel(to)}
                  </p>
                </div>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <TeamLogo team={target.team} size={32} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{target.team.name}</p>
                    <p className="flex items-center gap-1.5 text-xs">
                      <SidePill side={target.pick.side} size="sm" />
                      <span className="tabular-nums">{formatNumber(target.team.line)}</span>
                    </p>
                  </div>
                </div>
                <Badge tone={status.tone}>{status.label}</Badge>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
```

- [ ] **Step 8: `src/components/overview/SummaryStats.tsx`**

```tsx
import { ChartColumn, ChartLine, Trophy } from "lucide-react";
import { BallIcon } from "@/components/icons/BallIcon";
import { SignedValue } from "@/components/ui/SignedValue";
import { StatCard } from "@/components/ui/StatCard";
import { formatNumber, formatOrdinal, formatSigned } from "@/lib/format";
import type { StandingRow, Standings } from "@/lib/standings";

export function SummaryStats({ row, standings, isViewer }: { row: StandingRow; standings: Standings; isViewer: boolean }) {
  const projected = standings.basis === "projected";
  const leading = row.rank === 1;
  return (
    <section aria-label="Summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        icon={<Trophy className="size-8" />}
        label={isViewer ? "Your rank" : "Rank"}
        value={`${formatOrdinal(row.rank)} / ${standings.rows.length}`}
        sub={!projected && !standings.complete ? "Partial results" : undefined}
      />
      <StatCard
        icon={<ChartLine className="size-8" />}
        label={projected ? "Projected points" : "Final points"}
        value={<SignedValue value={row.totalPoints} />}
        sub={`Margin ${formatSigned(row.totalMargin)} · Fades ${formatSigned(row.fadePoints)}`}
      />
      <StatCard
        icon={<ChartColumn className="size-8" />}
        label={projected ? "Picks on pace" : "Correct calls"}
        value={`${row.correctCalls} / ${projected ? row.calls.length : row.scoredCalls}`}
        sub={projected ? undefined : `${row.scoredCalls} of ${row.calls.length} settled`}
      />
      <StatCard
        icon={<BallIcon className="size-8" />}
        label="Gap to first"
        value={leading ? "—" : formatNumber(row.gapToFirst)}
        sub={leading ? "In first place" : "points behind the leader"}
      />
    </section>
  );
}
```

- [ ] **Step 9: `src/components/overview/ClosestCalls.tsx`**

```tsx
import { Crosshair } from "lucide-react";
import { PaceBar } from "@/components/ui/PaceBar";
import { Panel } from "@/components/ui/Panel";
import { SidePill } from "@/components/ui/SidePill";
import { SignedValue } from "@/components/ui/SignedValue";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { formatNumber } from "@/lib/format";
import type { ScoredCall } from "@/lib/standings";

export function ClosestCalls({ calls }: { calls: ScoredCall[] }) {
  if (calls.length === 0) return null;
  return (
    <Panel
      title={
        <>
          Closest calls
          <span className="ml-2 font-sans text-sm font-normal text-fog-400">Picks that could swing the competition</span>
        </>
      }
      icon={<Crosshair aria-hidden className="size-5 text-fog-300" />}
      bodyClassName="@container"
    >
      <div className="grid gap-4 p-4 sm:p-5 @3xl:grid-cols-3">
        {calls.map(({ pick, team, evaluation }) => (
          <article
            key={pick.pickNumber}
            className="flex min-w-0 flex-col gap-4 rounded-lg border border-ink-700 bg-ink-900/70 p-4"
          >
            <div className="flex items-center gap-3">
              <TeamLogo team={team} size={44} />
              <div className="min-w-0">
                <h3 className="truncate font-semibold">
                  {team.city} {team.name}
                </h3>
                <p className="mt-1 flex items-center gap-2">
                  <SidePill side={pick.side} size="sm" />
                  <span className="font-semibold tabular-nums">{formatNumber(team.line)}</span>
                </p>
              </div>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 border-t border-ink-700 pt-3">
              <div className="min-w-0">
                <p className="text-xs text-fog-400">Pace</p>
                <div className="flex items-center gap-3">
                  <span className="font-display text-xl font-bold tabular-nums">{formatNumber(evaluation.wins ?? 0)}</span>
                  <PaceBar value={evaluation.wins} line={team.line} side={pick.side} />
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-fog-400">Proj. margin</p>
                <SignedValue value={evaluation.margin} className="font-display text-xl font-bold" />
              </div>
            </div>
          </article>
        ))}
      </div>
    </Panel>
  );
}
```

- [ ] **Step 10: `src/components/overview/LeagueOverview.tsx`**

```tsx
"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { TEAMS_BY_ID } from "@/data/teams";
import { findManager } from "@/lib/league/managers";
import type { Basis } from "@/lib/scoring";
import { closestCalls, computeStandings } from "@/lib/standings";
import type { League } from "@/lib/types";
import { ClosestCalls } from "./ClosestCalls";
import { FadesPanel } from "./FadesPanel";
import { PicksPanel } from "./PicksPanel";
import { StandingsPanel } from "./StandingsPanel";
import { SummaryStats } from "./SummaryStats";

export function LeagueOverview({ league, viewerId }: { league: League; viewerId: string | null }) {
  const [selectedId, setSelectedId] = useState(viewerId ?? league.managers[0].id);
  const [basis, setBasis] = useState<Basis>("projected");

  const projected = useMemo(() => computeStandings(league, TEAMS_BY_ID, "projected"), [league]);
  const final = useMemo(() => computeStandings(league, TEAMS_BY_ID, "final"), [league]);
  const standings = basis === "final" && final.anyScored ? final : projected;
  const row = standings.rows.find((candidate) => candidate.managerId === selectedId) ?? standings.rows[0];
  const manager = findManager(league.managers, row.managerId)!;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={league.name}
        subtitle={`${league.seasonLabel} • League overview`}
        tag={league.isDemo ? "Demo data" : undefined}
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]">
        <PicksPanel
          leagueId={league.id}
          managers={league.managers}
          manager={manager}
          viewerId={viewerId}
          row={row}
          onSelectManager={setSelectedId}
          basis={standings.basis}
          onBasisChange={setBasis}
          finalAvailable={final.anyScored}
          draftComplete={league.draft.status === "complete"}
        />
        <div className="flex min-w-0 flex-col gap-6">
          <StandingsPanel
            standings={standings}
            managers={league.managers}
            selectedId={row.managerId}
            viewerId={viewerId}
            onSelect={setSelectedId}
          />
          <FadesPanel row={row} managers={league.managers} />
        </div>
      </div>
      <SummaryStats row={row} standings={standings} isViewer={row.managerId === viewerId} />
      {standings.basis === "projected" && <ClosestCalls calls={closestCalls(row)} />}
    </div>
  );
}
```

- [ ] **Step 11: `src/app/l/[leagueId]/page.tsx`**

```tsx
import { Suspense } from "react";
import { LeagueOverview } from "@/components/overview/LeagueOverview";
import { PageFallback } from "@/components/ui/PageFallback";
import { getLeagueOrNotFound } from "@/server/league";
import { getViewerId } from "@/server/viewer";

export default function OverviewPage({ params }: PageProps<"/l/[leagueId]">) {
  return (
    <Suspense fallback={<PageFallback label="Loading league…" />}>
      <Overview params={params} />
    </Suspense>
  );
}

async function Overview({ params }: { params: PageProps<"/l/[leagueId]">["params"] }) {
  const { leagueId } = await params;
  const league = getLeagueOrNotFound(leagueId);
  const viewerId = await getViewerId(league);
  return <LeagueOverview league={league} viewerId={viewerId} />;
}
```

- [ ] **Step 12: Verify**

Run: `npm test && npm run lint && npm run typecheck && npm run build`
Expected: all PASS; build lists `/l/[leagueId]`.

Smoke: start `npx next start -p 3100` in the background, then
`curl -s localhost:3100/l/demo | grep -o "National Balla Association\|Available when results are final.\|Closest calls\|On track" | sort -u`
Expected: all four strings. Stop the server.

- [ ] **Step 13: Commit**

```bash
git add src
git commit -m "feat: build league overview with derived standings, fades and closest calls" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Draft room

**Files:**
- Create: `src/lib/draft-filters.ts` + test `src/lib/draft-filters.test.ts`
- Create: `src/lib/league/turn.ts` + test `src/lib/league/turn.test.ts`
- Create: `src/components/draft/{use-league-draft.ts,DraftRoom.tsx,DraftStatusBar.tsx,DraftLobby.tsx,InviteLink.tsx,DraftBoard.tsx,AvailablePicks.tsx,SideButton.tsx,SelectionPreview.tsx,ManagerPicks.tsx,SelectionBar.tsx}`
- Create: `src/app/l/[leagueId]/draft/page.tsx`

**Interfaces:**
- Consumes: draft helpers (Task 3), `TEAMS`, `TEAMS_BY_ID`, `TOTAL_SIDES` (Task 4), permissions/managers (Task 5), `DRAFT_POLL_INTERVAL_MS`, `SEASON`, Task 6 UI, `GET/POST /api/leagues/{id}/draft`.
- Produces: `SIDES`, `SideRef`, `TeamFilters`, `DEFAULT_FILTERS`, `filterTeams`, `availableSideCount`; `TurnKind`, `TurnSummary`, `describeTurn(league, viewerId)`; the `/l/[leagueId]/draft` page.

Behavior (from the spec):
- Selecting a side previews it; `Confirm pick` records it and advances; a drafted side shows its manager and is disabled.
- Search (city, name, abbreviation), conference filter, availability filter (`Available` = at least one side open / `All teams`), `Clear selection`, Pause/Resume (commissioner only).
- Selecting is allowed whenever the draft is live; `Confirm pick` is enabled only when `canPickNow`. Paused or not-started drafts block both.
- Selection panel shows the team's previous-season wins (`2024–25 wins`).
- Board: managers as columns in seat order, rounds as rows; scrolls inside its own container on both axes; keeps the current pick in view; the page never scrolls horizontally.
- Polls every `DRAFT_POLL_INTERVAL_MS`; ignores responses with an older `version`.

- [ ] **Step 1: Write the failing filter tests — `src/lib/draft-filters.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { TEAMS } from "@/data/teams";
import { createDraftState } from "@/lib/draft";
import { availableSideCount, DEFAULT_FILTERS, filterTeams } from "@/lib/draft-filters";
import type { DraftState, Side } from "@/lib/types";

const EMPTY = createDraftState(["m1", "m2", "m3", "m4"], 11);

function withPicks(picks: Array<[string, Side]>): DraftState {
  return {
    ...EMPTY,
    status: "live",
    picks: picks.map(([teamId, side], index) => ({
      pickNumber: index + 1,
      managerId: EMPTY.seatOrder[index % 4],
      teamId,
      side,
    })),
  };
}

describe("filterTeams", () => {
  it("returns every team alphabetically by default", () => {
    const teams = filterTeams(TEAMS, EMPTY, DEFAULT_FILTERS);
    expect(teams).toHaveLength(30);
    expect(teams[0].id).toBe("ATL");
    expect(teams[teams.length - 1].id).toBe("WAS");
  });

  it("searches city, name and abbreviation, ignoring case", () => {
    const ids = (query: string) => filterTeams(TEAMS, EMPTY, { ...DEFAULT_FILTERS, query }).map((team) => team.id);
    expect(ids("magic")).toEqual(["ORL"]);
    expect(ids("Los Angeles")).toEqual(["LAL"]);
    expect(ids("okc")).toEqual(["OKC"]);
    expect(ids("  ")).toHaveLength(30);
  });

  it("filters by conference", () => {
    const east = filterTeams(TEAMS, EMPTY, { ...DEFAULT_FILTERS, conference: "East" });
    expect(east).toHaveLength(15);
    expect(east.every((team) => team.conference === "East")).toBe(true);
  });

  it("hides fully drafted teams only when showing available teams", () => {
    const draft = withPicks([
      ["MIN", "OVER"],
      ["MIN", "UNDER"],
      ["OKC", "OVER"],
    ]);
    const available = filterTeams(TEAMS, draft, DEFAULT_FILTERS).map((team) => team.id);
    expect(available).not.toContain("MIN");
    expect(available).toContain("OKC");
    expect(available).toHaveLength(29);
    expect(filterTeams(TEAMS, draft, { ...DEFAULT_FILTERS, availability: "all" })).toHaveLength(30);
  });
});

describe("availableSideCount", () => {
  it("counts undrafted sides out of 60", () => {
    expect(availableSideCount(EMPTY, 30)).toBe(60);
    expect(availableSideCount(withPicks([["MIN", "OVER"], ["MIN", "UNDER"], ["OKC", "OVER"]]), 30)).toBe(57);
  });
});
```

Run: `npx vitest run src/lib/draft-filters.test.ts` → FAIL.

- [ ] **Step 2: Implement `src/lib/draft-filters.ts`**

```ts
import { findPickForSide } from "@/lib/draft";
import type { Conference, DraftState, Side, Team, TeamId } from "@/lib/types";

/** Display order in the draft room: Under, then Over. */
export const SIDES: readonly Side[] = ["UNDER", "OVER"];

export interface SideRef {
  teamId: TeamId;
  side: Side;
}

export interface TeamFilters {
  query: string;
  conference: "all" | Conference;
  availability: "available" | "all";
}

export const DEFAULT_FILTERS: TeamFilters = { query: "", conference: "all", availability: "available" };

export function filterTeams(teams: readonly Team[], draft: DraftState, filters: TeamFilters): Team[] {
  const query = filters.query.trim().toLowerCase();
  return teams
    .filter((team) => {
      if (filters.conference !== "all" && team.conference !== filters.conference) return false;
      if (query && ![team.city, team.name, `${team.city} ${team.name}`, team.id].some((text) => text.toLowerCase().includes(query))) {
        return false;
      }
      if (filters.availability === "available" && SIDES.every((side) => findPickForSide(draft, team.id, side))) {
        return false;
      }
      return true;
    })
    .sort((a, b) => `${a.city} ${a.name}`.localeCompare(`${b.city} ${b.name}`));
}

export function availableSideCount(draft: DraftState, teamCount: number): number {
  return teamCount * SIDES.length - draft.picks.length;
}
```

Run → PASS.

- [ ] **Step 3: Write the failing turn tests — `src/lib/league/turn.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { seatForPick } from "@/lib/draft";
import type { DraftAccess } from "@/lib/league/permissions";
import { describeTurn } from "@/lib/league/turn";
import type { DraftStatus, Manager } from "@/lib/types";

const MANAGERS: Manager[] = [
  { id: "m1", seat: 0, displayName: "Ana" },
  { id: "m2", seat: 1, displayName: "Ben" },
  { id: "m3", seat: 2, displayName: null },
  { id: "m4", seat: 3, displayName: null },
];
const SEATS = ["m1", "m2", "m3", "m4"];
const TEAMS = ["MIN", "OKC", "BOS", "CLE", "DEN", "LAL", "CHI", "ORL"];

function league(status: DraftStatus, pickCount = 0): DraftAccess {
  return {
    isDemo: false,
    commissionerId: "m1",
    managers: MANAGERS,
    draft: {
      status,
      rounds: 2,
      seatOrder: SEATS,
      picks: Array.from({ length: pickCount }, (_, i) => ({
        pickNumber: i + 1,
        managerId: SEATS[seatForPick(i + 1, 4)],
        teamId: TEAMS[i],
        side: "OVER" as const,
      })),
    },
  };
}

describe("describeTurn", () => {
  it("reports who picks first before the draft starts", () => {
    expect(describeTurn(league("not_started"), "m2")).toEqual({ kind: "not_started", managerId: "m1" });
  });

  it("tells the manager on the clock it's their turn", () => {
    expect(describeTurn(league("live"), "m1")).toEqual({ kind: "your_turn", managerId: "m1" });
  });

  it("shows everyone else who is on the clock", () => {
    expect(describeTurn(league("live"), "m2")).toEqual({ kind: "on_the_clock", managerId: "m1" });
    expect(describeTurn(league("live"), null)).toEqual({ kind: "on_the_clock", managerId: "m1" });
  });

  it("tells the commissioner when they're picking for an open seat", () => {
    expect(describeTurn(league("live", 2), "m1")).toEqual({ kind: "picking_for_open_seat", managerId: "m3" });
    expect(describeTurn(league("live", 2), "m2")).toEqual({ kind: "on_the_clock", managerId: "m3" });
  });

  it("reports paused and complete drafts", () => {
    expect(describeTurn(league("paused", 1), "m2")).toEqual({ kind: "paused", managerId: "m2" });
    expect(describeTurn(league("complete", 8), "m1")).toEqual({ kind: "complete", managerId: null });
  });
});
```

Run → FAIL. Implement `src/lib/league/turn.ts`:

```ts
import { managerOnTheClock } from "@/lib/draft";
import { canPickNow, type DraftAccess } from "@/lib/league/permissions";

export type TurnKind = "not_started" | "your_turn" | "picking_for_open_seat" | "on_the_clock" | "paused" | "complete";

export interface TurnSummary {
  kind: TurnKind;
  /** The manager whose pick it is (or will be first). Null once the draft is complete. */
  managerId: string | null;
}

export function describeTurn(league: DraftAccess, viewerId: string | null): TurnSummary {
  const { draft } = league;
  const managerId = managerOnTheClock(draft);
  if (draft.status === "complete") return { kind: "complete", managerId: null };
  if (draft.status === "not_started") return { kind: "not_started", managerId };
  if (draft.status === "paused") return { kind: "paused", managerId };
  if (managerId === viewerId) return { kind: "your_turn", managerId };
  if (canPickNow(league, viewerId)) return { kind: "picking_for_open_seat", managerId };
  return { kind: "on_the_clock", managerId };
}
```

Run: `npm test` → all PASS.

- [ ] **Step 4: `src/components/draft/use-league-draft.ts`**

```ts
"use client";

import { useCallback, useEffect, useState } from "react";
import { DRAFT_POLL_INTERVAL_MS } from "@/config/league";
import type { DraftAction } from "@/lib/draft";
import type { LeagueView } from "@/lib/types";

/** Holds the live league view: polls for other managers' picks and sends this viewer's actions. */
export function useLeagueDraft(initial: LeagueView) {
  const [view, setView] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const endpoint = `/api/leagues/${initial.league.id}/draft`;

  // Responses can arrive out of order (a poll racing an action); keep the newest version.
  const accept = useCallback((next: LeagueView) => {
    setView((current) => (next.league.version >= current.league.version ? next : current));
  }, []);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      if (response.ok) accept((await response.json()) as LeagueView);
    } catch {
      // Keep the last known state; the next poll retries.
    }
  }, [endpoint, accept]);

  const shouldPoll = !view.league.isDemo && view.league.draft.status !== "complete";
  useEffect(() => {
    if (!shouldPoll) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, DRAFT_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [shouldPoll, refresh]);

  const dispatch = useCallback(
    async (action: DraftAction): Promise<boolean> => {
      setPending(true);
      setError(null);
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(action),
        });
        const data = await response.json();
        if (!response.ok) {
          setError(typeof data?.message === "string" ? data.message : "Something went wrong.");
          void refresh();
          return false;
        }
        accept(data as LeagueView);
        return true;
      } catch {
        setError("Couldn't reach the server. Try again.");
        return false;
      } finally {
        setPending(false);
      }
    },
    [endpoint, accept, refresh],
  );

  const dismissError = useCallback(() => setError(null), []);

  return { view, error, pending, dispatch, dismissError };
}
```

- [ ] **Step 5: `src/components/draft/InviteLink.tsx`**

```tsx
"use client";

import { Check, Copy } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";

const noopSubscribe = () => () => {};

export function InviteLink({ leagueId, compact = false }: { leagueId: string; compact?: boolean }) {
  // window.location is client-only; the server render uses a relative link.
  const origin = useSyncExternalStore(noopSubscribe, () => window.location.origin, () => "");
  const [copied, setCopied] = useState(false);
  const url = `${origin}/l/${leagueId}/join`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const icon = copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />;

  if (compact) {
    return (
      <Button variant="secondary" size="sm" onClick={copy}>
        {icon}
        {copied ? "Link copied" : "Copy invite link"}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={`invite-${leagueId}`} className="text-sm font-semibold">
        Invite link
      </label>
      <div className="flex min-w-0 gap-2">
        <input
          id={`invite-${leagueId}`}
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
          className="h-10 min-w-0 flex-1 rounded-lg border border-ink-600 bg-ink-900 px-3 text-sm text-fog-300"
        />
        <Button variant="secondary" onClick={copy}>
          {icon}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: `src/components/draft/DraftLobby.tsx`** (shown while `status === "not_started"`)

```tsx
import { Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ManagerAvatar } from "@/components/ui/ManagerAvatar";
import { Panel } from "@/components/ui/Panel";
import { draftTotalPicks } from "@/lib/draft";
import { managerLabel, openSeats } from "@/lib/league/managers";
import type { League } from "@/lib/types";
import { InviteLink } from "./InviteLink";

export function DraftLobby({
  league,
  viewerId,
  canControl,
  pending,
  onStart,
}: {
  league: League;
  viewerId: string | null;
  canControl: boolean;
  pending: boolean;
  onStart: () => void;
}) {
  return (
    <Panel
      title="Draft lobby"
      icon={<Users aria-hidden className="size-5 text-fog-300" />}
      bodyClassName="flex flex-col gap-5 p-4 sm:p-5"
    >
      <p className="text-sm text-fog-300">
        {league.managers.length} managers · {league.draft.rounds} rounds · snake order · {draftTotalPicks(league.draft)}{" "}
        picks
      </p>
      <ul className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        {league.managers.map((manager) => (
          <li key={manager.id} className="flex items-center gap-3 rounded-lg border border-ink-700 bg-ink-900 px-3 py-3">
            <ManagerAvatar manager={manager} />
            <div className="min-w-0">
              <p className="truncate font-semibold">
                {managerLabel(manager)}
                {manager.id === viewerId && <span className="ml-2 text-xs text-accent">You</span>}
              </p>
              <p className="text-xs text-fog-400">
                {manager.id === league.commissionerId
                  ? "Commissioner"
                  : manager.displayName === null
                    ? "Open seat"
                    : "Joined"}
              </p>
            </div>
          </li>
        ))}
      </ul>
      {openSeats(league.managers).length > 0 && <InviteLink leagueId={league.id} />}
      <p className="text-sm text-fog-400">Open seats are drafted by the commissioner until someone claims them.</p>
      {canControl ? (
        <Button size="lg" onClick={onStart} disabled={pending} className="self-start">
          Start draft
        </Button>
      ) : (
        <p className="text-sm font-semibold text-fog-300">Waiting for the commissioner to start the draft.</p>
      )}
    </Panel>
  );
}
```

- [ ] **Step 7: `src/components/draft/DraftStatusBar.tsx`**

```tsx
import { Check, Pause, Play } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonClasses } from "@/components/ui/Button";
import { ManagerAvatar } from "@/components/ui/ManagerAvatar";
import { currentPickNumber, draftTotalPicks, managerUpNext, roundOf } from "@/lib/draft";
import { findManager, managerLabel, openSeats } from "@/lib/league/managers";
import type { TurnSummary } from "@/lib/league/turn";
import type { League, Manager } from "@/lib/types";
import { InviteLink } from "./InviteLink";

export function DraftStatusBar({
  league,
  turn,
  canControl,
  pending,
  onPause,
  onResume,
}: {
  league: League;
  turn: TurnSummary;
  canControl: boolean;
  pending: boolean;
  onPause: () => void;
  onResume: () => void;
}) {
  const { draft, managers } = league;
  const total = draftTotalPicks(draft);
  const pickNumber = currentPickNumber(draft);
  const manager = findManager(managers, turn.managerId);
  const upNext = findManager(managers, managerUpNext(draft));
  const paused = draft.status === "paused";

  return (
    <section
      aria-live="polite"
      className="flex flex-wrap items-center gap-4 rounded-xl border border-ink-700 bg-ink-850/90 px-4 py-4 sm:px-6"
    >
      <div className="flex min-w-0 flex-1 basis-64 items-center gap-4">
        {manager ? (
          <ManagerAvatar
            manager={manager}
            size="lg"
            className={turn.kind === "your_turn" || turn.kind === "picking_for_open_seat" ? "ring-2 ring-accent" : ""}
          />
        ) : (
          <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-ink-800 text-accent">
            <Check aria-hidden className="size-6" />
          </span>
        )}
        <div className="min-w-0">
          <p className="font-display text-xl font-semibold sm:text-2xl">
            <TurnHeadline turn={turn} manager={manager} />
          </p>
          <p className="text-sm text-fog-300">
            {pickNumber === null
              ? `All ${total} picks are in.`
              : `Round ${roundOf(pickNumber, draft.seatOrder.length)} · Pick ${pickNumber} of ${total}`}
          </p>
        </div>
      </div>
      {upNext && (
        <p className="text-sm text-fog-300 sm:border-l sm:border-ink-700 sm:pl-4">
          Up next: <span className="font-semibold text-fog-50">{managerLabel(upNext)}</span>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {canControl && turn.kind !== "complete" && openSeats(managers).length > 0 && (
          <InviteLink leagueId={league.id} compact />
        )}
        {turn.kind === "complete" ? (
          <Link href={`/l/${league.id}`} className={buttonClasses("secondary")}>
            League overview
          </Link>
        ) : canControl ? (
          paused ? (
            <Button onClick={onResume} disabled={pending}>
              <Play aria-hidden className="size-4" />
              Resume draft
            </Button>
          ) : (
            <Button variant="secondary" onClick={onPause} disabled={pending}>
              <Pause aria-hidden className="size-4" />
              Pause draft
            </Button>
          )
        ) : (
          <Badge tone={paused ? "danger" : "accent"}>{paused ? "Paused" : "Live"}</Badge>
        )}
      </div>
    </section>
  );
}

function TurnHeadline({ turn, manager }: { turn: TurnSummary; manager: Manager | undefined }) {
  const name = manager ? managerLabel(manager) : "";
  switch (turn.kind) {
    case "your_turn":
      return (
        <>
          <span className="text-accent">Your turn</span> · {name}
        </>
      );
    case "picking_for_open_seat":
      return (
        <>
          <span className="text-accent">Picking for {name}</span> · open seat
        </>
      );
    case "on_the_clock":
      return <>On the clock · {name}</>;
    case "paused":
      return (
        <>
          <span className="text-negative">Draft paused</span> · {name} is up
        </>
      );
    case "complete":
      return <>Draft complete</>;
    case "not_started":
      return <>Draft not started</>;
  }
}
```

- [ ] **Step 8: `src/components/draft/DraftBoard.tsx`**

```tsx
"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useRef } from "react";
import { ManagerAvatar } from "@/components/ui/ManagerAvatar";
import { Panel } from "@/components/ui/Panel";
import { SidePill } from "@/components/ui/SidePill";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { TEAMS_BY_ID } from "@/data/teams";
import { currentPickNumber, draftTotalPicks, pickNumberFor } from "@/lib/draft";
import { formatNumber } from "@/lib/format";
import { findManager, managerLabel } from "@/lib/league/managers";
import type { DraftPick, DraftStatus, League } from "@/lib/types";

export function DraftBoard({ league }: { league: League }) {
  const { draft, managers } = league;
  const seatCount = draft.seatOrder.length;
  const current = currentPickNumber(draft);
  const total = draftTotalPicks(draft);
  const upNext = current !== null && current < total ? current + 1 : null;
  const picksByNumber = new Map(draft.picks.map((pick) => [pick.pickNumber, pick]));
  const seats = draft.seatOrder.map((id) => findManager(managers, id)!);
  const rounds = Array.from({ length: draft.rounds }, (_, index) => index + 1);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Keep the current pick in view by scrolling the board's own container, never the page.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || current === null) return;
    const cell = scroller.querySelector<HTMLElement>(`[data-pick="${current}"]`);
    if (!cell) return;
    scroller.scrollTo({
      top: Math.max(0, cell.offsetTop - scroller.clientHeight / 2 + cell.offsetHeight / 2),
      left: Math.max(0, cell.offsetLeft - scroller.clientWidth / 2 + cell.offsetWidth / 2),
      behavior: "smooth",
    });
  }, [current]);

  return (
    <Panel
      title={
        <>
          Draft board
          <span className="ml-2 font-sans text-sm font-normal text-fog-400">Snake draft · {draft.rounds} rounds</span>
        </>
      }
    >
      <div
        ref={scrollerRef}
        tabIndex={0}
        aria-label="Draft board (scrollable)"
        className="relative max-h-[28rem] overflow-auto rounded-b-xl focus-visible:outline-2 focus-visible:outline-accent"
      >
        <div
          role="table"
          aria-label="Draft board"
          className="grid min-w-[46rem]"
          style={{ gridTemplateColumns: `4rem repeat(${seatCount}, minmax(10.5rem, 1fr))` }}
        >
          <div role="row" className="contents">
            <div role="columnheader" className="sticky left-0 top-0 z-20 border-b border-ink-700 bg-ink-850">
              <span className="sr-only">Round</span>
            </div>
            {seats.map((manager) => (
              <div
                role="columnheader"
                key={manager.id}
                className="sticky top-0 z-10 flex items-center gap-2 border-b border-l border-ink-700 bg-ink-850 px-3 py-2"
              >
                <ManagerAvatar manager={manager} size="sm" />
                <span className="truncate text-sm font-semibold">{managerLabel(manager)}</span>
              </div>
            ))}
          </div>
          {rounds.map((round) => (
            <div role="row" key={round} className="contents">
              <div
                role="rowheader"
                className="sticky left-0 z-10 flex items-center gap-1 border-b border-ink-700 bg-ink-850 px-3 text-sm font-semibold text-fog-300"
              >
                R{round}
                {round % 2 === 1 ? (
                  <ArrowRight aria-hidden className="size-4" />
                ) : (
                  <ArrowLeft aria-hidden className="size-4" />
                )}
                <span className="sr-only">{round % 2 === 1 ? "picks left to right" : "picks right to left"}</span>
              </div>
              {seats.map((manager, seat) => {
                const pickNumber = pickNumberFor(round, seat, seatCount);
                return (
                  <BoardCell
                    key={manager.id}
                    pickNumber={pickNumber}
                    pick={picksByNumber.get(pickNumber)}
                    state={pickNumber === current ? "current" : pickNumber === upNext ? "next" : "open"}
                    status={draft.status}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function BoardCell({
  pickNumber,
  pick,
  state,
  status,
}: {
  pickNumber: number;
  pick: DraftPick | undefined;
  state: "current" | "next" | "open";
  status: DraftStatus;
}) {
  const base = "flex min-h-14 items-center gap-2 border-b border-l border-ink-700 px-3 py-2 text-sm";
  if (pick) {
    const team = TEAMS_BY_ID[pick.teamId];
    return (
      <div role="cell" data-pick={pickNumber} className={base}>
        <span className="w-5 shrink-0 text-xs tabular-nums text-fog-400">{pickNumber}</span>
        <TeamLogo team={team} size={26} />
        <span className="min-w-0 flex-1 truncate">{team.name}</span>
        <SidePill side={pick.side} size="sm" />
        <span className="shrink-0 font-semibold tabular-nums">{formatNumber(team.line)}</span>
      </div>
    );
  }
  const currentLabel = status === "live" ? "On the clock" : status === "paused" ? "Paused" : "First pick";
  return (
    <div
      role="cell"
      data-pick={pickNumber}
      className={`${base} ${state === "current" ? "rounded-md border-2 border-accent bg-accent/5" : ""}`}
    >
      <span className="w-5 shrink-0 text-xs tabular-nums text-fog-400">{pickNumber}</span>
      <span className={`flex-1 text-center ${state === "current" ? "font-semibold text-accent" : "text-fog-300"}`}>
        {state === "current" ? currentLabel : state === "next" ? "Up next" : "—"}
      </span>
    </div>
  );
}
```

- [ ] **Step 9: `src/components/draft/SideButton.tsx`**

```tsx
import { Check } from "lucide-react";
import type { SideRef } from "@/lib/draft-filters";
import { formatNumber } from "@/lib/format";
import { findManager, managerLabel } from "@/lib/league/managers";
import type { DraftPick, Manager, Side, Team } from "@/lib/types";

const STYLES: Record<Side, { idle: string; selected: string }> = {
  OVER: { idle: "border-over/70 bg-over-deep text-over hover:bg-over/20", selected: "border-over bg-over text-accent-ink" },
  UNDER: {
    idle: "border-under/70 bg-under-deep text-under-ink hover:bg-under/30",
    selected: "border-under bg-under text-white",
  },
};

const BASE = "flex h-10 w-full min-w-0 items-center justify-center gap-1.5 rounded-lg border px-3 text-sm";

export function SideButton({
  team,
  side,
  pick,
  selected,
  managers,
  disabled,
  onSelect,
}: {
  team: Team;
  side: Side;
  pick: DraftPick | undefined;
  selected: boolean;
  managers: Manager[];
  disabled: boolean;
  onSelect: (ref: SideRef) => void;
}) {
  if (pick) {
    const owner = findManager(managers, pick.managerId);
    const label = owner ? managerLabel(owner) : "Drafted";
    return (
      <span
        className={`${BASE} border-ink-600 bg-ink-800 text-fog-400`}
        title={`${side} drafted by ${label} at pick ${pick.pickNumber}`}
      >
        <span className="sr-only">{side} drafted by </span>
        <span className="truncate">{label}</span>
      </span>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`${side} ${formatNumber(team.line)}, ${team.city} ${team.name}`}
      disabled={disabled}
      onClick={() => onSelect({ teamId: team.id, side })}
      className={`${BASE} font-display font-bold tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        selected ? STYLES[side].selected : STYLES[side].idle
      }`}
    >
      {selected && <Check aria-hidden className="size-4" />}
      {side}
    </button>
  );
}
```

- [ ] **Step 10: `src/components/draft/AvailablePicks.tsx`** — table at container `@xl+`, cards below

```tsx
"use client";

import { Search } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { Select } from "@/components/ui/Select";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { TEAMS, TOTAL_SIDES } from "@/data/teams";
import { findPickForSide } from "@/lib/draft";
import { availableSideCount, filterTeams, SIDES, type SideRef, type TeamFilters } from "@/lib/draft-filters";
import { formatNumber } from "@/lib/format";
import type { DraftState, Manager, Side, Team } from "@/lib/types";
import { SideButton } from "./SideButton";

export function AvailablePicks({
  draft,
  managers,
  filters,
  onFiltersChange,
  selection,
  onSelect,
  selectable,
}: {
  draft: DraftState;
  managers: Manager[];
  filters: TeamFilters;
  onFiltersChange: (filters: TeamFilters) => void;
  selection: SideRef | null;
  onSelect: (ref: SideRef) => void;
  selectable: boolean;
}) {
  const teams = filterTeams(TEAMS, draft, filters);
  const button = (team: Team, side: Side) => (
    <SideButton
      team={team}
      side={side}
      pick={findPickForSide(draft, team.id, side)}
      selected={selection?.teamId === team.id && selection.side === side}
      managers={managers}
      disabled={!selectable}
      onSelect={onSelect}
    />
  );

  return (
    <Panel
      title="Available picks"
      bodyClassName="@container"
      actions={
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <label className="relative min-w-0 flex-1 basis-40 sm:w-56 sm:flex-none">
            <span className="sr-only">Search teams</span>
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fog-400" />
            <input
              type="search"
              value={filters.query}
              onChange={(event) => onFiltersChange({ ...filters, query: event.target.value })}
              placeholder="Search teams"
              className="h-10 w-full rounded-lg border border-ink-600 bg-ink-900 pl-9 pr-3 text-sm text-fog-50 placeholder:text-fog-400 focus:border-accent focus:outline-none"
            />
          </label>
          <Select
            label="Conference"
            value={filters.conference}
            onChange={(conference) => onFiltersChange({ ...filters, conference })}
            options={[
              { value: "all", label: "All conferences" },
              { value: "East", label: "East" },
              { value: "West", label: "West" },
            ]}
          />
          <Select
            label="Availability"
            value={filters.availability}
            onChange={(availability) => onFiltersChange({ ...filters, availability })}
            options={[
              { value: "available", label: "Available" },
              { value: "all", label: "All teams" },
            ]}
          />
        </div>
      }
    >
      <table className="hidden w-full text-sm @xl:table">
        <thead className="text-left text-xs uppercase tracking-wider text-fog-400">
          <tr className="border-b border-ink-700">
            <th scope="col" className="px-5 py-3 font-semibold">Team</th>
            <th scope="col" className="px-3 py-3 text-right font-semibold">Line</th>
            <th scope="col" className="w-36 px-3 py-3 text-center font-semibold">Under</th>
            <th scope="col" className="w-36 px-3 py-3 text-center font-semibold">Over</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((team) => (
            <tr key={team.id} className="border-b border-ink-700/70">
              <td className="px-5 py-2.5">
                <div className="flex items-center gap-3">
                  <TeamLogo team={team} size={32} />
                  <span className="font-medium">
                    {team.city} {team.name}
                  </span>
                </div>
              </td>
              <td className="px-3 py-2.5 text-right text-base font-semibold tabular-nums">{formatNumber(team.line)}</td>
              {SIDES.map((side) => (
                <td key={side} className="px-3 py-2.5">
                  {button(team, side)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="divide-y divide-ink-700 @xl:hidden">
        {teams.map((team) => (
          <li key={team.id} className="px-4 py-3">
            <div className="flex items-center gap-3">
              <TeamLogo team={team} size={32} />
              <span className="min-w-0 flex-1 truncate font-medium">
                {team.city} {team.name}
              </span>
              <span className="font-semibold tabular-nums">{formatNumber(team.line)}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {SIDES.map((side) => (
                <div key={side}>{button(team, side)}</div>
              ))}
            </div>
          </li>
        ))}
      </ul>

      {teams.length === 0 && <p className="px-5 py-6 text-sm text-fog-400">No teams match these filters.</p>}
      <p className="border-t border-ink-700 px-5 py-3 text-sm text-fog-300">
        {availableSideCount(draft, TEAMS.length)} of {TOTAL_SIDES} sides available
      </p>
    </Panel>
  );
}
```

- [ ] **Step 11: `src/components/draft/SelectionPreview.tsx`**

```tsx
import { Button } from "@/components/ui/Button";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { SEASON } from "@/config/league";
import { TEAMS_BY_ID } from "@/data/teams";
import { currentPickNumber } from "@/lib/draft";
import type { SideRef } from "@/lib/draft-filters";
import { formatNumber } from "@/lib/format";
import { findManager, managerLabel } from "@/lib/league/managers";
import type { TurnSummary } from "@/lib/league/turn";
import type { DraftStatus, League } from "@/lib/types";

const EMPTY_MESSAGE: Record<DraftStatus, string> = {
  live: "Choose an Over or Under from Available picks to preview it here.",
  paused: "The draft is paused.",
  not_started: "The draft hasn't started yet.",
  complete: "The draft is complete.",
};

export function SelectionPreview({
  league,
  selection,
  notice,
  turn,
  canPick,
  pending,
  onConfirm,
  onClear,
}: {
  league: League;
  selection: SideRef | null;
  notice: string | null;
  turn: TurnSummary;
  canPick: boolean;
  pending: boolean;
  onConfirm: () => void;
  onClear: () => void;
}) {
  if (!selection) {
    return (
      <div className="rounded-lg border border-dashed border-ink-600 px-4 py-6 text-center text-sm text-fog-300">
        {notice && (
          <p role="status" className="mb-2 font-semibold text-negative">
            {notice}
          </p>
        )}
        <p>{EMPTY_MESSAGE[league.draft.status]}</p>
      </div>
    );
  }

  const team = TEAMS_BY_ID[selection.teamId];
  const onClock = findManager(league.managers, turn.managerId);
  const pickNumber = currentPickNumber(league.draft);
  const waiting = league.draft.status === "paused" ? "The draft is paused." : onClock ? `Waiting on ${managerLabel(onClock)}.` : "";

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-ink-700 bg-ink-900/70 p-4">
      <div className="flex items-center gap-4">
        <TeamLogo team={team} size={72} />
        <div className="min-w-0">
          <p className="truncate font-display text-xl font-semibold">
            {team.city} {team.name}
          </p>
          <p className="font-display text-2xl font-bold">
            <span className={selection.side === "OVER" ? "text-over" : "text-under"}>{selection.side}</span>{" "}
            {formatNumber(team.line)} <span className="text-base font-semibold text-fog-300">wins</span>
          </p>
          {onClock && pickNumber !== null && (
            <p className="text-sm text-fog-300">
              {managerLabel(onClock)} · Pick {pickNumber}
            </p>
          )}
        </div>
      </div>
      <dl className="flex items-center justify-between border-t border-ink-700 pt-3 text-sm">
        <dt className="text-fog-300">{SEASON.previousLabel} wins</dt>
        <dd className="font-display text-xl font-bold">{team.prevWins}</dd>
      </dl>
      <Button size="lg" onClick={onConfirm} disabled={!canPick || pending}>
        Confirm pick
      </Button>
      {!canPick && waiting && <p className="-mt-2 text-center text-xs text-fog-400">{waiting}</p>}
      <Button variant="secondary" onClick={onClear}>
        Clear selection
      </Button>
    </div>
  );
}
```

- [ ] **Step 12: `src/components/draft/ManagerPicks.tsx`**

```tsx
import { SidePill } from "@/components/ui/SidePill";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { TEAMS_BY_ID } from "@/data/teams";
import { picksForManager } from "@/lib/draft";
import { formatNumber } from "@/lib/format";
import { findManager, managerLabel } from "@/lib/league/managers";
import type { League } from "@/lib/types";

export function ManagerPicks({ league, managerId, isViewer }: { league: League; managerId: string; isViewer: boolean }) {
  const manager = findManager(league.managers, managerId)!;
  const picks = picksForManager(league.draft, managerId);
  return (
    <section aria-labelledby="manager-picks-title" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="manager-picks-title" className="font-display text-xl font-semibold">
          {isViewer ? "Your picks" : `${managerLabel(manager)}'s picks`}
        </h3>
        <span className="text-sm text-fog-300">
          {picks.length} / {league.draft.rounds} drafted
        </span>
      </div>
      {picks.length === 0 ? (
        <p className="text-sm text-fog-400">No picks yet.</p>
      ) : (
        <ol className="divide-y divide-ink-700 rounded-lg border border-ink-700">
          {picks.map((pick) => {
            const team = TEAMS_BY_ID[pick.teamId];
            return (
              <li key={pick.pickNumber} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="w-6 tabular-nums text-fog-400">{pick.pickNumber}</span>
                <TeamLogo team={team} size={26} />
                <span className="min-w-0 flex-1 truncate">{team.name}</span>
                <SidePill side={pick.side} size="sm" />
                <span className="w-10 text-right font-semibold tabular-nums">{formatNumber(team.line)}</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
```

- [ ] **Step 13: `src/components/draft/SelectionBar.tsx`** — sticky confirm bar below `xl`, above the bottom nav

```tsx
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { TEAMS_BY_ID } from "@/data/teams";
import type { SideRef } from "@/lib/draft-filters";
import { formatNumber } from "@/lib/format";

export function SelectionBar({
  selection,
  canPick,
  pending,
  onConfirm,
  onClear,
}: {
  selection: SideRef | null;
  canPick: boolean;
  pending: boolean;
  onConfirm: () => void;
  onClear: () => void;
}) {
  if (!selection) return null;
  const team = TEAMS_BY_ID[selection.teamId];
  return (
    <div className="fixed inset-x-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 flex items-center gap-3 rounded-xl border border-ink-600 bg-ink-900/95 p-3 shadow-2xl backdrop-blur lg:bottom-4 lg:left-[17rem] xl:hidden">
      <TeamLogo team={team} size={36} />
      <p className="min-w-0 flex-1 truncate text-sm">
        <span className="font-semibold">{team.name}</span>{" "}
        <span className={selection.side === "OVER" ? "text-over" : "text-under"}>{selection.side}</span>{" "}
        {formatNumber(team.line)}
      </p>
      <Button size="sm" variant="ghost" onClick={onClear} aria-label="Clear selection">
        <X aria-hidden className="size-4" />
      </Button>
      <Button size="sm" onClick={onConfirm} disabled={!canPick || pending}>
        Confirm
      </Button>
    </div>
  );
}
```

- [ ] **Step 14: `src/components/draft/DraftRoom.tsx`**

```tsx
"use client";

import { Info } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Panel } from "@/components/ui/Panel";
import { TEAMS_BY_ID } from "@/data/teams";
import { findPickForSide, managerOnTheClock, type DraftAction } from "@/lib/draft";
import { DEFAULT_FILTERS, type SideRef, type TeamFilters } from "@/lib/draft-filters";
import { findManager, managerLabel } from "@/lib/league/managers";
import { canControlDraft, canPickNow } from "@/lib/league/permissions";
import { describeTurn } from "@/lib/league/turn";
import type { LeagueView } from "@/lib/types";
import { AvailablePicks } from "./AvailablePicks";
import { DraftBoard } from "./DraftBoard";
import { DraftLobby } from "./DraftLobby";
import { DraftStatusBar } from "./DraftStatusBar";
import { ManagerPicks } from "./ManagerPicks";
import { SelectionBar } from "./SelectionBar";
import { SelectionPreview } from "./SelectionPreview";
import { useLeagueDraft } from "./use-league-draft";

export function DraftRoom({ initial }: { initial: LeagueView }) {
  const { view, error, pending, dispatch, dismissError } = useLeagueDraft(initial);
  const { league, viewerId } = view;
  const { draft } = league;
  const [selection, setSelection] = useState<SideRef | null>(null);
  const [filters, setFilters] = useState<TeamFilters>(DEFAULT_FILTERS);

  // A selection someone else drafts (seen via polling) stops being active and explains why.
  const takenBy = selection ? findPickForSide(draft, selection.teamId, selection.side) : undefined;
  const activeSelection = selection && !takenBy ? selection : null;
  const takenNotice =
    selection && takenBy
      ? `${TEAMS_BY_ID[selection.teamId].name} ${selection.side} was drafted by ${managerLabel(
          findManager(league.managers, takenBy.managerId)!,
        )}. Pick another side.`
      : null;

  const turn = describeTurn(league, viewerId);
  const canPick = canPickNow(league, viewerId);
  const canControl = canControlDraft(league, viewerId);
  const focusManagerId = viewerId ?? managerOnTheClock(draft) ?? league.managers[0].id;

  function run(action: DraftAction) {
    void dispatch(action);
  }

  async function confirm() {
    if (!activeSelection) return;
    const choice = activeSelection;
    setSelection(null);
    const ok = await dispatch({ type: "confirm", teamId: choice.teamId, side: choice.side });
    if (!ok) setSelection(choice);
  }

  const clear = () => setSelection(null);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Draft room"
        subtitle={`${league.name} • ${league.seasonLabel}`}
        tag={league.isDemo ? "Demo draft" : undefined}
      />
      {error && <Alert onDismiss={dismissError}>{error}</Alert>}
      {draft.status === "not_started" ? (
        <DraftLobby
          league={league}
          viewerId={viewerId}
          canControl={canControl}
          pending={pending}
          onStart={() => run({ type: "start" })}
        />
      ) : (
        <DraftStatusBar
          league={league}
          turn={turn}
          canControl={canControl}
          pending={pending}
          onPause={() => run({ type: "pause" })}
          onResume={() => run({ type: "resume" })}
        />
      )}
      <DraftBoard league={league} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
        <AvailablePicks
          draft={draft}
          managers={league.managers}
          filters={filters}
          onFiltersChange={setFilters}
          selection={activeSelection}
          onSelect={setSelection}
          selectable={draft.status === "live"}
        />
        <div className="min-w-0 xl:sticky xl:top-8 xl:self-start">
          <Panel title={viewerId ? "Your selection" : "Selection"} bodyClassName="flex flex-col gap-5 p-4 sm:p-5">
            <SelectionPreview
              league={league}
              selection={activeSelection}
              notice={takenNotice}
              turn={turn}
              canPick={canPick}
              pending={pending}
              onConfirm={confirm}
              onClear={clear}
            />
            <ManagerPicks league={league} managerId={focusManagerId} isViewer={focusManagerId === viewerId} />
            <p className="flex items-center gap-2 text-sm text-fog-400">
              <Info aria-hidden className="size-4 shrink-0" />
              Lines lock when drafted.
            </p>
          </Panel>
        </div>
      </div>
      <SelectionBar selection={activeSelection} canPick={canPick} pending={pending} onConfirm={confirm} onClear={clear} />
      {activeSelection && <div aria-hidden className="h-20 xl:hidden" />}
    </div>
  );
}
```

- [ ] **Step 15: `src/app/l/[leagueId]/draft/page.tsx`**

```tsx
import { Suspense } from "react";
import { DraftRoom } from "@/components/draft/DraftRoom";
import { PageFallback } from "@/components/ui/PageFallback";
import { getLeagueOrNotFound } from "@/server/league";
import { toLeagueView } from "@/server/viewer";

export default function DraftPage({ params }: PageProps<"/l/[leagueId]/draft">) {
  return (
    <Suspense fallback={<PageFallback label="Loading draft room…" />}>
      <DraftContent params={params} />
    </Suspense>
  );
}

async function DraftContent({ params }: { params: PageProps<"/l/[leagueId]/draft">["params"] }) {
  const { leagueId } = await params;
  const league = getLeagueOrNotFound(leagueId);
  return <DraftRoom initial={await toLeagueView(league)} />;
}
```

- [ ] **Step 16: Verify**

Run: `npm test && npm run lint && npm run typecheck && npm run build`
Expected: all PASS; build lists `/l/[leagueId]/draft`.

Smoke: start `npx next start -p 3100` in the background and run:
- `curl -s localhost:3100/l/demo/draft | grep -o "Draft complete\|16 of 60 sides available\|Lines lock when drafted." | sort -u` → all three strings.
- Create a league with curl (`POST /api/leagues` with a cookie jar as in Task 5), then `curl -s -b $JAR localhost:3100/l/$ID/draft | grep -o "Draft lobby\|Start draft\|Invite link" | sort -u` → all three.
Stop the server.

- [ ] **Step 17: Commit**

```bash
git add src
git commit -m "feat: build draft room with snake board, filters, selection and live polling" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Verification (controller)

Not dispatched — the controller runs it after the final review.

- [ ] `npm test && npm run lint && npm run typecheck && npm run build` — paste results.
- [ ] Dev server via `.claude/launch.json` → `dev`.
- [ ] Desktop 1440×900 and mobile 375×812, for `/l/demo`, `/l/demo/draft`, a fresh league's draft room (lobby, live, paused), `/l/demo/rosters`:
  - `document.documentElement.scrollWidth <= window.innerWidth` on every page.
  - Sidebar at desktop; bottom tab bar on mobile; "Soon" on Rosters/Settings.
  - Overview: manager switch changes picks, stats and fades; standings ranked by points with margin beneath; Final results disabled with note; View all toggles.
  - Draft room: select previews (with 2024–25 wins); confirm records and advances; drafted side shows manager and is disabled; search/conference/availability filters; clear; pause blocks selecting; board scrolls inside its container.
- [ ] Final results view: temporarily set a few teams to 82 games in `src/data/teams.ts`, confirm Final results enables with settled/pending rows and "Partial results", then revert (`git checkout src/data/teams.ts`).
- [ ] Screenshots of both pages at both widths.
