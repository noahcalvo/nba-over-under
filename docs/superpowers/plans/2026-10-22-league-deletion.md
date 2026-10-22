# League Deletion (Archive) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a league's commissioner delete it. The league becomes archived: still viewable read-only by URL, gone
from everyone's lists and NBA stakes, links dead, every write refused, no undo.

**Architecture:** A nullable `leagues.archived_at` column surfaces as `League.archivedAt`. The permission helpers
in `src/lib/league/permissions.ts` return false for an archived league, so every control the UI derives from them
disappears. Every `decide*` command refuses with a new `archived` error. A new `decideArchive` plus
`POST /api/leagues/{id}/archive` (through `withLockedLeague`) sets the column and bumps `version`, so polling clients see
it. `listUserLeagues` and `listSessionLeagues` skip archived leagues, which removes them from the homepage, `/nba`, the
switcher, the NBA stakes and the legacy claim in one place each.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Drizzle ORM (Postgres / PGlite), Vitest, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-10-22-league-deletion-design.md`

## Global Constraints

- Every league write goes through `withLockedLeague`; never authorize with `getViewerId()`.
- `src/lib/` stays pure (no React, `next/*`, `server-only`) and is test-first; tests colocated as `*.test.ts`.
- Anything reading `params`, `cookies()` or the database renders inside `<Suspense>`.
- Dark theme tokens only (`bg-ink-850`, `text-fog-400`, `text-negative`, …), no raw hex.
- No horizontal page scroll at 375px or 1440px; the member list must fit at 375px with 12 managers.
- Error codes: `archived` (HTTP 409) and `name_mismatch` (HTTP 400).
- Team records are not frozen: standings and team pages keep reading `team_records`, ESPN logs and FanDuel as today.
- Deleting is one-way: no endpoint, helper or UI unsets `archived_at`.
- Done means: `npm test && npm run lint && npm run typecheck && npm run build` all pass.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A draft room left open in another tab while the commissioner deletes.** The next poll should hide the pick, fade
   and control buttons and show the banner. It must not keep offering a Confirm that fails. Tests: Task 3
   (`archiveLeague` bumps `version`), Task 4 (polling stops and calls `router.refresh()` once archived).
2. **A pick or fade racing the delete.** It lands before the archive or is refused with `archived` afterwards, never
   both. Test: Task 3 "refuses a pick after the league is archived".
3. **The typed name with stray spaces or the wrong case.** `"  Hoop   Dreams "` matches "Hoop Dreams"; `"hoop dreams"`
   doesn't. Server and button use the same rule. Test: Task 2 `matchesLeagueName`.
4. **Double-clicking Delete, or two tabs deleting.** The second request gets `archived` (409) and nothing changes.
   Test: Task 3 "a second archive is refused and keeps the first time".
5. **An old pre-sign-in seat in a deleted league.** It must not keep the `/account` legacy notice alive forever. Test:
   Task 3 "listLegacyItems skips seats in archived leagues".

---

### Task 1: Archived state in the data model

**Files:**
- Modify: `src/db/schema.ts` (`leagues` table)
- Create: `drizzle/0007_league_archive.sql` (+ `drizzle/meta/*`) via `npm run db:generate -- --name league_archive`
- Modify: `src/lib/types.ts` (`League`)
- Modify: `src/db/leagues.ts` (`assemble`)
- Modify: `src/lib/league/commands.ts` (`createLeague`), `src/data/demo-league.ts`, `src/data/tutorial-league.ts`, plus
  any other `League` literal that `npm run typecheck` flags (test fixtures included)
- Test: `src/db/leagues.test.ts`

**Interfaces:**
- Produces: `League.archivedAt: string | null`, an ISO timestamp, null while active. Column
  `leagues.archivedAt = timestamp("archived_at", { withTimezone: true })`, nullable, no default.

- [ ] **Step 1: Write the failing test** in `src/db/leagues.test.ts`:
  - `it("loads a stored league as active")`: `(await loadLeague(db, id))!.archivedAt` is `null`.
  - `it("loads archived_at as an ISO string")`: after
    `db.update(leagues).set({ archivedAt: new Date("2026-10-22T15:00:00Z") })`, `archivedAt` equals
    `"2026-10-22T15:00:00.000Z"`.
- [ ] **Step 2: Run** `npx vitest run src/db/leagues.test.ts`. Expected: FAIL (no column, no property).
- [ ] **Step 3: Implement.** Add the column with a doc comment ("Set once when the commissioner deletes the league;
  never cleared."). Add the `League` field with the same doc. Map `row.archivedAt?.toISOString() ?? null` in
  `assemble`. Set `archivedAt: null` in `createLeague`, the demo and tutorial fixtures, and every literal typecheck
  flags. Then run `npm run db:generate -- --name league_archive`.
- [ ] **Step 4: Run** `npx vitest run src/db/leagues.test.ts src/db/migrations.test.ts && npm run typecheck`. Expected:
  PASS. If typecheck fails on `.next` " 2" duplicates, clear them (iCloud).
- [ ] **Step 5: Commit** `feat: store when a league was archived`.

### Task 2: Archive rules in the domain

**Files:**
- Modify: `src/lib/league/errors.ts` (`DomainError`, `ERROR_MESSAGES`), `src/server/http.ts` (`STATUS`)
- Modify: `src/lib/league/permissions.ts`, `src/lib/fades.ts` (`openFadeSeats` type)
- Modify: `src/lib/league/commands.ts`
- Test: `src/lib/league/permissions.test.ts`, `src/lib/league/commands.test.ts`

**Interfaces:**
- Consumes: `League.archivedAt` (Task 1).
- Produces:
  - `DomainError` gains `"archived"` and `"name_mismatch"`. Messages: `archived`: "This league was deleted by its
    commissioner. It's read-only."; `name_mismatch`: "Type the league's name exactly as it appears to delete it."
    Statuses: 409 and 400.
  - `matchesLeagueName(input: unknown, name: string): boolean` in `commands.ts`: true when
    `normalizeName(input, LEAGUE_NAME_MAX) === name` (trim plus collapsed whitespace, case-sensitive).
  - `decideArchive(league: League, actorId: string | null, confirmName: unknown): Result<null>`. Checks in order:
    `demo_league`, `archived`, `forbidden` (not `canControlDraft`), `name_mismatch`.
  - Every permission helper (`canControlDraft`, `canPickNow`, `canFadeFor`, `canManageSeats`, `canResetSeat`,
    `canRefreshRecords`) adds `"archivedAt"` to its `Pick<League, …>` and returns false when
    `league.archivedAt !== null`.
  - `decideDraftAction` (both the fade branch and the others), `decideLineOverrides`, `decideLeagueConfig`,
    `decideDraftOrder`, `decideClaim`, `decideInviteChange` and `decideSeatReset` return `archived` right after the
    `demo_league` check.

- [ ] **Step 1: Write the failing tests.**
  - `permissions.test.ts`: `it("refuses every action in an archived league")`. With `archivedAt` set to an ISO string,
    the commissioner gets false from `canControlDraft`, `canManageSeats`, `canRefreshRecords` and
    `canResetSeat(…, "m2")`. `canPickNow` and `canFadeFor` are false for the manager on the clock and for the
    commissioner on an open seat.
  - `commands.test.ts`, `describe("archived leagues")`, with `archived = { ...league, archivedAt: "2026-10-22T15:00:00.000Z" }`:
    - each of `act(archived, "m1", { type: "pause" })`, a confirm by the manager on the clock, a fade in the fade
      stage, `decideLineOverrides`, `decideLeagueConfig`, `decideDraftOrder`, `decideClaim` (league invite, NEWCOMER),
      `decideInviteChange` and `decideSeatReset` equals `{ ok: false, error: "archived" }`.
  - `describe("decideArchive")`:
    - commissioner with `"Hoop Dreams"` → `{ ok: true, value: null }`;
    - commissioner with `"  Hoop   Dreams "` → ok;
    - commissioner with `"hoop dreams"`, `""`, `42` → `name_mismatch`;
    - `"m2"` and `null` → `forbidden`;
    - already archived → `archived`;
    - demo → `demo_league`;
    - live, paused, fades and complete drafts all → ok (deleting is allowed at any stage).
  - `describe("matchesLeagueName")`: the same three name cases, run directly.
- [ ] **Step 2: Run** `npx vitest run src/lib/league`. Expected: FAIL (`decideArchive` not exported; archived
  leagues still allowed).
- [ ] **Step 3: Implement** the interfaces above. Add `archived: 409` and `name_mismatch: 400` to `STATUS`. Widen
  `openFadeSeats`'s parameter type (and `DraftAccess`) with `"archivedAt"`. Fix any caller typecheck flags; in
  `refreshLeagueRecords` (`src/db/actions.ts`), select `leagues.archivedAt` and pass it to `canRefreshRecords` (Task 3
  adds the explicit `archived` error).
- [ ] **Step 4: Run** `npx vitest run src/lib && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: archived leagues refuse every command`.

### Task 3: Archive write, API route and list filters

**Files:**
- Modify: `src/db/leagues.ts` (new `markArchived`; `listSessionLeagues` filter)
- Modify: `src/db/actions.ts` (new `archiveLeague`; `refreshLeagueRecords`)
- Modify: `src/db/accounts.ts` (`listUserLeagues` filter)
- Create: `src/app/api/leagues/[leagueId]/archive/route.ts`
- Test: `src/db/actions.test.ts`, `src/db/accounts.test.ts`, `src/db/legacy.test.ts`

**Interfaces:**
- Consumes: `decideArchive`, `matchesLeagueName`, `archived` (Task 2); `League.archivedAt` (Task 1).
- Produces:
  - `markArchived(tx: Tx, league: League): Promise<League>` in `leagues.ts`. Sets `archived_at = now()` (database
    time) and `version = league.version + 1`, then returns the league with both values.
  - `archiveLeague(db: Db, leagueId: string, userId: string | null, confirmName: unknown): Promise<Result<{ league: League; actorId: string | null }>>`
    in `actions.ts`. Runs `withLockedLeague` → `decideArchive` → `markArchived`, the same shape as `setLeagueConfig`.
  - `POST /api/leagues/{leagueId}/archive`, body `{ "confirmName": string }`. Same-origin check, `getAccount()` /
    `signedOutError()`, then `archiveLeague`. Responds 200 with `toLeagueView(league, actorId)` JSON, or
    `errorResponse(code)`. Copy `config/route.ts`.
  - `listUserLeagues` and `listSessionLeagues` add `isNull(leagues.archivedAt)` to their `where`.
  - `refreshLeagueRecords` returns `fail("archived")` when the row's `archivedAt` is set (after `not_found`, before
    the seat check).

- [ ] **Step 1: Write the failing tests.**
  - `actions.test.ts`, `describe("archiveLeague")`:
    - `it("archives the league for its commissioner")`: `archiveLeague(db, LEAGUE, ana, "<league name>")` is ok;
      `loadLeague` shows `archivedAt` non-null and `version` one higher.
    - `it("refuses other managers, spectators and the wrong name")`: Ben (after `joinAs(ben, "m2", "Ben")`) →
      `forbidden`; `cal` (no seat) → `forbidden`; `ana` with `"nope"` → `name_mismatch`. `archivedAt` stays null.
    - `it("a second archive is refused and keeps the first time")`: second call → `archived`; `archivedAt` and
      `version` unchanged.
    - `it("refuses a pick after the league is archived")`: start the draft, archive, then a `confirm` for pick 1 →
      `archived`; no row in `picks`.
    - `it("refuses claiming a link and refreshing records once archived")`: `joinAs(ben, "m2", "Ben")` → `archived`;
      `refreshLeagueRecords(db, LEAGUE, ana, <source used elsewhere in this file>)` → `archived`.
  - `accounts.test.ts`: `it("leaves archived leagues out of a user's leagues")`: bind `u1` in two leagues, archive one
    with `db.update(leagues).set({ archivedAt: new Date() })`; `listUserLeagues` returns only the other.
  - `legacy.test.ts`: `it("listLegacyItems skips seats in archived leagues")`: a session seat in an archived league
    isn't listed, and `claimLegacy` finishes with nothing left (the legacy session is deleted when that was its only
    item). Use this file's fixtures.
- [ ] **Step 2: Run** `npx vitest run src/db`. Expected: FAIL.
- [ ] **Step 3: Implement** the interfaces above.
- [ ] **Step 4: Run** `npx vitest run src/db && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: archive a league through the API`.

### Task 4: Read-only league pages and dead links

**Files:**
- Create: `src/components/shell/ArchivedBanner.tsx` (server component)
- Modify: `src/app/l/[leagueId]/layout.tsx`
- Modify: `src/components/draft/use-league-draft.ts`
- Modify: `src/app/i/[token]/page.tsx`
- Modify: `src/app/l/[leagueId]/settings/page.tsx` (`SettingsBody`)

**Interfaces:**
- Consumes: `League.archivedAt`, the permission changes (Task 2), `ERROR_MESSAGES.archived`.
- Produces: `ArchivedBanner({ leagueId }: { leagueId: Promise<string> }): Promise<ReactNode>`. It reads
  `findLeague` (cached) and renders nothing unless the league exists and `archivedAt !== null`.

- [ ] **Step 1: Banner.** Render `ERROR_MESSAGES.archived` in a full-width notice (border `border-ink-700`,
  `bg-ink-850`, an `Archive` lucide icon, `text-fog-200`), aligned with page content. *My call: no date in the copy, to
  avoid time zones.* In `layout.tsx`, render
  `<Suspense fallback={null}><ArchivedBanner leagueId={params.then((p) => p.leagueId)} /></Suspense>` above
  `{children}` inside `AppShell`. The banner has no data until it streams in, so nothing shifts for active leagues.
- [ ] **Step 2: Draft polling.** In `use-league-draft.ts`, `shouldPoll` also requires `view.league.archivedAt === null`.
  When an accepted view goes from active to archived, call `router.refresh()` once (`useRouter` from
  `next/navigation`) so the layout banner appears. The controls already vanish through the permission helpers.
- [ ] **Step 3: Link page.** In `/i/[token]/page.tsx`, after loading `league` and before any seat/redirect logic, if
  `league.archivedAt !== null` render the page's existing frame with "This league was deleted by its commissioner."
  and a secondary link button "View the league" to `/l/{id}`. Never show the claim form, signed in or out.
  `generateMetadata` can stay as is.
- [ ] **Step 4: Settings.** In `SettingsBody`, when `league.archivedAt !== null`, render a Panel reading "This league
  was deleted. Its links and seats can't be changed." followed by `accountPanel`, and return before the commissioner
  branch. The Delete panel (Task 5) then never shows on an archived league.
- [ ] **Step 5: Verify.** Run `npm run lint && npm run typecheck`. Then `AUTH_DEV_LOGIN=1 npm run dev`
  (`preview_start` "dev"): sign up as the commissioner, create a league, copy its invite, and archive it with
  `fetch('/api/leagues/<id>/archive', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({confirmName:'<name>'})})`
  from the page console. Check that Overview, Draft, Rosters, a team page and Settings show the banner and no write
  controls, that the invite link shows the deleted message, and that the homepage no longer lists the league.
- [ ] **Step 6: Commit** `feat: archived leagues read-only, with a banner and dead links`.

### Task 5: Delete league panel in Settings

**Files:**
- Create: `src/components/settings/DeleteLeaguePanel.tsx` (`"use client"`)
- Modify: `src/app/l/[leagueId]/settings/page.tsx` (commissioner branch of `SettingsBody`)

**Interfaces:**
- Consumes: `matchesLeagueName` (Task 2), `POST /api/leagues/{id}/archive` (Task 3), `managerLabel`, `Panel`,
  `Button`, `Alert`.
- Produces: `DeleteLeaguePanel({ league }: { league: Pick<League, "id" | "name" | "commissionerId" | "managers"> })`.

- [ ] **Step 1: Build the panel.** It renders last in the commissioner branch, as `Panel title="Delete league"`.
  - Collapsed: one line ("Deleting can't be undone.") and a "Delete league…" button (`secondary`, `text-negative`).
  - Expanded (inline, *my call: no modal primitive exists*):
    - Copy: "Members can still open the league read-only, but it leaves everyone's league list and its invite links
      stop working. This can't be undone."
    - A list of every manager in seat order: `managerLabel(manager)`, "Open seat" when `displayName` is null, and
      "Commissioner" on `commissionerId`. It scrolls inside a `max-h-64 overflow-y-auto` box.
    - A text input labelled `Type "{league.name}" to confirm`, with `autoComplete="off"`.
    - Buttons: Cancel (ghost; collapses and clears the input), and "Delete league" (`text-negative`). Delete is
      disabled until `matchesLeagueName(input, league.name)` and while a request is pending.
  - On submit, POST `{ confirmName: input }`. On 200, `router.push("/")` then `router.refresh()`. Otherwise show the
    response's `message` in an `Alert` inside the panel and keep it open.
- [ ] **Step 2: Verify in the dev server** (`AUTH_DEV_LOGIN=1`) at 375px and 1440px:
  - a 12-manager league lists all seats without horizontal scroll;
  - the button is disabled for the wrong case and enabled for extra spaces;
  - deleting lands on `/` without the league;
  - the league URL shows the banner.
  Sign in as a second account holding a seat and confirm the league is gone from its homepage and `/nba`. Screenshot
  the expanded panel.
- [ ] **Step 3: Run** `npm run lint && npm run typecheck`. Expected: PASS.
- [ ] **Step 4: Commit** `feat: commissioner can delete a league from settings`.

### Task 6: Document and verify

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Document.**
  - Under Domain rules, add a bullet "League deletion (archive)". It covers: commissioner only, from Settings, typed
    name; `leagues.archived_at`, one-way; read-only pages with a banner, records still update; every command and
    permission refuses (`archived`); left out of `listUserLeagues` / `listSessionLeagues` (homepage, `/nba`, switcher,
    stakes, legacy claim); links show "deleted"; `POST /api/leagues/{id}/archive`; migration `0007_league_archive`.
  - Add `archived_at` to the State and identity notes where the leagues table is described.
- [ ] **Step 2: Run** `npm test && npm run lint && npm run typecheck && npm run build`. Expected: all pass. Report the
  test count.
- [ ] **Step 3: Commit** `docs: league deletion rules`.
