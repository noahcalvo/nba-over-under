# Durable Storage, Invite Links and Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Courtline's leagues from server memory into Postgres and replace the editable seat cookie with server-validated sessions and private invite and sign-in links. Make every draft mutation atomic and freeze each league's lines when its draft starts. Scoring and the demo league don't change.

**Architecture:** Pure decisions live in `src/lib`: draft rules, permissions, league commands, tokens, link rules and lines. They run inside one Postgres transaction per league write (`withLockedLeague` in `src/db`), which locks the league row and re-reads the caller's seat and any link before deciding. Drizzle ORM talks to Neon through `pg` in production and to in-process PGlite in development and tests. Server components and route handlers reach the database only through `src/server/`.

**Tech Stack:** Next.js 16.4 (App Router, Cache Components), React 19.3, TypeScript strict, Drizzle ORM 0.45.3 with drizzle-kit 0.31.11, pg 8.23.0, @electric-sql/pglite 0.5.8, @vercel/functions 3.9.9, Vitest 4.1, Tailwind CSS v4.

**Spec:** `docs/superpowers/specs/2026-10-08-durable-storage-sessions-design.md`

## Global Constraints

- Work on a feature branch (e.g. `feat/durable-storage-sessions`) cut from the branch that holds this plan and the spec. Node 20. Import alias `@/*` → `./src/*`.
- New dependencies, exact versions, nothing else: `drizzle-orm@0.45.3`, `pg@8.23.0`, `@vercel/functions@3.9.9`, `@electric-sql/pglite@0.5.8`; dev: `drizzle-kit@0.31.11`, `@types/pg@8.23.1`.
- Next.js 16.4 with Cache Components. A server component that reads `params`, `cookies()` or the database sits inside `<Suspense>`. `getDb()` awaits `connection()` before any query. Read `node_modules/next/dist/docs/` before using an unfamiliar Next API.
- `src/lib/` stays pure: no React, no `next/*`, no `server-only`. `src/db/` never imports `server-only` (so Vitest can load it); only `src/server/` and `src/app/` import `src/db/`.
- Every league write goes through `withLockedLeague` (Task 4). `getViewerId()` is for rendering; never use it to authorize a write.
- `src/lib/scoring.ts` and `src/lib/standings.ts` don't change. The demo league (`demo`) lives in code, is never stored, and is read-only.
- Session cookie `courtline_session`: httpOnly, `SameSite=Lax`, `Path=/`, `Secure` in production, `Max-Age` 400 days. The server enforces expiry: 90 days idle, renewed at most once a day (`ACCESS` in `src/config/access.ts`). The old `courtline_seats` cookie grants nothing.
- Link token: `{22-char id}.{22-char signature}`, page `/i/{token}`, response header `Referrer-Policy: no-referrer`. Opening a link never changes anything; only `POST /api/links/claim` does.
- Errors: `invalid_link` 404, `stale_pick` 409, `team_already_held` 409, `lines_unavailable` 503. A failed `Origin` check, and an actor whose seat was revoked, get `forbidden` (403). Messages live in `ERROR_MESSAGES` (`src/lib/league/errors.ts`).
- Environment: `DATABASE_URL` (`postgres://…` or `pglite:<dir>`), `DATABASE_URL_UNPOOLED` (used for migrations when present), `LINK_SECRET` (at least 32 characters; required in production), `TEST_DATABASE_URL` (only for `npm run test:pg`).
- UI: dark theme tokens only. The page never scrolls horizontally at 375px or 1440px. Exact copy includes `League invite link`, `Your sign-in link`, `Reset seat`, `Waiting to rejoin`, `Copy rejoin link`, `Join the league`, `Rejoin your seat`, `Sign in`, `This link no longer works. Ask your commissioner for a new one.`, `Lines lock when the draft starts.`, `Lines locked when the draft started.`
- Mutating routes reject requests without a matching `Origin` header. Add `-H "Origin: http://localhost:3000"` to curl calls against them.
- Each task ends green: `npm test && npm run lint && npm run typecheck && npm run build`. Then commit with a message ending in a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (the second `-m` in each commit step).
- Code in this plan is complete and was verified in task order: copy it exactly. Each "replace" anchor occurs exactly once in its file at that point in the plan. If one doesn't, stop and report; don't improvise.
- The repo sits in an iCloud-synced folder. If `npm run typecheck` fails with duplicate route types from `.next/` files named like `routes.d 2.ts`, run `rm -rf .next` and retry.

## Verified during planning

All eight tasks were applied in order to a clean copy of the base branch. After every task, `npm test`, `npm run lint`, `npm run typecheck` and `npm run build` passed. The final tree passed `scripts/smoke.sh` (27 of 27) and browser checks at 375px and 1440px. Facts this plan relies on:

- PGlite 0.5.8 runs under `next dev` (Turbopack) once listed in `serverExternalPackages`. It creates its data directory but not missing parents.
- Next 16.4 does not call `register()` during `next build`. With a bad configuration, `next start` logs the error at startup and answers every request with a 500. The process stays up.
- Without `await connection()` before a query, Next reports `blocking-prerender-current-time` on database-backed pages (the drivers read the clock).
- Drizzle 0.45 wraps driver errors. The Postgres error, with `code` `23505` and `constraint`, is on `error.cause`. A raw `now()` comes back as a string; `mapWith(<timestamp column>)` turns it into a `Date`.
- On the shared `Db` type, `db.execute()` results are typed `unknown`, so tests use the query builder.
- Not verified (no Postgres available while planning): `npm run test:pg`, a Vercel deployment, and `attachDatabasePool` with a client checked out mid-transaction. Task 8 lists the optional run.

Decided during planning (the spec has been updated to match):
- `sessions.token_hash` is hex `text`, because Drizzle 0.45 has no `bytea` column.
- The spec's spike step was done during planning, so it is not a task.
- The draft room's line note now reads "Lines lock when the draft starts." before the draft starts, and "Lines locked when the draft started." after.

## Model guidance

| Task | Model | Why |
|---|---|---|
| 1 Database foundation | haiku | Complete code given; one generated migration to compare |
| 2 Lines out of team data | haiku | Mechanical edits with exact anchors |
| 3 Draft rules, seat permissions, league commands, and token and link primitives | haiku | Pure TypeScript with complete tests |
| 4 Repositories and league actions | haiku | Complete code and tests; runs on in-memory PGlite |
| 5 Switch the app to the database and sessions | sonnet | Largest integration: server glue, routes, pages and deletions in one coherent change |
| 6 Invite links, the link page and claiming | haiku | Complete code; the claim form reuses the old join form's markup |
| 7 League settings | haiku | Complete code; three small routes over Task 4's actions |
| 8 Deployment, smoke test, docs and final verification | sonnet | Verification needs judgement: browser checks at two widths and a production start |

## File map

```
src/config/access.ts                 ACCESS: session idle days, renewal hours, cookie max age, seat-invite days
src/lib/env.ts                       readServerConfig: DATABASE_URL / LINK_SECRET rules (production never on PGlite by accident)
src/lib/lines.ts                     LineSource, staticLineSource, isCompleteLineSet, withLines, indexTeams
src/lib/draft.ts                     + pickNumber on confirm, stale_pick, team_already_held, holdsTeam
src/lib/league/errors.ts             DomainError, ApiError, Result, succeed, fail, ERROR_MESSAGES
src/lib/league/permissions.ts        + canManageSeats, canResetSeat
src/lib/league/parse-action.ts       + pickNumber
src/lib/league/commands.ts           createLeague, decideDraftAction, decideClaim, decideInviteChange, decideSeatReset, decideOwnLinkReset
src/lib/access/tokens.ts             session tokens + SHA-256, link ids + HMAC signatures
src/lib/access/links.ts              LinkKind, LinkRecord, linkStatus, linkPath, LeagueAccess, NO_ACCESS
src/data/teams.ts                    TEAM_INFO (no lines), TEAM_IDS, TOTAL_SIDES
src/data/static-lines.ts             STATIC_LINES (the mock lines; demo league + static source)
src/db/schema.ts                     Drizzle tables: leagues, managers, picks, access_links, sessions, session_seats
src/db/client.ts                     openDatabase (pg or PGlite), Db, Tx, MIGRATIONS_FOLDER
src/db/test-db.ts                    createTestDb: cloned, migrated, in-memory PGlite
src/db/sessions.ts                   createSession, findSession, seatInLeague, bindSeat, unbindSeat
src/db/links.ts                      issueLink, revokeLinks, findLink, findLinkAt, markSeatInviteUsed, listActiveLinks
src/db/leagues.ts                    loadLeague, insertLeague, saveLeague, withLockedLeague, listSessionLeagues
src/db/actions.ts                    createLeagueFor, runDraftAction, claimLink(+InLeague), rotate/revokeLeagueInvite, resetSeat, resetOwnLink
drizzle/                             generated SQL migrations (never hand-edited)
drizzle.config.ts                    drizzle-kit generate config
scripts/migrate.mjs                  apply migrations to Postgres (vercel-build)
scripts/smoke.sh                     two-browser API smoke test
src/instrumentation.ts               refuse to start on a bad configuration
src/server/db.ts                     serverConfig, getDb (connection() + per-process singleton)
src/server/session.ts                SESSION_COOKIE, getSession, getViewerId, ensureSession
src/server/lines.ts                  lineSource (static), currentLinesOrNull
src/server/league.ts                 findLeague, getLeagueOrNotFound, teamsFor, toLeagueView, listViewerLeagues
src/server/access.ts                 pathForLink, verifyLink, readLinkToken, getLeagueAccess
src/server/http.ts                   errorResponse, resultResponse, readJsonBody, isSameOrigin
src/app/api/leagues/route.ts                               POST create
src/app/api/leagues/[leagueId]/draft/route.ts              GET view, POST action
src/app/api/leagues/[leagueId]/invite/route.ts             POST rotate, DELETE revoke
src/app/api/leagues/[leagueId]/seats/[managerId]/reset/route.ts   POST reset seat
src/app/api/leagues/[leagueId]/me/link/route.ts            POST reset own link
src/app/api/links/claim/route.ts                           POST claim a link
src/app/i/[token]/page.tsx           link page (join / rejoin / sign in)
src/app/l/[leagueId]/settings/page.tsx   Seats & links, Your access
src/app/l/[leagueId]/join/page.tsx   notice: ask for the invite link
src/components/access/               CopyLink, send-json, LinkClaimForm, SeatsPanel, YourAccessPanel
Deleted: src/lib/league/store.ts(+test), src/lib/league/seats-cookie.ts(+test), src/server/store.ts, src/server/viewer.ts,
         src/app/api/leagues/[leagueId]/join/route.ts, src/components/join/JoinForm.tsx, src/components/draft/InviteLink.tsx
```

---

### Task 1: Database foundation: dependencies, schema, migration, client, environment checks

**Files:**
- Modify: `package.json`, `package-lock.json` (via `npm install`), `next.config.ts`, `.gitignore`
- Create: `drizzle.config.ts`, `src/db/schema.ts`, `drizzle/0000_init.sql` + `drizzle/meta/*` (generated)
- Create: `src/db/client.ts`, `src/db/test-db.ts`, `src/lib/env.ts`, `src/instrumentation.ts`, `scripts/migrate.mjs`
- Test: `src/lib/env.test.ts`, `src/db/client.test.ts`

**Interfaces:**
- Consumes: nothing new. The app keeps running on the in-memory store until Task 5.
- Produces: `readServerConfig(env): ServerConfigResult`, types `DatabaseConfig` (`{ kind: "postgres"; url }` | `{ kind: "pglite"; dataDir: string | null }`) and `ServerConfig` (`database`, `linkSecret`, `usingDevLinkSecret`), `MISSING_DATABASE_MESSAGE` (src/lib/env.ts).
- Produces: `openDatabase(config: DatabaseConfig): Promise<Db>`, `type Db`, `type Tx`, `MIGRATIONS_FOLDER` (src/db/client.ts); `createTestDb(): Promise<Db>` (src/db/test-db.ts).
- Produces: Drizzle tables `leagues`, `managers`, `picks`, `accessLinks`, `sessions`, `sessionSeats` (src/db/schema.ts). Constraint names later tasks rely on: `picks_pkey`, `picks_side_unique`, `picks_manager_team_unique`.

- [ ] **Step 1: Install the dependencies (exact versions, all at least two weeks old)**

Run:

```bash
npm install --save-exact drizzle-orm@0.45.3 pg@8.23.0 @vercel/functions@3.9.9 @electric-sql/pglite@0.5.8
npm install --save-exact -D drizzle-kit@0.31.11 @types/pg@8.23.1
```

Expected: `package.json` gains exactly these six entries (no `^`), sorted into `dependencies` and `devDependencies`.

In `package.json`, replace:

```json
    "typecheck": "next typegen && tsc --noEmit"
```

with:

```json
    "typecheck": "next typegen && tsc --noEmit",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "node scripts/migrate.mjs"
```

- [ ] **Step 2: Write the failing environment tests**

Create `src/lib/env.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_PGLITE_DIR, MISSING_DATABASE_MESSAGE, MISSING_LINK_SECRET_MESSAGE, readServerConfig } from "@/lib/env";

const SECRET = "x".repeat(32);

describe("readServerConfig", () => {
  it("refuses to start production without a database or link secret", () => {
    expect(readServerConfig({ NODE_ENV: "production" })).toEqual({
      ok: false,
      problems: [MISSING_DATABASE_MESSAGE, MISSING_LINK_SECRET_MESSAGE],
    });
    expect(readServerConfig({ NODE_ENV: "production", LINK_SECRET: SECRET })).toEqual({
      ok: false,
      problems: [MISSING_DATABASE_MESSAGE],
    });
  });

  it("uses Postgres when DATABASE_URL is a postgres URL", () => {
    for (const url of ["postgres://u:p@host/db", "postgresql://u:p@host/db?sslmode=require"]) {
      expect(readServerConfig({ NODE_ENV: "production", DATABASE_URL: url, LINK_SECRET: SECRET })).toEqual({
        ok: true,
        config: { database: { kind: "postgres", url }, linkSecret: SECRET, usingDevLinkSecret: false },
      });
    }
  });

  it("allows PGlite in production only through the explicit pglite: opt-in", () => {
    const result = readServerConfig({ NODE_ENV: "production", DATABASE_URL: "pglite:.data/prod", LINK_SECRET: SECRET });
    expect(result.ok && result.config.database).toEqual({ kind: "pglite", dataDir: ".data/prod" });
  });

  it("falls back to PGlite and a development secret outside production", () => {
    const dev = readServerConfig({ NODE_ENV: "development" });
    expect(dev.ok && dev.config.database).toEqual({ kind: "pglite", dataDir: DEFAULT_PGLITE_DIR });
    expect(dev.ok && dev.config.usingDevLinkSecret).toBe(true);
    const test = readServerConfig({ NODE_ENV: "test" });
    expect(test.ok && test.config.database).toEqual({ kind: "pglite", dataDir: null });
  });

  it("rejects unknown database URLs and short secrets", () => {
    expect(readServerConfig({ NODE_ENV: "development", DATABASE_URL: "mysql://x" })).toEqual({
      ok: false,
      problems: ["DATABASE_URL must be a postgres:// URL or pglite:<directory>."],
    });
    expect(readServerConfig({ NODE_ENV: "development", DATABASE_URL: "pglite:" }).ok).toBe(false);
    expect(readServerConfig({ NODE_ENV: "development", LINK_SECRET: "short" })).toEqual({
      ok: false,
      problems: ["LINK_SECRET must be at least 32 characters."],
    });
  });
});
```

Run:

```bash
npx vitest run src/lib/env.test.ts
```

Expected: FAIL: cannot resolve `@/lib/env`.

- [ ] **Step 3: Implement the environment checks**

Production must never fall back to storage that doesn't persist: without `DATABASE_URL` it is an error, and PGlite is only used in production through the explicit `pglite:<dir>` opt-in.

Create `src/lib/env.ts`:

```ts
// Reads and checks the server's environment. Production must never fall back to storage that doesn't persist.

export type DatabaseConfig =
  | { kind: "postgres"; url: string }
  /** dataDir null means in-memory (tests). */
  | { kind: "pglite"; dataDir: string | null };

export interface ServerConfig {
  database: DatabaseConfig;
  linkSecret: string;
  /** True when LINK_SECRET is unset outside production and the development fallback is in use. */
  usingDevLinkSecret: boolean;
}

export type ServerConfigResult = { ok: true; config: ServerConfig } | { ok: false; problems: string[] };

export const MISSING_DATABASE_MESSAGE =
  "DATABASE_URL is required in production. Courtline will not start on non-persistent storage.";
export const MISSING_LINK_SECRET_MESSAGE = "LINK_SECRET is required in production.";
export const DEFAULT_PGLITE_DIR = ".data/pglite";
export const LINK_SECRET_MIN_LENGTH = 32;
const DEV_LINK_SECRET = "courtline-development-link-secret-not-for-production";
const PGLITE_PREFIX = "pglite:";

type Env = Readonly<Record<string, string | undefined>>;

export function readServerConfig(env: Env): ServerConfigResult {
  const production = env.NODE_ENV === "production";
  const problems: string[] = [];

  let database: DatabaseConfig | null = null;
  const url = env.DATABASE_URL?.trim();
  if (!url) {
    if (production) problems.push(MISSING_DATABASE_MESSAGE);
    else database = { kind: "pglite", dataDir: env.NODE_ENV === "test" ? null : DEFAULT_PGLITE_DIR };
  } else if (url.startsWith("postgres://") || url.startsWith("postgresql://")) {
    database = { kind: "postgres", url };
  } else if (url.startsWith(PGLITE_PREFIX) && url.length > PGLITE_PREFIX.length) {
    // Explicit opt-in, e.g. to try a production build locally with `DATABASE_URL=pglite:.data/pglite npm start`.
    database = { kind: "pglite", dataDir: url.slice(PGLITE_PREFIX.length) };
  } else {
    problems.push("DATABASE_URL must be a postgres:// URL or pglite:<directory>.");
  }

  let linkSecret = env.LINK_SECRET ?? "";
  const usingDevLinkSecret = linkSecret === "" && !production;
  if (linkSecret === "") {
    if (production) problems.push(MISSING_LINK_SECRET_MESSAGE);
    else linkSecret = DEV_LINK_SECRET;
  } else if (linkSecret.length < LINK_SECRET_MIN_LENGTH) {
    problems.push(`LINK_SECRET must be at least ${LINK_SECRET_MIN_LENGTH} characters.`);
  }

  if (problems.length > 0 || !database) return { ok: false, problems };
  return { ok: true, config: { database, linkSecret, usingDevLinkSecret } };
}
```

Run:

```bash
npx vitest run src/lib/env.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 4: Write the schema and the Drizzle Kit config**

Constraint names are explicit because `src/db/leagues.ts` (Task 4) maps unique violations by name. `token_hash` is hex `text`: Drizzle 0.45 has no `bytea` column, and hex keeps PGlite and `pg` returning the same type.

Create `drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";

