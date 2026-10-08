# Durable storage, invite links and sessions — design

Date: 2026-10-08 · Status: approved in chat, pending written review

Courtline's prototype keeps leagues in server memory and identifies managers with an editable cookie
(`courtline_seats = leagueId:managerId|…`). This design moves leagues into Postgres, replaces the cookie with an opaque
server-validated session, adds private invite and sign-in links (no account registration), makes every draft mutation
atomic, and freezes each league's win-total lines when its draft starts. The demo league, scoring and standings logic
are unchanged.

Spec 2 (separate, later) covers a live line feed from a sportsbook data provider.

## Goals

- Leagues, seats, picks and sessions survive restarts and run on Vercel (serverless).
- Nobody can act as a manager by editing a cookie. The cookie holds a random token; the server decides who it is.
- The commissioner shares one invite link with the group. Each manager then has a private sign-in link for other
  devices. The commissioner can rotate or revoke the invite and recover a manager's seat.
- Two simultaneous draft actions can never corrupt the draft: no duplicate pick numbers, no side drafted twice, no
  accidental double pick.
- Lines can come from an external source later without touching scoring.

## Non-goals

Live line feed and push scoring (spec 2) · accounts, passwords, email · rate limiting · commissioner transfer ·
"leave league" / "sign out this device" UI · fade creation · scheduled purge of expired sessions (deleted lazily on
lookup for now) · migrating in-memory leagues (they are ephemeral today).

## Decisions

| Topic | Decision |
|---|---|
| Hosting | Vercel (Fluid compute). |
| Database | Postgres. Production: Neon via the Vercel Marketplace, preview deployments on Neon branches. |
| Driver / ORM | Drizzle ORM. Production uses `pg` (node-postgres) with one module-scope `Pool` registered with `attachDatabasePool` from `@vercel/functions`, on Neon's pooled connection string. Neon's HTTP driver is not used: it cannot run interactive transactions. |
| Local dev and tests | PGlite (Postgres in WASM, in-process) when `DATABASE_URL` is unset outside production: file-backed at `.data/pglite` for `next dev`, in-memory for tests. No Docker. PGlite is never chosen implicitly in production (see Configuration checks). |
| Draft rule: one side per team | A manager may hold at most one side of each team (never both MIN Over and MIN Under). It applies to the seat on the clock, including when the commissioner picks for an open seat. |
| Spectators | Anyone with `/l/{id}` can view a league read-only, as today. Only actions need a seat. |
| Joining | One shared, secret, rotatable **league invite link** per league. Whoever opens it picks an open seat and enters a name. |
| Multi-device and recovery | Claiming a seat issues that manager a private **personal link** (reusable). Recovery is a commissioner **seat reset**, which issues a single-use **seat invite** for that seat. |
| Lines | Fetched through a `LineSource` interface. Frozen into the league when the draft starts. Spec 1 ships only a static source with today's values. |
| Teams | Team metadata (names, colors, ids, prior wins, current records) stays in `src/data/teams.ts`. Lines move out of it. |
| Demo league | Stays in code, never stored. Read-only, viewer always `null`, fixed lines. The id `demo` is reserved. |

## Data model

Manager ids stay `m1`…`m4`, keyed per league, so `League`, scoring, standings and components keep their shapes.
Team ids in `picks` are validated against `TEAM_IDS` in application code (no teams table).

