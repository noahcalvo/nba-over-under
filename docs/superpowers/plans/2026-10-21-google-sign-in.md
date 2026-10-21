# Google Sign-in Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seats, commissioner rights and 30/30 entries belong to a Google account (Better Auth), with an explicit claim
for what browsers held before sign-in.

**Architecture:** Better Auth (Drizzle adapter, renamed core tables) is the authentication layer; `user_seats` and
`challenge_entries.owner_user_id` are the ownership layer, read under the existing locks. The legacy
`courtline_session` tables stay read-only except for the legacy claim. Pure rules stay in `src/lib/`, writes in
`src/db/`, glue in `src/server/`.

**Tech Stack:** Next.js 16.4 App Router (Cache Components), React 19, TypeScript strict, Better Auth 1.7.12 (already in
`package.json`, exact pin), Drizzle 0.45 (Postgres / PGlite), Vitest 4.1, Tailwind v4 tokens.

**Spec:** `docs/superpowers/specs/2026-10-21-google-sign-in-design.md` (read it with this plan; its "Decisions taken"
list is the authority).

## Global Constraints

- Read `CLAUDE.md` and `AGENTS.md` first. Read the relevant guide in `node_modules/next/dist/docs/` before using a Next
  API you haven't used in this repo. Better Auth types live in `node_modules/better-auth/dist/**.d.mts` and
  `node_modules/better-auth/node_modules/@better-auth/core/dist/**.d.mts`: check option names there, never from memory.
- `src/lib/` stays pure (no React, no `next/*`, no `server-only`); tests colocated `*.test.ts`, test-first.
- `src/db/` has no `server-only`; only `src/server/` and `src/app/` import it.
- Every league write goes through `withLockedLeague`; never authorize a write with `getViewerId()`.
- Error codes added (in `src/lib/league/errors.ts`, statuses in `src/server/http.ts`):
  `sign_in_required` 401 "Sign in with Google to do that.", `seat_owned` 409 "Another account already holds this seat.
  Ask your commissioner to reset it.", `entry_exists` 409 "Your account already has a 30/30 entry this season.",
  `auth_unavailable` 503 "Sign-in isn't available right now." (`auth_unavailable` is an `ApiError`, not a
  `DomainError`.)
- Table names: `users`, `auth_sessions`, `auth_accounts`, `auth_verifications`, `user_seats`; Drizzle export keys
  `users`, `authSessions`, `authAccounts`, `authVerifications`, `userSeats`. Column JS keys are exactly Better Auth's
  field names (camelCase); SQL column names snake_case.
- Cookie prefix `courtline`; Better Auth `telemetry: { enabled: false }`; session `expiresIn` =
  `ACCESS.sessionIdleDays` days, `updateAge` = `ACCESS.sessionRenewHours` hours (in seconds).
- Env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_SECRET` (≥ 32 chars), `BETTER_AUTH_URL`,
  `VERCEL_PROJECT_PRODUCTION_URL` (fallback), `AUTH_DEV_LOGIN=1` (development only). Missing auth env never fails
  `register()` or reads.
- No new legacy session is created anywhere; `ensureSession` is deleted in Task 4 (its last caller is the challenge
  entry route).
- UI: dark tokens only (`bg-ink-850`, `text-fog-400`, `text-accent`, …), existing `Button`/`buttonClasses`/`Panel`;
  no horizontal page scroll at 375px or 1440px; any component reading cookies/headers/db sits in `<Suspense>`.
- Exact copy: sign-in page title "Sign in"; button "Continue with Google"; unavailable "Sign-in isn't available right
  now."; shell link "Sign in"; menu item "Sign out"; landing "Sign in with Google to create a league"; invite "Sign in
  with Google to continue"; challenge "Sign in to save"; legacy notice "This browser has seats or a 30/30 entry from
  before sign-in." with link "Move them to your account"; settings panel title "Your account", body "Signed in as
  {email}. Your seat follows your Google account."; dev form heading "Development sign-in".
- Commit per task; message ends with the two trailer lines:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_014SnmaehcdxcKzLXV7Y1iGd`. Never include a model id elsewhere.
- Done means: `npm test && npm run lint && npm run typecheck && npm run build` all pass.

## Review Focus

1. **A personal link opened by a second Google account after the seat moved to the first** → `seat_owned`, seat and
   first account untouched. Test in Task 3.