// Only `drizzle-kit generate` uses this file. Migrations are applied by scripts/migrate.mjs (Postgres) or by the app
// on startup (PGlite).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
```

Create `src/db/schema.ts`:

```ts
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const leagues = pgTable(
  "leagues",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    seasonLabel: text("season_label").notNull(),
    commissionerId: text("commissioner_id").notNull(),
    rounds: smallint("rounds").notNull(),
    draftStatus: text("draft_status", { enum: ["not_started", "live", "paused", "complete"] }).notNull(),
    /** teamId → line, frozen when the draft starts. */
    lines: jsonb("lines").$type<Record<string, number>>(),
    linesSource: text("lines_source"),
    linesAsOf: timestamp("lines_as_of", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [
    check("leagues_draft_status_check", sql`${t.draftStatus} in ('not_started', 'live', 'paused', 'complete')`),
    check("leagues_demo_reserved_check", sql`${t.id} <> 'demo'`),
  ],
);

export const managers = pgTable(
  "managers",
  {
    leagueId: text("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    seat: smallint("seat").notNull(),
    /** Null means an open seat. */
    displayName: text("display_name"),
  },
  (t) => [primaryKey({ name: "managers_pkey", columns: [t.leagueId, t.id] }), unique("managers_seat_unique").on(t.leagueId, t.seat)],
);

export const picks = pgTable(
  "picks",
  {
    leagueId: text("league_id").notNull(),
    pickNumber: smallint("pick_number").notNull(),
    managerId: text("manager_id").notNull(),
    teamId: text("team_id").notNull(),
    side: text("side", { enum: ["OVER", "UNDER"] }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: "picks_pkey", columns: [t.leagueId, t.pickNumber] }),
    unique("picks_side_unique").on(t.leagueId, t.teamId, t.side),
    unique("picks_manager_team_unique").on(t.leagueId, t.managerId, t.teamId),
    check("picks_side_check", sql`${t.side} in ('OVER', 'UNDER')`),
    foreignKey({
      name: "picks_manager_fk",
      columns: [t.leagueId, t.managerId],
      foreignColumns: [managers.leagueId, managers.id],
    }).onDelete("cascade"),
  ],
);

export const accessLinks = pgTable(
  "access_links",
  {
    id: text("id").primaryKey(),
    leagueId: text("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    /** Null only for a league invite. */
    managerId: text("manager_id"),
    kind: text("kind", { enum: ["league_invite", "seat_invite", "personal"] }).notNull(),
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    usedAt: timestamp("used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    check("access_links_kind_check", sql`${t.kind} in ('league_invite', 'seat_invite', 'personal')`),
    check("access_links_seat_check", sql`(${t.kind} = 'league_invite') = (${t.managerId} is null)`),
    foreignKey({
      name: "access_links_manager_fk",
      columns: [t.leagueId, t.managerId],
      foreignColumns: [managers.leagueId, managers.id],
    }).onDelete("cascade"),
    uniqueIndex("access_links_one_league_invite")
      .on(t.leagueId)
      .where(sql`${t.kind} = 'league_invite' and ${t.revokedAt} is null`),
    uniqueIndex("access_links_one_seat_link")
      .on(t.leagueId, t.managerId, t.kind)
      .where(sql`${t.kind} <> 'league_invite' and ${t.usedAt} is null and ${t.revokedAt} is null`),
  ],
);

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Hex SHA-256 of the cookie token. The token itself is never stored. */
  tokenHash: text("token_hash").notNull().unique("sessions_token_hash_unique"),
  createdAt: createdAt(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const sessionSeats = pgTable(
  "session_seats",
  {
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    leagueId: text("league_id").notNull(),
    managerId: text("manager_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: "session_seats_pkey", columns: [t.sessionId, t.leagueId] }),
    foreignKey({
      name: "session_seats_manager_fk",
      columns: [t.leagueId, t.managerId],
      foreignColumns: [managers.leagueId, managers.id],
    }).onDelete("cascade"),
    index("session_seats_by_seat").on(t.leagueId, t.managerId),
  ],
);
```

- [ ] **Step 5: Generate the first migration**

Run:

```bash
npm run db:generate -- --name init
```

Expected: `drizzle/0000_init.sql`, `drizzle/meta/_journal.json` and `drizzle/meta/0000_snapshot.json` are created. The SQL must match the listing below (the snapshot's ids differ per run; that's fine). Never edit generated files by hand: change the schema and generate again.

Expected `drizzle/0000_init.sql`:

```sql
CREATE TABLE "access_links" (
	"id" text PRIMARY KEY NOT NULL,
	"league_id" text NOT NULL,
	"manager_id" text,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "access_links_kind_check" CHECK ("access_links"."kind" in ('league_invite', 'seat_invite', 'personal')),
	CONSTRAINT "access_links_seat_check" CHECK (("access_links"."kind" = 'league_invite') = ("access_links"."manager_id" is null))
);
--> statement-breakpoint
CREATE TABLE "leagues" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"season_label" text NOT NULL,
	"commissioner_id" text NOT NULL,
	"rounds" smallint NOT NULL,
	"draft_status" text NOT NULL,
	"lines" jsonb,
	"lines_source" text,
	"lines_as_of" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leagues_draft_status_check" CHECK ("leagues"."draft_status" in ('not_started', 'live', 'paused', 'complete')),
	CONSTRAINT "leagues_demo_reserved_check" CHECK ("leagues"."id" <> 'demo')
);
--> statement-breakpoint
CREATE TABLE "managers" (
	"league_id" text NOT NULL,
	"id" text NOT NULL,
	"seat" smallint NOT NULL,
	"display_name" text,
	CONSTRAINT "managers_pkey" PRIMARY KEY("league_id","id"),
	CONSTRAINT "managers_seat_unique" UNIQUE("league_id","seat")
);
--> statement-breakpoint
CREATE TABLE "picks" (
	"league_id" text NOT NULL,
	"pick_number" smallint NOT NULL,
	"manager_id" text NOT NULL,
	"team_id" text NOT NULL,
	"side" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "picks_pkey" PRIMARY KEY("league_id","pick_number"),
	CONSTRAINT "picks_side_unique" UNIQUE("league_id","team_id","side"),
	CONSTRAINT "picks_manager_team_unique" UNIQUE("league_id","manager_id","team_id"),
	CONSTRAINT "picks_side_check" CHECK ("picks"."side" in ('OVER', 'UNDER'))
);
--> statement-breakpoint
CREATE TABLE "session_seats" (
	"session_id" uuid NOT NULL,
	"league_id" text NOT NULL,
	"manager_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_seats_pkey" PRIMARY KEY("session_id","league_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "access_links" ADD CONSTRAINT "access_links_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_links" ADD CONSTRAINT "access_links_manager_fk" FOREIGN KEY ("league_id","manager_id") REFERENCES "public"."managers"("league_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managers" ADD CONSTRAINT "managers_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "picks" ADD CONSTRAINT "picks_manager_fk" FOREIGN KEY ("league_id","manager_id") REFERENCES "public"."managers"("league_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_seats" ADD CONSTRAINT "session_seats_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_seats" ADD CONSTRAINT "session_seats_manager_fk" FOREIGN KEY ("league_id","manager_id") REFERENCES "public"."managers"("league_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "access_links_one_league_invite" ON "access_links" USING btree ("league_id") WHERE "access_links"."kind" = 'league_invite' and "access_links"."revoked_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "access_links_one_seat_link" ON "access_links" USING btree ("league_id","manager_id","kind") WHERE "access_links"."kind" <> 'league_invite' and "access_links"."used_at" is null and "access_links"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "session_seats_by_seat" ON "session_seats" USING btree ("league_id","manager_id");
```

- [ ] **Step 6: Write the failing database tests**

Create `src/db/client.test.ts`:

```ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openDatabase } from "@/db/client";
import { accessLinks, leagues, managers, picks, sessions, sessionSeats } from "@/db/schema";
import { createTestDb } from "@/db/test-db";

const LEAGUE = { name: "L", seasonLabel: "2025–26", commissionerId: "m1", rounds: 11, draftStatus: "not_started" } as const;

describe("database", () => {
  it("migrates every table", async () => {
    const db = await createTestDb();
    for (const table of [leagues, managers, picks, accessLinks, sessions, sessionSeats]) {
      expect(await db.select().from(table)).toEqual([]);
    }
  });

  it("opens a file-backed PGlite even when its parent directories don't exist yet", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "courtline-"));
    const db = await openDatabase({ kind: "pglite", dataDir: path.join(root, "nested", "pglite") });
    expect(await db.select().from(leagues)).toEqual([]);
  });

  it("reserves the demo id and allows one working league invite per league", async () => {
    const db = await createTestDb();
    await expect(db.insert(leagues).values({ id: "demo", ...LEAGUE })).rejects.toThrow();
    await db.insert(leagues).values({ id: "lg0001", ...LEAGUE });
    await db.insert(accessLinks).values({ id: "first", leagueId: "lg0001", kind: "league_invite" });
    await expect(
      db.insert(accessLinks).values({ id: "second", leagueId: "lg0001", kind: "league_invite" }),
    ).rejects.toThrow();
  });
});
```

Run:

```bash
npx vitest run src/db/client.test.ts
```

Expected: FAIL: cannot resolve `@/db/client`.

- [ ] **Step 7: Implement the database client and the test helper**

`openDatabase` picks `pg` for Postgres and PGlite otherwise. PGlite creates its own data directory but not missing parents, hence the `mkdirSync`. The test helper migrates one in-memory database per test file and gives each test a `clone()` of it, which is about twice as fast as migrating per test.

Create `src/db/client.ts`:

```ts
import { mkdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { attachDatabasePool } from "@vercel/functions";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { Pool } from "pg";
import type { DatabaseConfig } from "@/lib/env";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Generated by `npm run db:generate`; applied by scripts/migrate.mjs on Postgres and here on PGlite. */
export const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

/** Postgres for deployments; PGlite (in-process, migrated on open) for development and tests. */
export async function openDatabase(config: DatabaseConfig): Promise<Db> {
  if (config.kind === "postgres") {
    const pool = new Pool({ connectionString: config.url, max: 5 });
    // On Vercel Fluid compute this closes idle clients before the instance suspends. Elsewhere it does nothing.
    attachDatabasePool(pool);
    return drizzlePg({ client: pool, schema });
  }
  // PGlite creates its own directory but not missing parents (e.g. `.data/`).
  if (config.dataDir) mkdirSync(path.dirname(config.dataDir), { recursive: true });
  const client = config.dataDir ? new PGlite(config.dataDir) : new PGlite();
  const db = drizzlePglite({ client, schema });
  await migratePglite(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db;
}
```

Create `src/db/test-db.ts`:

```ts
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { MIGRATIONS_FOLDER, type Db } from "./client";
import * as schema from "./schema";

// Migrate one in-memory database per test file, then hand each test a clone of it: same schema, no shared rows.
let template: Promise<PGlite> | null = null;

async function migratedTemplate(): Promise<PGlite> {
  const client = new PGlite();
  await migrate(drizzle({ client, schema }), { migrationsFolder: MIGRATIONS_FOLDER });
  return client;
}

/** A fresh, migrated, in-memory database. */
export async function createTestDb(): Promise<Db> {
  template ??= migratedTemplate();
  // clone() is typed as the PGlite interface but returns a PGlite instance.
  const client = (await (await template).clone()) as PGlite;
  return drizzle({ client, schema });
}
```

Run:

```bash
npx vitest run src/db/client.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 8: Add the startup check, the migration script and the config changes**

Next calls `register()` once per server instance before it serves anything. In Next 16.4 it does not run during `next build` (verified), so local builds need no database; the `NEXT_PHASE` guard keeps it that way if that changes. With a bad configuration `next start` logs the problem and answers every request with a 500.

Create `src/instrumentation.ts`:

```ts
import { readServerConfig } from "@/lib/env";

/**
 * Next calls this once per server instance, before it handles any request. A production server without a database
 * or link secret stops here instead of serving requests on storage that doesn't persist.
 */
export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const result = readServerConfig(process.env);
  if (!result.ok) throw new Error(`Courtline can't start. ${result.problems.join(" ")}`);
  if (result.config.usingDevLinkSecret) console.warn("LINK_SECRET is not set; using the development secret.");
}
```

`scripts/migrate.mjs` is plain JavaScript so it runs without a TypeScript loader. It prefers `DATABASE_URL_UNPOOLED` (set by Neon's Vercel integration) because migrations should not go through the transaction-mode pooler.

Create `scripts/migrate.mjs`:

```js
// Applies drizzle/ migrations to Postgres. Runs in `vercel-build` before `next build`, so a deployment without a
// database fails before it goes live. PGlite applies the same migrations itself when the app opens it.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

// Neon's Vercel integration sets DATABASE_URL (pooled) and DATABASE_URL_UNPOOLED; migrate over a direct connection.
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

if (!url) {
  console.error("DATABASE_URL is required in production. Courtline will not start on non-persistent storage.");
  process.exit(1);
}
if (url.startsWith("pglite:")) {
  console.log("DATABASE_URL points at PGlite; the app applies migrations when it opens the database.");
  process.exit(0);
}

const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  await migrate(drizzle({ client: pool }), { migrationsFolder: "drizzle" });
  console.log("Migrations applied.");
} finally {
  await pool.end();
}
```

In `next.config.ts`, replace:

```ts
  partialPrefetching: true,
  images: {
```

with:

```ts
  partialPrefetching: true,
  // PGlite ships WASM and data files that must load from node_modules at runtime. (Next externalizes `pg` itself.)
  serverExternalPackages: ["@electric-sql/pglite"],
  images: {
```

In `.gitignore`, replace:

```text
# subagent-driven-development scratch
.superpowers/
```

with:

```text
# subagent-driven-development scratch
.superpowers/

# local PGlite database (npm run dev)
/.data/
```

- [ ] **Step 9: Verify**

Run:

```bash
npm test && npm run lint && npm run typecheck && npm run build
```

Expected: all pass; `npm run build` needs no `DATABASE_URL`.

Run:

```bash
node scripts/migrate.mjs; echo "exit=$?"
```

Expected: prints `DATABASE_URL is required in production. Courtline will not start on non-persistent storage.` and `exit=1`.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: add Postgres schema, migrations, database client and environment checks" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Lines out of team data: LineSet, LineSource, League.lines and LeagueView.teams

**Files:**
- Create: `src/lib/lines.ts`, `src/data/static-lines.ts`
- Modify: `src/lib/types.ts`, `src/data/teams.ts`, `src/data/demo-league.ts`
- Modify: `src/components/overview/LeagueOverview.tsx`, `src/components/draft/{DraftRoom,DraftBoard,AvailablePicks,ManagerPicks,SelectionBar,SelectionPreview}.tsx`
- Modify (interim, deleted in Task 5): `src/lib/league/store.ts`, `src/lib/league/store.test.ts`, `src/server/viewer.ts`, `src/app/api/leagues/[leagueId]/draft/route.ts`, `src/app/l/[leagueId]/page.tsx`
- Test: `src/lib/lines.test.ts`, `src/data/demo-league.test.ts`, `src/lib/draft-filters.test.ts`

**Interfaces:**
- Consumes: `TeamLookup` from `src/lib/standings.ts` (unchanged).
- Produces: types `TeamInfo = Omit<Team, "line">`, `LineSet { values; source; asOf }`, `League.lines: LineSet | null`, `LeagueView.teams: Team[]` (src/lib/types.ts).
- Produces: `LineSource { current(): Promise<LineSet> }`, `staticLineSource(lines)`, `isCompleteLineSet(lines, teamIds)`, `withLines(teamInfo, lines): Team[]`, `indexTeams(teams): TeamLookup` (src/lib/lines.ts).
- Produces: `TEAM_INFO` (replaces `TEAMS`; `TEAMS_BY_ID` is gone), `TEAM_IDS`, `TOTAL_SIDES` (src/data/teams.ts); `STATIC_LINES` (src/data/static-lines.ts).
- Produces: components take teams as props: `LeagueOverview { league, teams: Team[], viewerId }`, `AvailablePicks { teams: Team[], … }`, and `teams: TeamLookup` on `DraftBoard`, `ManagerPicks`, `SelectionBar`, `SelectionPreview`.

- [ ] **Step 1: Write the failing lines tests**

Create `src/lib/lines.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { indexTeams, isCompleteLineSet, staticLineSource, withLines } from "@/lib/lines";
import type { LineSet, TeamInfo } from "@/lib/types";

const INFO: TeamInfo[] = [
  { id: "MIN", nbaId: 1, city: "Minnesota", name: "Timberwolves", conference: "West", color: "#0C2340", prevWins: 49, wins: 30, losses: 18 },
  { id: "OKC", nbaId: 2, city: "Oklahoma City", name: "Thunder", conference: "West", color: "#007AC1", prevWins: 68, wins: 36, losses: 12 },
];
const LINES: LineSet = { source: "test", asOf: "2026-10-01T00:00:00.000Z", values: { MIN: 49.5, OKC: 62.5 } };

describe("withLines", () => {
  it("adds each team's line to its metadata", () => {
    expect(withLines(INFO, LINES).map((team) => [team.id, team.line, team.name])).toEqual([
      ["MIN", 49.5, "Timberwolves"],
      ["OKC", 62.5, "Thunder"],
    ]);
  });

  it("throws when a team has no line", () => {
    expect(() => withLines(INFO, { ...LINES, values: { MIN: 49.5 } })).toThrow("No line for OKC");
  });
});

describe("isCompleteLineSet", () => {
  const ids = new Set(["MIN", "OKC"]);

  it("needs a finite line for every team", () => {
    expect(isCompleteLineSet(LINES, ids)).toBe(true);
    expect(isCompleteLineSet({ ...LINES, values: { MIN: 49.5 } }, ids)).toBe(false);
    expect(isCompleteLineSet({ ...LINES, values: { MIN: 49.5, OKC: Number.NaN } }, ids)).toBe(false);
  });
});

describe("indexTeams and staticLineSource", () => {
  it("indexes teams by id", () => {
    expect(indexTeams(withLines(INFO, LINES)).OKC.line).toBe(62.5);
  });

  it("serves the same lines every time", async () => {
    await expect(staticLineSource(LINES).current()).resolves.toBe(LINES);
  });
});
```

Run:

```bash
npx vitest run src/lib/lines.test.ts
```

Expected: FAIL: cannot resolve `@/lib/lines`.

- [ ] **Step 2: Add the types**

In `src/lib/types.ts`, replace:

```ts
  /** Season win-total line. Always ends in .5. */
  line: number;
```

with:

```ts
  /** Season win-total line, from the LineSet the league scores against. */
  line: number;
```

In `src/lib/types.ts`, replace:

```ts
export interface Manager {
```

with:

```ts
/** Team metadata without a line. Lines come from a LineSet. */
export type TeamInfo = Omit<Team, "line">;

/** Season win-total lines for every team, from one source at one moment. */
export interface LineSet {
  /** teamId → line. */
  values: Readonly<Record<TeamId, number>>;
  source: string;
  /** ISO 8601 timestamp. */
  asOf: string;
}

export interface Manager {
```

In `src/lib/types.ts`, replace:

```ts
  draft: DraftState;
  fades: Fade[];
}
```

with:

```ts
  draft: DraftState;
  fades: Fade[];
  /** Lines frozen when the draft started. Null until then. */
  lines: LineSet | null;
}
```

In `src/lib/types.ts`, replace:

```ts
export interface LeagueView {
  league: League;
  viewerId: string | null;
}
```

with:

```ts
export interface LeagueView {
  league: League;
  viewerId: string | null;
  /** Every team with the lines this view scores against: the league's frozen lines, or current lines before the draft starts. */
  teams: Team[];
}
```

- [ ] **Step 3: Implement lines and move the line values out of the team data**

Create `src/lib/lines.ts`:

```ts
import type { TeamLookup } from "@/lib/standings";
import type { LineSet, Team, TeamId, TeamInfo } from "@/lib/types";

/** Where current lines come from. Spec 1 ships only the static source; a live feed implements the same interface. */
export interface LineSource {
  /** The latest lines. May reject, or return a set missing teams; callers check with isCompleteLineSet. */
  current(): Promise<LineSet>;
}

export function staticLineSource(lines: LineSet): LineSource {
  return { current: async () => lines };
}

/** True when every team has a finite line. */
export function isCompleteLineSet(lines: LineSet, teamIds: ReadonlySet<TeamId>): boolean {
  return [...teamIds].every((teamId) => Number.isFinite(lines.values[teamId]));
}

/** Joins team metadata with lines. Throws when a team has no line, so check isCompleteLineSet first. */
export function withLines(teams: readonly TeamInfo[], lines: LineSet): Team[] {
  return teams.map((team) => {
    const line = lines.values[team.id];
    if (!Number.isFinite(line)) throw new Error(`No line for ${team.id}`);
    return { ...team, line };
  });
}

export function indexTeams(teams: readonly Team[]): TeamLookup {
  return Object.fromEntries(teams.map((team) => [team.id, team]));
}
```

Create `src/data/static-lines.ts`:

```ts
import type { LineSet } from "@/lib/types";

/** The prototype's mock lines. They back the static line source and the demo league. */
export const STATIC_LINES: LineSet = {
  source: "static",
  asOf: "2025-10-01T00:00:00.000Z",
  values: {
    ATL: 46.5,
    BOS: 41.5,
    BKN: 20.5,
    CHA: 26.5,
    CHI: 32.5,
    CLE: 56.5,
    DET: 46.5,
    IND: 38.5,
    MIA: 37.5,
    MIL: 43.5,
    NYK: 53.5,
    ORL: 51.5,
    PHI: 43.5,
    TOR: 37.5,
    WAS: 20.5,
    DAL: 40.5,
    DEN: 54.5,
    GSW: 47.5,
    HOU: 52.5,
    LAC: 47.5,
    LAL: 49.5,
    MEM: 40.5,
    MIN: 49.5,
    NOP: 33.5,
    OKC: 62.5,
    PHX: 31.5,
    POR: 33.5,
    SAC: 35.5,
    SAS: 44.5,
    UTA: 18.5,
  },
};
```

Replace the whole of `src/data/teams.ts` (every team loses `line`; `TEAMS` becomes `TEAM_INFO` and `TEAMS_BY_ID` goes away):

```ts
import type { TeamId, TeamInfo } from "@/lib/types";

/** Team metadata. Lines live in a LineSet (see src/lib/lines.ts). */
export const TEAM_INFO: readonly TeamInfo[] = [
  { id: "ATL", nbaId: 1610612737, city: "Atlanta", name: "Hawks", conference: "East", color: "#C8102E", prevWins: 40, wins: 25, losses: 24 },
  { id: "BOS", nbaId: 1610612738, city: "Boston", name: "Celtics", conference: "East", color: "#007A33", prevWins: 61, wins: 22, losses: 26 },
  { id: "BKN", nbaId: 1610612751, city: "Brooklyn", name: "Nets", conference: "East", color: "#2A2A2A", prevWins: 26, wins: 13, losses: 35 },
  { id: "CHA", nbaId: 1610612766, city: "Charlotte", name: "Hornets", conference: "East", color: "#1D1160", prevWins: 19, wins: 17, losses: 30 },
  { id: "CHI", nbaId: 1610612741, city: "Chicago", name: "Bulls", conference: "East", color: "#CE1141", prevWins: 39, wins: 21, losses: 27 },
  { id: "CLE", nbaId: 1610612739, city: "Cleveland", name: "Cavaliers", conference: "East", color: "#860038", prevWins: 64, wins: 33, losses: 15 },
  { id: "DET", nbaId: 1610612765, city: "Detroit", name: "Pistons", conference: "East", color: "#1D42BA", prevWins: 44, wins: 31, losses: 17 },
  { id: "IND", nbaId: 1610612754, city: "Indiana", name: "Pacers", conference: "East", color: "#002D62", prevWins: 50, wins: 18, losses: 30 },
  { id: "MIA", nbaId: 1610612748, city: "Miami", name: "Heat", conference: "East", color: "#98002E", prevWins: 37, wins: 24, losses: 25 },
  { id: "MIL", nbaId: 1610612749, city: "Milwaukee", name: "Bucks", conference: "East", color: "#00471B", prevWins: 48, wins: 22, losses: 26 },
  { id: "NYK", nbaId: 1610612752, city: "New York", name: "Knicks", conference: "East", color: "#006BB6", prevWins: 51, wins: 31, losses: 16 },
  { id: "ORL", nbaId: 1610612753, city: "Orlando", name: "Magic", conference: "East", color: "#0077C0", prevWins: 41, wins: 30, losses: 18 },
  { id: "PHI", nbaId: 1610612755, city: "Philadelphia", name: "76ers", conference: "East", color: "#ED174C", prevWins: 24, wins: 25, losses: 23 },
  { id: "TOR", nbaId: 1610612761, city: "Toronto", name: "Raptors", conference: "East", color: "#CE1141", prevWins: 30, wins: 26, losses: 22 },
  { id: "WAS", nbaId: 1610612764, city: "Washington", name: "Wizards", conference: "East", color: "#002B5C", prevWins: 18, wins: 10, losses: 38 },
  { id: "DAL", nbaId: 1610612742, city: "Dallas", name: "Mavericks", conference: "West", color: "#00538C", prevWins: 39, wins: 20, losses: 28 },
  { id: "DEN", nbaId: 1610612743, city: "Denver", name: "Nuggets", conference: "West", color: "#0E2240", prevWins: 50, wins: 34, losses: 14 },
  { id: "GSW", nbaId: 1610612744, city: "Golden State", name: "Warriors", conference: "West", color: "#1D428A", prevWins: 48, wins: 25, losses: 23 },
  { id: "HOU", nbaId: 1610612745, city: "Houston", name: "Rockets", conference: "West", color: "#CE1141", prevWins: 52, wins: 31, losses: 18 },
  { id: "LAC", nbaId: 1610612746, city: "LA", name: "Clippers", conference: "West", color: "#C8102E", prevWins: 50, wins: 23, losses: 25 },
  { id: "LAL", nbaId: 1610612747, city: "Los Angeles", name: "Lakers", conference: "West", color: "#552583", prevWins: 50, wins: 30, losses: 18 },
  { id: "MEM", nbaId: 1610612763, city: "Memphis", name: "Grizzlies", conference: "West", color: "#5D76A9", prevWins: 48, wins: 21, losses: 27 },
  { id: "MIN", nbaId: 1610612750, city: "Minnesota", name: "Timberwolves", conference: "West", color: "#0C2340", prevWins: 49, wins: 30, losses: 18 },
  { id: "NOP", nbaId: 1610612740, city: "New Orleans", name: "Pelicans", conference: "West", color: "#85714D", prevWins: 21, wins: 12, losses: 37 },
  { id: "OKC", nbaId: 1610612760, city: "Oklahoma City", name: "Thunder", conference: "West", color: "#007AC1", prevWins: 68, wins: 36, losses: 12 },
  { id: "PHX", nbaId: 1610612756, city: "Phoenix", name: "Suns", conference: "West", color: "#1D1160", prevWins: 36, wins: 24, losses: 24 },
  { id: "POR", nbaId: 1610612757, city: "Portland", name: "Trail Blazers", conference: "West", color: "#E03A3E", prevWins: 36, wins: 21, losses: 27 },
  { id: "SAC", nbaId: 1610612758, city: "Sacramento", name: "Kings", conference: "West", color: "#5A2D81", prevWins: 40, wins: 16, losses: 32 },
  { id: "SAS", nbaId: 1610612759, city: "San Antonio", name: "Spurs", conference: "West", color: "#4B5257", prevWins: 34, wins: 31, losses: 17 },
  { id: "UTA", nbaId: 1610612762, city: "Utah", name: "Jazz", conference: "West", color: "#753BBD", prevWins: 17, wins: 14, losses: 34 },
];

export const TEAM_IDS: ReadonlySet<TeamId> = new Set(TEAM_INFO.map((team) => team.id));

/** Every team has a separately draftable Over and Under. */
export const TOTAL_SIDES = TEAM_INFO.length * 2;
```

In `src/data/demo-league.ts`, replace:

```ts
import { seatForPick } from "@/lib/draft";
```

with:

```ts
import { STATIC_LINES } from "@/data/static-lines";
import { seatForPick } from "@/lib/draft";
```

In `src/data/demo-league.ts`, replace:

```ts
      { id: "f4", managerId: "m4", targetPickNumber: 9 },
    ],
  };
```

with:

```ts
      { id: "f4", managerId: "m4", targetPickNumber: 9 },
    ],
    lines: STATIC_LINES,
  };
```

Run:

```bash
npx vitest run src/lib/lines.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 4: Update the data tests**

The demo test gains a check that no manager holds both sides of a team (the rule lands in Task 3).

Replace the whole of `src/data/demo-league.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { LEAGUE_DEFAULTS } from "@/config/league";
import { buildDemoLeague, DEMO_LEAGUE_ID } from "@/data/demo-league";
import { STATIC_LINES } from "@/data/static-lines";
import { TEAM_IDS, TEAM_INFO, TOTAL_SIDES } from "@/data/teams";
import { seatForPick, totalPicks } from "@/lib/draft";
import { indexTeams, isCompleteLineSet, withLines } from "@/lib/lines";
import { computeStandings } from "@/lib/standings";

const TEAMS_BY_ID = indexTeams(withLines(TEAM_INFO, STATIC_LINES));

describe("TEAM_INFO", () => {
  it("has 30 unique teams, 15 per conference, and 60 sides", () => {
    expect(TEAM_INFO).toHaveLength(30);
    expect(TEAM_IDS.size).toBe(30);
    expect(new Set(TEAM_INFO.map((team) => team.nbaId)).size).toBe(30);
    expect(TEAM_INFO.filter((team) => team.conference === "East")).toHaveLength(15);
    expect(TOTAL_SIDES).toBe(60);
  });

  it("uses valid mid-season records and colors", () => {
    for (const team of TEAM_INFO) {
      expect(team.wins + team.losses).toBeGreaterThan(0);
      expect(team.wins + team.losses).toBeLessThan(82);
      expect(team.color).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
});

describe("STATIC_LINES", () => {
  it("has a half-point line for every team and nothing else", () => {
    expect(isCompleteLineSet(STATIC_LINES, TEAM_IDS)).toBe(true);
    expect(Object.keys(STATIC_LINES.values).sort()).toEqual([...TEAM_IDS].sort());
    for (const line of Object.values(STATIC_LINES.values)) expect(line % 1).toBe(0.5);
  });
});

describe("buildDemoLeague", () => {
  const league = buildDemoLeague();

  it("is a completed 4-manager, 11-round draft on the static lines", () => {
    expect(league.id).toBe(DEMO_LEAGUE_ID);
    expect(league.isDemo).toBe(true);
    expect(league.lines).toBe(STATIC_LINES);
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

  it("never gives a manager both sides of a team", () => {
    const held = new Set(league.draft.picks.map((pick) => `${pick.managerId}:${pick.teamId}`));
    expect(held.size).toBe(league.draft.picks.length);
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

In `src/lib/draft-filters.test.ts`, replace:

```ts
import { TEAMS } from "@/data/teams";
```

with:

```ts
import { STATIC_LINES } from "@/data/static-lines";
import { TEAM_INFO } from "@/data/teams";
```

In `src/lib/draft-filters.test.ts`, replace:

```ts
import type { DraftState, Side } from "@/lib/types";
```

with:

```ts
import { withLines } from "@/lib/lines";
import type { DraftState, Side } from "@/lib/types";

const TEAMS = withLines(TEAM_INFO, STATIC_LINES);
```

- [ ] **Step 5: Pass teams into the overview**

In `src/components/overview/LeagueOverview.tsx`, replace:

```tsx
import { TEAMS_BY_ID } from "@/data/teams";
```

with:

```tsx

```

In `src/components/overview/LeagueOverview.tsx`, replace:

```tsx
import { findManager } from "@/lib/league/managers";
```

with:

```tsx
import { findManager } from "@/lib/league/managers";
import { indexTeams } from "@/lib/lines";
```

In `src/components/overview/LeagueOverview.tsx`, replace:

```tsx
import type { League } from "@/lib/types";
```

with:

```tsx
import type { League, Team } from "@/lib/types";
```

In `src/components/overview/LeagueOverview.tsx`, replace:

```tsx
export function LeagueOverview({ league, viewerId }: { league: League; viewerId: string | null }) {
```

with:

```tsx
export function LeagueOverview({ league, teams, viewerId }: { league: League; teams: Team[]; viewerId: string | null }) {
```

In `src/components/overview/LeagueOverview.tsx`, replace:

```tsx
  const projected = useMemo(() => computeStandings(league, TEAMS_BY_ID, "projected"), [league]);
  const final = useMemo(() => computeStandings(league, TEAMS_BY_ID, "final"), [league]);
```

with:

```tsx
  const teamsById = useMemo(() => indexTeams(teams), [teams]);
  const projected = useMemo(() => computeStandings(league, teamsById, "projected"), [league, teamsById]);
  const final = useMemo(() => computeStandings(league, teamsById, "final"), [league, teamsById]);
```

- [ ] **Step 6: Pass teams into the draft components**

In `src/components/draft/ManagerPicks.tsx`, replace:

```tsx
import { TEAMS_BY_ID } from "@/data/teams";
```

with:

```tsx

```

In `src/components/draft/ManagerPicks.tsx`, replace:

```tsx
import { findManager, managerLabel } from "@/lib/league/managers";
```

with:

```tsx
import { findManager, managerLabel } from "@/lib/league/managers";
import type { TeamLookup } from "@/lib/standings";
```

In `src/components/draft/ManagerPicks.tsx`, replace:

```tsx
export function ManagerPicks({ league, managerId, isViewer }: { league: League; managerId: string; isViewer: boolean }) {
```

with:

```tsx
export function ManagerPicks({
  league,
  teams,
  managerId,
  isViewer,
}: {
  league: League;
  teams: TeamLookup;
  managerId: string;
  isViewer: boolean;
}) {
```

In `src/components/draft/ManagerPicks.tsx`, replace:

```tsx
            const team = TEAMS_BY_ID[pick.teamId];
```

with:

```tsx
            const team = teams[pick.teamId];
```

In `src/components/draft/SelectionBar.tsx`, replace:

```tsx
import { TEAMS_BY_ID } from "@/data/teams";
```

with:

```tsx

```

In `src/components/draft/SelectionBar.tsx`, replace:

```tsx
import { formatNumber } from "@/lib/format";
```

with:

```tsx
import { formatNumber } from "@/lib/format";
import type { TeamLookup } from "@/lib/standings";
```

In `src/components/draft/SelectionBar.tsx`, replace:

```tsx
export function SelectionBar({
  selection,
```

with:

```tsx
export function SelectionBar({
  teams,
  selection,
```

In `src/components/draft/SelectionBar.tsx`, replace:

```tsx
}: {
  selection: SideRef | null;
```

with:

```tsx
}: {
  teams: TeamLookup;
  selection: SideRef | null;
```

In `src/components/draft/SelectionBar.tsx`, replace:

```tsx
  const team = TEAMS_BY_ID[selection.teamId];
```

with:

```tsx
  const team = teams[selection.teamId];
```

In `src/components/draft/SelectionPreview.tsx`, replace:

```tsx
import { TEAMS_BY_ID } from "@/data/teams";
```

with:

```tsx

```

In `src/components/draft/SelectionPreview.tsx`, replace:

```tsx
import type { TurnSummary } from "@/lib/league/turn";
```

with:

```tsx
import type { TurnSummary } from "@/lib/league/turn";
import type { TeamLookup } from "@/lib/standings";
```

In `src/components/draft/SelectionPreview.tsx`, replace:

```tsx
export function SelectionPreview({
  league,
  selection,
```

with:

```tsx
export function SelectionPreview({
  league,
  teams,
  selection,
```

In `src/components/draft/SelectionPreview.tsx`, replace:

```tsx
}: {
  league: League;
  selection: SideRef | null;
```

with:

```tsx
}: {
  league: League;
  teams: TeamLookup;
  selection: SideRef | null;
```

In `src/components/draft/SelectionPreview.tsx`, replace:

```tsx
  const team = TEAMS_BY_ID[selection.teamId];
```

with:

```tsx
  const team = teams[selection.teamId];
```

In `src/components/draft/DraftBoard.tsx`, replace:

```tsx
import { TEAMS_BY_ID } from "@/data/teams";
```

with:

```tsx

```

In `src/components/draft/DraftBoard.tsx`, replace:

```tsx
import { findManager, managerLabel } from "@/lib/league/managers";
```

with:

```tsx
import { findManager, managerLabel } from "@/lib/league/managers";
import type { TeamLookup } from "@/lib/standings";
```

In `src/components/draft/DraftBoard.tsx`, replace:

```tsx
import type { DraftPick, DraftStatus, League } from "@/lib/types";
```

with:

```tsx
import type { DraftPick, DraftStatus, League, Team } from "@/lib/types";
```

In `src/components/draft/DraftBoard.tsx`, replace:

```tsx
export function DraftBoard({ league }: { league: League }) {
```

with:

```tsx
export function DraftBoard({ league, teams }: { league: League; teams: TeamLookup }) {
```

In `src/components/draft/DraftBoard.tsx`, replace:

```tsx
                const pickNumber = pickNumberFor(round, seat, seatCount);
                return (
                  <BoardCell
                    key={manager.id}
                    pickNumber={pickNumber}
                    pick={picksByNumber.get(pickNumber)}
```

with:

```tsx
                const pickNumber = pickNumberFor(round, seat, seatCount);
                const pick = picksByNumber.get(pickNumber);
                return (
                  <BoardCell
                    key={manager.id}
                    pickNumber={pickNumber}
                    pick={pick}
                    team={pick ? teams[pick.teamId] : undefined}
```

In `src/components/draft/DraftBoard.tsx`, replace:

```tsx
function BoardCell({
  pickNumber,
  pick,
  state,
  status,
}: {
  pickNumber: number;
  pick: DraftPick | undefined;
```

with:

```tsx
function BoardCell({
  pickNumber,
  pick,
  team,
  state,
  status,
}: {
  pickNumber: number;
  pick: DraftPick | undefined;
  team: Team | undefined;
```

In `src/components/draft/DraftBoard.tsx`, replace:

```tsx
  if (pick) {
    const team = TEAMS_BY_ID[pick.teamId];
    return (
```

with:

```tsx
  if (pick && team) {
    return (
```

In `src/components/draft/AvailablePicks.tsx`, replace:

```tsx
import { TEAMS, TOTAL_SIDES } from "@/data/teams";
```

with:

```tsx
import { TOTAL_SIDES } from "@/data/teams";
```

In `src/components/draft/AvailablePicks.tsx`, replace:

```tsx
export function AvailablePicks({
  draft,
```

with:

```tsx
export function AvailablePicks({
  teams: allTeams,
  draft,
```

In `src/components/draft/AvailablePicks.tsx`, replace:

```tsx
}: {
  draft: DraftState;
```

with:

```tsx
}: {
  teams: Team[];
  draft: DraftState;
```

In `src/components/draft/AvailablePicks.tsx`, replace:

```tsx
  const teams = filterTeams(TEAMS, draft, filters);
```

with:

```tsx
  const teams = filterTeams(allTeams, draft, filters);
```

In `src/components/draft/AvailablePicks.tsx`, replace:

```tsx
        {availableSideCount(draft, TEAMS.length)} of {TOTAL_SIDES} sides available
```

with:

```tsx
        {availableSideCount(draft, allTeams.length)} of {TOTAL_SIDES} sides available
```

- [ ] **Step 7: Wire teams through the draft room**

In `src/components/draft/DraftRoom.tsx`, replace:

```tsx
import { Info } from "lucide-react";
import { useState } from "react";
```

with:

```tsx
import { Info } from "lucide-react";
import { useMemo, useState } from "react";
```

In `src/components/draft/DraftRoom.tsx`, replace:

```tsx
import { TEAMS_BY_ID } from "@/data/teams";
```

with:

```tsx

```

In `src/components/draft/DraftRoom.tsx`, replace:

```tsx
import { describeTurn } from "@/lib/league/turn";
```

with:

```tsx
import { describeTurn } from "@/lib/league/turn";
import { indexTeams } from "@/lib/lines";
```

In `src/components/draft/DraftRoom.tsx`, replace:

```tsx
  const { draft } = league;
  const [selection
```

with:

```tsx
  const { draft } = league;
  const teamsById = useMemo(() => indexTeams(view.teams), [view.teams]);
  const [selection
```

In `src/components/draft/DraftRoom.tsx`, replace:

```tsx
${TEAMS_BY_ID[selection.teamId].name}
```

with:

```tsx
${teamsById[selection.teamId].name}
```

In `src/components/draft/DraftRoom.tsx`, replace:

```tsx
      <DraftBoard league={league} />
```

with:

```tsx
      <DraftBoard league={league} teams={teamsById} />
```

In `src/components/draft/DraftRoom.tsx`, replace:

```tsx
        <AvailablePicks
          draft={draft}
```

with:

```tsx
        <AvailablePicks
          teams={view.teams}
          draft={draft}
```

In `src/components/draft/DraftRoom.tsx`, replace:

```tsx
            <SelectionPreview
              league={league}
```

with:

```tsx
            <SelectionPreview
              league={league}
              teams={teamsById}
```

In `src/components/draft/DraftRoom.tsx`, replace:

```tsx
            <ManagerPicks league={league} managerId={focusManagerId} isViewer={focusManagerId === viewerId} />
```

with:

```tsx
            <ManagerPicks
              league={league}
              teams={teamsById}
              managerId={focusManagerId}
              isViewer={focusManagerId === viewerId}
            />
```

In `src/components/draft/DraftRoom.tsx`, replace:

```tsx
      <SelectionBar
        selection={activeSelection}
```

with:

```tsx
      <SelectionBar
        teams={teamsById}
        selection={activeSelection}
```

- [ ] **Step 8: Interim server changes (all deleted or rewritten in Task 5)**

The in-memory store keeps the app running until Task 5. It never freezes lines, so its views use the static lines.

In `src/lib/league/store.ts`, replace:

```ts
        fades: [],
      };
```

with:

```ts
        fades: [],
        lines: null,
      };
```

In `src/lib/league/store.test.ts`, replace:

```ts
  fades: [],
};
```

with:

```ts
  fades: [],
  lines: null,
};
```

In `src/server/viewer.ts`, replace:

```ts
import { cookies } from "next/headers";
```

with:

```ts
import { cookies } from "next/headers";
import { STATIC_LINES } from "@/data/static-lines";
import { TEAM_INFO } from "@/data/teams";
```

In `src/server/viewer.ts`, replace:

```ts
import { parseSeats, SEATS_COOKIE, serializeSeats, type SeatMap } from "@/lib/league/seats-cookie";
```

with:

```ts
import { parseSeats, SEATS_COOKIE, serializeSeats, type SeatMap } from "@/lib/league/seats-cookie";
import { withLines } from "@/lib/lines";
```

In `src/server/viewer.ts`, replace:

```ts
export async function toLeagueView(league: League): Promise<LeagueView> {
  return { league, viewerId: await getViewerId(league) };
}
```

with:

```ts
/** Interim until Task 5: the league's frozen lines, else the static lines. */
export async function toLeagueView(league: League): Promise<LeagueView> {
  return { league, viewerId: await getViewerId(league), teams: withLines(TEAM_INFO, league.lines ?? STATIC_LINES) };
}
```

In `src/app/api/leagues/[leagueId]/draft/route.ts`, replace:

```ts
import type { LeagueView } from "@/lib/types";
```

with:

```ts

```

In `src/app/api/leagues/[leagueId]/draft/route.ts`, replace:

```ts
  const view: LeagueView = { league: result.value, viewerId };
  return Response.json(view);
```

with:

```ts
  return Response.json(await toLeagueView(result.value));
```

Replace the whole of `src/app/l/[leagueId]/page.tsx` (interim):

```tsx
import { Suspense } from "react";
import { LeagueOverview } from "@/components/overview/LeagueOverview";
import { PageFallback } from "@/components/ui/PageFallback";
import { getLeagueOrNotFound } from "@/server/league";
import { toLeagueView } from "@/server/viewer";

export default function OverviewPage({ params }: PageProps<"/l/[leagueId]">) {
  return (
    <Suspense fallback={<PageFallback label="Loading league…" />}>
      <Overview params={params} />
    </Suspense>
  );
}

async function Overview({ params }: { params: PageProps<"/l/[leagueId]">["params"] }) {
  const { leagueId } = await params;
  const view = await toLeagueView(getLeagueOrNotFound(leagueId));
  return <LeagueOverview league={view.league} teams={view.teams} viewerId={view.viewerId} />;
}
```

- [ ] **Step 9: Verify**

Run:

```bash
grep -rn "@/data/teams" src/components src/app
```

Expected: one match, `src/components/draft/AvailablePicks.tsx` importing `TOTAL_SIDES`. Every component gets teams with lines from props.

Run:

```bash
npm test && npm run lint && npm run typecheck && npm run build
```

Expected: all pass.

Run `npm run dev`, open http://localhost:3000/l/demo and http://localhost:3000/l/demo/draft: the demo overview and draft room look exactly as before (same lines, standings and board).

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "refactor: move lines into a LineSet and pass teams with lines through views" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Draft rules, seat permissions, league commands, and token and link primitives

**Files:**
- Modify: `src/lib/draft.ts`, `src/lib/league/parse-action.ts`, `src/lib/league/permissions.ts`, `src/lib/league/errors.ts`, `src/server/http.ts`
- Create: `src/lib/league/commands.ts`, `src/config/access.ts`, `src/lib/access/tokens.ts`, `src/lib/access/links.ts`
- Modify: `src/components/draft/DraftRoom.tsx`, `src/components/draft/AvailablePicks.tsx`, `src/components/draft/SideButton.tsx`
- Delete: `src/lib/league/store.test.ts` (superseded by `commands.test.ts`; `store.ts` itself goes in Task 5)
- Test: `src/lib/draft.test.ts`, `src/lib/league/parse-action.test.ts`, `src/lib/league/permissions.test.ts`, `src/lib/league/commands.test.ts`, `src/lib/access/tokens.test.ts`, `src/lib/access/links.test.ts`

**Interfaces:**
- Consumes: `isCompleteLineSet`, `LineSet` (Task 2).
- Produces (src/lib/draft.ts): `DraftAction` confirm is `{ type: "confirm"; teamId; side; pickNumber: number }`; `DraftError` adds `"stale_pick" | "team_already_held"`; `holdsTeam(state, managerId, teamId): boolean`.
- Produces (src/lib/league/errors.ts): `DomainError`, `ApiError = DomainError | "invalid_request"`, `Result<T> = { ok: true; value: T } | { ok: false; error: DomainError }`, `succeed(value)`, `fail(error)`, `ERROR_MESSAGES`.
- Produces (src/lib/league/permissions.ts): `canManageSeats(league, actorId)`, `canResetSeat(league, actorId, targetId)`.
- Produces (src/lib/league/commands.ts): `normalizeName`, `randomLeagueId`, `createLeague(input, id): Result<League>`, `decideDraftAction(league, actorId, action, teamIds, lines: LineSet | null): Result<League>`, `decideClaim(league, link: { kind; managerId }, browserSeatId, input: ClaimInput): Result<Claim>` (`Claim { league; managerId; changed }`), `decideInviteChange(league, actorId): Result<null>`, `decideSeatReset(league, actorId, targetId): Result<null>`, `decideOwnLinkReset(league, actorId): Result<string>`.
- Produces (src/lib/access/tokens.ts): `createSessionToken`, `isSessionToken`, `hashSessionToken(token): Promise<string>` (hex), `createLinkId`, `signLinkId(linkId, secret): Promise<string>` (`{id}.{sig}`), `verifyLinkToken(token, secret): Promise<string | null>`.
- Produces (src/lib/access/links.ts): `LinkKind` (`league_invite` | `seat_invite` | `personal`), `LinkRecord`, `linkStatus(link, now)`, `linkPath(token)` (`/i/{token}`), `LeagueAccess { invitePath; seatInvitePaths; personalPath }`, `NO_ACCESS`.
- Produces (src/config/access.ts): `ACCESS { sessionIdleDays: 90, sessionRenewHours: 24, cookieMaxAgeDays: 400, seatInviteDays: 7 }`.
- Produces (src/server/http.ts): `errorResponse`, `resultResponse(result)`, `readJsonBody`, `isSameOrigin(request)`.

- [ ] **Step 1: Write the failing draft-rule tests**

Every confirm now names the pick it is making. A test helper builds confirms for the pick on the clock, so the existing cases keep their meaning; new cases cover `stale_pick` and one side per team.

Replace the whole of `src/lib/draft.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  applyDraftAction,
  createDraftState,
  currentPickNumber,
  findPickForSide,
  holdsTeam,
  managerOnTheClock,
  managerUpNext,
  pickNumberFor,
  picksForManager,
  roundOf,
  seatForPick,
  totalPicks,
  type DraftAction,
} from "@/lib/draft";
import type { DraftState, Side } from "@/lib/types";

const SEATS = ["m1", "m2", "m3", "m4"];
const TEAM_IDS = new Set(["MIN", "OKC", "BOS", "CLE"]);

function mustApply(state: DraftState, action: DraftAction, teamIds: ReadonlySet<string> = TEAM_IDS): DraftState {
  const result = applyDraftAction(state, action, teamIds);
  if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
  return result.state;
}

/** A confirm for the pick that is on the clock now. */
function pick(state: DraftState, teamId: string, side: Side): DraftAction {
  return { type: "confirm", teamId, side, pickNumber: state.picks.length + 1 };
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
    for (let pickNumber = 1; pickNumber <= 44; pickNumber++) counts[seatForPick(pickNumber, 4)]++;
    expect(counts).toEqual([11, 11, 11, 11]);
  });

  it("ends round 11 with the last seat", () => {
    expect(roundOf(44, 4)).toBe(11);
    expect(seatForPick(44, 4)).toBe(3);
  });

  it("pickNumberFor inverts seatForPick", () => {
    for (let pickNumber = 1; pickNumber <= 44; pickNumber++) {
      expect(pickNumberFor(roundOf(pickNumber, 4), seatForPick(pickNumber, 4), 4)).toBe(pickNumber);
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
    const live = liveDraft();
    const state = mustApply(live, pick(live, "MIN", "OVER"));
    expect(state.picks).toEqual([{ pickNumber: 1, managerId: "m1", teamId: "MIN", side: "OVER" }]);
    expect(currentPickNumber(state)).toBe(2);
    expect(managerOnTheClock(state)).toBe("m2");
    expect(managerUpNext(state)).toBe("m3");
  });

  it("keeps the other side of a drafted team available to other managers", () => {
    let state = liveDraft();
    state = mustApply(state, pick(state, "MIN", "OVER"));
    state = mustApply(state, pick(state, "MIN", "UNDER"));
    expect(state.picks[1]).toEqual({ pickNumber: 2, managerId: "m2", teamId: "MIN", side: "UNDER" });
    expect(findPickForSide(state, "MIN", "UNDER")?.managerId).toBe("m2");
  });

  it("rejects a side that is already drafted", () => {
    const live = liveDraft();
    const state = mustApply(live, pick(live, "MIN", "OVER"));
    expect(applyDraftAction(state, pick(state, "MIN", "OVER"), TEAM_IDS)).toEqual({ ok: false, error: "side_taken" });
  });

  it("never lets a manager hold both sides of a team", () => {
    // m4 takes CLE OVER at pick 4, then is on the clock again at pick 5.
    let state = liveDraft();
    for (const [teamId, side] of [["MIN", "OVER"], ["OKC", "OVER"], ["BOS", "OVER"], ["CLE", "OVER"]] as const) {
      state = mustApply(state, pick(state, teamId, side));
    }
    expect(managerOnTheClock(state)).toBe("m4");
    expect(holdsTeam(state, "m4", "CLE")).toBe(true);
    expect(holdsTeam(state, "m4", "MIN")).toBe(false);
    expect(applyDraftAction(state, pick(state, "CLE", "UNDER"), TEAM_IDS)).toEqual({
      ok: false,
      error: "team_already_held",
    });
    expect(mustApply(state, pick(state, "MIN", "UNDER")).picks[4].managerId).toBe("m4");
  });

  it("rejects a confirm for any pick other than the one on the clock", () => {
    const live = liveDraft();
    const state = mustApply(live, pick(live, "MIN", "OVER"));
    // A double click resends pick 1; a screen from the future sends pick 3.
    for (const pickNumber of [1, 3]) {
      expect(applyDraftAction(state, { type: "confirm", teamId: "OKC", side: "OVER", pickNumber }, TEAM_IDS)).toEqual({
        ok: false,
        error: "stale_pick",
      });
    }
  });

  it("rejects unknown teams", () => {
    const live = liveDraft();
    expect(applyDraftAction(live, pick(live, "XXX", "OVER"), TEAM_IDS)).toEqual({ ok: false, error: "unknown_team" });
  });

  it("blocks picks unless the draft is live", () => {
    const notStarted = createDraftState(SEATS, 11);
    expect(applyDraftAction(notStarted, pick(notStarted, "MIN", "OVER"), TEAM_IDS)).toEqual({
      ok: false,
      error: "not_live",
    });
    const paused = mustApply(liveDraft(), { type: "pause" });
    expect(applyDraftAction(paused, pick(paused, "MIN", "OVER"), TEAM_IDS)).toEqual({ ok: false, error: "not_live" });
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
    const sides: Array<[string, Side]> = [
      ["MIN", "OVER"], ["OKC", "OVER"], ["BOS", "UNDER"], ["CLE", "OVER"], ["MIN", "UNDER"], ["OKC", "UNDER"],
    ];
    for (const [teamId, side] of sides) state = mustApply(state, pick(state, teamId, side));
    expect(state.picks.map((p) => p.managerId)).toEqual(["m1", "m2", "m3", "m4", "m4", "m3"]);
    expect(managerOnTheClock(state)).toBe("m2");
    expect(picksForManager(state, "m4").map((p) => p.pickNumber)).toEqual([4, 5]);
  });

  it("completes after the final pick", () => {
    let state = liveDraft(["m1", "m2"], 2);
    const sides: Array<[string, Side]> = [
      ["MIN", "OVER"], ["MIN", "UNDER"], ["OKC", "OVER"], ["OKC", "UNDER"],
    ];
    for (const [teamId, side] of sides) state = mustApply(state, pick(state, teamId, side));
    expect(state.status).toBe("complete");
    expect(currentPickNumber(state)).toBeNull();
    expect(managerOnTheClock(state)).toBeNull();
    expect(managerUpNext(state)).toBeNull();
    expect(applyDraftAction(state, pick(state, "BOS", "OVER"), TEAM_IDS)).toEqual({ ok: false, error: "not_live" });
  });
});
```

Run:

```bash
npx vitest run src/lib/draft.test.ts
```

Expected: FAIL: `holdsTeam` is not a function, and the stale-pick cases fail.

- [ ] **Step 2: Implement the draft rules**

In `src/lib/draft.ts`, replace:

```ts
export function picksForManager(state: DraftState, managerId: string): DraftPick[] {
  return state.picks.filter((pick) => pick.managerId === managerId);
}
```

with:

```ts
export function picksForManager(state: DraftState, managerId: string): DraftPick[] {
  return state.picks.filter((pick) => pick.managerId === managerId);
}

/** True when the manager already holds a side of this team. A manager may hold at most one side per team. */
export function holdsTeam(state: DraftState, managerId: string, teamId: TeamId): boolean {
  return state.picks.some((pick) => pick.managerId === managerId && pick.teamId === teamId);
}
```

In `src/lib/draft.ts`, replace:

```ts
  | { type: "confirm"; teamId: TeamId; side: Side };

export type DraftError = "invalid_transition" | "not_live" | "side_taken" | "unknown_team";
```

with:

```ts
  /** pickNumber is the pick the client believes it is making; a stale screen or a double click fails with stale_pick. */
  | { type: "confirm"; teamId: TeamId; side: Side; pickNumber: number };

export type DraftError =
  | "invalid_transition"
  | "not_live"
  | "side_taken"
  | "unknown_team"
  | "stale_pick"
  | "team_already_held";
```

In `src/lib/draft.ts`, replace:

```ts
 * this only enforces draft rules: status transitions, side availability and snake order.
 */
```

with:

```ts
 * this only enforces draft rules: status transitions, the expected pick number, side availability, one side per team
 * per manager, and snake order.
 */
```

In `src/lib/draft.ts`, replace:

```ts
      if (state.status !== "live") return fail("not_live");
      if (!teamIds.has(action.teamId)) return fail("unknown_team");
      if (findPickForSide(state, action.teamId, action.side)) return fail("side_taken");
      const pickNumber = state.picks.length + 1;
      const managerId = managerForPick(state, pickNumber);
      if (managerId === null) return fail("not_live");
```

with:

```ts
      if (state.status !== "live") return fail("not_live");
      const pickNumber = state.picks.length + 1;
      if (action.pickNumber !== pickNumber) return fail("stale_pick");
      if (!teamIds.has(action.teamId)) return fail("unknown_team");
      if (findPickForSide(state, action.teamId, action.side)) return fail("side_taken");
      const managerId = managerForPick(state, pickNumber);
      if (managerId === null) return fail("not_live");
      if (holdsTeam(state, managerId, action.teamId)) return fail("team_already_held");
```

Run:

```bash
npx vitest run src/lib/draft.test.ts
```

Expected: PASS, 15 tests.

- [ ] **Step 3: Require a pick number when parsing a confirm**

Replace the whole of `src/lib/league/parse-action.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseDraftAction } from "@/lib/league/parse-action";

describe("parseDraftAction", () => {
  it("accepts control actions", () => {
    expect(parseDraftAction({ type: "start" })).toEqual({ type: "start" });
    expect(parseDraftAction({ type: "pause" })).toEqual({ type: "pause" });
    expect(parseDraftAction({ type: "resume" })).toEqual({ type: "resume" });
  });

  it("accepts a confirm with a team, side and pick number, dropping extra fields", () => {
    expect(parseDraftAction({ type: "confirm", teamId: "MIN", side: "OVER", pickNumber: 3, extra: 1 })).toEqual({
      type: "confirm",
      teamId: "MIN",
      side: "OVER",
      pickNumber: 3,
    });
  });

  it("rejects anything else", () => {
    expect(parseDraftAction(null)).toBeNull();
    expect(parseDraftAction("start")).toBeNull();
    expect(parseDraftAction({ type: "confirm", teamId: "MIN", side: "SIDEWAYS", pickNumber: 1 })).toBeNull();
    expect(parseDraftAction({ type: "confirm", side: "OVER", pickNumber: 1 })).toBeNull();
    expect(parseDraftAction({ type: "delete" })).toBeNull();
  });

  it("requires a positive whole pick number on a confirm", () => {
    for (const pickNumber of [undefined, 0, -1, 1.5, "1", Number.NaN]) {
      expect(parseDraftAction({ type: "confirm", teamId: "MIN", side: "OVER", pickNumber })).toBeNull();
    }
  });
});
```

Run:

```bash
npx vitest run src/lib/league/parse-action.test.ts
```

Expected: FAIL: the confirm case loses `pickNumber`.

In `src/lib/league/parse-action.ts`, replace:

```ts
  const { type, teamId, side } = input as Record<string, unknown>;
  if (type === "start" || type === "pause" || type === "resume") return { type };
  if (type === "confirm" && typeof teamId === "string" && (side === "OVER" || side === "UNDER")) {
    return { type, teamId, side };
  }
```

with:

```ts
  const { type, teamId, side, pickNumber } = input as Record<string, unknown>;
  if (type === "start" || type === "pause" || type === "resume") return { type };
  if (
    type === "confirm" &&
    typeof teamId === "string" &&
    (side === "OVER" || side === "UNDER") &&
    typeof pickNumber === "number" &&
    Number.isInteger(pickNumber) &&
    pickNumber > 0
  ) {
    return { type, teamId, side, pickNumber };
  }
```

Run:

```bash
npx vitest run src/lib/league/parse-action.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 4: Add seat permissions**

Replace the whole of `src/lib/league/permissions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { canControlDraft, canManageSeats, canPickNow, canResetSeat, type DraftAccess } from "@/lib/league/permissions";
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

describe("canManageSeats", () => {
  it("allows only the commissioner, never in the demo league", () => {
    expect(canManageSeats(league("not_started"), "m1")).toBe(true);
    expect(canManageSeats(league("not_started"), "m2")).toBe(false);
    expect(canManageSeats(league("not_started"), null)).toBe(false);
    expect(canManageSeats(league("not_started", 0, true), "m1")).toBe(false);
  });
});

describe("canResetSeat", () => {
  it("lets the commissioner reset another claimed seat", () => {
    expect(canResetSeat(league("live"), "m1", "m2")).toBe(true);
  });

  it("refuses open seats, unknown seats, their own seat and everyone else", () => {
    expect(canResetSeat(league("live"), "m1", "m3")).toBe(false); // open
    expect(canResetSeat(league("live"), "m1", "m9")).toBe(false);
    expect(canResetSeat(league("live"), "m1", "m1")).toBe(false);
    expect(canResetSeat(league("live"), "m2", "m1")).toBe(false);
    expect(canResetSeat(league("live", 0, true), "m1", "m2")).toBe(false);
  });
});
```

Run:

```bash
npx vitest run src/lib/league/permissions.test.ts
```

Expected: FAIL: `canManageSeats` is not a function.

Replace the whole of `src/lib/league/permissions.ts`:

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

/** Invite links and seat resets belong to the commissioner. The demo league is read-only. */
export function canManageSeats(league: Pick<League, "isDemo" | "commissionerId">, actorId: string | null): boolean {
  return !league.isDemo && actorId !== null && actorId === league.commissionerId;
}

/** The commissioner may reset any claimed seat except their own. */
export function canResetSeat(
  league: Pick<League, "isDemo" | "commissionerId" | "managers">,
  actorId: string | null,
  targetId: string,
): boolean {
  if (!canManageSeats(league, actorId) || targetId === actorId) return false;
  const target = league.managers.find((manager) => manager.id === targetId);
  return target !== undefined && target.displayName !== null;
}
```

Run:

```bash
npx vitest run src/lib/league/permissions.test.ts
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Replace the error list and the HTTP helpers**

`errors.ts` no longer depends on the store: `DomainError` lists every failure, and `Result` is the shared return type of commands and database actions. `http.ts` maps the new errors to statuses and gains `resultResponse` and `isSameOrigin`, used from Task 5 on.

Replace the whole of `src/lib/league/errors.ts`:

```ts
import type { DraftError } from "@/lib/draft";

/** Every way a league action can fail. Route handlers map these to HTTP statuses in src/server/http.ts. */
export type DomainError =
  | "not_found"
  | "forbidden"
  | "invalid_name"
  | "invalid_league_name"
  | "seat_taken"
  | "already_joined"
  | "demo_league"
  | "invalid_link"
  | "lines_unavailable"
  | DraftError;

export type ApiError = DomainError | "invalid_request";

export type Result<T> = { ok: true; value: T } | { ok: false; error: DomainError };

export function succeed<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function fail<T>(error: DomainError): Result<T> {
  return { ok: false, error };
}

export const ERROR_MESSAGES: Record<ApiError, string> = {
  not_found: "That league or seat doesn't exist.",
  forbidden: "You can't do that right now.",
  invalid_name: "Enter your name (1–24 characters).",
  invalid_league_name: "League names can be up to 32 characters.",
  seat_taken: "That seat was just claimed. Pick another.",
  already_joined: "You already have a seat in this league.",
  demo_league: "The demo league is read-only.",
  invalid_link: "This link no longer works. Ask your commissioner for a new one.",
  lines_unavailable: "Lines aren't available right now. Try again in a minute.",
  not_live: "The draft isn't live.",
  side_taken: "That side was just drafted.",
  unknown_team: "Unknown team.",
  invalid_transition: "The draft can't do that from its current state.",
  stale_pick: "The draft moved on. Check the board and pick again.",
  team_already_held: "A manager can't hold both sides of a team.",
  invalid_request: "Invalid request.",
};
```

Replace the whole of `src/server/http.ts`:

```ts
import "server-only";
import { ERROR_MESSAGES, type ApiError, type Result } from "@/lib/league/errors";

const STATUS: Record<ApiError, number> = {
  not_found: 404,
  invalid_link: 404,
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
  stale_pick: 409,
  team_already_held: 409,
  lines_unavailable: 503,
};

export function errorResponse(error: ApiError): Response {
  return Response.json({ error, message: ERROR_MESSAGES[error] }, { status: STATUS[error] });
}

/** `{ ok: true }` or the error, for mutations whose pages re-render instead of reading a response body. */
export function resultResponse(result: Result<unknown>): Response {
  return result.ok ? Response.json({ ok: true }) : errorResponse(result.error);
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Mutations must come from this site's own pages. Backs up SameSite=Lax cookies and JSON-only bodies. */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(request.url).origin;
}
```

- [ ] **Step 6: Write the failing command tests**

These replace the in-memory store tests (same cases, plus line freezing, stale picks, one side per team, seat-invite re-claims, personal links and seat administration).

Create `src/lib/league/commands.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { DraftAction } from "@/lib/draft";
import {
  createLeague,
  decideClaim,
  decideDraftAction,
  decideInviteChange,
  decideOwnLinkReset,
  decideSeatReset,
  type ClaimInput,
} from "@/lib/league/commands";
import type { Result } from "@/lib/league/errors";
import type { League, LineSet, Side } from "@/lib/types";

const TEAM_IDS = new Set(["MIN", "OKC", "BOS"]);
const LINES: LineSet = { source: "test", asOf: "2026-10-01T00:00:00.000Z", values: { MIN: 49.5, OKC: 62.5, BOS: 41.5 } };
const LEAGUE_INVITE = { kind: "league_invite" as const, managerId: null };

function must<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
  return result.value;
}

function newLeague(): League {
  return must(createLeague({ leagueName: "  Hoop   Dreams ", displayName: " Ana " }, "abc123"));
}

function join(league: League, managerId: string, displayName: string): League {
  return must(decideClaim(league, LEAGUE_INVITE, null, { managerId, displayName })).league;
}

function act(league: League, actorId: string | null, action: DraftAction): Result<League> {
  return decideDraftAction(league, actorId, action, TEAM_IDS, LINES);
}

function pick(league: League, teamId: string, side: Side): DraftAction {
  return { type: "confirm", teamId, side, pickNumber: league.draft.picks.length + 1 };
}

describe("createLeague", () => {
  it("creates a fresh 4-seat, 11-round league with the creator as commissioner in seat 1", () => {
    const league = newLeague();
    expect(league).toMatchObject({
      id: "abc123",
      name: "Hoop Dreams",
      isDemo: false,
      commissionerId: "m1",
      version: 1,
      fades: [],
      lines: null,
      draft: { status: "not_started", rounds: 11, seatOrder: ["m1", "m2", "m3", "m4"], picks: [] },
    });
    expect(league.managers.map((m) => m.displayName)).toEqual(["Ana", null, null, null]);
  });

  it("defaults the league name and validates names", () => {
    expect(must(createLeague({ displayName: "Ana" }, "x")).name).toBe("My League");
    expect(createLeague({ displayName: "   " }, "x")).toEqual({ ok: false, error: "invalid_name" });
    expect(createLeague({ displayName: "x".repeat(25) }, "x")).toEqual({ ok: false, error: "invalid_name" });
    expect(createLeague({ displayName: "Ana", leagueName: "x".repeat(33) }, "x")).toEqual({
      ok: false,
      error: "invalid_league_name",
    });
  });
});

describe("decideClaim", () => {
  it("claims an open seat from the league invite", () => {
    const claim = must(decideClaim(newLeague(), LEAGUE_INVITE, null, { managerId: "m3", displayName: " Cal " }));
    expect(claim.managerId).toBe("m3");
    expect(claim.changed).toBe(true);
    expect(claim.league.managers[2].displayName).toBe("Cal");
  });

  it("rejects taken seats, a second seat, unknown seats, bad names and the demo league", () => {
    const league = newLeague();
    const claim = (input: ClaimInput, browserSeatId: string | null = null) =>
      decideClaim(league, LEAGUE_INVITE, browserSeatId, input);
    expect(claim({ managerId: "m1", displayName: "Cal" })).toEqual({ ok: false, error: "seat_taken" });
    expect(claim({ managerId: "m2", displayName: "Cal" }, "m1")).toEqual({ ok: false, error: "already_joined" });
    expect(claim({ managerId: "m9", displayName: "Cal" })).toEqual({ ok: false, error: "not_found" });
    expect(claim({ displayName: "Cal" })).toEqual({ ok: false, error: "not_found" });
    expect(claim({ managerId: "m2", displayName: "" })).toEqual({ ok: false, error: "invalid_name" });
    expect(decideClaim({ ...league, isDemo: true }, LEAGUE_INVITE, null, { managerId: "m2", displayName: "Cal" })).toEqual({
      ok: false,
      error: "demo_league",
    });
  });

  it("re-claims a reset seat from its seat invite without an open-seat check, keeping its picks", () => {
    let league = join(newLeague(), "m2", "Ben");
    league = must(act(league, "m1", { type: "start" }));
    league = must(act(league, "m1", pick(league, "MIN", "OVER")));
    league = must(act(league, "m2", pick(league, "OKC", "OVER")));
    const seatInvite = { kind: "seat_invite" as const, managerId: "m2" };
    const claim = must(decideClaim(league, seatInvite, null, { managerId: "m4", displayName: "Benny" }));
    expect(claim.managerId).toBe("m2"); // the link's seat wins over a submitted managerId
    expect(claim.league.managers[1].displayName).toBe("Benny");
    expect(claim.league.draft.picks).toEqual(league.draft.picks);
    expect(decideClaim(league, seatInvite, "m3", { displayName: "Ben" })).toEqual({ ok: false, error: "already_joined" });
    expect(decideClaim(league, seatInvite, null, { displayName: " " })).toEqual({ ok: false, error: "invalid_name" });
  });

  it("signs a browser in with a personal link without changing the league", () => {
    const league = join(newLeague(), "m2", "Ben");
    const claim = must(decideClaim(league, { kind: "personal", managerId: "m2" }, "m4", {}));
    expect(claim).toEqual({ league, managerId: "m2", changed: false });
  });
});

describe("decideDraftAction", () => {
  it("lets only the commissioner start, pause and resume", () => {
    let league = join(newLeague(), "m2", "Ben");
    expect(act(league, "m2", { type: "start" })).toEqual({ ok: false, error: "forbidden" });
    expect(act(league, null, { type: "start" })).toEqual({ ok: false, error: "forbidden" });
    league = must(act(league, "m1", { type: "start" }));
    expect(league.draft.status).toBe("live");
    league = must(act(league, "m1", { type: "pause" }));
    expect(league.draft.status).toBe("paused");
    expect(act(league, "m1", pick(league, "MIN", "OVER"))).toEqual({ ok: false, error: "not_live" });
  });

  it("freezes complete lines into the league when the draft starts", () => {
    const league = newLeague();
    expect(must(act(league, "m1", { type: "start" })).lines).toBe(LINES);
    const missing = { ...LINES, values: { MIN: 49.5, OKC: 62.5 } };
    for (const lines of [null, missing]) {
      expect(decideDraftAction(league, "m1", { type: "start" }, TEAM_IDS, lines)).toEqual({
        ok: false,
        error: "lines_unavailable",
      });
    }
  });

  it("keeps the frozen lines on later actions", () => {
    let league = must(act(newLeague(), "m1", { type: "start" }));
    league = must(decideDraftAction(league, "m1", { type: "pause" }, TEAM_IDS, null));
    expect(league.lines).toBe(LINES);
  });

  it("enforces turns, open-seat picking, side availability and one side per team", () => {
    let league = must(act(join(newLeague(), "m2", "Ben"), "m1", { type: "start" }));
    expect(act(league, "m2", pick(league, "MIN", "OVER"))).toEqual({ ok: false, error: "forbidden" });
    league = must(act(league, "m1", pick(league, "MIN", "OVER")));
    expect(act(league, "m2", pick(league, "MIN", "OVER"))).toEqual({ ok: false, error: "side_taken" });
    league = must(act(league, "m2", pick(league, "MIN", "UNDER")));

    // Picks 3 and 4 belong to open seats m3 and m4: the commissioner picks for them.
    league = must(act(league, "m1", pick(league, "OKC", "OVER")));
    expect(league.draft.picks[2]).toEqual({ pickNumber: 3, managerId: "m3", teamId: "OKC", side: "OVER" });
    league = must(act(league, "m1", pick(league, "BOS", "OVER")));
    // Pick 5 is m4 again (snake). m4 already holds BOS, so BOS UNDER is off limits for it.
    expect(act(league, "m1", pick(league, "BOS", "UNDER"))).toEqual({ ok: false, error: "team_already_held" });
  });

  it("reports a stale pick before checking whose turn it is", () => {
    let league = must(act(join(newLeague(), "m2", "Ben"), "m1", { type: "start" }));
    const first = pick(league, "MIN", "OVER");
    league = must(act(league, "m1", first));
    // A double click resends pick 1. It's m2's turn now, but the answer is stale_pick, not forbidden.
    expect(act(league, "m1", first)).toEqual({ ok: false, error: "stale_pick" });
  });

  it("hands a seat over when someone joins mid-draft", () => {
    let league = must(act(newLeague(), "m1", { type: "start" }));
    league = must(act(league, "m1", pick(league, "MIN", "OVER")));
    league = join(league, "m2", "Ben");
    expect(act(league, "m1", pick(league, "OKC", "OVER"))).toEqual({ ok: false, error: "forbidden" });
    expect(act(league, "m2", pick(league, "OKC", "OVER")).ok).toBe(true);
  });

  it("rejects the demo league and unknown teams", () => {
    const league = must(act(newLeague(), "m1", { type: "start" }));
    expect(act({ ...league, isDemo: true }, "m1", { type: "pause" })).toEqual({ ok: false, error: "demo_league" });
    expect(act(league, "m1", pick(league, "XXX", "OVER"))).toEqual({ ok: false, error: "unknown_team" });
  });
});

describe("seat administration", () => {
  const league = join(newLeague(), "m2", "Ben");

  it("lets only the commissioner change the league invite", () => {
    expect(decideInviteChange(league, "m1")).toEqual({ ok: true, value: null });
    expect(decideInviteChange(league, "m2")).toEqual({ ok: false, error: "forbidden" });
    expect(decideInviteChange({ ...league, isDemo: true }, "m1")).toEqual({ ok: false, error: "demo_league" });
  });

  it("lets the commissioner reset another claimed seat", () => {
    expect(decideSeatReset(league, "m1", "m2")).toEqual({ ok: true, value: null });
    expect(decideSeatReset(league, "m1", "m1")).toEqual({ ok: false, error: "forbidden" });
    expect(decideSeatReset(league, "m1", "m3")).toEqual({ ok: false, error: "forbidden" }); // open seat
    expect(decideSeatReset(league, "m1", "m9")).toEqual({ ok: false, error: "not_found" });
    expect(decideSeatReset(league, "m2", "m1")).toEqual({ ok: false, error: "forbidden" });
  });

  it("lets any seated manager reset their own link", () => {
    expect(decideOwnLinkReset(league, "m2")).toEqual({ ok: true, value: "m2" });
    expect(decideOwnLinkReset(league, null)).toEqual({ ok: false, error: "forbidden" });
  });
});
```

Delete:

```bash
git rm src/lib/league/store.test.ts
```

Run:

```bash
npx vitest run src/lib/league/commands.test.ts
```

Expected: FAIL: cannot resolve `@/lib/league/commands`.

- [ ] **Step 7: Implement the commands**

Each command is a pure decision made against the league as it stands under the lock (Task 4). A confirm checks `not_live`, then `stale_pick`, then permission, so a double click reports `stale_pick` rather than `forbidden`. A seat invite re-claims a seat that stays claimed: no open-seat check, picks kept, name updated.

Create `src/lib/league/commands.ts`:

```ts
import { LEAGUE_DEFAULTS, SEASON } from "@/config/league";
import type { LinkKind } from "@/lib/access/links";
import { applyDraftAction, createDraftState, currentPickNumber, type DraftAction } from "@/lib/draft";
import { fail, succeed, type Result } from "@/lib/league/errors";
import { findManager } from "@/lib/league/managers";
import { canControlDraft, canManageSeats, canPickNow, canResetSeat } from "@/lib/league/permissions";
import { isCompleteLineSet } from "@/lib/lines";
import type { League, LineSet, Manager, TeamId } from "@/lib/types";

// Pure decisions for every league mutation. src/db/actions.ts runs them inside a transaction that holds the league
// lock and persists what they return; nothing here does I/O.

export const DISPLAY_NAME_MAX = 24;
export const LEAGUE_NAME_MAX = 32;
export const DEFAULT_LEAGUE_NAME = "My League";

const LEAGUE_ID_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const LEAGUE_ID_LENGTH = 6;

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

/** A fresh 4-seat league with the creator in seat 1 as commissioner. */
export function createLeague(input: { leagueName?: unknown; displayName: unknown }, id: string): Result<League> {
  const name = normalizeName(input.displayName, DISPLAY_NAME_MAX);
  if (!name) return fail("invalid_name");
  const requested =
    typeof input.leagueName === "string" && input.leagueName.trim() !== "" ? input.leagueName : DEFAULT_LEAGUE_NAME;
  const title = normalizeName(requested, LEAGUE_NAME_MAX);
  if (!title) return fail("invalid_league_name");

  const seatOrder = Array.from({ length: LEAGUE_DEFAULTS.managerCount }, (_, seat) => `m${seat + 1}`);
  const managers: Manager[] = seatOrder.map((managerId, seat) => ({
    id: managerId,
    seat,
    displayName: seat === 0 ? name : null,
  }));
  return succeed({
    id,
    name: title,
    seasonLabel: SEASON.label,
    isDemo: false,
    commissionerId: seatOrder[0],
    version: 1,
    managers,
    draft: createDraftState(seatOrder, LEAGUE_DEFAULTS.rounds),
    fades: [],
    lines: null,
  });
}

/**
 * Start, pause and resume belong to the commissioner; a confirm belongs to the manager on the clock (or the
 * commissioner for an open seat) and must name the current pick. Start freezes `lines` into the league.
 */
export function decideDraftAction(
  league: League,
  actorId: string | null,
  action: DraftAction,
  teamIds: ReadonlySet<TeamId>,
  lines: LineSet | null,
): Result<League> {
  if (league.isDemo) return fail("demo_league");
  if (action.type === "confirm") {
    if (league.draft.status !== "live") return fail("not_live");
    if (action.pickNumber !== currentPickNumber(league.draft)) return fail("stale_pick");
    if (!canPickNow(league, actorId)) return fail("forbidden");
  } else if (!canControlDraft(league, actorId)) {
    return fail("forbidden");
  }
  const result = applyDraftAction(league.draft, action, teamIds);
  if (!result.ok) return fail(result.error);
  if (action.type !== "start") return succeed({ ...league, draft: result.state });
  if (!lines || !isCompleteLineSet(lines, teamIds)) return fail("lines_unavailable");
  return succeed({ ...league, draft: result.state, lines });
}

export interface ClaimInput {
  /** The open seat chosen on a league invite. Ignored for other links. */
  managerId?: unknown;
  displayName?: unknown;
}

export interface Claim {
  league: League;
  managerId: string;
  /** False when only this browser's seat binding changes (a personal link). */
  changed: boolean;
}

/**
 * Decides a claim of an active link. `browserSeatId` is the seat this browser already holds in the league.
 * - League invite: claims an open seat and names it.
 * - Seat invite: re-claims a reset seat, which stays claimed: no open-seat check, picks kept, name updated.
 * - Personal link: signs this browser in as the seat; the league doesn't change.
 */
export function decideClaim(
  league: League,
  link: { kind: LinkKind; managerId: string | null },
  browserSeatId: string | null,
  input: ClaimInput,
): Result<Claim> {
  if (league.isDemo) return fail("demo_league");
  if (link.kind === "league_invite") {
    if (browserSeatId !== null) return fail("already_joined");
    const seat = findManager(league.managers, typeof input.managerId === "string" ? input.managerId : null);
    if (!seat) return fail("not_found");
    if (seat.displayName !== null) return fail("seat_taken");
    return nameSeat(league, seat.id, input.displayName);
  }
  const seat = findManager(league.managers, link.managerId);
  if (!seat) return fail("not_found");
  if (link.kind === "personal") return succeed({ league, managerId: seat.id, changed: false });
  if (browserSeatId !== null && browserSeatId !== seat.id) return fail("already_joined");
  return nameSeat(league, seat.id, input.displayName);
}

function nameSeat(league: League, managerId: string, rawName: unknown): Result<Claim> {
  const name = normalizeName(rawName, DISPLAY_NAME_MAX);
  if (!name) return fail("invalid_name");
  const managers = league.managers.map((manager) =>
    manager.id === managerId ? { ...manager, displayName: name } : manager,
  );
  return succeed({ league: { ...league, managers }, managerId, changed: true });
}

/** Rotating or revoking the league invite. */
export function decideInviteChange(league: League, actorId: string | null): Result<null> {
  if (league.isDemo) return fail("demo_league");
  return canManageSeats(league, actorId) ? succeed(null) : fail("forbidden");
}

/** Resetting a claimed seat: its devices are signed out and a seat invite replaces its personal link. */
export function decideSeatReset(league: League, actorId: string | null, targetId: string): Result<null> {
  if (league.isDemo) return fail("demo_league");
  if (!canManageSeats(league, actorId)) return fail("forbidden");
  if (!findManager(league.managers, targetId)) return fail("not_found");
  return canResetSeat(league, actorId, targetId) ? succeed(null) : fail("forbidden");
}

/** Resetting your own personal link. Returns your manager id. */
export function decideOwnLinkReset(league: League, actorId: string | null): Result<string> {
  if (league.isDemo) return fail("demo_league");
  return actorId === null ? fail("forbidden") : succeed(actorId);
}
```

Run:

```bash
npx vitest run src/lib/league/commands.test.ts
```

Expected: PASS, 16 tests.

- [ ] **Step 8: Write the failing token and link tests**

Create `src/lib/access/tokens.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  base64url,
  createLinkId,
  createSessionToken,
  hashSessionToken,
  isSessionToken,
  signLinkId,
  verifyLinkToken,
} from "@/lib/access/tokens";

const SECRET = "test-link-secret-that-is-long-enough";

describe("session tokens", () => {
  it("are 32 random bytes in base64url", () => {
    const token = createSessionToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(isSessionToken(token)).toBe(true);
    expect(createSessionToken()).not.toBe(token);
  });

  it("rejects malformed cookie values", () => {
    expect(isSessionToken("")).toBe(false);
    expect(isSessionToken("abc")).toBe(false);
    expect(isSessionToken(`${createSessionToken()}=`)).toBe(false);
  });

  it("hash to a stable hex SHA-256", async () => {
    // SHA-256("abc"), a published test vector.
    await expect(hashSessionToken("abc")).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("link tokens", () => {
  it("round-trip a link id", async () => {
    const linkId = createLinkId();
    expect(linkId).toMatch(/^[A-Za-z0-9_-]{22}$/);
    const token = await signLinkId(linkId, SECRET);
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{22}$/);
    await expect(verifyLinkToken(token, SECRET)).resolves.toBe(linkId);
  });

  it("reject a tampered signature, a swapped id, another secret and garbage", async () => {
    const linkId = createLinkId();
    const token = await signLinkId(linkId, SECRET);
    const [, sig] = token.split(".");
    const flipped = `${linkId}.${sig[0] === "A" ? "B" : "A"}${sig.slice(1)}`;
    await expect(verifyLinkToken(flipped, SECRET)).resolves.toBeNull();
    await expect(verifyLinkToken(`${createLinkId()}.${sig}`, SECRET)).resolves.toBeNull();
    await expect(verifyLinkToken(token, "another-secret-that-is-long-enough!!")).resolves.toBeNull();
    await expect(verifyLinkToken("nope", SECRET)).resolves.toBeNull();
    await expect(verifyLinkToken(`${linkId}.`, SECRET)).resolves.toBeNull();
  });
});

describe("base64url", () => {
  it("uses the URL-safe alphabet without padding", () => {
    expect(base64url(new Uint8Array([251, 255, 191]))).toBe("-_-_");
    expect(base64url(new Uint8Array([1]))).toBe("AQ");
  });
});
```

Create `src/lib/access/links.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { linkPath, linkStatus } from "@/lib/access/links";

const NOW = new Date("2026-10-08T12:00:00.000Z");
const BEFORE = new Date("2026-10-08T11:00:00.000Z");
const AFTER = new Date("2026-10-08T13:00:00.000Z");
const FRESH = { expiresAt: null, usedAt: null, revokedAt: null };

describe("linkStatus", () => {
  it("is active until revoked, used or expired", () => {
    expect(linkStatus(FRESH, NOW)).toBe("active");
    expect(linkStatus({ ...FRESH, expiresAt: AFTER }, NOW)).toBe("active");
  });

  it("reports revoked, then used, then expired", () => {
    expect(linkStatus({ expiresAt: BEFORE, usedAt: BEFORE, revokedAt: BEFORE }, NOW)).toBe("revoked");
    expect(linkStatus({ expiresAt: BEFORE, usedAt: BEFORE, revokedAt: null }, NOW)).toBe("used");
    expect(linkStatus({ ...FRESH, expiresAt: BEFORE }, NOW)).toBe("expired");
    expect(linkStatus({ ...FRESH, expiresAt: NOW }, NOW)).toBe("expired");
  });
});

describe("linkPath", () => {
  it("opens the link page", () => {
    expect(linkPath("abc.def")).toBe("/i/abc.def");
  });
});
```

Run:

```bash
npx vitest run src/lib/access
```

Expected: FAIL: cannot resolve `@/lib/access/tokens` and `@/lib/access/links`.

- [ ] **Step 9: Implement tokens, link rules and the access config**

Session tokens are 32 random bytes; only their SHA-256 is stored. A link token is `{linkId}.{sig}` with an HMAC-SHA256 signature cut to 128 bits, so the database alone can't produce a working link while the app can show a link again from its id.

Create `src/config/access.ts`:

```ts
export const ACCESS = {
  /** A session expires this many days after it was last used. */
  sessionIdleDays: 90,
  /** A session's expiry is pushed back at most this often. */
  sessionRenewHours: 24,
  /** Cookie lifetime. Browsers cap it near 400 days; the server enforces the real expiry. */
  cookieMaxAgeDays: 400,
  /** A seat invite (issued by a seat reset) works for this many days. */
  seatInviteDays: 7,
} as const;
```

Create `src/lib/access/tokens.ts`:

```ts
// Session tokens and link tokens. Web Crypto only, so this stays plain TypeScript.

const SESSION_TOKEN_BYTES = 32;
const LINK_ID_BYTES = 16;
const LINK_SIGNATURE_BYTES = 16;

const SESSION_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const LINK_TOKEN = /^([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{22})$/;

const encoder = new TextEncoder();

export function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomBase64url(byteLength: number): string {
  return base64url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

/** The opaque value stored in the session cookie. */
export function createSessionToken(): string {
  return randomBase64url(SESSION_TOKEN_BYTES);
}

export function isSessionToken(value: string): boolean {
  return SESSION_TOKEN.test(value);
}

/** Hex SHA-256. The database stores this, never the token. */
export async function hashSessionToken(token: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(token)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Primary key of an access_links row. */
export function createLinkId(): string {
  return randomBase64url(LINK_ID_BYTES);
}

async function signature(linkId: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(linkId)));
  return base64url(mac.slice(0, LINK_SIGNATURE_BYTES));
}

/** `{linkId}.{sig}`: the database alone can't produce a working link, but the app can rebuild one from its id. */
export async function signLinkId(linkId: string, secret: string): Promise<string> {
  return `${linkId}.${await signature(linkId, secret)}`;
}

/** The link id when the token's signature is valid, otherwise null. Needs no database read. */
export async function verifyLinkToken(token: string, secret: string): Promise<string | null> {
  const match = LINK_TOKEN.exec(token);
  if (!match) return null;
  const [, linkId, given] = match;
  return constantTimeEqual(given, await signature(linkId, secret)) ? linkId : null;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}
```

Create `src/lib/access/links.ts`:

```ts
/** league_invite: shared, claims any open seat. seat_invite: single use, re-claims a reset seat. personal: signs in. */
export type LinkKind = "league_invite" | "seat_invite" | "personal";

export type LinkStatus = "active" | "revoked" | "used" | "expired";

export interface LinkRecord {
  id: string;
  leagueId: string;
  /** Null only for a league invite. */
  managerId: string | null;
  kind: LinkKind;
  expiresAt: Date | null;
  usedAt: Date | null;
  revokedAt: Date | null;
}

/** Whether a link still works at `now`. Callers inside a transaction pass the database clock. */
export function linkStatus(link: Pick<LinkRecord, "expiresAt" | "usedAt" | "revokedAt">, now: Date): LinkStatus {
  if (link.revokedAt) return "revoked";
  if (link.usedAt) return "used";
  if (link.expiresAt && link.expiresAt.getTime() <= now.getTime()) return "expired";
  return "active";
}

/** The app path a link token opens. */
export function linkPath(token: string): string {
  return `/i/${token}`;
}

/** The links a viewer may see in a league. Spectators see none. */
export interface LeagueAccess {
  /** Commissioner only. */
  invitePath: string | null;
  /** Commissioner only: managerId → path of that seat's pending seat invite. */
  seatInvitePaths: Readonly<Record<string, string>>;
  /** The viewer's own personal link. */
  personalPath: string | null;
}

export const NO_ACCESS: LeagueAccess = { invitePath: null, seatInvitePaths: {}, personalPath: null };
```

Run:

```bash
npx vitest run src/lib/access
```

Expected: PASS, 9 tests.

- [ ] **Step 10: Send the pick number and block a held team's other side in the draft room**

In `src/components/draft/DraftRoom.tsx`, replace:

```tsx
import { findPickForSide, managerOnTheClock, type DraftAction } from "@/lib/draft";
```

with:

```tsx
import { currentPickNumber, findPickForSide, managerOnTheClock, type DraftAction } from "@/lib/draft";
```

In `src/components/draft/DraftRoom.tsx`, replace:

```tsx
  async function confirm() {
    if (!activeSelection) return;
    const choice = activeSelection;
    setSelection(null);
    const ok = await dispatch({ type: "confirm", teamId: choice.teamId, side: choice.side });
```

with:

```tsx
  async function confirm() {
    const pickNumber = currentPickNumber(draft);
    if (!activeSelection || pickNumber === null) return;
    const choice = activeSelection;
    setSelection(null);
    const ok = await dispatch({ type: "confirm", teamId: choice.teamId, side: choice.side, pickNumber });
```

In `src/components/draft/AvailablePicks.tsx`, replace:

```tsx
import { findPickForSide } from "@/lib/draft";
```

with:

```tsx
import { findPickForSide, holdsTeam, managerOnTheClock } from "@/lib/draft";
```

In `src/components/draft/AvailablePicks.tsx`, replace:

```tsx
import { formatNumber } from "@/lib/format";
```

with:

```tsx
import { formatNumber } from "@/lib/format";
import { findManager, managerLabel } from "@/lib/league/managers";
```

In `src/components/draft/AvailablePicks.tsx`, replace:

```tsx
  const teams = filterTeams(allTeams, draft, filters);
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
```

with:

```tsx
  const teams = filterTeams(allTeams, draft, filters);
  // A manager may hold one side per team: block the other side of teams the manager on the clock already has.
  const onClock = findManager(managers, managerOnTheClock(draft));
  const button = (team: Team, side: Side) => (
    <SideButton
      team={team}
      side={side}
      pick={findPickForSide(draft, team.id, side)}
      selected={selection?.teamId === team.id && selection.side === side}
      managers={managers}
      disabled={!selectable}
      blockedNote={
        selectable && onClock && holdsTeam(draft, onClock.id, team.id)
          ? `${managerLabel(onClock)} has the other side`
          : undefined
      }
      onSelect={onSelect}
    />
  );
```

In `src/components/draft/SideButton.tsx`, replace:

```tsx
  disabled,
  onSelect,
}: {
```

with:

```tsx
  disabled,
  blockedNote,
  onSelect,
}: {
```

In `src/components/draft/SideButton.tsx`, replace:

```tsx
  disabled: boolean;
  onSelect: (ref: SideRef) => void;
}) {
```

with:

```tsx
  disabled: boolean;
  /** Why the manager on the clock can't take this side (they hold the team's other side). */
  blockedNote?: string;
  onSelect: (ref: SideRef) => void;
}) {
```

In `src/components/draft/SideButton.tsx`, replace:

```tsx
      aria-label={`${side} ${formatNumber(team.line)}, ${team.city} ${team.name}`}
      disabled={disabled}
```

with:

```tsx
      aria-label={`${side} ${formatNumber(team.line)}, ${team.city} ${team.name}${blockedNote ? ` (${blockedNote})` : ""}`}
      title={blockedNote}
      disabled={disabled || blockedNote !== undefined}
```

- [ ] **Step 11: Verify**

Run:

```bash
npm test && npm run lint && npm run typecheck && npm run build
```

Expected: all pass.

Run `npm run dev` and create a league. Start the draft and make picks 1–5 as the commissioner (you pick for the open seats). At pick 5 seat 4 is on the clock again: the other side of the team seat 4 took at pick 4 is greyed out, with "Manager 4 has the other side" on hover.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat: add league commands, stale-pick and one-side-per-team rules, tokens and link rules" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Repositories and league actions: sessions, links, the locked league transaction

**Files:**
- Create: `src/db/sessions.ts`, `src/db/links.ts`, `src/db/leagues.ts`, `src/db/actions.ts`
- Modify: `package.json` (`test:pg` script)
- Test: `src/db/sessions.test.ts`, `src/db/leagues.test.ts`, `src/db/actions.test.ts`, `src/db/concurrency.pg.test.ts` (skipped without `TEST_DATABASE_URL`)

**Interfaces:**
- Consumes: `Db`, `Tx`, `createTestDb`, schema tables (Task 1); `League`, `LineSet` (Task 2); commands, `Result`, `fail`, `succeed`, `DomainError`, `linkStatus`, `LinkKind`, `LinkRecord`, `createLinkId`, `ACCESS` (Task 3).
- Produces (src/db/sessions.ts): `SessionRecord { id; seats: Record<leagueId, managerId> }`, `createSession(db, tokenHash): Promise<string>`, `findSession(db, tokenHash): Promise<SessionRecord | null>`, `seatInLeague(db, sessionId, leagueId)`, `bindSeat(db, sessionId, leagueId, managerId)`, `unbindSeat(db, leagueId, managerId, keepSessionId?)`.
- Produces (src/db/links.ts): `issueLink(db, { leagueId, managerId, kind, expiresInDays? }): Promise<string>`, `revokeLinks(db, { leagueId, kind, managerId? })`, `findLink(db, linkId)`, `findLinkAt(db, linkId)` (link + database clock), `markSeatInviteUsed(db, linkId): Promise<boolean>`, `listActiveLinks(db, leagueId): Promise<LinkRecord[]>`.
- Produces (src/db/leagues.ts): `loadLeague(db, leagueId): Promise<League | null>`, `insertLeague(tx, league)`, `saveLeague(tx, before, after): Promise<League>`, `withLockedLeague(db, leagueId, sessionId, work)`, `LockedLeague { tx; league; actorId }`, `listSessionLeagues(db, sessionId): Promise<SeatedLeague[]>` (`SeatedLeague { id; name; seasonLabel; commissionerId; manager: Manager }`).
- Produces (src/db/actions.ts): `createLeagueFor(db, sessionId, input, generateId?)`, `runDraftAction(db, leagueId, sessionId, action, lines): Promise<Result<{ league; actorId }>>`, `claimLink(db, linkId, sessionId, input)`, `claimLinkInLeague(db, leagueId, linkId, sessionId, input)`, `rotateLeagueInvite`, `revokeLeagueInvite`, `resetSeat(db, leagueId, sessionId, targetId)`, `resetOwnLink(db, leagueId, sessionId, { signOutOtherDevices })`. Every one returns `Result<…>`.

- [ ] **Step 1: Write the failing repository and action tests**

Each test gets a fresh migrated database from `createTestDb()`. `actions.test.ts` covers every flow in the spec: league invite claims (including two simultaneous claims of one seat), rechecking a link after the lock (revoked, rotated, expired, used, wrong league), seat resets and seat invites, personal links, invite controls and draft actions (including a double-submitted pick).

Create `src/db/sessions.test.ts`:

```ts
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createLeagueFor } from "@/db/actions";
import type { Db } from "@/db/client";
import { sessions } from "@/db/schema";
import { bindSeat, createSession, findSession, seatInLeague, unbindSeat } from "@/db/sessions";
import { createTestDb } from "@/db/test-db";

let db: Db;

beforeEach(async () => {
  db = await createTestDb();
});

describe("sessions", () => {
  it("finds a session by token hash with its seats", async () => {
    const id = await createSession(db, "hash-a");
    expect(await findSession(db, "hash-a")).toEqual({ id, seats: {} });
    await createLeagueFor(db, id, { displayName: "Ana" }, () => "lg0001");
    expect(await findSession(db, "hash-a")).toEqual({ id, seats: { lg0001: "m1" } });
    expect(await findSession(db, "unknown")).toBeNull();
  });

  it("deletes an expired session instead of returning it", async () => {
    const id = await createSession(db, "hash-a");
    await db.update(sessions).set({ expiresAt: sql`now() - interval '1 minute'` }).where(eq(sessions.id, id));
    expect(await findSession(db, "hash-a")).toBeNull();
    expect(await db.select().from(sessions)).toEqual([]);
  });

  it("pushes back the expiry at most once a day", async () => {
    const id = await createSession(db, "hash-a");
    const read = async () => (await db.select().from(sessions).where(eq(sessions.id, id)))[0];
    const fresh = await read();
    await findSession(db, "hash-a");
    expect((await read()).lastSeenAt).toEqual(fresh.lastSeenAt); // used within the day: no write

    await db
      .update(sessions)
      .set({ lastSeenAt: sql`now() - interval '2 days'`, expiresAt: sql`now() + interval '88 days'` })
      .where(eq(sessions.id, id));
    const idle = await read();
    await findSession(db, "hash-a");
    const renewed = await read();
    expect(renewed.lastSeenAt.getTime()).toBeGreaterThan(idle.lastSeenAt.getTime());
    expect(renewed.expiresAt.getTime()).toBeGreaterThan(idle.expiresAt.getTime());
  });

  it("binds one seat per league, replacing the previous one, and signs seats out", async () => {
    const a = await createSession(db, "hash-a");
    const b = await createSession(db, "hash-b");
    await createLeagueFor(db, a, { displayName: "Ana" }, () => "lg0001");
    await bindSeat(db, b, "lg0001", "m2");
    await bindSeat(db, b, "lg0001", "m3");
    expect(await seatInLeague(db, b, "lg0001")).toBe("m3");

    await bindSeat(db, b, "lg0001", "m1"); // a second browser on the commissioner seat
    await unbindSeat(db, "lg0001", "m1", a); // everyone but a
    expect(await seatInLeague(db, a, "lg0001")).toBe("m1");
    expect(await seatInLeague(db, b, "lg0001")).toBeNull();
    await unbindSeat(db, "lg0001", "m1");
    expect(await seatInLeague(db, a, "lg0001")).toBeNull();
  });

  it("ignores the seat of an expired session", async () => {
    const a = await createSession(db, "hash-a");
    await createLeagueFor(db, a, { displayName: "Ana" }, () => "lg0001");
    await db.update(sessions).set({ expiresAt: sql`now() - interval '1 minute'` }).where(eq(sessions.id, a));
    expect(await seatInLeague(db, a, "lg0001")).toBeNull();
  });
});
```

Create `src/db/leagues.test.ts`:

```ts
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createLeagueFor, runDraftAction } from "@/db/actions";
import type { Db } from "@/db/client";
import { listSessionLeagues, loadLeague, withLockedLeague } from "@/db/leagues";
import { accessLinks, leagues, managers, picks, sessions, sessionSeats } from "@/db/schema";
import { createSession } from "@/db/sessions";
import { createTestDb } from "@/db/test-db";
import { succeed } from "@/lib/league/errors";
import type { LineSet } from "@/lib/types";
import { STATIC_LINES } from "@/data/static-lines";

let db: Db;
let ana: string;

beforeEach(async () => {
  db = await createTestDb();
  ana = await createSession(db, "hash-ana");
  await createLeagueFor(db, ana, { leagueName: "Hoops", displayName: "Ana" }, () => "lg0001");
});

describe("loadLeague", () => {
  it("assembles a stored league", async () => {
    const league = await loadLeague(db, "lg0001");
    expect(league).toMatchObject({
      id: "lg0001",
      name: "Hoops",
      isDemo: false,
      commissionerId: "m1",
      version: 1,
      fades: [],
      lines: null,
      draft: { status: "not_started", rounds: 11, seatOrder: ["m1", "m2", "m3", "m4"], picks: [] },
    });
    expect(league!.managers.map((m) => m.displayName)).toEqual(["Ana", null, null, null]);
    expect(await loadLeague(db, "nope")).toBeNull();
  });

  it("round-trips frozen lines", async () => {
    await runDraftAction(db, "lg0001", ana, { type: "start" }, STATIC_LINES);
    const lines = (await loadLeague(db, "lg0001"))!.lines as LineSet;
    expect(lines).toEqual(STATIC_LINES);
  });
});

describe("createLeagueFor", () => {
  it("retries when a generated id is taken", async () => {
    const ids = ["lg0001", "lg0002"];
    const result = await createLeagueFor(db, ana, { displayName: "Ana" }, () => ids.shift()!);
    expect(result).toEqual({ ok: true, value: { leagueId: "lg0002" } });
  });

  it("validates names without writing anything", async () => {
    expect(await createLeagueFor(db, ana, { displayName: " " }, () => "lg0009")).toEqual({
      ok: false,
      error: "invalid_name",
    });
    expect(await loadLeague(db, "lg0009")).toBeNull();
  });
});

describe("withLockedLeague", () => {
  it("returns not_found and demo_league without running the work", async () => {
    const work = async () => succeed("ran");
    expect(await withLockedLeague(db, "nope", ana, work)).toEqual({ ok: false, error: "not_found" });
    expect(await withLockedLeague(db, "demo", ana, work)).toEqual({ ok: false, error: "demo_league" });
  });

  it("reads the actor under the lock", async () => {
    const seen = await withLockedLeague(db, "lg0001", ana, async ({ actorId }) => succeed(actorId));
    expect(seen).toEqual({ ok: true, value: "m1" });
    expect(await withLockedLeague(db, "lg0001", null, async ({ actorId }) => succeed(actorId))).toEqual({
      ok: true,
      value: null,
    });
  });

  it("rolls back everything the work wrote when it returns an error", async () => {
    const result = await withLockedLeague(db, "lg0001", ana, async ({ tx }) => {
      await tx.update(leagues).set({ name: "Changed" }).where(eq(leagues.id, "lg0001"));
      return { ok: false, error: "forbidden" } as const;
    });
    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect((await loadLeague(db, "lg0001"))!.name).toBe("Hoops");
  });

  it("maps unique-constraint backstops to domain errors and rolls back", async () => {
    await runDraftAction(db, "lg0001", ana, { type: "start" }, STATIC_LINES);
    await runDraftAction(db, "lg0001", ana, { type: "confirm", teamId: "MIN", side: "OVER", pickNumber: 1 }, null);
    const insertPick = (values: { pickNumber: number; managerId: string; teamId: string; side: "OVER" | "UNDER" }) =>
      withLockedLeague(db, "lg0001", ana, async ({ tx }) => {
        await tx.update(leagues).set({ name: "Changed" }).where(eq(leagues.id, "lg0001"));
        await tx.insert(picks).values({ leagueId: "lg0001", ...values });
        return succeed(null);
      });
    expect(await insertPick({ pickNumber: 2, managerId: "m2", teamId: "MIN", side: "OVER" })).toEqual({
      ok: false,
      error: "side_taken",
    });
    expect(await insertPick({ pickNumber: 2, managerId: "m1", teamId: "MIN", side: "UNDER" })).toEqual({
      ok: false,
      error: "team_already_held",
    });
    expect(await insertPick({ pickNumber: 1, managerId: "m2", teamId: "OKC", side: "OVER" })).toEqual({
      ok: false,
      error: "stale_pick",
    });
    const league = (await loadLeague(db, "lg0001"))!;
    expect(league.name).toBe("Hoops");
    expect(league.draft.picks).toHaveLength(1);
  });
});

describe("listSessionLeagues", () => {
  it("lists the session's seats, newest first", async () => {
    await createLeagueFor(db, ana, { leagueName: "Second", displayName: "Ana" }, () => "lg0002");
    const listed = await listSessionLeagues(db, ana);
    expect(listed.map((league) => [league.id, league.name, league.manager.displayName])).toEqual([
      ["lg0002", "Second", "Ana"],
      ["lg0001", "Hoops", "Ana"],
    ]);
  });
});

describe("cascades", () => {
  it("deleting a league removes its managers, picks, links and seats but not sessions", async () => {
    await runDraftAction(db, "lg0001", ana, { type: "start" }, STATIC_LINES);
    await runDraftAction(db, "lg0001", ana, { type: "confirm", teamId: "MIN", side: "OVER", pickNumber: 1 }, null);
    await db.delete(leagues).where(eq(leagues.id, "lg0001"));
    for (const table of [managers, picks, accessLinks, sessionSeats]) {
      expect(await db.select().from(table)).toEqual([]);
    }
    expect(await db.select().from(sessions)).toHaveLength(1);
  });
});
```

Create `src/db/actions.test.ts`:

```ts
import { and, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { STATIC_LINES } from "@/data/static-lines";
import {
  claimLink,
  claimLinkInLeague,
  createLeagueFor,
  resetOwnLink,
  resetSeat,
  revokeLeagueInvite,
  rotateLeagueInvite,
  runDraftAction,
} from "@/db/actions";
import type { Db } from "@/db/client";
import { loadLeague } from "@/db/leagues";
import { findLink, listActiveLinks } from "@/db/links";
import { accessLinks } from "@/db/schema";
import { createSession, findSession, seatInLeague } from "@/db/sessions";
import { createTestDb } from "@/db/test-db";
import type { LinkKind } from "@/lib/access/links";
import type { Side } from "@/lib/types";

const LEAGUE = "lg0001";

let db: Db;
let ana: string; // commissioner, m1
let ben: string;
let cal: string;

async function activeLinkId(kind: LinkKind, managerId: string | null = null): Promise<string> {
  const link = (await listActiveLinks(db, LEAGUE)).find((l) => l.kind === kind && l.managerId === managerId);
  if (!link) throw new Error(`no active ${kind} for ${managerId}`);
  return link.id;
}

async function joinAs(sessionId: string, managerId: string, displayName: string) {
  return claimLink(db, await activeLinkId("league_invite"), sessionId, { managerId, displayName });
}

function confirm(sessionId: string, pickNumber: number, teamId: string, side: Side) {
  return runDraftAction(db, LEAGUE, sessionId, { type: "confirm", teamId, side, pickNumber }, null);
}

beforeEach(async () => {
  db = await createTestDb();
  [ana, ben, cal] = await Promise.all(["a", "b", "c"].map((name) => createSession(db, `hash-${name}`)));
  await createLeagueFor(db, ana, { leagueName: "Hoops", displayName: "Ana" }, () => LEAGUE);
});

describe("creating a league", () => {
  it("issues a league invite and the commissioner's personal link, and seats the creator", async () => {
    const links = await listActiveLinks(db, LEAGUE);
    expect(links.map((link) => [link.kind, link.managerId])).toEqual([
      ["league_invite", null],
      ["personal", "m1"],
    ]);
    expect(await seatInLeague(db, ana, LEAGUE)).toBe("m1");
  });
});

describe("claiming the league invite", () => {
  it("claims an open seat, issues its personal link and bumps the version", async () => {
    expect(await joinAs(ben, "m2", "Ben")).toEqual({ ok: true, value: { leagueId: LEAGUE, managerId: "m2" } });
    const league = (await loadLeague(db, LEAGUE))!;
    expect(league.managers[1].displayName).toBe("Ben");
    expect(league.version).toBe(2);
    expect(await seatInLeague(db, ben, LEAGUE)).toBe("m2");
    await expect(activeLinkId("personal", "m2")).resolves.toBeTruthy();
    await expect(activeLinkId("league_invite")).resolves.toBeTruthy(); // reusable
  });

  it("lets only one of two simultaneous claims take a seat", async () => {
    const invite = await activeLinkId("league_invite");
    const results = await Promise.all([
      claimLink(db, invite, ben, { managerId: "m2", displayName: "Ben" }),
      claimLink(db, invite, cal, { managerId: "m2", displayName: "Cal" }),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, error: "seat_taken" }]);
  });

  it("refuses a second seat for the same browser", async () => {
    await joinAs(ben, "m2", "Ben");
    expect(await joinAs(ben, "m3", "Ben again")).toEqual({ ok: false, error: "already_joined" });
  });

  it("fails with invalid_link for unknown links", async () => {
    expect(await claimLink(db, "AAAAAAAAAAAAAAAAAAAAAA", ben, { managerId: "m2", displayName: "Ben" })).toEqual({
      ok: false,
      error: "invalid_link",
    });
  });
});

describe("rechecking the link after the lock", () => {
  // claimLinkInLeague is the locked half of claimLink. Each test changes the link after the unlocked read
  // (simulated by reading it here) and before the lock.

  it("rejects a league invite revoked after the pre-transaction read", async () => {
    const invite = await activeLinkId("league_invite");
    expect(await findLink(db, invite)).not.toBeNull(); // the unlocked read passed
    await revokeLeagueInvite(db, LEAGUE, ana);
    expect(await claimLinkInLeague(db, LEAGUE, invite, ben, { managerId: "m2", displayName: "Ben" })).toEqual({
      ok: false,
      error: "invalid_link",
    });
  });

  it("rejects a league invite rotated after the pre-transaction read", async () => {
    const invite = await activeLinkId("league_invite");
    await rotateLeagueInvite(db, LEAGUE, ana);
    expect(await claimLinkInLeague(db, LEAGUE, invite, ben, { managerId: "m2", displayName: "Ben" })).toEqual({
      ok: false,
      error: "invalid_link",
    });
    expect(await joinAs(ben, "m2", "Ben")).toMatchObject({ ok: true }); // the new invite works
  });

  it("rejects a seat invite that expired after the pre-transaction read", async () => {
    await joinAs(ben, "m2", "Ben");
    await resetSeat(db, LEAGUE, ana, "m2");
    const seatInvite = await activeLinkId("seat_invite", "m2");
    await db.update(accessLinks).set({ expiresAt: sql`now() - interval '1 second'` }).where(eq(accessLinks.id, seatInvite));
    expect(await claimLinkInLeague(db, LEAGUE, seatInvite, cal, { displayName: "Ben" })).toEqual({
      ok: false,
      error: "invalid_link",
    });
  });

  it("rejects a seat invite used by someone else after the pre-transaction read", async () => {
    await joinAs(ben, "m2", "Ben");
    await resetSeat(db, LEAGUE, ana, "m2");
    const seatInvite = await activeLinkId("seat_invite", "m2");
    expect(await claimLink(db, seatInvite, cal, { displayName: "Ben" })).toMatchObject({ ok: true });
    const dan = await createSession(db, "hash-d");
    expect(await claimLinkInLeague(db, LEAGUE, seatInvite, dan, { displayName: "Ben" })).toEqual({
      ok: false,
      error: "invalid_link",
    });
  });

  it("rejects a link checked against another league", async () => {
    await createLeagueFor(db, cal, { displayName: "Cal" }, () => "lg0002");
    const invite = await activeLinkId("league_invite");
    expect(await claimLinkInLeague(db, "lg0002", invite, ben, { managerId: "m2", displayName: "Ben" })).toEqual({
      ok: false,
      error: "invalid_link",
    });
  });
});

describe("seat reset and seat invites", () => {
  beforeEach(async () => {
    await joinAs(ben, "m2", "Ben");
    await runDraftAction(db, LEAGUE, ana, { type: "start" }, STATIC_LINES);
    await confirm(ana, 1, "MIN", "OVER");
    await confirm(ben, 2, "OKC", "OVER");
  });

  it("signs the seat out everywhere, revokes its personal link and issues a seat invite", async () => {
    const oldPersonal = await activeLinkId("personal", "m2");
    expect(await resetSeat(db, LEAGUE, ana, "m2")).toEqual({ ok: true, value: null });
    expect(await seatInLeague(db, ben, LEAGUE)).toBeNull();
    expect((await findSession(db, "hash-b"))!.seats).toEqual({});
    expect((await findLink(db, oldPersonal))!.revokedAt).not.toBeNull();
    const seatInvite = (await findLink(db, await activeLinkId("seat_invite", "m2")))!;
    expect(seatInvite.expiresAt).not.toBeNull();
    // The seat stays claimed: the name and picks are kept.
    const league = (await loadLeague(db, LEAGUE))!;
    expect(league.managers[1].displayName).toBe("Ben");
    expect(league.draft.picks.map((pick) => pick.managerId)).toEqual(["m1", "m2"]);
  });

  it("refuses a pick from a browser whose seat was reset after it loaded the page", async () => {
    const viewer = await findSession(db, "hash-b"); // what the page saw while rendering
    expect(viewer!.seats[LEAGUE]).toBe("m2");
    await confirm(ana, 3, "BOS", "OVER"); // m3 is open: the commissioner picks
    await confirm(ana, 4, "CLE", "OVER"); // m4 is open
    await confirm(ana, 5, "DEN", "OVER"); // m4 again (snake)
    await confirm(ana, 6, "LAL", "OVER"); // m3
    await resetSeat(db, LEAGUE, ana, "m2"); // m2 is on the clock for pick 7
    expect(await confirm(ben, 7, "NYK", "OVER")).toEqual({ ok: false, error: "forbidden" });
  });

  it("lets the seat be re-claimed once, keeping its picks and taking the new name", async () => {
    await resetSeat(db, LEAGUE, ana, "m2");
    const seatInvite = await activeLinkId("seat_invite", "m2");
    expect(await claimLink(db, seatInvite, cal, { displayName: "Benny" })).toEqual({
      ok: true,
      value: { leagueId: LEAGUE, managerId: "m2" },
    });
    expect(await seatInLeague(db, cal, LEAGUE)).toBe("m2");
    const league = (await loadLeague(db, LEAGUE))!;
    expect(league.managers[1].displayName).toBe("Benny");
    expect(league.draft.picks[1].managerId).toBe("m2");
    await expect(activeLinkId("personal", "m2")).resolves.toBeTruthy();
    const dan = await createSession(db, "hash-d");
    expect(await claimLink(db, seatInvite, dan, { displayName: "Dan" })).toEqual({ ok: false, error: "invalid_link" });
  });

  it("never offers a reset seat on the league invite", async () => {
    await resetSeat(db, LEAGUE, ana, "m2");
    expect(await joinAs(cal, "m2", "Cal")).toEqual({ ok: false, error: "seat_taken" });
  });

  it("is commissioner-only and never for their own seat", async () => {
    expect(await resetSeat(db, LEAGUE, ben, "m1")).toEqual({ ok: false, error: "forbidden" });
    expect(await resetSeat(db, LEAGUE, ana, "m1")).toEqual({ ok: false, error: "forbidden" });
    expect(await resetSeat(db, LEAGUE, ana, "m3")).toEqual({ ok: false, error: "forbidden" }); // open seat
    expect(await resetSeat(db, "demo", ana, "m2")).toEqual({ ok: false, error: "demo_league" });
  });
});

describe("personal links", () => {
  it("sign another browser in without changing the league, replacing its seat in that league", async () => {
    await joinAs(ben, "m2", "Ben");
    const before = (await loadLeague(db, LEAGUE))!.version;
    const personal = await activeLinkId("personal", "m2");
    expect(await claimLink(db, personal, cal, {})).toEqual({ ok: true, value: { leagueId: LEAGUE, managerId: "m2" } });
    expect(await seatInLeague(db, cal, LEAGUE)).toBe("m2");
    expect(await seatInLeague(db, ben, LEAGUE)).toBe("m2");
    expect((await loadLeague(db, LEAGUE))!.version).toBe(before);
    // A personal link is reusable.
    expect(await claimLink(db, personal, ana, {})).toMatchObject({ ok: true });
    expect(await seatInLeague(db, ana, LEAGUE)).toBe("m2");
  });

  it("can be reset by its manager, optionally signing out their other browsers", async () => {
    await joinAs(ben, "m2", "Ben");
    const oldLink = await activeLinkId("personal", "m2");
    await claimLink(db, oldLink, cal, {}); // cal is Ben's second device
    expect(await resetOwnLink(db, LEAGUE, ben, { signOutOtherDevices: true })).toEqual({ ok: true, value: null });
    expect(await seatInLeague(db, ben, LEAGUE)).toBe("m2");
    expect(await seatInLeague(db, cal, LEAGUE)).toBeNull();
    expect(await claimLink(db, oldLink, cal, {})).toEqual({ ok: false, error: "invalid_link" });
    expect(await activeLinkId("personal", "m2")).not.toBe(oldLink);
    expect(await resetOwnLink(db, LEAGUE, cal, { signOutOtherDevices: false })).toEqual({
      ok: false,
      error: "forbidden",
    });
  });
});

describe("league invite controls", () => {
  it("are commissioner-only", async () => {
    await joinAs(ben, "m2", "Ben");
    expect(await rotateLeagueInvite(db, LEAGUE, ben)).toEqual({ ok: false, error: "forbidden" });
    expect(await revokeLeagueInvite(db, LEAGUE, null)).toEqual({ ok: false, error: "forbidden" });
  });

  it("revoke leaves no working invite until the next rotate", async () => {
    await revokeLeagueInvite(db, LEAGUE, ana);
    const invites = await db
      .select()
      .from(accessLinks)
      .where(and(eq(accessLinks.leagueId, LEAGUE), eq(accessLinks.kind, "league_invite")));
    expect(invites.every((link) => link.revokedAt !== null)).toBe(true);
    await rotateLeagueInvite(db, LEAGUE, ana);
    await expect(activeLinkId("league_invite")).resolves.toBeTruthy();
  });
});

describe("draft actions", () => {
  it("persist the change and bump the version; refusals change nothing", async () => {
    await joinAs(ben, "m2", "Ben");
    expect(await runDraftAction(db, LEAGUE, ben, { type: "start" }, STATIC_LINES)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect((await loadLeague(db, LEAGUE))!.version).toBe(2);
    const started = await runDraftAction(db, LEAGUE, ana, { type: "start" }, STATIC_LINES);
    expect(started.ok && started.value.league.version).toBe(3);
    expect(started.ok && started.value.actorId).toBe("m1");
    expect((await loadLeague(db, LEAGUE))!.draft.status).toBe("live");
  });

  it("fail with lines_unavailable and stay not_started when no lines are given", async () => {
    expect(await runDraftAction(db, LEAGUE, ana, { type: "start" }, null)).toEqual({
      ok: false,
      error: "lines_unavailable",
    });
    expect((await loadLeague(db, LEAGUE))!.draft.status).toBe("not_started");
  });

  it("turn a double-submitted pick into stale_pick", async () => {
    await runDraftAction(db, LEAGUE, ana, { type: "start" }, STATIC_LINES);
    const results = await Promise.all([confirm(ana, 1, "MIN", "OVER"), confirm(ana, 1, "MIN", "OVER")]);
    expect(results.map((result) => (result.ok ? "ok" : result.error)).sort()).toEqual(["ok", "stale_pick"]);
    expect((await loadLeague(db, LEAGUE))!.draft.picks).toHaveLength(1);
  });

  it("refuse the demo league and spectators", async () => {
    expect(await runDraftAction(db, "demo", ana, { type: "pause" }, null)).toEqual({ ok: false, error: "demo_league" });
    expect(await runDraftAction(db, LEAGUE, null, { type: "start" }, STATIC_LINES)).toEqual({
      ok: false,
      error: "forbidden",
    });
  });
});
```

Run:

```bash
npx vitest run src/db
```

Expected: FAIL: cannot resolve `@/db/actions` (and the other new modules).

- [ ] **Step 2: Implement the session and link repositories**

Expiry and renewal use the database clock (`now()`). `findLinkAt` maps `now()` through a timestamp column (`mapWith`) because a raw `now()` comes back as a string.

Create `src/db/sessions.ts`:

```ts
import { and, eq, gt, ne, sql } from "drizzle-orm";
import { ACCESS } from "@/config/access";
import type { Db } from "./client";
import { sessions, sessionSeats } from "./schema";

export interface SessionRecord {
  id: string;
  /** leagueId → managerId for every seat this browser holds. */
  seats: Readonly<Record<string, string>>;
}

const renewedExpiry = () => sql`now() + make_interval(days => ${ACCESS.sessionIdleDays})`;

export async function createSession(db: Db, tokenHash: string): Promise<string> {
  const [row] = await db.insert(sessions).values({ tokenHash, expiresAt: renewedExpiry() }).returning({ id: sessions.id });
  return row.id;
}

/**
 * The unexpired session for a token hash, with its seats. An expired session is deleted. An unexpired one has its
 * expiry pushed back, at most once per ACCESS.sessionRenewHours.
 */
export async function findSession(db: Db, tokenHash: string): Promise<SessionRecord | null> {
  const [row] = await db
    .select({
      id: sessions.id,
      expired: sql<boolean>`${sessions.expiresAt} <= now()`,
      renewDue: sql<boolean>`${sessions.lastSeenAt} < now() - make_interval(hours => ${ACCESS.sessionRenewHours})`,
    })
    .from(sessions)
    .where(eq(sessions.tokenHash, tokenHash));
  if (!row) return null;
  if (row.expired) {
    await db.delete(sessions).where(eq(sessions.id, row.id));
    return null;
  }
  if (row.renewDue) {
    await db.update(sessions).set({ lastSeenAt: sql`now()`, expiresAt: renewedExpiry() }).where(eq(sessions.id, row.id));
  }
  const seats = await db
    .select({ leagueId: sessionSeats.leagueId, managerId: sessionSeats.managerId })
    .from(sessionSeats)
    .where(eq(sessionSeats.sessionId, row.id));
  return { id: row.id, seats: Object.fromEntries(seats.map((seat) => [seat.leagueId, seat.managerId])) };
}

/** The seat this session holds in a league, or null. Call it inside the transaction that holds the league lock. */
export async function seatInLeague(db: Db, sessionId: string, leagueId: string): Promise<string | null> {
  const [row] = await db
    .select({ managerId: sessionSeats.managerId })
    .from(sessionSeats)
    .innerJoin(sessions, eq(sessions.id, sessionSeats.sessionId))
    .where(
      and(eq(sessionSeats.sessionId, sessionId), eq(sessionSeats.leagueId, leagueId), gt(sessions.expiresAt, sql`now()`)),
    );
  return row?.managerId ?? null;
}

/** Seats this session as the manager, replacing any seat it held in the league. */
export async function bindSeat(db: Db, sessionId: string, leagueId: string, managerId: string): Promise<void> {
  await db
    .insert(sessionSeats)
    .values({ sessionId, leagueId, managerId })
    .onConflictDoUpdate({ target: [sessionSeats.sessionId, sessionSeats.leagueId], set: { managerId, createdAt: sql`now()` } });
}

/** Signs a seat out on every browser, or on every browser except `keepSessionId`. */
export async function unbindSeat(db: Db, leagueId: string, managerId: string, keepSessionId?: string): Promise<void> {
  await db
    .delete(sessionSeats)
    .where(
      and(
        eq(sessionSeats.leagueId, leagueId),
        eq(sessionSeats.managerId, managerId),
        keepSessionId ? ne(sessionSeats.sessionId, keepSessionId) : undefined,
      ),
    );
}
```

Create `src/db/links.ts`:

```ts
import { and, asc, eq, gt, isNull, or, sql } from "drizzle-orm";
import type { LinkKind, LinkRecord } from "@/lib/access/links";
import { createLinkId } from "@/lib/access/tokens";
import type { Db } from "./client";
import { accessLinks } from "./schema";

const LINK_COLUMNS = {
  id: accessLinks.id,
  leagueId: accessLinks.leagueId,
  managerId: accessLinks.managerId,
  kind: accessLinks.kind,
  expiresAt: accessLinks.expiresAt,
  usedAt: accessLinks.usedAt,
  revokedAt: accessLinks.revokedAt,
};

const stillWorks = () =>
  and(
    isNull(accessLinks.revokedAt),
    isNull(accessLinks.usedAt),
    or(isNull(accessLinks.expiresAt), gt(accessLinks.expiresAt, sql`now()`)),
  );

/** Creates a link and returns its id. Revoke the previous link of the same kind first (a unique index enforces it). */
export async function issueLink(
  db: Db,
  input: { leagueId: string; managerId: string | null; kind: LinkKind; expiresInDays?: number },
): Promise<string> {
  const id = createLinkId();
  await db.insert(accessLinks).values({
    id,
    leagueId: input.leagueId,
    managerId: input.managerId,
    kind: input.kind,
    expiresAt: input.expiresInDays ? sql`now() + make_interval(days => ${input.expiresInDays})` : null,
  });
  return id;
}

/** Revokes the unrevoked, unused links of one kind for a seat, or for the league when managerId is omitted. */
export async function revokeLinks(db: Db, input: { leagueId: string; kind: LinkKind; managerId?: string }): Promise<void> {
  await db
    .update(accessLinks)
    .set({ revokedAt: sql`now()` })
    .where(
      and(
        eq(accessLinks.leagueId, input.leagueId),
        eq(accessLinks.kind, input.kind),
        input.managerId === undefined ? undefined : eq(accessLinks.managerId, input.managerId),
        isNull(accessLinks.revokedAt),
        isNull(accessLinks.usedAt),
      ),
    );
}

export async function findLink(db: Db, linkId: string): Promise<LinkRecord | null> {
  const [row] = await db.select(LINK_COLUMNS).from(accessLinks).where(eq(accessLinks.id, linkId));
  return row ?? null;
}

/** The link plus the database clock. Call it inside the transaction that holds the league lock. */
export async function findLinkAt(db: Db, linkId: string): Promise<{ link: LinkRecord; now: Date } | null> {
  const [row] = await db
    .select({ ...LINK_COLUMNS, now: sql<Date>`now()`.mapWith(accessLinks.createdAt) })
    .from(accessLinks)
    .where(eq(accessLinks.id, linkId));
  if (!row) return null;
  const { now, ...link } = row;
  return { link, now };
}

/** Consumes a seat invite. False unless exactly this call used it (not already used, revoked or expired). */
export async function markSeatInviteUsed(db: Db, linkId: string): Promise<boolean> {
  const rows = await db
    .update(accessLinks)
    .set({ usedAt: sql`now()` })
    .where(and(eq(accessLinks.id, linkId), eq(accessLinks.kind, "seat_invite"), stillWorks()))
    .returning({ id: accessLinks.id });
  return rows.length === 1;
}

/** Every link of the league that still works, oldest first. */
export async function listActiveLinks(db: Db, leagueId: string): Promise<LinkRecord[]> {
  return db
    .select(LINK_COLUMNS)
    .from(accessLinks)
    .where(and(eq(accessLinks.leagueId, leagueId), stillWorks()))
    .orderBy(asc(accessLinks.createdAt));
}
```

- [ ] **Step 3: Implement the league repository and the locked transaction**

`withLockedLeague` is the only way to write to a league: lock the row (`SELECT … FOR UPDATE`), read the caller's seat under the lock, load the league, run `work`. An error result throws an internal `Abort` so the transaction rolls back. Drizzle wraps driver errors, so unique violations are found by walking `error.cause` for code `23505` and mapped by constraint name.

Create `src/db/leagues.ts`:

```ts
import { and, asc, desc, eq } from "drizzle-orm";
import { DEMO_LEAGUE_ID } from "@/data/demo-league";
import { fail, type DomainError, type Result } from "@/lib/league/errors";
import type { League, Manager } from "@/lib/types";
import type { Db, Tx } from "./client";
import { leagues, managers, picks, sessionSeats } from "./schema";
import { seatInLeague } from "./sessions";

type LeagueRow = typeof leagues.$inferSelect;

async function assemble(db: Db, row: LeagueRow): Promise<League> {
  const managerRows = await db.select().from(managers).where(eq(managers.leagueId, row.id)).orderBy(asc(managers.seat));
  const pickRows = await db.select().from(picks).where(eq(picks.leagueId, row.id)).orderBy(asc(picks.pickNumber));
  const roster: Manager[] = managerRows.map((manager) => ({
    id: manager.id,
    seat: manager.seat,
    displayName: manager.displayName,
  }));
  return {
    id: row.id,
    name: row.name,
    seasonLabel: row.seasonLabel,
    isDemo: false,
    commissionerId: row.commissionerId,
    version: row.version,
    managers: roster,
    draft: {
      status: row.draftStatus,
      rounds: row.rounds,
      seatOrder: roster.map((manager) => manager.id),
      picks: pickRows.map((pick) => ({
        pickNumber: pick.pickNumber,
        managerId: pick.managerId,
        teamId: pick.teamId,
        side: pick.side,
      })),
    },
    fades: [],
    lines:
      row.lines && row.linesSource && row.linesAsOf
        ? { values: row.lines, source: row.linesSource, asOf: row.linesAsOf.toISOString() }
        : null,
  };
}

/** A stored league, or null. The demo league is never stored; see src/server/league.ts. */
export async function loadLeague(db: Db, leagueId: string): Promise<League | null> {
  const [row] = await db.select().from(leagues).where(eq(leagues.id, leagueId));
  return row ? assemble(db, row) : null;
}

/** Inserts a new league and its managers. False when the id is already taken. */
export async function insertLeague(tx: Tx, league: League): Promise<boolean> {
  const inserted = await tx
    .insert(leagues)
    .values({
      id: league.id,
      name: league.name,
      seasonLabel: league.seasonLabel,
      commissionerId: league.commissionerId,
      rounds: league.draft.rounds,
      draftStatus: league.draft.status,
      version: league.version,
    })
    .onConflictDoNothing()
    .returning({ id: leagues.id });
  if (inserted.length === 0) return false;
  await tx.insert(managers).values(
    league.managers.map((manager) => ({
      leagueId: league.id,
      id: manager.id,
      seat: manager.seat,
      displayName: manager.displayName,
    })),
  );
  return true;
}

/** Writes what changed between two versions of a locked league (new picks, names, status, lines) and bumps version. */
export async function saveLeague(tx: Tx, before: League, after: League): Promise<League> {
  const newPicks = after.draft.picks.slice(before.draft.picks.length);
  if (newPicks.length > 0) {
    await tx.insert(picks).values(newPicks.map((pick) => ({ leagueId: after.id, ...pick })));
  }
  for (const manager of after.managers) {
    const previous = before.managers.find((candidate) => candidate.id === manager.id);
    if (previous?.displayName === manager.displayName) continue;
    await tx
      .update(managers)
      .set({ displayName: manager.displayName })
      .where(and(eq(managers.leagueId, after.id), eq(managers.id, manager.id)));
  }
  const version = before.version + 1;
  await tx
    .update(leagues)
    .set({
      draftStatus: after.draft.status,
      lines: after.lines?.values ?? null,
      linesSource: after.lines?.source ?? null,
      linesAsOf: after.lines ? new Date(after.lines.asOf) : null,
      version,
    })
    .where(eq(leagues.id, after.id));
  return { ...after, version };
}

export interface LockedLeague {
  tx: Tx;
  league: League;
  /** This session's seat in the league, read under the lock. Null for spectators and signed-out browsers. */
  actorId: string | null;
}

/** Carries a domain error out of the transaction callback so the transaction rolls back. */
class Abort extends Error {
  constructor(readonly code: DomainError) {
    super(code);
  }
}

/** Backstops: if the lock and the rules ever miss a duplicate, the database still refuses it. */
const UNIQUE_VIOLATIONS: Readonly<Record<string, DomainError>> = {
  picks_pkey: "stale_pick",
  picks_side_unique: "side_taken",
  picks_manager_team_unique: "team_already_held",
};

function uniqueViolation(error: unknown): DomainError | null {
  for (let cause: unknown = error; cause && typeof cause === "object"; cause = (cause as { cause?: unknown }).cause) {
    const { code, constraint } = cause as { code?: unknown; constraint?: unknown };
    if (code === "23505" && typeof constraint === "string") return UNIQUE_VIOLATIONS[constraint] ?? null;
  }
  return null;
}

/**
 * The only way to write to a league. In one transaction: lock the league row (SELECT … FOR UPDATE), read this
 * session's seat under the lock, load the league, then run `work`. An error result rolls back everything `work`
 * wrote. Writers to one league run one at a time; reads are not blocked.
 */
export async function withLockedLeague<T>(
  db: Db,
  leagueId: string,
  sessionId: string | null,
  work: (locked: LockedLeague) => Promise<Result<T>>,
): Promise<Result<T>> {
  if (leagueId === DEMO_LEAGUE_ID) return fail("demo_league");
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx.select().from(leagues).where(eq(leagues.id, leagueId)).for("update");
      if (!row) return fail<T>("not_found");
      const actorId = sessionId ? await seatInLeague(tx, sessionId, leagueId) : null;
      const result = await work({ tx, league: await assemble(tx, row), actorId });
      if (!result.ok) throw new Abort(result.error);
      return result;
    });
  } catch (error) {
    if (error instanceof Abort) return fail(error.code);
    const violation = uniqueViolation(error);
    if (violation) return fail(violation);
    throw error;
  }
}

export interface SeatedLeague {
  id: string;
  name: string;
  seasonLabel: string;
  commissionerId: string;
  manager: Manager;
}

/** The leagues a session holds a seat in, most recently joined first. */
export async function listSessionLeagues(db: Db, sessionId: string): Promise<SeatedLeague[]> {
  const rows = await db
    .select({
      id: leagues.id,
      name: leagues.name,
      seasonLabel: leagues.seasonLabel,
      commissionerId: leagues.commissionerId,
      managerId: managers.id,
      seat: managers.seat,
      displayName: managers.displayName,
    })
    .from(sessionSeats)
    .innerJoin(leagues, eq(leagues.id, sessionSeats.leagueId))
    .innerJoin(managers, and(eq(managers.leagueId, sessionSeats.leagueId), eq(managers.id, sessionSeats.managerId)))
    .where(eq(sessionSeats.sessionId, sessionId))
    .orderBy(desc(sessionSeats.createdAt));
  return rows.map(({ managerId, seat, displayName, ...league }) => ({
    ...league,
    manager: { id: managerId, seat, displayName },
  }));
}
```

- [ ] **Step 4: Implement the league actions**

`claimLink` reads the link without the lock only to learn which league to lock; `claimLinkInLeague` rechecks it under the lock. Tests call the second half directly to simulate a link changing between the two.

Create `src/db/actions.ts`:

```ts
import { ACCESS } from "@/config/access";
import { TEAM_IDS } from "@/data/teams";
import { linkStatus } from "@/lib/access/links";
import type { DraftAction } from "@/lib/draft";
import {
  createLeague,
  decideClaim,
  decideDraftAction,
  decideInviteChange,
  decideOwnLinkReset,
  decideSeatReset,
  randomLeagueId,
  type ClaimInput,
} from "@/lib/league/commands";
import { fail, succeed, type Result } from "@/lib/league/errors";
import type { League, LineSet } from "@/lib/types";
import type { Db } from "./client";
import { insertLeague, saveLeague, withLockedLeague } from "./leagues";
import { findLink, findLinkAt, issueLink, markSeatInviteUsed, revokeLinks } from "./links";
import { bindSeat, unbindSeat } from "./sessions";

// Every league mutation. Each one runs its pure decision from src/lib/league/commands.ts inside withLockedLeague,
// so permissions and links are checked against the locked state, then persists the outcome.

const LEAGUE_ID_ATTEMPTS = 5;

/** Creates a league with its league invite and the commissioner's personal link, and seats this session in seat 1. */
export async function createLeagueFor(
  db: Db,
  sessionId: string,
  input: { leagueName?: unknown; displayName: unknown },
  generateId: () => string = randomLeagueId,
): Promise<Result<{ leagueId: string }>> {
  for (let attempt = 0; attempt < LEAGUE_ID_ATTEMPTS; attempt++) {
    const created = createLeague(input, generateId());
    if (!created.ok) return fail(created.error);
    const league = created.value;
    const inserted = await db.transaction(async (tx) => {
      if (!(await insertLeague(tx, league))) return false;
      await issueLink(tx, { leagueId: league.id, managerId: null, kind: "league_invite" });
      await issueLink(tx, { leagueId: league.id, managerId: league.commissionerId, kind: "personal" });
      await bindSeat(tx, sessionId, league.id, league.commissionerId);
      return true;
    });
    if (inserted) return succeed({ leagueId: league.id });
  }
  throw new Error("Could not generate a unique league id");
}

export interface DraftOutcome {
  league: League;
  /** The seat that acted, as read under the lock. */
  actorId: string | null;
}

/** Start, pause, resume or confirm. Fetch `lines` before calling (no network calls while holding the lock). */
export function runDraftAction(
  db: Db,
  leagueId: string,
  sessionId: string | null,
  action: DraftAction,
  lines: LineSet | null,
): Promise<Result<DraftOutcome>> {
  return withLockedLeague(db, leagueId, sessionId, async ({ tx, league, actorId }) => {
    const decided = decideDraftAction(league, actorId, action, TEAM_IDS, lines);
    if (!decided.ok) return fail(decided.error);
    return succeed({ league: await saveLeague(tx, league, decided.value), actorId });
  });
}

export interface ClaimOutcome {
  leagueId: string;
  managerId: string;
}

/** Claims a link for this session. The caller has already verified the token's signature. */
export async function claimLink(db: Db, linkId: string, sessionId: string, input: ClaimInput): Promise<Result<ClaimOutcome>> {
  // Read without the lock only to learn which league to lock. Nothing here is trusted for the write.
  const link = await findLink(db, linkId);
  if (!link) return fail("invalid_link");
  return claimLinkInLeague(db, link.leagueId, linkId, sessionId, input);
}

/**
 * The locked part of a claim. After taking the league lock it re-reads the link and rechecks revocation, expiry and
 * single use against the database clock, so a claim that lost a race to a revoke, rotation, reset or another claim
 * fails with invalid_link.
 */
export function claimLinkInLeague(
  db: Db,
  leagueId: string,
  linkId: string,
  sessionId: string,
  input: ClaimInput,
): Promise<Result<ClaimOutcome>> {
  return withLockedLeague(db, leagueId, sessionId, async ({ tx, league, actorId }) => {
    const found = await findLinkAt(tx, linkId);
    if (!found || found.link.leagueId !== league.id || linkStatus(found.link, found.now) !== "active") {
      return fail("invalid_link");
    }
    const { link } = found;
    const decided = decideClaim(league, link, actorId, input);
    if (!decided.ok) return fail(decided.error);
    const { managerId } = decided.value;
    if (link.kind === "seat_invite" && !(await markSeatInviteUsed(tx, link.id))) return fail("invalid_link");
    if (link.kind !== "personal") {
      await revokeLinks(tx, { leagueId: league.id, kind: "personal", managerId });
      await issueLink(tx, { leagueId: league.id, managerId, kind: "personal" });
    }
    await bindSeat(tx, sessionId, league.id, managerId);
    if (decided.value.changed) await saveLeague(tx, league, decided.value.league);
    return succeed({ leagueId: league.id, managerId });
  });
}

/** Commissioner: replace the league invite. The old link stops working. */
export function rotateLeagueInvite(db: Db, leagueId: string, sessionId: string | null): Promise<Result<null>> {
  return withLockedLeague(db, leagueId, sessionId, async ({ tx, league, actorId }) => {
    const decided = decideInviteChange(league, actorId);
    if (!decided.ok) return decided;
    await revokeLinks(tx, { leagueId: league.id, kind: "league_invite" });
    await issueLink(tx, { leagueId: league.id, managerId: null, kind: "league_invite" });
    return decided;
  });
}

/** Commissioner: revoke the league invite without a replacement. */
export function revokeLeagueInvite(db: Db, leagueId: string, sessionId: string | null): Promise<Result<null>> {
  return withLockedLeague(db, leagueId, sessionId, async ({ tx, league, actorId }) => {
    const decided = decideInviteChange(league, actorId);
    if (!decided.ok) return decided;
    await revokeLinks(tx, { leagueId: league.id, kind: "league_invite" });
    return decided;
  });
}

/**
 * Commissioner: sign a claimed seat out everywhere and replace its personal link with a single-use seat invite.
 * The seat stays claimed; its name and picks are kept.
 */
export function resetSeat(db: Db, leagueId: string, sessionId: string | null, targetId: string): Promise<Result<null>> {
  return withLockedLeague(db, leagueId, sessionId, async ({ tx, league, actorId }) => {
    const decided = decideSeatReset(league, actorId, targetId);
    if (!decided.ok) return decided;
    await unbindSeat(tx, league.id, targetId);
    await revokeLinks(tx, { leagueId: league.id, kind: "personal", managerId: targetId });
    await revokeLinks(tx, { leagueId: league.id, kind: "seat_invite", managerId: targetId });
    await issueLink(tx, {
      leagueId: league.id,
      managerId: targetId,
      kind: "seat_invite",
      expiresInDays: ACCESS.seatInviteDays,
    });
    return decided;
  });
}

/** Any seated manager: replace their personal link, optionally signing out their other browsers. */
export function resetOwnLink(
  db: Db,
  leagueId: string,
  sessionId: string | null,
  options: { signOutOtherDevices: boolean },
): Promise<Result<null>> {
  return withLockedLeague(db, leagueId, sessionId, async ({ tx, league, actorId }) => {
    const decided = decideOwnLinkReset(league, actorId);
    if (!decided.ok) return fail(decided.error);
    const managerId = decided.value;
    await revokeLinks(tx, { leagueId: league.id, kind: "personal", managerId });
    await issueLink(tx, { leagueId: league.id, managerId, kind: "personal" });
    if (options.signOutOtherDevices && sessionId) await unbindSeat(tx, league.id, managerId, sessionId);
    return succeed(null);
  });
}
```

Run:

```bash
npx vitest run src/db
```

Expected: PASS: 41 tests (client 3, sessions 5, leagues 10, actions 23).

- [ ] **Step 5: Add the real-Postgres concurrency test**

PGlite has a single connection, so it can't prove the row lock. This file runs only with `TEST_DATABASE_URL` and is skipped otherwise. No Postgres was available while planning, so it has been type-checked but not run; run it once against a Neon branch or local Postgres before relying on it.

Create `src/db/concurrency.pg.test.ts`:

```ts
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { STATIC_LINES } from "@/data/static-lines";
import { claimLink, createLeagueFor, resetSeat, runDraftAction } from "@/db/actions";
import { MIGRATIONS_FOLDER, type Db } from "@/db/client";
import { listActiveLinks } from "@/db/links";
import * as schema from "@/db/schema";
import { createSession } from "@/db/sessions";
import { randomLeagueId } from "@/lib/league/commands";

// PGlite has a single connection, so it can't prove the row lock. Run this file against a real Postgres:
//   TEST_DATABASE_URL=postgres://… npm run test:pg
// It migrates that database and creates uniquely named leagues; it never deletes anything.
const url = process.env.TEST_DATABASE_URL;
const PARALLEL = 8;

describe.skipIf(!url)("row lock on real Postgres", () => {
  let pool: Pool;
  let db: Db;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url, max: PARALLEL + 2 });
    const pgDb = drizzle({ client: pool, schema });
    await migrate(pgDb, { migrationsFolder: MIGRATIONS_FOLDER });
    db = pgDb;
  });

  afterAll(async () => {
    await pool?.end();
  });

  async function newLeague() {
    const commissioner = await createSession(db, crypto.randomUUID());
    const leagueId = randomLeagueId();
    const created = await createLeagueFor(db, commissioner, { displayName: "Ana" }, () => leagueId);
    if (!created.ok) throw new Error(created.error);
    return { leagueId, commissioner };
  }

  it("lets exactly one of many parallel confirms take the pick", async () => {
    const { leagueId, commissioner } = await newLeague();
    await runDraftAction(db, leagueId, commissioner, { type: "start" }, STATIC_LINES);
    const results = await Promise.all(
      Array.from({ length: PARALLEL }, () =>
        runDraftAction(db, leagueId, commissioner, { type: "confirm", teamId: "MIN", side: "OVER", pickNumber: 1 }, null),
      ),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(new Set(results.flatMap((result) => (result.ok ? [] : [result.error])))).toEqual(new Set(["stale_pick"]));
  });

  it("lets exactly one of many parallel claims use a seat invite", async () => {
    const { leagueId, commissioner } = await newLeague();
    const invite = (await listActiveLinks(db, leagueId)).find((link) => link.kind === "league_invite")!;
    await claimLink(db, invite.id, await createSession(db, crypto.randomUUID()), { managerId: "m2", displayName: "Ben" });
    await resetSeat(db, leagueId, commissioner, "m2");
    const seatInvite = (await listActiveLinks(db, leagueId)).find((link) => link.kind === "seat_invite")!;
    const sessions = await Promise.all(Array.from({ length: PARALLEL }, () => createSession(db, crypto.randomUUID())));
    const results = await Promise.all(
      sessions.map((sessionId) => claimLink(db, seatInvite.id, sessionId, { displayName: "Ben" })),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(new Set(results.flatMap((result) => (result.ok ? [] : [result.error])))).toEqual(new Set(["invalid_link"]));
  });
});
```

In `package.json`, replace:

```json
    "test:watch": "vitest",
```

with:

```json
    "test:watch": "vitest",
    "test:pg": "vitest run src/db/concurrency.pg.test.ts",
```

Run:

```bash
npm run test:pg
```

Expected: 2 tests skipped (no `TEST_DATABASE_URL`).

- [ ] **Step 6: Verify**

Run:

```bash
npm test && npm run lint && npm run typecheck && npm run build
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add session, link and league repositories with locked league actions" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Switch the app to the database and sessions

**Files:**
- Create: `src/server/db.ts`, `src/server/session.ts`, `src/server/lines.ts`
- Replace: `src/server/league.ts`, `src/app/api/leagues/route.ts`, `src/app/api/leagues/[leagueId]/draft/route.ts`, `src/app/l/[leagueId]/page.tsx`, `src/app/l/[leagueId]/draft/page.tsx` (interim until Task 6), `src/app/l/[leagueId]/join/page.tsx`
- Modify: `src/app/l/[leagueId]/layout.tsx`, `src/app/page.tsx`, `src/app/not-found.tsx`, `src/components/draft/DraftRoom.tsx`
- Delete: `src/app/api/leagues/[leagueId]/join/route.ts`, `src/server/store.ts`, `src/server/viewer.ts`, `src/lib/league/store.ts`, `src/lib/league/seats-cookie.ts`, `src/lib/league/seats-cookie.test.ts`, `src/components/join/JoinForm.tsx`

**Interfaces:**
- Consumes: `openDatabase`, `readServerConfig` (Task 1); `withLines`, `staticLineSource`, `STATIC_LINES`, `TEAM_INFO` (Task 2); token helpers, `ACCESS`, `parseDraftAction`, http helpers (Task 3); `createLeagueFor`, `runDraftAction`, `loadLeague`, `listSessionLeagues`, `createSession`, `findSession` (Task 4).
- Produces (src/server/db.ts): `serverConfig(): ServerConfig`, `getDb(): Promise<Db>` (awaits `connection()` first).
- Produces (src/server/session.ts): `SESSION_COOKIE = "courtline_session"`, `getSession()` (React `cache`), `getViewerId(leagueId): Promise<string | null>` (rendering only), `ensureSession(): Promise<string>` (route handlers only).
- Produces (src/server/lines.ts): `lineSource: LineSource`, `currentLinesOrNull(): Promise<LineSet | null>`.
- Produces (src/server/league.ts): `findLeague(leagueId)`, `getLeagueOrNotFound(leagueId)` (now async), `teamsFor(league)`, `toLeagueView(league, viewerId?)`, `listViewerLeagues()`.

- [ ] **Step 1: Add the server glue**

`getDb()` opens the database once per process (cached on `globalThis` so dev hot reloads never open a second PGlite on the same directory) and never at import time, so `next build` needs no database. It awaits `connection()` first: with Cache Components on, Next rejects the clock reads the drivers make during a prerender (`blocking-prerender-current-time`), and `connection()` marks the read as request-time. It works in route handlers too.

Create `src/server/db.ts`:

```ts
import "server-only";
import { connection } from "next/server";
import { openDatabase, type Db } from "@/db/client";
import { readServerConfig, type ServerConfig } from "@/lib/env";

/** The validated environment. src/instrumentation.ts runs the same check at startup. */
export function serverConfig(): ServerConfig {
  const result = readServerConfig(process.env);
  if (!result.ok) throw new Error(result.problems.join(" "));
  return result.config;
}

// One database per server process, opened on first use (never at import, so `next build` needs no database).
// globalThis survives dev hot reloads, which matters for PGlite: two instances on one directory would corrupt it.
const globalForDb = globalThis as unknown as { __courtlineDb?: Promise<Db> };

export async function getDb(): Promise<Db> {
  // Database rows are request-time data. With Cache Components, prerendering must stop before a query: the drivers
  // read the clock, which Next rejects during a prerender.
  await connection();
  globalForDb.__courtlineDb ??= openDatabase(serverConfig().database).catch((error: unknown) => {
    globalForDb.__courtlineDb = undefined;
    throw error;
  });
  return globalForDb.__courtlineDb;
}
```

`getViewerId()` is for rendering only. Mutations get their actor from `withLockedLeague`, which re-reads the seat under the lock.

Create `src/server/session.ts`:

```ts
import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { ACCESS } from "@/config/access";
import { DEMO_LEAGUE_ID } from "@/data/demo-league";
import { createSession, findSession, type SessionRecord } from "@/db/sessions";
import { createSessionToken, hashSessionToken, isSessionToken } from "@/lib/access/tokens";
import { getDb } from "@/server/db";

export const SESSION_COOKIE = "courtline_session";
/** The prototype's editable seat cookie. Ignored, and deleted whenever a session cookie is set. */
const LEGACY_SEATS_COOKIE = "courtline_seats";

/** This browser's session, looked up once per request. Null without a valid, unexpired session. */
export const getSession = cache(async (): Promise<SessionRecord | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !isSessionToken(token)) return null;
  return findSession(await getDb(), await hashSessionToken(token));
});

/**
 * The viewer's seat in a league, for rendering. Never use it to authorize a write: mutations re-read the seat
 * under the league lock (src/db/leagues.ts withLockedLeague).
 */
export async function getViewerId(leagueId: string): Promise<string | null> {
  if (leagueId === DEMO_LEAGUE_ID) return null;
  return (await getSession())?.seats[leagueId] ?? null;
}

/** Route handlers only (cookies can't be set while rendering): this browser's session id, creating one if needed. */
export async function ensureSession(): Promise<string> {
  const existing = await getSession();
  if (existing) return existing.id;
  const token = createSessionToken();
  const sessionId = await createSession(await getDb(), await hashSessionToken(token));
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ACCESS.cookieMaxAgeDays * 24 * 60 * 60,
  });
  jar.delete(LEGACY_SEATS_COOKIE);
  return sessionId;
}
```

Create `src/server/lines.ts`:

```ts
import "server-only";
import { STATIC_LINES } from "@/data/static-lines";
import { staticLineSource, type LineSource } from "@/lib/lines";
import type { LineSet } from "@/lib/types";

/** Spec 1 ships only the static source. A live feed replaces it here. */
export const lineSource: LineSource = staticLineSource(STATIC_LINES);

/** Current lines, or null when the source fails (starting a draft then fails with lines_unavailable). */
export async function currentLinesOrNull(): Promise<LineSet | null> {
  try {
    return await lineSource.current();
  } catch {
    return null;
  }
}
```

Replace the whole of `src/server/league.ts`:

```ts
import "server-only";
import { notFound } from "next/navigation";
import { buildDemoLeague, DEMO_LEAGUE_ID } from "@/data/demo-league";
import { TEAM_INFO } from "@/data/teams";
import { listSessionLeagues, loadLeague, type SeatedLeague } from "@/db/leagues";
import { withLines } from "@/lib/lines";
import type { League, LeagueView, Team } from "@/lib/types";
import { getDb } from "@/server/db";
import { lineSource } from "@/server/lines";
import { getSession, getViewerId } from "@/server/session";

/** The demo league lives in code, never in the database. */
const DEMO_LEAGUE = buildDemoLeague();

export async function findLeague(leagueId: string): Promise<League | null> {
  if (leagueId === DEMO_LEAGUE_ID) return DEMO_LEAGUE;
  return loadLeague(await getDb(), leagueId);
}

export async function getLeagueOrNotFound(leagueId: string): Promise<League> {
  const league = await findLeague(leagueId);
  if (!league) notFound();
  return league;
}

/** Every team with the lines this league scores against: frozen at draft start, the current lines before that. */
export async function teamsFor(league: League): Promise<Team[]> {
  return withLines(TEAM_INFO, league.lines ?? (await lineSource.current()));
}

/** Pass viewerId when it is already known (e.g. the actor a mutation read under the lock). */
export async function toLeagueView(league: League, viewerId?: string | null): Promise<LeagueView> {
  return {
    league,
    viewerId: viewerId === undefined ? await getViewerId(league.id) : viewerId,
    teams: await teamsFor(league),
  };
}

/** The leagues this browser holds a seat in, most recently joined first. */
export async function listViewerLeagues(): Promise<SeatedLeague[]> {
  const session = await getSession();
  return session ? listSessionLeagues(await getDb(), session.id) : [];
}
```

- [ ] **Step 2: Rewrite the create and draft routes**

Every mutating route checks `isSameOrigin` first. Starting a draft fetches lines before taking the league lock: no network calls while holding it.

Replace the whole of `src/app/api/leagues/route.ts`:

```ts
import { createLeagueFor } from "@/db/actions";
import { getDb } from "@/server/db";
import { errorResponse, isSameOrigin, readJsonBody } from "@/server/http";
import { ensureSession } from "@/server/session";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return errorResponse("forbidden");
  const body = await readJsonBody(request);
  const sessionId = await ensureSession();
  const result = await createLeagueFor(await getDb(), sessionId, {
    leagueName: body.leagueName,
    displayName: body.displayName,
  });
  if (!result.ok) return errorResponse(result.error);
  return Response.json({ leagueId: result.value.leagueId }, { status: 201 });
}
```

Replace the whole of `src/app/api/leagues/[leagueId]/draft/route.ts`:

```ts
import { runDraftAction } from "@/db/actions";
import { parseDraftAction } from "@/lib/league/parse-action";
import { getDb } from "@/server/db";
import { errorResponse, isSameOrigin, readJsonBody } from "@/server/http";
import { findLeague, toLeagueView } from "@/server/league";
import { currentLinesOrNull } from "@/server/lines";
import { getSession } from "@/server/session";

export async function GET(_request: Request, ctx: RouteContext<"/api/leagues/[leagueId]/draft">) {
  const { leagueId } = await ctx.params;
  const league = await findLeague(leagueId);
  if (!league) return errorResponse("not_found");
  return Response.json(await toLeagueView(league), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, ctx: RouteContext<"/api/leagues/[leagueId]/draft">) {
  if (!isSameOrigin(request)) return errorResponse("forbidden");
  const { leagueId } = await ctx.params;
  const action = parseDraftAction(await readJsonBody(request));
  if (!action) return errorResponse("invalid_request");
  // Fetch lines before taking the league lock: no network calls while holding it.
  const lines = action.type === "start" ? await currentLinesOrNull() : null;
  const session = await getSession();
  const result = await runDraftAction(await getDb(), leagueId, session?.id ?? null, action, lines);
  if (!result.ok) return errorResponse(result.error);
  return Response.json(await toLeagueView(result.value.league, result.value.actorId));
}
```

- [ ] **Step 3: Move the pages onto the new server modules**

Replace the whole of `src/app/l/[leagueId]/page.tsx`:

```tsx
import { Suspense } from "react";
import { LeagueOverview } from "@/components/overview/LeagueOverview";
import { PageFallback } from "@/components/ui/PageFallback";
import { getLeagueOrNotFound, toLeagueView } from "@/server/league";

export default function OverviewPage({ params }: PageProps<"/l/[leagueId]">) {
  return (
    <Suspense fallback={<PageFallback label="Loading league…" />}>
      <Overview params={params} />
    </Suspense>
  );
}

async function Overview({ params }: { params: PageProps<"/l/[leagueId]">["params"] }) {
  const { leagueId } = await params;
  const view = await toLeagueView(await getLeagueOrNotFound(leagueId));
  return <LeagueOverview league={view.league} teams={view.teams} viewerId={view.viewerId} />;
}
```

Replace the whole of `src/app/l/[leagueId]/draft/page.tsx` (interim; Task 6 adds the links):

```tsx
import { Suspense } from "react";
import { DraftRoom } from "@/components/draft/DraftRoom";
import { PageFallback } from "@/components/ui/PageFallback";
import { getLeagueOrNotFound, toLeagueView } from "@/server/league";

export default function DraftPage({ params }: PageProps<"/l/[leagueId]/draft">) {
  return (
    <Suspense fallback={<PageFallback label="Loading draft room…" />}>
      <DraftContent params={params} />
    </Suspense>
  );
}

async function DraftContent({ params }: { params: PageProps<"/l/[leagueId]/draft">["params"] }) {
  const { leagueId } = await params;
  return <DraftRoom initial={await toLeagueView(await getLeagueOrNotFound(leagueId))} />;
}
```

In `src/app/l/[leagueId]/layout.tsx`, replace:

```tsx
import { getLeagueOrNotFound, listSeatLeagues } from "@/server/league";
import { readSeats } from "@/server/viewer";
```

with:

```tsx
import { getLeagueOrNotFound, listViewerLeagues } from "@/server/league";
```

In `src/app/l/[leagueId]/layout.tsx`, replace:

```tsx
  const league = getLeagueOrNotFound(leagueId);
  const otherLeagues = listSeatLeagues(await readSeats())
    .filter((seat) => seat.league.id !== league.id)
    .map(({ league: other }) => ({ id: other.id, name: other.name, seasonLabel: other.seasonLabel }));
```

with:

```tsx
  const league = await getLeagueOrNotFound(leagueId);
  const otherLeagues = (await listViewerLeagues())
    .filter((other) => other.id !== league.id)
    .map((other) => ({ id: other.id, name: other.name, seasonLabel: other.seasonLabel }));
```

In `src/app/page.tsx`, replace:

```tsx
import { findManager, managerLabel } from "@/lib/league/managers";
import { listSeatLeagues } from "@/server/league";
import { readSeats } from "@/server/viewer";
```

with:

```tsx
import { managerLabel } from "@/lib/league/managers";
import { listViewerLeagues } from "@/server/league";
```

In `src/app/page.tsx`, replace:

```tsx
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
```

with:

```tsx
  const leagues = await listViewerLeagues();
  if (leagues.length === 0) return null;
  return (
    <Panel title="Your leagues">
      <ul className="divide-y divide-ink-700">
        {leagues.map((league) => (
          <li key={league.id}>
            <Link href={`/l/${league.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-ink-800 sm:px-5">
              <span className="min-w-0">
                <span className="block truncate font-semibold">{league.name}</span>
                <span className="block text-sm text-fog-400">
                  {managerLabel(league.manager)}
                  {league.commissionerId === league.manager.id ? " · Commissioner" : ""}
                </span>
              </span>
              <ArrowRight aria-hidden className="size-4 shrink-0 text-fog-400" />
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
```

In `src/app/not-found.tsx`, replace:

```tsx
      <p className="text-fog-300">
        Leagues live in server memory in this prototype, so a server restart clears them. Create a new one or open the
        demo league.
      </p>
```

with:

```tsx
      <p className="text-fog-300">Check the link, or create a new league or open the demo league.</p>
```

The public join page becomes a notice: joining needs the private invite link from Task 6.

Replace the whole of `src/app/l/[leagueId]/join/page.tsx`:

```tsx
import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { buttonClasses } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";

/** Old public join links land here. Joining now needs the league's private invite link. */
export default function JoinPage() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <PageHeader title="Join league" subtitle="Invites are private" />
      <Panel bodyClassName="flex flex-col items-start gap-4 p-4 sm:p-5">
        <p className="text-fog-300">
          Ask your commissioner for the league&apos;s invite link. It opens a page where you pick an open seat.
        </p>
        <Link href="/" className={buttonClasses("secondary")}>
          All leagues
        </Link>
      </Panel>
    </div>
  );
}
```

In `src/components/draft/DraftRoom.tsx`, replace:

```tsx
              Lines lock when drafted.
```

with:

```tsx
              {draft.status === "not_started" ? "Lines lock when the draft starts." : "Lines locked when the draft started."}
```

- [ ] **Step 4: Delete the in-memory store, the seat cookie and the public join flow**

Delete:

```bash
git rm 'src/app/api/leagues/[leagueId]/join/route.ts' src/server/store.ts src/server/viewer.ts src/lib/league/store.ts src/lib/league/seats-cookie.ts src/lib/league/seats-cookie.test.ts src/components/join/JoinForm.tsx
```

Run:

```bash
grep -rn "leagueStore\|readSeats\|seats-cookie\|server/viewer\|JoinForm" src
```

Expected: no matches.

- [ ] **Step 5: Verify**

Run:

```bash
npm test && npm run lint && npm run typecheck && npm run build
```

Expected: all pass.

Start `npm run dev` (PGlite at `.data/pglite`), then in another terminal:

Run:

```bash
B=http://localhost:3000; J=$(mktemp -d)
api() { curl -s -w " [%{http_code}]\n" -b "$J/ana" -c "$J/ana" -H "Origin: $B" -H "content-type: application/json" "$B$1" -d "$2"; }
L=$(api /api/leagues '{"displayName":"Ana"}' | sed -E 's/.*"leagueId":"([a-z0-9]+)".*/\1/'); echo "league $L"
api /api/leagues/$L/draft '{"type":"start"}' | grep -o '"source":"static"\|\[[0-9]*\]$'
api /api/leagues/$L/draft '{"type":"confirm","teamId":"MIN","side":"OVER","pickNumber":1}' | grep -o '\[[0-9]*\]$'
api /api/leagues/$L/draft '{"type":"confirm","teamId":"MIN","side":"OVER","pickNumber":1}' | grep -o '"stale_pick"\|\[[0-9]*\]$'
curl -s -w " [%{http_code}]\n" -b "$J/ana" -H "content-type: application/json" "$B/api/leagues/$L/draft" -d '{"type":"pause"}'
curl -s -b "courtline_seats=$L:m1" "$B/api/leagues/$L/draft" | grep -o '"viewerId":[a-z0-9"]*'
echo "$L" > "$J/league"; echo "jar: $J"
```

Expected: the start shows `"source":"static"` and `[200]`; pick 1 `[200]`; the repeated pick `"stale_pick"` `[409]`; the request without `Origin` `[403]`; the old `courtline_seats` cookie gives `"viewerId":null`.

Stop and restart `npm run dev`, then in the same terminal (same `$B`, `$J` and `$L`):

Run:

```bash
curl -s -b "$J/ana" "$B/api/leagues/$L/draft" | grep -o '"viewerId":"m1"\|"pickNumber":1'
```

Expected: `"pickNumber":1` and `"viewerId":"m1"`: the league, its pick and the session survived the restart.

In the browser: create a league, start the draft and make a pick. The panel note reads "Lines locked when the draft started." Restart `npm run dev` and reload: the pick is still on the board and the league is under **Your leagues** on http://localhost:3000. Check that http://localhost:3000/l/demo still renders the demo and that the dev overlay reports no issues (no `blocking-prerender-current-time`).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: store leagues in Postgres and identify browsers with server-side sessions" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Invite links, the link page and claiming

**Files:**
- Create: `src/server/access.ts`, `src/components/access/CopyLink.tsx`, `src/components/access/send-json.ts`, `src/components/access/LinkClaimForm.tsx`, `src/app/i/[token]/page.tsx`, `src/app/api/links/claim/route.ts`
- Replace: `src/app/l/[leagueId]/draft/page.tsx`
- Modify: `next.config.ts`, `src/components/draft/DraftLobby.tsx`, `src/components/draft/DraftStatusBar.tsx`, `src/components/draft/DraftRoom.tsx`
- Delete: `src/components/draft/InviteLink.tsx`

**Interfaces:**
- Consumes: `claimLink`, `findLink`, `listActiveLinks` (Task 4); `getDb`, `serverConfig`, `ensureSession`, `getViewerId`, `findLeague` (Task 5); `signLinkId`, `verifyLinkToken`, `linkPath`, `linkStatus`, `LeagueAccess`, `NO_ACCESS` (Task 3).
- Produces (src/server/access.ts): `pathForLink(linkId): Promise<string>`, `verifyLink(token): Promise<string | null>`, `readLinkToken(token): Promise<LinkRecord | null>`, `getLeagueAccess(league, viewerId): Promise<LeagueAccess>`.
- Produces (components): `CopyLink { path; label; description?; compact? }`, `sendJson(url, method, body?): Promise<SendResult>`, `LinkClaimForm { token; kind; league: { id; name; managers }; seatId }`; `DraftRoom { initial; access: LeagueAccess }`, `DraftLobby { …; access }`, `DraftStatusBar { …; invitePath }`.
- Produces (routes): `GET /i/{token}` (never changes anything), `POST /api/links/claim { token, managerId?, displayName? }` → `{ leagueId, managerId }`.

- [ ] **Step 1: Add the server-side link helpers**

`getLeagueAccess` decides which links a viewer sees: the league invite and pending seat invites for the commissioner, the viewer's own personal link for any manager, nothing for spectators. The `League` payload itself never carries links.

Create `src/server/access.ts`:

```ts
import "server-only";
import { findLink, listActiveLinks } from "@/db/links";
import { linkPath, NO_ACCESS, type LeagueAccess, type LinkRecord } from "@/lib/access/links";
import { signLinkId, verifyLinkToken } from "@/lib/access/tokens";
import type { League } from "@/lib/types";
import { getDb, serverConfig } from "@/server/db";

export async function pathForLink(linkId: string): Promise<string> {
  return linkPath(await signLinkId(linkId, serverConfig().linkSecret));
}

/** The link id in a token when its signature is valid. Needs no database read. */
export function verifyLink(token: string): Promise<string | null> {
  return verifyLinkToken(token, serverConfig().linkSecret);
}

/** The link a token points at, for display only. A claim rechecks the link under the league lock. */
export async function readLinkToken(token: string): Promise<LinkRecord | null> {
  const linkId = await verifyLink(token);
  return linkId ? findLink(await getDb(), linkId) : null;
}

/** The links this viewer may see: invites for the commissioner, their own personal link for any manager. */
export async function getLeagueAccess(league: League, viewerId: string | null): Promise<LeagueAccess> {
  if (league.isDemo || viewerId === null) return NO_ACCESS;
  const isCommissioner = viewerId === league.commissionerId;
  let invitePath: string | null = null;
  let personalPath: string | null = null;
  const seatInvitePaths: Record<string, string> = {};
  for (const link of await listActiveLinks(await getDb(), league.id)) {
    if (link.kind === "personal" && link.managerId === viewerId) {
      personalPath = await pathForLink(link.id);
    } else if (isCommissioner && link.kind === "league_invite") {
      invitePath = await pathForLink(link.id);
    } else if (isCommissioner && link.kind === "seat_invite" && link.managerId) {
      seatInvitePaths[link.managerId] = await pathForLink(link.id);
    }
  }
  return { invitePath, seatInvitePaths, personalPath };
}
```

- [ ] **Step 2: Add the claim route**

The signature check needs no database read. A browser without a session gets one here, before the claim transaction.

Create `src/app/api/links/claim/route.ts`:

```ts
import { claimLink } from "@/db/actions";
import { verifyLink } from "@/server/access";
import { getDb } from "@/server/db";
import { errorResponse, isSameOrigin, readJsonBody } from "@/server/http";
import { ensureSession } from "@/server/session";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return errorResponse("forbidden");
  const body = await readJsonBody(request);
  const linkId = typeof body.token === "string" ? await verifyLink(body.token) : null;
  if (!linkId) return errorResponse("invalid_link");
  const sessionId = await ensureSession();
  const result = await claimLink(await getDb(), linkId, sessionId, {
    managerId: body.managerId,
    displayName: body.displayName,
  });
  if (!result.ok) return errorResponse(result.error);
  return Response.json(result.value);
}
```

- [ ] **Step 3: Add the shared link components**

Create `src/components/access/CopyLink.tsx`:

```tsx
"use client";

import { Check, Copy } from "lucide-react";
import { useId, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";

const noopSubscribe = () => () => {};

/** A private link with a copy button. `path` is app-relative ("/i/…"); the browser adds its own origin. */
export function CopyLink({
  path,
  label,
  description,
  compact = false,
}: {
  path: string;
  label: string;
  description?: string;
  compact?: boolean;
}) {
  // window.location is client-only; the server render shows the path alone.
  const origin = useSyncExternalStore(noopSubscribe, () => window.location.origin, () => "");
  const [copied, setCopied] = useState(false);
  const inputId = useId();
  const url = `${origin}${path}`;

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
        {copied ? "Link copied" : `Copy ${label.toLowerCase()}`}
      </Button>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={inputId} className="text-sm font-semibold">
        {label}
      </label>
      <div className="flex min-w-0 gap-2">
        <input
          id={inputId}
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
      {description && <p className="text-sm text-fog-400">{description}</p>}
    </div>
  );
}
```

Create `src/components/access/send-json.ts`:

```ts
export type SendResult = { ok: true; data: Record<string, unknown> } | { ok: false; message: string };

/** Sends a JSON request to one of our API routes and turns any failure into a message for the user. */
export async function sendJson(url: string, method: "POST" | "DELETE", body?: unknown): Promise<SendResult> {
  try {
    const response = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data: unknown = await response.json().catch(() => ({}));
    const record = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
    if (!response.ok) {
      return { ok: false, message: typeof record.message === "string" ? record.message : "Something went wrong." };
    }
    return { ok: true, data: record };
  } catch {
    return { ok: false, message: "Couldn't reach the server. Try again." };
  }
}
```

Create `src/components/access/LinkClaimForm.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { ManagerAvatar } from "@/components/ui/ManagerAvatar";
import type { LinkKind } from "@/lib/access/links";
import { findManager, managerLabel, openSeats } from "@/lib/league/managers";
import type { League } from "@/lib/types";
import { sendJson } from "./send-json";

const inputClasses =
  "h-11 rounded-lg border border-ink-600 bg-ink-900 px-3 text-fog-50 focus:border-accent focus:outline-none";

type ClaimLeague = Pick<League, "id" | "name" | "managers">;

/** The form behind /i/{token}: claim an open seat, re-claim a reset seat, or sign in with a personal link. */
export function LinkClaimForm({
  token,
  kind,
  league,
  seatId,
}: {
  token: string;
  kind: LinkKind;
  league: ClaimLeague;
  /** The link's seat. Null for a league invite. */
  seatId: string | null;
}) {
  const router = useRouter();
  const seat = findManager(league.managers, seatId);
  const open = openSeats(league.managers);
  const [managerId, setManagerId] = useState(open[0]?.id ?? "");
  const [displayName, setDisplayName] = useState(kind === "seat_invite" ? (seat?.displayName ?? "") : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (kind === "league_invite" && open.length === 0) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-fog-300">Every seat in {league.name} is taken.</p>
        <Link href={`/l/${league.id}`} className={buttonClasses("secondary")}>
          View the league
        </Link>
      </div>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await sendJson("/api/links/claim", "POST", { token, managerId, displayName });
    if (!result.ok) {
      setError(result.message);
      setPending(false);
      return;
    }
    router.push(kind === "personal" ? `/l/${league.id}` : `/l/${league.id}/draft`);
  }

  const errorMessage = error && (
    <p role="alert" className="text-sm text-negative">
      {error}
    </p>
  );

  if (kind === "personal" && seat) {
    return (
      <form onSubmit={onSubmit} className="flex flex-col items-start gap-4">
        <div className="flex items-center gap-3">
          <ManagerAvatar manager={seat} />
          <p className="text-fog-300">
            This link signs this browser in as <span className="font-semibold text-fog-50">{managerLabel(seat)}</span>{" "}
            in {league.name}.
          </p>
        </div>
        {errorMessage}
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Signing in…" : `Continue as ${managerLabel(seat)}`}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      {kind === "league_invite" ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-semibold">Pick an open seat</legend>
          {league.managers.map((manager) => {
            const isOpen = manager.displayName === null;
            return (
              <label
                key={manager.id}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
                  managerId === manager.id ? "border-accent/60 bg-accent/10" : "border-ink-700"
                } ${isOpen ? "cursor-pointer" : "opacity-60"}`}
              >
                <input
                  type="radio"
                  name="seat"
                  value={manager.id}
                  checked={managerId === manager.id}
                  disabled={!isOpen}
                  onChange={() => setManagerId(manager.id)}
                  className="accent-[var(--color-accent)]"
                />
                <ManagerAvatar manager={manager} size="sm" />
                <span className="flex-1">{isOpen ? `Seat ${manager.seat + 1} · open` : managerLabel(manager)}</span>
              </label>
            );
          })}
        </fieldset>
      ) : (
        seat && (
          <div className="flex items-center gap-3">
            <ManagerAvatar manager={seat} />
            <p className="text-fog-300">
              Rejoin seat {seat.seat + 1}. Its picks are kept; you can change the name.
            </p>
          </div>
        )
      )}
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Your name
        <input
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          maxLength={24}
          required
          className={inputClasses}
        />
      </label>
      {errorMessage}
      <Button type="submit" size="lg" disabled={pending || (kind === "league_invite" && !managerId)} className="self-start">
        {pending ? "Joining…" : kind === "league_invite" ? "Join league" : "Rejoin league"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Add the link page**

Rendering never claims anything: chat apps fetch links to build previews. Every bad state (bad signature, unknown, revoked, used, expired) shows the same message. A browser that already holds the right seat goes straight to the league.

Create `src/app/i/[token]/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LinkClaimForm } from "@/components/access/LinkClaimForm";
import { Logo } from "@/components/shell/Logo";
import { buttonClasses } from "@/components/ui/Button";
import { PageFallback } from "@/components/ui/PageFallback";
import { Panel } from "@/components/ui/Panel";
import { linkStatus, type LinkKind } from "@/lib/access/links";
import { ERROR_MESSAGES } from "@/lib/league/errors";
import { readLinkToken } from "@/server/access";
import { findLeague } from "@/server/league";
import { getViewerId } from "@/server/session";

const TITLES: Record<LinkKind, string> = {
  league_invite: "Join the league",
  seat_invite: "Rejoin your seat",
  personal: "Sign in",
};

export default function LinkPage({ params }: PageProps<"/i/[token]">) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-8 px-4 py-10 sm:py-16">
      <Logo />
      <Suspense fallback={<PageFallback label="Checking your link…" />}>
        <LinkContent params={params} />
      </Suspense>
    </main>
  );
}

async function LinkContent({ params }: { params: PageProps<"/i/[token]">["params"] }) {
  const { token } = await params;
  // Display only: rendering never claims anything (chat apps fetch links to build previews). The claim route
  // rechecks the link under the league lock.
  const link = await readLinkToken(token);
  const league = link && linkStatus(link, new Date()) === "active" ? await findLeague(link.leagueId) : null;
  if (!link || !league) {
    return (
      <Panel title="Link not working" bodyClassName="flex flex-col items-start gap-4 p-4 sm:p-5">
        <p className="text-fog-300">{ERROR_MESSAGES.invalid_link}</p>
        <Link href="/" className={buttonClasses("secondary")}>
          Back to Courtline
        </Link>
      </Panel>
    );
  }

  const viewerSeat = await getViewerId(league.id);
  if (viewerSeat !== null && (link.kind === "league_invite" || viewerSeat === link.managerId)) {
    redirect(`/l/${league.id}`);
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-4xl font-bold">{TITLES[link.kind]}</h1>
        <p className="mt-1 text-lg text-link">
          {league.name} • {league.seasonLabel}
        </p>
      </div>
      <Panel bodyClassName="p-4 sm:p-5">
        <LinkClaimForm
          token={token}
          kind={link.kind}
          league={{ id: league.id, name: league.name, managers: league.managers }}
          seatId={link.managerId}
        />
      </Panel>
    </section>
  );
}
```

In `next.config.ts`, replace:

```ts
    remotePatterns: [{ protocol: "https", hostname: "cdn.nba.com", pathname: "/logos/nba/**" }],
  },
  turbopack: {
```

with:

```ts
    remotePatterns: [{ protocol: "https", hostname: "cdn.nba.com", pathname: "/logos/nba/**" }],
  },
  // Link pages carry a secret token in the URL: never send it to another site in a Referer header.
  async headers() {
    return [{ source: "/i/:token", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] }];
  },
  turbopack: {
```

- [ ] **Step 5: Show the links in the draft room**

Replace the whole of `src/app/l/[leagueId]/draft/page.tsx`:

```tsx
import { Suspense } from "react";
import { DraftRoom } from "@/components/draft/DraftRoom";
import { PageFallback } from "@/components/ui/PageFallback";
import { getLeagueAccess } from "@/server/access";
import { getLeagueOrNotFound, toLeagueView } from "@/server/league";

export default function DraftPage({ params }: PageProps<"/l/[leagueId]/draft">) {
  return (
    <Suspense fallback={<PageFallback label="Loading draft room…" />}>
      <DraftContent params={params} />
    </Suspense>
  );
}

async function DraftContent({ params }: { params: PageProps<"/l/[leagueId]/draft">["params"] }) {
  const { leagueId } = await params;
  const view = await toLeagueView(await getLeagueOrNotFound(leagueId));
  return <DraftRoom initial={view} access={await getLeagueAccess(view.league, view.viewerId)} />;
}
```

In `src/components/draft/DraftRoom.tsx`, replace:

```tsx
import { Panel } from "@/components/ui/Panel";
```

with:

```tsx
import { Panel } from "@/components/ui/Panel";
import type { LeagueAccess } from "@/lib/access/links";
```

In `src/components/draft/DraftRoom.tsx`, replace:

```tsx
export function DraftRoom({ initial }: { initial: LeagueView }) {
```

with:

```tsx
export function DraftRoom({ initial, access }: { initial: LeagueView; access: LeagueAccess }) {
```

In `src/components/draft/DraftRoom.tsx`, replace:

```tsx
        <DraftLobby
          league={league}
          viewerId={viewerId}
```

with:

```tsx
        <DraftLobby
          league={league}
          access={access}
          viewerId={viewerId}
```

In `src/components/draft/DraftRoom.tsx`, replace:

```tsx
        <DraftStatusBar
          league={league}
          turn={turn}
```

with:

```tsx
        <DraftStatusBar
          league={league}
          invitePath={access.invitePath}
          turn={turn}
```

In `src/components/draft/DraftLobby.tsx`, replace:

```tsx
import { Users } from "lucide-react";
```

with:

```tsx
import { Users } from "lucide-react";
import { CopyLink } from "@/components/access/CopyLink";
```

In `src/components/draft/DraftLobby.tsx`, replace:

```tsx
import type { League } from "@/lib/types";
import { InviteLink } from "./InviteLink";
```

with:

```tsx
import type { LeagueAccess } from "@/lib/access/links";
import type { League } from "@/lib/types";
```

In `src/components/draft/DraftLobby.tsx`, replace:

```tsx
export function DraftLobby({
  league,
  viewerId,
```

with:

```tsx
export function DraftLobby({
  league,
  access,
  viewerId,
```

In `src/components/draft/DraftLobby.tsx`, replace:

```tsx
}: {
  league: League;
  viewerId: string | null;
```

with:

```tsx
}: {
  league: League;
  access: LeagueAccess;
  viewerId: string | null;
```

In `src/components/draft/DraftLobby.tsx`, replace:

```tsx
      {openSeats(league.managers).length > 0 && <InviteLink leagueId={league.id} />}
```

with:

```tsx
      {access.invitePath && openSeats(league.managers).length > 0 && (
        <CopyLink
          path={access.invitePath}
          label="League invite link"
          description="Send this to the group. Anyone with it can claim an open seat. Manage it in League settings."
        />
      )}
      {canControl && access.personalPath && (
        <CopyLink
          path={access.personalPath}
          label="Your sign-in link"
          description="Save this somewhere safe. It's the only way back into the commissioner seat if you switch devices or clear cookies."
        />
      )}
```

In `src/components/draft/DraftStatusBar.tsx`, replace:

```tsx
import { InviteLink } from "./InviteLink";
```

with:

```tsx
import { CopyLink } from "@/components/access/CopyLink";
```

In `src/components/draft/DraftStatusBar.tsx`, replace:

```tsx
export function DraftStatusBar({
  league,
  turn,
```

with:

```tsx
export function DraftStatusBar({
  league,
  invitePath,
  turn,
```

In `src/components/draft/DraftStatusBar.tsx`, replace:

```tsx
}: {
  league: League;
  turn: TurnSummary;
```

with:

```tsx
}: {
  league: League;
  /** Commissioner only. */
  invitePath: string | null;
  turn: TurnSummary;
```

In `src/components/draft/DraftStatusBar.tsx`, replace:

```tsx
        {canControl && turn.kind !== "complete" && openSeats(managers).length > 0 && (
          <InviteLink leagueId={league.id} compact />
        )}
```

with:

```tsx
        {invitePath && turn.kind !== "complete" && openSeats(managers).length > 0 && (
          <CopyLink path={invitePath} label="Invite link" compact />
        )}
```

Delete:

```bash
git rm src/components/draft/InviteLink.tsx
```

- [ ] **Step 6: Verify**

Run:

```bash
npm test && npm run lint && npm run typecheck && npm run build
```

Expected: all pass.

With `npm run dev` running:

Run:

```bash
B=http://localhost:3000; J=$(mktemp -d)
api() { curl -s -w " [%{http_code}]\n" -b "$J/$1" -c "$J/$1" -H "Origin: $B" -H "content-type: application/json" "$B$2" -d "$3"; }
L=$(api ana /api/leagues '{"displayName":"Ana"}' | sed -E 's/.*"leagueId":"([a-z0-9]+)".*/\1/')
LINKS=$(curl -s -b "$J/ana" "$B/l/$L/draft" | grep -o '/i/[A-Za-z0-9_-]\{22\}\.[A-Za-z0-9_-]\{22\}' | awk '!s[$0]++')
INVITE=$(echo "$LINKS" | sed -n 1p); PERSONAL=$(echo "$LINKS" | sed -n 2p); echo "invite $INVITE"; echo "personal $PERSONAL"
curl -s "$B/l/$L/draft" | grep -c '/i/'
api ben /api/links/claim "{\"token\":\"${INVITE#/i/}\",\"managerId\":\"m2\",\"displayName\":\"Ben\"}"
api ben /api/links/claim "{\"token\":\"${INVITE#/i/}\",\"managerId\":\"m3\",\"displayName\":\"Ben\"}"
api ana2 /api/links/claim "{\"token\":\"${PERSONAL#/i/}\"}"
curl -s -b "$J/ana2" "$B/api/leagues/$L/draft" | grep -o '"viewerId":"[a-z0-9]*"'
curl -s "$B/i/AAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAA" | grep -o "This link no longer works" | head -1
curl -s -D - -o /dev/null "$B$INVITE" | grep -i referrer-policy
```

Expected: both links print; a spectator's draft room contains `0` links; Ben's claim returns `"managerId":"m2"` `[200]`; his second claim `"already_joined"` `[409]`; the personal link signs a second browser in (`[200]`, then `"viewerId":"m1"`); the forged link shows the message; the header is `Referrer-Policy: no-referrer`.

In the browser: create a league, copy the league invite from the lobby, open it in a private window and join as seat 2. Check the lobby and the link page at 375px and 1440px (no horizontal scroll).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add private league invite, personal links and the link claim page" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: League settings: seats, invite controls, seat resets and your access

**Files:**
- Create: `src/components/access/SeatsPanel.tsx`, `src/components/access/YourAccessPanel.tsx`
- Create: `src/app/api/leagues/[leagueId]/invite/route.ts`, `src/app/api/leagues/[leagueId]/seats/[managerId]/reset/route.ts`, `src/app/api/leagues/[leagueId]/me/link/route.ts`
- Replace: `src/app/l/[leagueId]/settings/page.tsx`
- Modify: `src/components/shell/nav-items.ts`

**Interfaces:**
- Consumes: `rotateLeagueInvite`, `revokeLeagueInvite`, `resetSeat`, `resetOwnLink` (Task 4); `getSession`, `getViewerId`, `getDb`, `getLeagueOrNotFound` (Task 5); `getLeagueAccess`, `CopyLink`, `sendJson` (Task 6); `resultResponse`, `isSameOrigin` (Task 3).
- Produces (routes): `POST /api/leagues/{id}/invite` (rotate), `DELETE /api/leagues/{id}/invite` (revoke), `POST /api/leagues/{id}/seats/{managerId}/reset`, `POST /api/leagues/{id}/me/link { signOutOtherDevices? }`. Each answers `{ ok: true }` or the error; the page calls `router.refresh()` to show the new links.
- Produces (components): `SeatsPanel { league; invitePath; seatInvitePaths }`, `YourAccessPanel { leagueId; personalPath }`.

- [ ] **Step 1: Add the routes**

Each route only checks the origin and passes the session id through. Permissions are decided inside the league transaction.

Create `src/app/api/leagues/[leagueId]/invite/route.ts`:

```ts
import { revokeLeagueInvite, rotateLeagueInvite } from "@/db/actions";
import { getDb } from "@/server/db";
import { errorResponse, isSameOrigin, resultResponse } from "@/server/http";
import { getSession } from "@/server/session";

/** Rotate: revoke the league invite and issue a new one. */
export async function POST(request: Request, ctx: RouteContext<"/api/leagues/[leagueId]/invite">) {
  if (!isSameOrigin(request)) return errorResponse("forbidden");
  const { leagueId } = await ctx.params;
  const session = await getSession();
  return resultResponse(await rotateLeagueInvite(await getDb(), leagueId, session?.id ?? null));
}

/** Revoke the league invite without a replacement. */
export async function DELETE(request: Request, ctx: RouteContext<"/api/leagues/[leagueId]/invite">) {
  if (!isSameOrigin(request)) return errorResponse("forbidden");
  const { leagueId } = await ctx.params;
  const session = await getSession();
  return resultResponse(await revokeLeagueInvite(await getDb(), leagueId, session?.id ?? null));
}
```

Create `src/app/api/leagues/[leagueId]/seats/[managerId]/reset/route.ts`:

```ts
import { resetSeat } from "@/db/actions";
import { getDb } from "@/server/db";
import { errorResponse, isSameOrigin, resultResponse } from "@/server/http";
import { getSession } from "@/server/session";

export async function POST(request: Request, ctx: RouteContext<"/api/leagues/[leagueId]/seats/[managerId]/reset">) {
  if (!isSameOrigin(request)) return errorResponse("forbidden");
  const { leagueId, managerId } = await ctx.params;
  const session = await getSession();
  return resultResponse(await resetSeat(await getDb(), leagueId, session?.id ?? null, managerId));
}
```

Create `src/app/api/leagues/[leagueId]/me/link/route.ts`:

```ts
import { resetOwnLink } from "@/db/actions";
import { getDb } from "@/server/db";
import { errorResponse, isSameOrigin, readJsonBody, resultResponse } from "@/server/http";
import { getSession } from "@/server/session";

/** Replace the viewer's personal link; `{ signOutOtherDevices: true }` also signs out their other browsers. */
export async function POST(request: Request, ctx: RouteContext<"/api/leagues/[leagueId]/me/link">) {
  if (!isSameOrigin(request)) return errorResponse("forbidden");
  const { leagueId } = await ctx.params;
  const body = await readJsonBody(request);
  const session = await getSession();
  return resultResponse(
    await resetOwnLink(await getDb(), leagueId, session?.id ?? null, {
      signOutOtherDevices: body.signOutOtherDevices === true,
    }),
  );
}
```

- [ ] **Step 2: Add the settings panels**

A seat reset asks for confirmation inline. The seat row keeps the name at least 10rem wide and lets the buttons wrap below it, so "Copy rejoin link" and "Reset seat" fit at 375px.

Create `src/components/access/SeatsPanel.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ManagerAvatar } from "@/components/ui/ManagerAvatar";
import { Panel } from "@/components/ui/Panel";
import { managerLabel } from "@/lib/league/managers";
import type { League } from "@/lib/types";
import { CopyLink } from "./CopyLink";
import { sendJson } from "./send-json";

/** Commissioner controls: the league invite and seat resets. */
export function SeatsPanel({
  league,
  invitePath,
  seatInvitePaths,
}: {
  league: Pick<League, "id" | "managers" | "commissionerId">;
  invitePath: string | null;
  seatInvitePaths: Readonly<Record<string, string>>;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState<string | null>(null);

  async function run(url: string, method: "POST" | "DELETE") {
    setPending(true);
    setError(null);
    const result = await sendJson(url, method);
    setPending(false);
    setConfirmingReset(null);
    if (!result.ok) setError(result.message);
    router.refresh();
  }

  const inviteUrl = `/api/leagues/${league.id}/invite`;

  return (
    <Panel title="Seats & links" bodyClassName="flex flex-col gap-6 p-4 sm:p-5">
      <section className="flex flex-col gap-3">
        {invitePath ? (
          <CopyLink
            path={invitePath}
            label="League invite link"
            description="Send this to the group. Anyone with it can claim an open seat until you make a new link or turn it off."
          />
        ) : (
          <p className="text-sm text-fog-300">The league invite link is off. Nobody can claim an open seat.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(inviteUrl, "POST")}>
            {invitePath ? "Make a new link" : "Turn on invite link"}
          </Button>
          {invitePath && (
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(inviteUrl, "DELETE")}>
              Turn off
            </Button>
          )}
        </div>
      </section>

      <ul className="flex flex-col divide-y divide-ink-700 rounded-lg border border-ink-700">
        {league.managers.map((manager) => {
          const isCommissioner = manager.id === league.commissionerId;
          const rejoinPath = seatInvitePaths[manager.id];
          const status = isCommissioner
            ? "Commissioner"
            : manager.displayName === null
              ? "Open seat"
              : rejoinPath
                ? "Waiting to rejoin"
                : "Joined";
          return (
            <li key={manager.id} className="flex flex-col gap-3 px-3 py-3 sm:px-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <div className="flex min-w-0 flex-1 basis-40 items-center gap-3">
                  <ManagerAvatar manager={manager} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{managerLabel(manager)}</p>
                    <p className="text-xs text-fog-400">{status}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {rejoinPath && <CopyLink path={rejoinPath} label="Rejoin link" compact />}
                  {!isCommissioner && manager.displayName !== null && confirmingReset !== manager.id && (
                    <Button variant="ghost" size="sm" disabled={pending} onClick={() => setConfirmingReset(manager.id)}>
                      Reset seat
                    </Button>
                  )}
                </div>
              </div>
              {confirmingReset === manager.id && (
                <div className="flex flex-col gap-3 rounded-lg border border-negative/50 bg-negative/10 p-3 text-sm">
                  <p>
                    Sign {managerLabel(manager)} out on every device and make a one-time rejoin link? Their name and
                    picks stay.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() => run(`/api/leagues/${league.id}/seats/${manager.id}/reset`, "POST")}
                    >
                      Reset seat
                    </Button>
                    <Button variant="ghost" size="sm" disabled={pending} onClick={() => setConfirmingReset(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}
    </Panel>
  );
}
```

Create `src/components/access/YourAccessPanel.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { CopyLink } from "./CopyLink";
import { sendJson } from "./send-json";

/** Any manager: their personal sign-in link, and a way to replace it. */
export function YourAccessPanel({ leagueId, personalPath }: { leagueId: string; personalPath: string | null }) {
  const router = useRouter();
  const [signOutOtherDevices, setSignOutOtherDevices] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resetLink() {
    setPending(true);
    setError(null);
    const result = await sendJson(`/api/leagues/${leagueId}/me/link`, "POST", { signOutOtherDevices });
    setPending(false);
    if (!result.ok) setError(result.message);
    router.refresh();
  }

  return (
    <Panel title="Your access" bodyClassName="flex flex-col gap-4 p-4 sm:p-5">
      {personalPath && (
        <CopyLink
          path={personalPath}
          label="Your sign-in link"
          description="Open it on another device to sign in as you. Keep it private: anyone with it can act as you."
        />
      )}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={signOutOtherDevices}
          onChange={(event) => setSignOutOtherDevices(event.target.checked)}
          className="accent-[var(--color-accent)]"
        />
        Also sign out my other devices
      </label>
      <Button variant="secondary" disabled={pending} onClick={resetLink} className="self-start">
        {pending ? "Resetting…" : "Reset my link"}
      </Button>
      <p className="text-sm text-fog-400">Resetting makes your old sign-in link stop working.</p>
      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}
    </Panel>
  );
}
```

- [ ] **Step 3: Build the settings page and mark it ready**

Replace the whole of `src/app/l/[leagueId]/settings/page.tsx`:

```tsx
import { Suspense } from "react";
import { SeatsPanel } from "@/components/access/SeatsPanel";
import { YourAccessPanel } from "@/components/access/YourAccessPanel";
import { PageHeader } from "@/components/shell/PageHeader";
import { PageFallback } from "@/components/ui/PageFallback";
import { Panel } from "@/components/ui/Panel";
import type { League } from "@/lib/types";
import { getLeagueAccess } from "@/server/access";
import { getLeagueOrNotFound } from "@/server/league";
import { getViewerId } from "@/server/session";

export default function SettingsPage({ params }: PageProps<"/l/[leagueId]/settings">) {
  return (
    <Suspense fallback={<PageFallback label="Loading settings…" />}>
      <SettingsContent params={params} />
    </Suspense>
  );
}

async function SettingsContent({ params }: { params: PageProps<"/l/[leagueId]/settings">["params"] }) {
  const { leagueId } = await params;
  const league = await getLeagueOrNotFound(leagueId);
  const viewerId = await getViewerId(league.id);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="League settings"
        subtitle={`${league.name} • ${league.seasonLabel}`}
        tag={league.isDemo ? "Demo data" : undefined}
      />
      <SettingsBody league={league} viewerId={viewerId} />
      <Panel bodyClassName="p-4 text-sm text-fog-400 sm:p-5">
        Scoring weights and round count aren&apos;t configurable yet.
      </Panel>
    </div>
  );
}

async function SettingsBody({ league, viewerId }: { league: League; viewerId: string | null }) {
  if (league.isDemo) {
    return (
      <Panel bodyClassName="p-4 text-fog-300 sm:p-5">
        The demo league is read-only. Create your own league to manage invites and seats.
      </Panel>
    );
  }
  if (viewerId === null) {
    return (
      <Panel bodyClassName="p-4 text-fog-300 sm:p-5">
        Only managers in this league can see its links. Ask your commissioner for the league invite link.
      </Panel>
    );
  }
  const access = await getLeagueAccess(league, viewerId);
  return (
    <>
      {viewerId === league.commissionerId && (
        <SeatsPanel league={league} invitePath={access.invitePath} seatInvitePaths={access.seatInvitePaths} />
      )}
      <YourAccessPanel leagueId={league.id} personalPath={access.personalPath} />
    </>
  );
}
```

In `src/components/shell/nav-items.ts`, replace:

```ts
{ href: `${base}/settings`, label: "League settings", shortLabel: "Settings", icon: Settings, ready: false, exact: false },
```

with:

```ts
{ href: `${base}/settings`, label: "League settings", shortLabel: "Settings", icon: Settings, ready: true, exact: false },
```

- [ ] **Step 4: Verify**

Run:

```bash
npm test && npm run lint && npm run typecheck && npm run build
```

Expected: all pass.

In the browser with `npm run dev`: create a league and join seat 2 from a private window. As the commissioner open **League settings**: the invite has a copy box, **Make a new link** and **Turn off**; Ben's row has **Reset seat**. Reset it: the private window's draft room loses its seat on the next poll, the row shows "Waiting to rejoin" with **Copy rejoin link**, and the rejoin link opens "Rejoin your seat" with Ben's name filled in. As Ben, **Reset my link** with "Also sign out my other devices" replaces the sign-in link. Check settings at 375px and 1440px.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add league settings for invite links, seat resets and personal access" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Deployment, smoke test, docs and final verification

**Files:**
- Modify: `package.json` (`vercel-build`)
- Create: `scripts/smoke.sh`
- Replace: `README.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: everything above.
- Produces: `npm run vercel-build` (migrate, then build), `scripts/smoke.sh [base-url]` (exits non-zero on any failed check).

- [ ] **Step 1: Migrate before every Vercel build**

Vercel runs `vercel-build` instead of `build` when it exists. Migrating first means a deployment without a database fails instead of going live.

In `package.json`, replace:

```json
    "build": "next build",
```

with:

```json
    "build": "next build",
    "vercel-build": "npm run db:migrate && next build",
```

- [ ] **Step 2: Add the smoke test**

Two-browser API checks for the whole feature, one curl cookie jar per browser. Requests carry an `Origin` header because mutating routes refuse requests without one.

Create `scripts/smoke.sh`:

```bash
#!/usr/bin/env bash
# Two-browser smoke test of leagues, invite links, sessions and draft rules against a running server.
# Usage: scripts/smoke.sh [base-url]    (default http://localhost:3000, e.g. from `npm run dev`)
# Each "browser" is a curl cookie jar. Exits non-zero when any check fails.
set -u
BASE=${1:-http://localhost:3000}
JARS=$(mktemp -d)
trap 'rm -rf "$JARS"' EXIT
FAILED=0
CODE=""
BODY=""

# call JAR METHOD PATH [JSON]: sends the request with this site's Origin; sets CODE and BODY.
call() {
  local args=(-s -o "$JARS/body" -w "%{http_code}" -b "$JARS/$1" -c "$JARS/$1" -X "$2" -H "Origin: $BASE")
  if [ -n "${4:-}" ]; then args+=(-H "content-type: application/json" -d "$4"); fi
  CODE=$(curl "${args[@]}" "$BASE$3")
  BODY=$(cat "$JARS/body")
}

# check LABEL STATUS [TEXT]: passes when CODE is STATUS and BODY contains TEXT.
check() {
  if [ "$CODE" = "$2" ] && { [ -z "${3:-}" ] || grep -qF -- "$3" <<<"$BODY"; }; then
    echo "PASS $1"
  else
    echo "FAIL $1 (got $CODE: $(head -c 160 <<<"$BODY"))"
    FAILED=1
  fi
}

links() { grep -o '/i/[A-Za-z0-9_-]\{22\}\.[A-Za-z0-9_-]\{22\}' <<<"$BODY" | awk '!seen[$0]++'; }
confirm() { call "$1" POST "/api/leagues/$LEAGUE/draft" "{\"type\":\"confirm\",\"teamId\":\"$2\",\"side\":\"$3\",\"pickNumber\":$4}"; }

call ana POST /api/leagues '{"leagueName":"Smoke Test","displayName":"Ana"}'
check "create a league" 201 '"leagueId"'
LEAGUE=$(sed -E 's/.*"leagueId":"([a-z0-9]+)".*/\1/' <<<"$BODY")

call ana GET "/l/$LEAGUE/draft"
INVITE=$(links | sed -n 1p)
ANA_LINK=$(links | sed -n 2p)
[ -n "$INVITE" ] && [ -n "$ANA_LINK" ] && echo "PASS commissioner sees the invite and their sign-in link" ||
  { echo "FAIL commissioner links missing"; FAILED=1; }

call nobody GET "/l/$LEAGUE/draft"
[ -z "$(links)" ] && echo "PASS spectators see no links" || { echo "FAIL spectator sees links"; FAILED=1; }

call ben GET "$INVITE"
check "invite page renders" 200 "Join the league"

CODE=$(curl -s -o "$JARS/body" -w "%{http_code}" -H "content-type: application/json" "$BASE/api/links/claim" \
  -d "{\"token\":\"${INVITE#/i/}\",\"managerId\":\"m2\",\"displayName\":\"Ben\"}")
BODY=$(cat "$JARS/body")
check "claim without Origin is refused" 403 '"forbidden"'

call ben POST /api/links/claim "{\"token\":\"${INVITE#/i/}\",\"managerId\":\"m2\",\"displayName\":\"Ben\"}"
check "Ben claims seat 2" 200 '"managerId":"m2"'
call ben POST /api/links/claim "{\"token\":\"${INVITE#/i/}\",\"managerId\":\"m3\",\"displayName\":\"Ben\"}"
check "a second seat for the same browser is refused" 409 '"already_joined"'

call ben POST "/api/leagues/$LEAGUE/draft" '{"type":"start"}'
check "only the commissioner starts" 403 '"forbidden"'
call ana POST "/api/leagues/$LEAGUE/draft" '{"type":"start"}'
check "commissioner starts; lines freeze" 200 '"source":"static"'

confirm ana MIN OVER 1
check "pick 1" 200
confirm ana MIN OVER 1
check "double submit is stale" 409 '"stale_pick"'
confirm ben MIN UNDER 2
check "pick 2 (other side, other manager)" 200
confirm ana OKC OVER 3
check "commissioner picks for open seat 3" 200
confirm ana BOS OVER 4
check "commissioner picks for open seat 4" 200
confirm ana BOS UNDER 5
check "seat 4 can't hold both sides of BOS" 409 '"team_already_held"'

call ben GET "/api/leagues/$LEAGUE/draft"
check "Ben is seated" 200 '"viewerId":"m2"'
call ana POST "/api/leagues/$LEAGUE/seats/m2/reset" '{}'
check "commissioner resets seat 2" 200 '"ok":true'
call ben GET "/api/leagues/$LEAGUE/draft"
check "Ben is signed out everywhere" 200 '"viewerId":null'

call ana GET "/l/$LEAGUE/settings"
REJOIN=$(links | grep -vF -e "$INVITE" -e "$ANA_LINK" | head -1)
call cal POST /api/links/claim "{\"token\":\"${REJOIN#/i/}\",\"displayName\":\"Benny\"}"
check "the rejoin link re-claims seat 2" 200 '"managerId":"m2"'
call dan POST /api/links/claim "{\"token\":\"${REJOIN#/i/}\",\"displayName\":\"Dan\"}"
check "the rejoin link works once" 404 '"invalid_link"'

call ana POST "/api/leagues/$LEAGUE/invite" '{}'
check "commissioner rotates the invite" 200 '"ok":true'
call eve GET "$INVITE"
check "the old invite stops working" 200 "This link no longer works"
call eve GET "/i/AAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAA"
check "a forged link gets the same message" 200 "This link no longer works"
grep -qi "referrer-policy: no-referrer" <(curl -s -D - -o /dev/null "$BASE$INVITE") &&
  echo "PASS link pages send no Referer" || { echo "FAIL Referrer-Policy header missing"; FAILED=1; }

call ana GET /
check "home lists the league" 200 "Smoke Test"
call ana POST /api/leagues/demo/draft '{"type":"pause"}'
check "demo league is read-only" 403 '"demo_league"'
CODE=$(curl -s -o "$JARS/body" -w "%{http_code}" -b "courtline_seats=$LEAGUE:m1" "$BASE/api/leagues/$LEAGUE/draft")
BODY=$(cat "$JARS/body")
check "the old editable seat cookie grants nothing" 200 '"viewerId":null'

exit $FAILED
```

Run:

```bash
chmod +x scripts/smoke.sh
```

- [ ] **Step 3: Update the docs**

CLAUDE.md's "State and identity" section describes the new rules every later change must follow.

Replace the whole of `CLAUDE.md`:

```markdown
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
- Leagues live in Postgres (`DATABASE_URL`). Without it, outside production, PGlite at `.data/pglite` (delete the
  folder to reset). Production refuses to start without `DATABASE_URL` and `LINK_SECRET` (`src/lib/env.ts`,
  `src/instrumentation.ts`). The demo league (`/l/demo`) lives in code, never in the database, and is read-only.
- Every league write goes through `withLockedLeague` (`src/db/leagues.ts`): it locks the league row, re-reads the
  caller's seat and any link under the lock, then runs the pure decision. Never authorize a write with
  `getViewerId()`; it is for rendering.
- Identity: cookie `courtline_session` holds a random token; the database stores only its SHA-256. A session holds one
  seat per league (`session_seats`). No accounts.
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
```

Replace the whole of `README.md`:

````markdown
# Courtline

Courtline — draft Overs and Unders on every NBA season win total (prototype).

## Setup

```bash
npm install
npm run dev
```

Open http://localhost:3000. The demo league is at http://localhost:3000/l/demo (read-only). To draft for real, use **Create league** on the landing page, then send the league invite link from the draft room to the other managers. Each manager gets a private sign-in link for other devices under **League settings**.

Locally the app stores leagues in PGlite (Postgres in WebAssembly) under `.data/pglite`. Delete that folder to start over. Set `DATABASE_URL=postgres://…` to use a real Postgres instead.

## Deploying to Vercel

1. Add Neon Postgres from the Vercel Marketplace. It sets `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED`; enable a database branch per preview deployment.
2. Set `LINK_SECRET` to at least 32 random characters, e.g. `openssl rand -base64 48`. Changing it invalidates every invite and sign-in link (not sessions).
3. Deploy. `vercel-build` runs `npm run db:migrate` (over the unpooled URL) before `next build`, so a deployment without a database fails instead of going live.

A production server started without `DATABASE_URL` or `LINK_SECRET` refuses to serve: every request returns 500 and the log names what is missing. To try a production build locally, run `DATABASE_URL=pglite:.data/prod LINK_SECRET=$(openssl rand -base64 48) npm start`.

## Commands

```bash
npm test          # Vitest unit tests
npm run lint
npm run typecheck
npm run build
npm start         # serve the production build
npm run db:generate -- --name <change>   # after editing src/db/schema.ts
npm run db:migrate                       # apply migrations to DATABASE_URL
TEST_DATABASE_URL=postgres://… npm run test:pg   # concurrency tests on a real Postgres
scripts/smoke.sh http://localhost:3000   # two-browser API smoke test
```

## Requirements

Node 20. The project uses Vitest 4.1; Vitest 5 needs Node ≥ 22.12.

## Limitations

- No accounts. A manager's access is their browser session plus their personal sign-in link. A commissioner who loses both cannot get the commissioner seat back.
- Lines are the prototype's static mock values; team records are mock data too.
- Rosters, and the scoring and round settings, are not built yet.

## Notices

NBA team logos load from NBA's CDN and are NBA trademarks. Licensing review is required before any public launch.

## Docs

- [CLAUDE.md](CLAUDE.md): project conventions
- [Design spec](docs/superpowers/specs/2026-10-08-courtline-prototype-design.md)
- [Implementation plan](docs/superpowers/plans/2026-10-08-courtline-prototype.md)
- [Durable storage and sessions spec](docs/superpowers/specs/2026-10-08-durable-storage-sessions-design.md) and [plan](docs/superpowers/plans/2026-10-08-durable-storage-sessions.md)
- [`wiremocks/`](wiremocks/): desktop mockups
````

- [ ] **Step 4: Verify: checks and smoke test**

Run:

```bash
npm test && npm run lint && npm run typecheck && npm run build
```

Expected: all pass (171 passed, 2 skipped).

Start `npm run dev`, then:

Run:

```bash
scripts/smoke.sh http://localhost:3000
```

Expected: 27 lines starting `PASS`, exit code 0.

- [ ] **Step 5: Verify: production refuses non-persistent storage**

Run:

```bash
npm run build
env -u DATABASE_URL -u LINK_SECRET npx next start -p 3001
```

Expected: the log shows `Courtline can't start. DATABASE_URL is required in production. Courtline will not start on non-persistent storage. LINK_SECRET is required in production.` before any request, and `curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/` prints `500`. Stop it.

Run:

```bash
DATABASE_URL=pglite:.data/prod LINK_SECRET=$(openssl rand -base64 48) npx next start -p 3001
```

Expected: the app serves normally on the explicit PGlite opt-in. Stop it and delete `.data/prod`.

- [ ] **Step 6: Verify: browser**

With `npm run dev`, check at 375px and 1440px that nothing scrolls horizontally and the dev overlay reports no issues: `/`, `/l/demo`, `/l/demo/draft`, `/l/demo/settings` (read-only notice), and for a league you created: its overview, draft room (lobby links, then a started draft), settings (before and after a seat reset), a league invite page, a rejoin page and a forged `/i/…` link.

Optional, before relying on the row lock in production: run `TEST_DATABASE_URL=postgres://… npm run test:pg` against a Neon branch or local Postgres. Expected: 2 tests pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "docs: document durable storage, sessions and deployment; add smoke test" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