```sql
create table leagues (
  id              text primary key,                -- 6-char public id; 'demo' is reserved and never stored
  name            text not null,
  season_label    text not null,
  commissioner_id text not null,                   -- manager id, 'm1'
  rounds          smallint not null,
  draft_status    text not null check (draft_status in ('not_started','live','paused','complete')),
  lines           jsonb,                           -- { teamId: line }, null until the draft starts
  lines_source    text,
  lines_as_of     timestamptz,
  version         integer not null default 1,      -- bumped by every mutation
  created_at      timestamptz not null default now()
);

create table managers (
  league_id    text not null references leagues on delete cascade,
  id           text not null,                      -- 'm1'..'m4'
  seat         smallint not null,
  display_name text,                               -- null = open seat
  primary key (league_id, id),
  unique (league_id, seat)
);

create table picks (
  league_id   text not null,
  pick_number smallint not null,
  manager_id  text not null,
  team_id     text not null,
  side        text not null check (side in ('OVER','UNDER')),
  created_at  timestamptz not null default now(),
  primary key (league_id, pick_number),
  unique (league_id, team_id, side),
  unique (league_id, manager_id, team_id),         -- one side per team per manager
  foreign key (league_id, manager_id) references managers on delete cascade
);

create table access_links (
  id          text primary key,                    -- 128-bit random, base64url
  league_id   text not null references leagues on delete cascade,
  manager_id  text,                                -- null only for league_invite
  kind        text not null check (kind in ('league_invite','seat_invite','personal')),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz,                         -- seat_invite only
  used_at     timestamptz,                         -- seat_invite only (single use)
  revoked_at  timestamptz,
  check ((kind = 'league_invite') = (manager_id is null)),
  foreign key (league_id, manager_id) references managers on delete cascade
);
create unique index access_links_one_league_invite on access_links (league_id)
  where kind = 'league_invite' and revoked_at is null;
create unique index access_links_one_seat_link on access_links (league_id, manager_id, kind)
  where kind <> 'league_invite' and used_at is null and revoked_at is null;

create table sessions (
  id           uuid primary key default gen_random_uuid(),
  token_hash   bytea not null unique,              -- sha256(cookie token); the token is never stored
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at   timestamptz not null
);

create table session_seats (                       -- which seat this browser holds in each league
  session_id  uuid not null references sessions on delete cascade,
  league_id   text not null,
  manager_id  text not null,
  created_at  timestamptz not null default now(),
  primary key (session_id, league_id),             -- one seat per league per browser
  foreign key (league_id, manager_id) references managers on delete cascade
);
create index session_seats_by_seat on session_seats (league_id, manager_id);
```

Fades have no table yet. Stored leagues return `fades: []` until fade creation is designed. Seat order is derived from
`managers.seat`.

Migrations are generated by `drizzle-kit` into `drizzle/` and committed. PGlite applies them on startup. Postgres gets
them from `npm run db:migrate`, which runs in `vercel-build` before `next build`.

## Tokens

- **Session token**: 32 random bytes, base64url, in cookie `courtline_session` (httpOnly, `Secure` in production,
  `SameSite=Lax`, `Path=/`, `Max-Age` 400 days). The database stores only its SHA-256 hash. The server enforces
  expiry: 90 days after last use, renewed in the database at most once a day. The cookie is never rewritten for
  renewal.
- **Link token**: `{linkId}.{sig}`, where `sig` is HMAC-SHA256(`LINK_SECRET`, `linkId`) truncated to 128 bits,
  base64url. The database stores only `linkId`, so a database leak alone cannot produce a working link, while the app
  can show a link again (commissioner re-copies the invite; a manager re-copies their personal link). A bad signature is
  rejected without a database read. Rotating `LINK_SECRET` invalidates every link but no session.
- `LINK_SECRET` is required in production (see Configuration checks). In development a fixed fallback is used with a
  console warning.

## Links and claiming

### Link kinds

| Kind | Who sees it | Uses | Ends when |
|---|---|---|---|
| `league_invite` | Commissioner | Many: each use claims one open seat | Rotated or revoked. Useless once no seat is open. |
| `seat_invite` | Commissioner, after a seat reset | Once, for that seat | Used, revoked by another reset, or expired (7 days) |
| `personal` | Only that seat's manager | Many: signs a browser in as that manager | Manager resets it, or the commissioner resets the seat |

### Flows