2. **The same legacy seat claimed from two browsers (laptop and phone legacy cookies) by one account** → first "moved",
   second "already_yours", no 500. By two different accounts → second `seat_owned`. Tests in Task 5.
3. **A signed-out POST/PUT to any mutation route** → 401 `sign_in_required`, never 403 or 500. Covered by the route
   checklist in Task 3/4 and the smoke script in Task 8.
4. **Production without Google env** → pages render, `/api/auth/*` 503, `/sign-in` shows the unavailable copy.
   `readAuthConfig` tests in Task 2.
5. **`/sign-in?next=//evil.example` or `next=https://evil.example`** → lands on `/`. `safeNextPath` tests in Task 6.

---

### Task 1: Account tables, migration and seat queries

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/0006_accounts.sql` (+ `drizzle/meta/*` from `npm run db:generate -- --name accounts`)
- Create: `src/db/accounts.ts`, `src/db/accounts.test.ts`
- Modify: `src/db/test-db.ts` (add `createTestUser`), `src/db/migrations.test.ts`

**Interfaces:**
- Produces (schema): `users`, `authSessions`, `authAccounts`, `authVerifications`, `userSeats`;
  `challengeEntries.ownerUserId` (`owner_user_id` text, references `users.id` `ON DELETE SET NULL`) and unique
  `challenge_entries_user_unique` on `(season, owner_user_id)`.
- Produces (`src/db/accounts.ts`):
  - `userSeatInLeague(db: Db | Tx, userId: string, leagueId: string): Promise<string | null>` — manager id
  - `seatHolder(db: Db | Tx, leagueId: string, managerId: string): Promise<string | null>` — user id
  - `bindUserSeat(db: Db | Tx, userId: string, leagueId: string, managerId: string): Promise<void>` — plain insert;
    callers decide under the league lock, constraints are the backstop
  - `unbindSeatHolder(db: Db | Tx, leagueId: string, managerId: string): Promise<void>`
  - `loadUserSeats(db: Db, userId: string): Promise<Readonly<Record<string, string>>>` — leagueId → managerId
  - `listUserLeagues(db: Db, userId: string): Promise<SeatedLeague[]>` — same shape and order (most recently joined
    first) as `listSessionLeagues` in `src/db/leagues.ts` (reuse its `SeatedLeague` type)
- Produces (`src/db/test-db.ts`): `createTestUser(db: Db, name?: string): Promise<string>` — inserts a `users` row with
  a random id and unique email `${id}@test.local`, returns the id.

Tables (SQL names → columns): `users` (`id` text pk, `name` text not null, `email` text not null unique,
`email_verified` boolean not null default false, `image` text, `created_at`/`updated_at` timestamptz not null default
now). `auth_sessions` (`id` text pk, `expires_at` timestamptz not null, `token` text not null unique, `created_at`,
`updated_at`, `ip_address` text, `user_agent` text, `user_id` text not null → users cascade, index on `user_id`).
`auth_accounts` (`id` text pk, `account_id` text not null, `provider_id` text not null, `user_id` → users cascade
(indexed), `access_token`, `refresh_token`, `id_token` text, `access_token_expires_at`, `refresh_token_expires_at`
timestamptz, `scope`, `password` text, `created_at`, `updated_at`; unique `(provider_id, account_id)`).
`auth_verifications` (`id` text pk, `identifier` text not null (indexed), `value` text not null, `expires_at`,
`created_at`, `updated_at`). `user_seats` (`user_id` → users cascade, `league_id`, `manager_id`, `created_at`; pk
`user_seats_pkey (user_id, league_id)`; unique `user_seats_seat_unique (league_id, manager_id)`; fk
`user_seats_manager_fk (league_id, manager_id)` → managers cascade).

- [ ] **Step 1: Write failing tests** in `src/db/accounts.test.ts` (create a league with `insertLeague` or
  `createLeagueFor`-free setup via `insertLeague` + `buildDemoLeague`-style league, as `leagues.test.ts` does):
  - `"binds one seat per user per league"`: `bindUserSeat(u1, L, "m1")` then `bindUserSeat(u1, L, "m2")` rejects
    (unique violation); `userSeatInLeague(db, u1, L)` → `"m1"`.
  - `"binds one user per seat"`: `bindUserSeat(u1, L, "m2")`, `bindUserSeat(u2, L, "m2")` rejects;
    `seatHolder(db, L, "m2")` → `u1`.
  - `"unbinds a seat's holder"`: after `unbindSeatHolder(db, L, "m2")`, `seatHolder` → `null`.
  - `"drops the binding when the seat is removed"`: deleting the `managers` row cascades (`seatHolder` → `null`).
  - `"lists a user's leagues, most recently joined first"`: two leagues, `listUserLeagues` order and
    `manager.id`, and `loadUserSeats` → `{ [L1]: "m1", [L2]: "m3" }`.
  - `"one challenge entry per user per season"`: inserting two `challenge_entries` rows with the same season and
    `ownerUserId` rejects; two with `ownerUserId: null` succeed.
- [ ] **Step 2: Run** `npx vitest run src/db/accounts.test.ts` — FAIL (module/tables missing).
- [ ] **Step 3: Implement** the schema, run `npm run db:generate -- --name accounts`, check the SQL creates only the
  new tables/column/constraint (no change to existing tables beyond `challenge_entries`), implement
  `src/db/accounts.ts` and `createTestUser`.
- [ ] **Step 4: Extend** `src/db/migrations.test.ts` with `"keeps leagues, seats and entries stored before accounts"`:
  apply migrations `< "0006"`, insert a league, managers, a `sessions` + `session_seats` row and a challenge season +
  entry with `owner_session_id`; apply `0006`; assert the league loads unchanged, the session seat still reads via
  `seatInLeague` from `src/db/sessions.ts`, the entry's `owner_user_id` is null and `user_seats` is empty.
- [ ] **Step 5: Run** `npm test` — PASS; `npm run typecheck` — PASS.
- [ ] **Step 6: Commit** `feat: account tables and user seats`.

### Task 2: Better Auth server setup

**Files:**
- Modify: `src/lib/env.ts`, `src/lib/env.test.ts` (create if absent), `src/instrumentation.ts`,
  `src/lib/league/errors.ts`, `src/server/http.ts`
- Create: `src/server/auth.ts`, `src/server/account.ts`, `src/app/api/auth/[...all]/route.ts`

**Interfaces:**
- Consumes: Task 1 tables.
- Produces (`src/lib/env.ts`):
  ```ts
  export interface AuthConfig {
    baseURL: string; // origin, no trailing slash
    secret: string;
    google: { clientId: string; clientSecret: string } | null;
    devLogin: boolean;
    usingDevSecret: boolean;
  }
  export type AuthConfigResult = { ok: true; config: AuthConfig } | { ok: false; problems: string[] };
  export function readAuthConfig(env: Readonly<Record<string, string | undefined>>): AuthConfigResult;
  ```
- Produces (`src/server/auth.ts`, `import "server-only"`): `getAuth(): Promise<CourtlineAuth | null>` (null when
  `readAuthConfig` fails; built once per process on `globalThis`, with `await getDb()`), `type CourtlineAuth`,
  `authAvailability(): { available: boolean; devLogin: boolean }` (no database read).
- Produces (`src/server/account.ts`, `import "server-only"`):
  ```ts
  export interface Account { userId: string; name: string; email: string; image: string | null }
  export const getAccount: () => Promise<Account | null>; // React cache(), reads headers()
  ```
- Produces: errors `sign_in_required`, `seat_owned`, `entry_exists` (`DomainError`) and `auth_unavailable`
  (`ApiError` only) with the messages and statuses in Global Constraints.

`readAuthConfig` rules: production = `NODE_ENV === "production"`. Secret: `BETTER_AUTH_SECRET`; empty → in production a
problem `"BETTER_AUTH_SECRET is required for sign-in."`, otherwise the development constant
`"courtline-development-auth-secret-not-for-production"` and `usingDevSecret: true`; present but shorter than 32 → a
problem. Google: both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` → set; exactly one → problem
`"Set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET."`; neither → `null`. `devLogin = !production &&
AUTH_DEV_LOGIN === "1"`. Neither Google nor devLogin → problem `"Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (or
AUTH_DEV_LOGIN=1 outside production)."`. baseURL: `BETTER_AUTH_URL`, else `https://${VERCEL_PROJECT_PRODUCTION_URL}`
when set, else `http://localhost:3000` outside production, else problem `"BETTER_AUTH_URL is required for sign-in."`;
it must parse as an `http:`/`https:` URL and is normalized to its `origin`.

`getAuth` options: `appName: "Courtline"`, `baseURL`, `secret`, `database: drizzleAdapter(db, { provider: "pg",
schema: { users, authSessions, authAccounts, authVerifications } })`, model names `users` / `authSessions` /
`authAccounts` / `authVerifications`, `session.expiresIn` / `updateAge` from `ACCESS`,
`socialProviders: google ? { google: { clientId, clientSecret, prompt: "select_account" } } : {}`,
`emailAndPassword: { enabled: devLogin }`, `advanced: { cookiePrefix: "courtline" }`, `telemetry: { enabled: false }`,
`trustedOrigins: [baseURL]`. The `[...all]` route answers `errorResponse("auth_unavailable")` when `getAuth()` is null,
else `auth.handler(request)` for GET and POST.

- [ ] **Step 1: Write failing tests** in `src/lib/env.test.ts` for `readAuthConfig`:
  `"production needs a secret, Google and a URL"` (empty env with `NODE_ENV: "production"` → three problems);
  `"production falls back to the Vercel production URL"` (`VERCEL_PROJECT_PRODUCTION_URL: "nba-over-under-iota.vercel.app"`
  → `baseURL: "https://nba-over-under-iota.vercel.app"`); `"never enables dev login in production"`
  (`AUTH_DEV_LOGIN: "1"` + full Google env in production → `devLogin: false`); `"development uses the dev secret and
  localhost"` (`AUTH_DEV_LOGIN: "1"` only → ok, `usingDevSecret: true`, `baseURL: "http://localhost:3000"`,
  `google: null`); `"rejects half a Google config"`; `"rejects a short secret"`; `"normalizes BETTER_AUTH_URL to its
  origin"` (`"https://example.com/path/"` → `"https://example.com"`); `"rejects a non-http URL"`
  (`"ftp://example.com"`).
- [ ] **Step 2: Run** `npx vitest run src/lib/env.test.ts` — FAIL.
- [ ] **Step 3: Implement** `readAuthConfig`, the errors and statuses, `src/server/auth.ts`, `src/server/account.ts`,
  the route, and in `register()` log (never throw) `Sign-in is off: …problems` when `readAuthConfig` fails and a warning
  when `usingDevSecret`.
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run lint && npm run build` — PASS.
- [ ] **Step 5: Manual check:** `AUTH_DEV_LOGIN=1 npm run dev`, then
  `curl -s -c /tmp/j -H 'content-type: application/json' -H 'origin: http://localhost:3000' -d
  '{"email":"a@test.local","password":"password1234","name":"Ana"}' localhost:3000/api/auth/sign-up/email` returns a
  user, and `curl -s -b /tmp/j localhost:3000/api/auth/get-session` returns it. Without `AUTH_DEV_LOGIN` and Google
  env, `/api/auth/get-session` → 503. Note results in the report.
- [ ] **Step 6: Commit** `feat: Better Auth with Google`.

### Task 3: League access by account

**Files:**
- Modify: `src/lib/league/commands.ts` (+ its test), `src/db/leagues.ts`, `src/db/actions.ts`,
  `src/db/actions.test.ts`, `src/db/leagues.test.ts`, `src/db/concurrency.pg.test.ts`, `src/db/migrations.test.ts`,
  `src/server/session.ts`, `src/server/league.ts`, `src/server/access.ts`, `src/lib/access/links.ts`,
  every route under `src/app/api/leagues/**` and `src/app/api/links/claim/route.ts`, `src/app/i/[token]/page.tsx`,
  `src/app/l/[leagueId]/settings/page.tsx`, `src/components/draft/DraftLobby.tsx`, `src/app/page.tsx` (only if it
  needs the renamed loader)
- Delete: `src/app/api/leagues/[leagueId]/me/link/route.ts`, `src/components/access/YourAccessPanel.tsx`

**Interfaces:**
- Consumes: Task 1 `userSeatInLeague`, `seatHolder`, `bindUserSeat`, `unbindSeatHolder`, `loadUserSeats`,
  `listUserLeagues`, `createTestUser`; Task 2 `getAccount`, errors.
- Produces:
  - `withLockedLeague(db, leagueId, userId: string | null, work)` — `actorId` = `userSeatInLeague` under the lock.
  - Every function in `src/db/actions.ts` takes `userId: string` (or `string | null` where it took
    `sessionId: string | null`) in place of `sessionId`. `resetOwnLink` and `decideOwnLinkReset` are deleted.
  - `decideClaim(league, link, actor: ClaimActor, input)` with
    `export interface ClaimActor { seatId: string | null; linkSeatHolder: "none" | "self" | "other" }` —
    `linkSeatHolder` is whose account holds the link's seat (always `"none"` for a league invite).
  - `src/server/session.ts`: `getLegacySession()` (the old `getSession`, unchanged behavior), `SESSION_COOKIE`,
    `getViewerId(leagueId)` now from `loadUserSeats` of `getAccount()` (cached per request). `ensureSession` stays
    only for the challenge entry route until Task 4 deletes it.
  - `listViewerLeagues()` reads `listUserLeagues` for the account.
  - `LeagueAccess` loses `personalPath`.

Rules (spec decision 6): `createLeagueFor(db, userId, input)` binds the commissioner's seat to the user and issues only
the league invite. `claimLinkInLeague`: read `seatHolder` of the link's seat under the lock (league invite: of the chosen
seat after the decision; it is open so it has none), decide, then `bindUserSeat` unless the holder is already the user,
then revoke the claimed seat's personal links; never issue a personal link. `decideClaim`: league invite as before
(`already_joined` when `seatId !== null`); personal: `seatId !== null && seatId !== seat.id` → `already_joined`,
`linkSeatHolder === "other"` → `seat_owned`, else unchanged league; seat invite: as before.
`resetSeat`: `unbindSeatHolder` + legacy `unbindSeat` + the existing link changes. Route handlers:
`const account = await getAccount(); if (!account) return errorResponse("sign_in_required");` after the same-origin
check, then pass `account.userId`. The draft page and `/i/{token}` keep working through `getViewerId`. The settings page
shows only the commissioner's `SeatsPanel` for now (Task 7 adds "Your account"); `DraftLobby` drops its personal link
block.

- [ ] **Step 1: Update tests first.** In `actions.test.ts`/`leagues.test.ts`/`migrations.test.ts`/
  `concurrency.pg.test.ts` replace `createSession` actors with `createTestUser`, and add to `actions.test.ts`:
  - `"a personal link binds a seat no account holds"`: legacy-style personal link for `m2` (issue with `issueLink`),
    claim as `u2` → ok, `seatHolder(m2)` → `u2`, that personal link revoked.
  - `"a personal link never moves a seat between accounts"` (Review Focus 1): after the above, `u3` claims a new
    personal link for `m2` → `seat_owned`; `seatHolder(m2)` still `u2`; `u3` holds nothing.
  - `"a personal link for another seat is already_joined"`.
  - `"creating a league issues no personal link"`: `listActiveLinks` has only the league invite.
  - `"a seat reset unbinds the account and legacy sessions"`: holder null, `session_seats` rows for the seat gone, a
    seat invite issued; the old holder's draft action → `forbidden`.
  - and in `commands.test.ts` the `decideClaim` cases for each `linkSeatHolder`.
- [ ] **Step 2: Run** `npm test` — FAIL on the new/changed cases.
- [ ] **Step 3: Implement** the changes above. Grep `getSession\|ensureSession\|sessionId\|personalPath\|resetOwnLink`
  across `src/` until only legacy uses remain (`src/db/sessions.ts`, `getLegacySession`, and challenge code that Task 4
  changes).
- [ ] **Step 4: Run** `npm test && npm run lint && npm run typecheck && npm run build` — PASS.
- [ ] **Step 5: Commit** `feat: league seats belong to accounts`.

### Task 4: Challenge entries by account

**Files:**
- Modify: `src/db/challenge.ts`, `src/db/challenge.test.ts`, `src/app/api/challenge/entry/route.ts`,
  `src/server/challenge.ts`, `src/server/game-interest.ts`, any test of `game-interest`/`nba-pages` that stubs sessions

**Interfaces:**
- Consumes: Task 2 `getAccount`; Task 3 `getLegacySession`.
- Produces: `ensureSession` deleted; `SaveEntryInput.userId: string` replaces `sessionId`; `saveChallengeEntry` writes `ownerUserId` (never
  `ownerSessionId`) and finds the entry by `(season, ownerUserId)`; `loadEntryForUser(db, season, userId)`;
  `loadEntryForSession` stays (legacy claim). `getViewerEntry(db)` and the NBA interests read the account.

- [ ] **Step 1: Update tests** in `challenge.test.ts` to users, and add `"one entry per account per season"` (two saves
  by `u1` update one entry; `u2` gets its own) and `"a legacy entry is not the account's entry"` (an entry inserted with
  `ownerSessionId` only is not returned by `loadEntryForUser`, and `u1` saving creates a separate entry).
- [ ] **Step 2: Run** `npx vitest run src/db/challenge.test.ts` — FAIL.
- [ ] **Step 3: Implement.** The route returns `sign_in_required` before parsing when signed out.
- [ ] **Step 4: Run** `npm test && npm run lint && npm run typecheck && npm run build` — PASS.
- [ ] **Step 5: Commit** `feat: challenge entries belong to accounts`.

### Task 5: Legacy claim

**Files:**
- Create: `src/lib/access/legacy.ts`, `src/lib/access/legacy.test.ts`, `src/db/legacy.ts`, `src/db/legacy.test.ts`,
  `src/server/legacy.ts`, `src/app/api/account/legacy/route.ts`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces:
  ```ts
  // src/lib/access/legacy.ts
  export type LegacySeatOutcome = "moved" | "already_yours" | "already_joined" | "seat_owned";
  export function decideLegacySeat(input: { userId: string; managerId: string; userSeatId: string | null; seatHolderId: string | null }): LegacySeatOutcome;
  // src/db/legacy.ts
  export interface LegacyItems { seats: SeatedLeague[]; entry: { id: string; displayName: string } | null }
  export function listLegacyItems(db: Db, sessionId: string, season: number): Promise<LegacyItems>;
  export interface LegacyClaimResult {
    seats: { leagueId: string; leagueName: string; managerId: string; outcome: LegacySeatOutcome }[];
    entry: { id: string; displayName: string; outcome: "moved" | "entry_exists" } | null;
    sessionCleared: boolean;
  }
  export function claimLegacy(db: Db, sessionId: string, userId: string, season: number): Promise<LegacyClaimResult>;
  // src/server/legacy.ts
  export function getLegacyItems(): Promise<LegacyItems | null>; // null unless signed in AND a legacy session has something
  ```
- `POST /api/account/legacy`: same-origin, `sign_in_required` when signed out, `{ seats: [], entry: null,
  sessionCleared: false }` when there is no legacy session, else `claimLegacy` for `CHALLENGE.seasonYear`; deletes the
  `courtline_session` cookie when `sessionCleared`. Responds with the result JSON.

`decideLegacySeat` order: `seatHolderId === userId` → `already_yours`; `userSeatId !== null` → `already_joined`;
`seatHolderId !== null` → `seat_owned`; else `moved`. `claimLegacy`: each seat inside `withLockedLeague(db, leagueId,
userId, …)` (actor = the user's seat there), `seatHolder` read under the lock, `bindUserSeat` on `moved`, delete the
session's `session_seats` row on `moved`/`already_yours`. Entry: one transaction, select the season's entry with
`ownerSessionId = sessionId and ownerUserId is null` `FOR UPDATE`; if the user has an entry that season →
`entry_exists`, else set `ownerUserId = userId, ownerSessionId = null` (only those two columns); a unique violation on
`challenge_entries_user_unique` also means `entry_exists`. Finally delete the `sessions` row when it has no
`session_seats` rows and no `challenge_entries` reference it (any season) → `sessionCleared: true`.

- [ ] **Step 1: Write failing tests:** `legacy.test.ts` (lib) — one case per outcome, plus "already_yours wins over
  already_joined". `src/db/legacy.test.ts`:
  - `"moves seats and the entry into the account"`: legacy session with seats in two leagues and an entry → both
    `moved`, entry `moved`, `seatHolder` = user, `loadEntryForUser` returns the entry with unchanged picks,
    `pickedAt`, `lineAtPick` and name, `sessionCleared: true`, `findSession` → null.
  - `"two browsers, one account"` (Review Focus 2): sessions S1 and S2 both hold `m2`; claim S1 → `moved`; claim S2 →
    `already_yours`; both legacy rows gone.
  - `"two browsers, two accounts"`: S1 by u1 `moved`; S2 by u2 → `seat_owned`; S2's row stays,
    `sessionCleared: false`.
  - `"keeps a conflicting entry"`: u1 already has an entry → `entry_exists`, legacy entry's owners unchanged.
  - `"moves a locked entry's owner only"`: season frozen (`freezeChallenge` after the deadline) → entry `moved`, picks
    and `savedAt` unchanged.
  - `"concurrent claims of one seat by two accounts"`: `Promise.all` of two `claimLegacy` calls → exactly one `moved`,
    the other `seat_owned`, no throw.
- [ ] **Step 2: Run** them — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run lint && npm run typecheck && npm run build` — PASS.
- [ ] **Step 5: Commit** `feat: move a browser's seats and entry to an account`.

### Task 6: Sign-in page and account menu

**Files:**
- Create: `src/lib/access/next-path.ts` (+ test), `src/app/sign-in/page.tsx`, `src/components/account/auth-client.ts`,
  `src/components/account/GoogleSignInButton.tsx`, `src/components/account/DevSignInForm.tsx`,
  `src/components/account/AccountMenu.tsx`, `src/components/account/AccountSlot.tsx`
- Modify: `src/components/shell/AppShell.tsx`, `src/components/challenge/ChallengeShell.tsx`,
  `src/components/nba/NbaShell.tsx`

**Interfaces:**
- Consumes: Task 2 `getAccount`, `authAvailability`.
- Produces: `safeNextPath(raw: unknown): string`; `signInHref(next: string): string` (=
  `/sign-in?next=${encodeURIComponent(next)}`) in the same file; `<AccountSlot />` (server, wraps its own `Suspense`
  with a fixed-size fallback, passes `Account | null` to the client `AccountMenu`); `authClient` from
  `createAuthClient()` (`better-auth/react`).

`safeNextPath`: a string starting with `/`, not `//`, no `\`, no control characters, at most 2048 chars → itself;
anything else → `/`. `/sign-in`: signed in → `redirect(safeNextPath(next))`; auth unavailable → the unavailable copy;
else "Continue with Google" (`authClient.signIn.social({ provider: "google", callbackURL: next })`) and, when
`devLogin`, the "Development sign-in" form (name, email, password; sign in, falling back to sign up when the account
doesn't exist; then `window.location.assign(next)`). `AccountMenu`: signed out → "Sign in" link to
`signInHref(pathname + search)`; signed in → avatar (Google `image` via `next/image` `unoptimized` with
`referrerPolicy="no-referrer"`, falling back to initials like `ManagerAvatar`) + name, a menu (button with
`aria-expanded`, closes on Escape and outside click) showing the email and "Sign out" (`authClient.signOut()` then
`router.refresh()`). Shell placement: `AppShell` sidebar bottom and mobile header; `ChallengeShell` / `NbaShell` header
beside `ViewerLeaguesMenu`. Must fit 375px headers.

- [ ] **Step 1: Write failing tests** for `safeNextPath` (Review Focus 5): `"/l/abc"` kept; `"/challenge?x=1"` kept;
  `"//evil.example"`, `"https://evil.example"`, `"/\\evil"`, `"javascript:alert(1)"`, `""`, `undefined`, `42`,
  `"/a\nb"` → `"/"`. And `signInHref("/i/tok?x=1")` → `"/sign-in?next=%2Fi%2Ftok%3Fx%3D1"`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4:** `npm test && npm run lint && npm run typecheck && npm
  run build` — PASS.
- [ ] **Step 5: Browser check** (`AUTH_DEV_LOGIN=1 npm run dev`, Playwright with `/opt/pw-browsers/chromium`): sign in
  through the dev form from `/challenge`, land back on `/challenge`, see the name in the header at 375px and 1440px, sign
  out. Screenshot paths in the report.
- [ ] **Step 6: Commit** `feat: sign-in page and account menu`.

### Task 7: Signed-in flows and the legacy claim page

**Files:**
- Modify: `src/app/page.tsx`, `src/components/landing/CreateLeagueForm.tsx` (only if needed),
  `src/app/i/[token]/page.tsx`, `src/components/access/LinkClaimForm.tsx`, `src/app/l/[leagueId]/settings/page.tsx`,
  challenge board save UI (`src/components/challenge/SavePanel.tsx`, `ChallengeBoard.tsx` and the compact save bar —
  find where `onSave` is wired), the challenge page loader that feeds the board
- Create: `src/components/account/YourAccountPanel.tsx`, `src/app/account/page.tsx`,
  `src/components/account/LegacyClaim.tsx`, `src/components/account/LegacyNotice.tsx`

**Interfaces:**
- Consumes: Task 2 `getAccount`, Task 5 `getLegacyItems` and the route, Task 6 `signInHref`, `AccountSlot`.

Behavior: landing Create league panel signed out → "Sign in with Google to create a league" (button-styled link to
`signInHref("/")`). `/i/{token}` signed out → title, league and seat as now, then "Sign in with Google to continue"
linking to `signInHref("/i/{token}")`; signed in → the existing form (personal-link copy becomes "This link adds
{seat} in {league} to your account." and button "Add to my account"). Settings: "Your account" panel for any signed-in
viewer of a stored league (also non-managers), after `SeatsPanel`. Challenge: the board receives `signedIn: boolean`;
signed out, the save buttons (rail and compact bar) read "Sign in to save" and navigate to `signInHref("/challenge")`
without touching the local draft. `/account`: signed out → `redirect(signInHref("/account"))`; shows the account
(name, email) and, from `getLegacyItems()`, each legacy seat (league name, seat label) and the entry with one "Move to
my account" button (`LegacyClaim`, client: POST, then shows each outcome with its message — `moved` "Moved",
`already_yours` "Already in your account", `already_joined` ERROR_MESSAGES.already_joined, `seat_owned`
ERROR_MESSAGES.seat_owned, `entry_exists` ERROR_MESSAGES.entry_exists — then `router.refresh()`); nothing legacy →
"Nothing to move." `LegacyNotice` (server, own Suspense, renders null unless `getLegacyItems()` has items): the notice
copy and link to `/account`, placed at the top of the main column in `AppShell`, `ChallengeShell`, `NbaShell` and on
the landing page. Display names (spec decision 13): the create-league form, the claim form and the challenge name
field start from the account's Google name when they would otherwise be empty; a name already typed or saved wins.

- [ ] **Step 1:** Implement (UI task; no new `src/lib` logic). **Step 2:** `npm test && npm run lint && npm run
  typecheck && npm run build` — PASS.
- [ ] **Step 3: Browser check** with `AUTH_DEV_LOGIN=1 npm run dev`: (a) signed out, landing and challenge show the
  sign-in prompts; picks made signed out survive the dev sign-in round trip and save; (b) create a league signed in,
  open its invite in a second browser context signed out → prompt → dev sign-in as another user → join; (c) legacy:
  insert a `sessions` + `session_seats` row for a seat with a script against `.data/pglite` (stop the server first) or
  via a Vitest-free node script using `src/db` — document the method — set the cookie, sign in, see the notice, move,
  see "Moved". 375px and 1440px screenshots in the report.
- [ ] **Step 4: Commit** `feat: sign-in prompts, account panel and legacy claim page`.

### Task 8: Docs, copy and smoke test

**Files:**
- Modify: `CLAUDE.md` (State and identity, Commands, Architecture lists, Domain rules on the challenge identity
  limitation and links), `README.md` (env vars and Google OAuth setup: authorized redirect URI
  `{origin}/api/auth/callback/google`, JavaScript origin), `src/app/challenge/how-it-works/page.tsx` (identity copy per
  spec decision 12), `scripts/smoke.sh`

`smoke.sh` signs each curl "browser" up with `/api/auth/sign-up/email` (needs the server started with
`AUTH_DEV_LOGIN=1`; the script says so and exits early with a clear message when sign-up answers 404/503), drops the
`courtline_seats` legacy check that no longer applies or rewrites it to assert the cookie grants nothing, and adds:
signed-out `POST /api/leagues` → 401 `sign_in_required`.

- [ ] **Step 1:** Update the docs and copy. **Step 2:** Update `smoke.sh`; run it against `AUTH_DEV_LOGIN=1 npm run
  dev` (fresh `.data/pglite`) — all checks pass. **Step 3:** `npm test && npm run lint && npm run typecheck && npm run
  build` — PASS. **Step 4: Commit** `docs: Google sign-in`.