- **Create league** (`POST /api/leagues`), one transaction: insert the league and four managers (seat 1 named), issue
  the league invite and seat 1's personal link, get or create the browser session and bind it to `m1`, set the cookie.
  The lobby tells the commissioner to save their personal link: if they lose it and their cookie, the commissioner seat
  can't be recovered.
- **Link page** `/i/{token}` (GET, no side effects, because chat apps fetch links for previews):
  - League invite: league name, open seats, name field. "This league is full" when no seat is open.
  - Seat invite: the seat, name field pre-filled with the seat's existing name.
  - Personal link: "Continue as {name}".
  - Bad signature, unknown, revoked, used or expired: one message, "This link no longer works. Ask your commissioner
    for a new one." No hint about which.
  - A browser that already holds a seat in the league goes straight to the league when it opens the league invite, or
    a seat invite or personal link for the seat it already holds.
- **Claim** (`POST /api/links/claim { token, managerId?, displayName? }`), one transaction under the league lock:
  - League invite: the seat must be open (`seat_taken` otherwise) and the browser must not hold another seat in the
    league (`already_joined`). Set the name, issue the seat's personal link, bind the session, bump `version`.
  - Seat invite: mark used with `UPDATE … WHERE used_at IS NULL AND revoked_at IS NULL` (single use under races). The
    seat is claimed, not open, so there is no open-seat check: keep its picks, set the name the claimer submits
    (pre-filled with the existing one), issue a new personal link, bind the session, bump `version`. Fails with
    `already_joined` if this browser holds a different seat in the league.
  - Personal link: bind the session to the seat, replacing this browser's existing seat in that league if any. No
    version bump (the league didn't change).
  - Responds with the league id. The client goes to the draft room.

### Commissioner and manager controls

- **Settings → Seats & links** (commissioner). While seats are open, the lobby also shows the league invite with a copy
  button, to the commissioner only (other managers see seat status but no link).
  - Copy the league invite. Rotate it (revoke and reissue) or revoke it.
  - Reset a claimed seat other than their own: delete that seat's `session_seats` rows (signed out everywhere), revoke
    its personal link and any pending seat invite, issue a seat invite and show it for copying. Name and picks stay.
  - A reset seat stays claimed: it never appears among the league invite's open seats and the commissioner can't pick
    for it, and its seat invite hands the existing seat (name and picks intact) to whoever opens it. If the seat
    comes on the clock before it's reclaimed, the draft waits; the commissioner can pause.
- **Settings → Your access** (any seated manager): copy their personal link; "Reset my link" revokes it and issues a new
  one, optionally signing out their other devices.
- The rest of Settings stays "Not built yet". The nav item drops "Soon".
- The old `/l/{id}/join` page becomes a notice: "Ask your commissioner for the league's invite link."

### Permissions (pure, `src/lib/league/permissions.ts`)

Existing `canControlDraft` and `canPickNow` are unchanged. New: `canManageSeats` (commissioner, not demo) and
`canResetSeat` (`canManageSeats`, the target is claimed and is not the actor). Personal-link actions require the actor
to hold that seat.

### Viewer resolution

`getViewer()` reads the cookie, hashes the token, loads the unexpired session (deleting it if expired) and its seats,
and is wrapped in React `cache()` so a request does it once. `viewerId` for a league is the session's seat there, or
`null`. The demo league always gets `null`. The old `courtline_seats` cookie is ignored and deleted the next time a
route handler sets the session cookie.

### Exposure

The `League` payload never contains links or sessions. Links come from separate server-only queries and render only for
the commissioner (league and seat invites) or the seat's own manager (personal link). Every mutating route checks that
`Origin` matches the request's own origin, on top of `SameSite=Lax` and JSON-only bodies. `/i/*` responses send
`Referrer-Policy: no-referrer`.

## Atomic mutations

Every league write goes through `mutateLeague(leagueId, sessionId, decide)` in the league repository:

1. `BEGIN`, then `SELECT … FROM leagues WHERE id = $1 FOR UPDATE`. Writers to one league run one at a time. Reads,
   including the 2-second draft poll, are not blocked.
2. Resolve the actor **inside the transaction**: read this session's seat for the league from `session_seats`, joined
   to an unexpired `sessions` row. The result (a manager id or `null`) is the only actor `decide` sees. An actor id
   resolved before the lock (for example by `getViewer()` while rendering) is never used for a write.
3. Load managers and picks into a `League`.
4. Call `decide(league, actorId)`, a pure function from `src/lib/league/commands.ts` that returns the next `League`
   (plus any link or session effects) or a typed error. Every permission check runs here, against the locked state:
   `canControlDraft` / `canPickNow` then `applyDraftAction` for draft actions, `canManageSeats` / `canResetSeat` for
   seat management, seat ownership for personal-link actions.
5. Write the difference (new picks, status, managers, lines, links, session seats). Set `version = version + 1` when
   the `League` changed (a personal-link sign-in changes only `session_seats`, so it doesn't). `COMMIT`. Any error
   rolls back.

Draft actions, claims, seat resets and personal-link resets all take this lock, so none of them can interleave. A seat
reset or "sign out my other devices" deletes `session_seats` rows under the lock, so a request from a just-revoked
browser that was already in flight finds no seat in step 2 and fails with `forbidden`.

- **Intent guard**: `confirm` carries `pickNumber`, the pick the client believes it is making. If it isn't the current
  pick the server returns `stale_pick` (409) and the UI refreshes with "The draft moved on." This stops a double click
  from drafting twice (a commissioner picking for consecutive open seats would otherwise draft both) and stops a stale
  screen from picking for the wrong slot.
- **One side per team**: `applyDraftAction` (`src/lib/draft.ts`) rejects a pick when the manager on the clock already
  holds the other side of that team, with `team_already_held` (409). The draft room disables that side for the manager
  on the clock and says why. No manager can be left without a legal pick: at most 43 of 60 sides are gone before any
  pick, leaving at least 17, and at most 10 of them are the other side of a team the picking manager already holds.
- **Backstop**: the primary key on `(league_id, pick_number)` and the uniques on `(league_id, team_id, side)` and
  `(league_id, manager_id, team_id)` reject anything the lock and rules somehow missed. A violation maps to
  `side_taken` or `team_already_held` and rolls back.
- **Rejected**: `SERIALIZABLE` isolation with retry loops (more code, same per-league ordering); advisory locks (the row
  lock already does it and is visible in the schema).

## Lines

- `src/data/teams.ts` exports `TeamInfo` (today's `Team` without `line`). Today's line values move to
  `src/data/static-lines.ts`.
- `src/lib/lines.ts`: `LineSet = { values: Record<TeamId, number>; source: string; asOf: string }`,
  `LineSource = { current(): Promise<LineSet> }`, `withLines(info, lineSet): Team[]`, and a validator (every team
  present, finite number).
- `League` gains `lines: LineSet | null`. The demo league's lines are the static set.
- `start` reads `lineSource.current()` **before** `BEGIN` (no network call while holding the lock) and writes it in the
  same transaction that sets the draft live. If the set is invalid or missing a team, the action fails with
  `lines_unavailable` (503) and the draft stays `not_started`.
- `LeagueView` gains `teams: Team[]`: the league's frozen lines once the draft has started, otherwise the source's
  current lines (shown in the lobby and available list before start).
- Components stop importing `TEAMS` / `TEAMS_BY_ID` and read `view.teams` (DraftRoom, AvailablePicks, DraftBoard,
  ManagerPicks, SelectionBar, SelectionPreview, LeagueOverview). `computeStandings(league, teams, basis)` already takes
  the lookup, so `scoring.ts` and `standings.ts` are untouched.
- Scoring still treats a margin of exactly 0 as a miss. Static lines all end in .5, so no push can occur in spec 1.
  Spec 2 must settle push scoring before accepting whole-number lines.

## Configuration checks

Production must never fall back to storage that doesn't persist.

- A pure `validateServerEnv(env)` (`src/lib/env.ts`) returns the database choice or a list of problems:
  - `DATABASE_URL` set to a `postgres://` / `postgresql://` URL: Postgres.
  - `DATABASE_URL=pglite:<path>`: PGlite at that path. This explicit opt-in is the only way to run a production build
    (`npm start`) on PGlite, for local testing.
  - Unset outside production: PGlite (`.data/pglite`, or in-memory under Vitest).
  - Unset in production (`NODE_ENV=production`): error "DATABASE_URL is required in production. Courtline will not
    start on non-persistent storage." `LINK_SECRET` missing in production is also an error.
- `src/instrumentation.ts` `register()` calls it once per server instance. Next runs `register` before the server
  handles any request, so a misconfigured production server fails at startup instead of serving requests on PGlite.
  The check is skipped during `next build` (`NEXT_PHASE === "phase-production-build"`), so local builds don't need a
  database.
- `vercel-build` runs `db:migrate` first, which exits non-zero with the same message when `DATABASE_URL` is missing,
  so a Vercel deployment without a database fails before it goes live.
- `src/db/client.ts` takes the validated choice; it never reads `DATABASE_URL` itself.

## Errors

New API errors: `invalid_link` (404, every bad-link state), `stale_pick` (409), `team_already_held` (409, "A manager
can't hold both sides of a team."), `lines_unavailable` (503). A failed `Origin` check, and an actor whose seat was
revoked, get `forbidden`. Existing errors keep their statuses. `already_joined` and `seat_taken` keep their messages.

## Code layout

- `src/config/access.ts`: session idle lifetime (90 days), renewal interval (1 day), cookie max age (400 days), seat
  invite lifetime (7 days).
- `src/lib/` (pure, test-first): `league/commands.ts` (create, claim, draft action, reset seat; replaces the logic in
  `league/store.ts`), `league/permissions.ts` (+ seat permissions), `league/parse-action.ts` (+ `pickNumber`),
  `access/tokens.ts` (session token and hash, link sign and verify, via Web Crypto), `access/links.ts` (link validity
  rules), `lines.ts`. Delete `league/store.ts` and `league/seats-cookie.ts` with their tests.
- `src/db/` (new): `schema.ts`, `client.ts` (`pg` when `DATABASE_URL` is set, else PGlite), `migrate.ts`, `leagues.ts`,
  `links.ts`, `sessions.ts`, and a test helper that returns a fresh migrated in-memory PGlite. It does not import
  `server-only`, so Vitest can load it; only `src/server/` imports it.
- `src/server/`: `db.ts` (singleton on `globalThis`, replaces `store.ts`), `session.ts` (cookie and `getViewer`,
  replaces `viewer.ts`), `league.ts` (demo short-circuit, then load or `notFound()`), `lines.ts` (static source),
  `http.ts` (+ origin check, new statuses).
- `src/app/`: `i/[token]/page.tsx`; `api/links/claim`; `api/leagues/[leagueId]/invite` (POST rotate, DELETE revoke);
  `api/leagues/[leagueId]/seats/[managerId]/reset`; `api/leagues/[leagueId]/me/link`; existing create and draft routes
  rewritten; settings page sections; join page becomes the notice.
- `src/components/access/`: link claim form, seats-and-links panel, your-access panel. `InviteLink` takes a URL instead
  of a league id.
- `next.config.ts`: `serverExternalPackages: ["@electric-sql/pglite"]` (Next externalizes `pg` already) and the `/i/*`
  referrer header.
- Environment: `DATABASE_URL`, `LINK_SECRET`, validated by `src/lib/env.ts` from `src/instrumentation.ts`. `.data/` is
  gitignored.
- Dependencies: `drizzle-orm`, `pg`, `@vercel/functions`, `@electric-sql/pglite`; dev: `drizzle-kit`, `@types/pg`.
- Server components keep the existing `<Suspense>` pattern. League data is read fresh on every request (no
  `use cache`).

## Testing

- **Pure units, test-first**: commands (ported store tests, plus `stale_pick`, lines frozen at start,
  `lines_unavailable`, claim rules, seat reset, reclaiming a reset seat keeps its picks), the one-side-per-team rule in
  `applyDraftAction` (including the commissioner picking for an open seat), permissions, tokens (round trip, tampered
  signature, wrong secret), link validity (revoked, used, expired), `validateServerEnv` (production without
  `DATABASE_URL` or `LINK_SECRET` fails, `pglite:` opt-in works, unset in dev picks PGlite), `withLines`,
  `parse-action`. A demo-data test pins that the demo draft obeys the one-side-per-team rule.
- **Repositories against in-memory PGlite with migrations applied**: create league transaction, `mutateLeague` persists
  the diff and bumps `version`, the unique-constraint backstops map to `side_taken` / `team_already_held`, a seat
  invite can be claimed once, seat reset removes that seat's sessions, a mutation from a session whose seat was reset
  gets `forbidden` even though its viewer was resolved before the reset, session expiry and renewal, cascades.
- **Real concurrency**: PGlite has one connection, so it cannot prove the row lock. `npm run test:pg` runs against
  `TEST_DATABASE_URL` (real Postgres) and fires parallel confirms for the same pick: exactly one succeeds. Skipped when
  the variable is unset.
- **End to end**: a two-cookie-jar API smoke run (create, copy invite, claim, start, pick, `stale_pick`, seat reset
  signs the old browser out, revoked link shows the generic message), and browser checks of the link page, lobby and
  settings at 375 px and 1440 px.
- Before claiming done: `npm test && npm run lint && npm run typecheck && npm run build`.

## Implementation steps

The app works after every step.

1. **Spike**: PGlite and `pg` under `next dev` and `next build` with Turbopack and `serverExternalPackages`. Throwaway
   code; findings feed step 2.
2. **Database foundation**: dependencies, schema, first migration, `validateServerEnv` and `instrumentation.ts`,
   client, PGlite test helper, `db:generate` / `db:migrate` scripts, `.gitignore`.
3. **Lines refactor** (still on the in-memory store): `TeamInfo`, `static-lines.ts`, `LineSource`, `League.lines`,
   `LeagueView.teams`, components off `TEAMS`.
4. **Pure commands**: move store logic into `commands.ts`, then add `pickNumber` / `stale_pick`, the one-side-per-team
   rule (with the draft room disabling the held team's other side), lines frozen at start, seat permissions and reset.
5. **Access primitives**: tokens, link validity, `config/access.ts`.
6. **Repositories**: leagues (`mutateLeague`), links, sessions, tested on PGlite.
7. **Switch over**: server glue, create and draft routes, pages on the database and sessions. Delete the in-memory store
   and the seat cookie.
8. **Invite and claim**: `/i/[token]`, claim route, league invite in the lobby, commissioner link reminder, draft UI
   sends `pickNumber` and handles `stale_pick`, join page notice.
9. **Seat management**: Settings sections, rotate and revoke invite, seat reset with seat invite, personal link reset.
10. **Operations and docs**: `vercel-build`, optional `test:pg`, README and CLAUDE.md ("State and identity", the
    one-side-per-team domain rule, commands), full verification.

## Risks

- PGlite under Turbopack is unverified. Step 1 settles it. Fallback: local Postgres via Docker for dev, PGlite only in
  Vitest.
- Whether `register()` runs during `next build` (and that `NEXT_PHASE` identifies it) is unverified. Step 1 checks it.
- `attachDatabasePool` with a client checked out mid-transaction is not documented. The `test:pg` run and a preview
  deployment smoke test cover it.
- A commissioner who loses both their cookie and personal link cannot recover the league. Accepted for now; the lobby
  warns them to save the link.
