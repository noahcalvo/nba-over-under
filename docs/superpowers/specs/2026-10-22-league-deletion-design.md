# League deletion (archive) — design

## Intent

A commissioner needs a way to get rid of a league they no longer want: a test league, a league that never filled, or
one that's finished and cluttering everyone's homepage. For the commissioner it is "Delete league". Nothing is
destroyed, though. The league moves to an **archived** state that the other members can still open and browse, so
nobody loses their record of what happened.

## Goals

- The commissioner deletes a league from League settings, at any stage: before the draft, mid-draft, in fades or
  mid-season.
- Before confirming, the commissioner sees every member of the league and types the league's exact name to confirm.
- Afterwards the league is **archived** for everyone, the commissioner included:
  - Anyone with the URL can still open every league page (Overview, Draft board, Rosters, team pages, Settings), as
    before but with the league itself frozen (team records still update), with a banner saying the commissioner deleted the league and that it is read-only.
  - It no longer appears in anyone's "Your leagues" list on the homepage.
  - It no longer contributes stakes on the NBA schedule and game pages (`/nba`, `/nba/games/{id}`).
  - Its links (league invite, seat invites, personal links) stop working: opening one says the league was deleted,
    with no claim form, and a claim POST is refused.
  - Every league mutation is refused.
- One-way. There is no restore.

## Non-goals

- Hard-deleting rows. Picks, fades, managers, seats and links stay in the database.
- Restoring or un-archiving a league, by anyone.
- Members leaving a league themselves, or hiding a league only for themselves.
- Deleting the demo league (it lives in code and is read-only already).
- Any change to the 30/30 Challenge.

## Anti-goals (a failure even if it technically works)

- A member opens their old league link and gets a 404 or an empty page.
- An archived league still shows up somewhere as one of "your leagues", or as stakes on tonight's games.
- A draft in progress can still take a pick, fade, pause or resume after the delete, because a client was already open
  or a request raced the delete.
- The commissioner deletes a league by accident: one click, or no clear picture of who it affects.

## Decisions taken (with the user)

1. Commissioner only (`m1`, `commissionerId`), and only through their signed-in account's seat, like every other
   league write. *My call:* a league whose `m1` seat isn't held by any account can't be deleted; there's no admin path.
9. Team records keep updating for archived leagues; only the league's own data is frozen.
2. Delete = archive. Archived leagues stay fully viewable, read-only, to anyone with the URL (the same audience as
   today's public league pages).
3. Archived leagues are dropped from "Your leagues" for everyone.
4. Archived leagues are dropped from the NBA schedule stakes.
5. Invite and seat links stop working.
6. No undo.
7. Confirmation: the dialog lists all the league's members, and the commissioner must type the league name exactly.
8. Allowed at any draft stage.

## How it fits the codebase

### Data

- New nullable column `leagues.archived_at timestamptz` (null = active). Migration
  `npm run db:generate -- --name league_archive`, committed in `drizzle/`.
- Archived state is separate from `draft_status`. The draft keeps whatever status it had (a paused or live draft stays
  so in the data), so the board, picks and fades show exactly what existed at deletion.
- Team records are **not** frozen (decided with the user). Standings, scores and awards keep being derived from the
  shared `team_records` as the real season plays out, and team pages keep reading ESPN game logs and the sportsbook
  line as they do today. Only the league's own data (draft, picks, fades, seats, lines) is frozen.
- `League` (in `src/lib/types.ts`) gains `archivedAt: string | null` (ISO), loaded with the league and passed in
  `LeagueView`. The code-built demo league and the tutorial league have `archivedAt: null`.

### The decision (pure, `src/lib/league/commands.ts`, test-first)

- `decideArchive(league, actorId, confirmName)`:
  - `demo_league` for the demo.
  - `forbidden` unless the actor is the commissioner (`canControlDraft`-style check; the commissioner seat must be held
    by the caller's account).
  - `archived` if already archived.
  - `name_mismatch` unless `confirmName` equals the league name. Compare after the same normalization `normalizeName`
    applies (trimmed, whitespace collapsed); case-sensitive. *Builder may settle the exact comparison; the UI's
    disabled button must use the same rule as the server.*
  - Succeeds with the archive time.
- Every existing decision (`decideDraftAction`, `decideLineOverrides`, `decideLeagueConfig`, `decideDraftOrder`,
  `decideClaim`, `decideInviteChange`, `decideSeatReset`) refuses an archived league with `archived`, checked right
  after the demo check. Test each.
- The record refresh from a league's Overview is also refused for an archived league (`archived`). The daily records
  cron is not league-scoped and is unaffected.

### The write

- `POST /api/leagues/{leagueId}/archive` with `{ "confirmName": "…" }`. Signed out → `signedOutError()`. It goes
  through `withLockedLeague` (locks the row, re-reads the caller's seat), runs `decideArchive`, and sets `archived_at`
  to the database's time. Because every mutation takes the same row lock and every decision now checks `archived`, a
  pick or fade racing the delete either lands before it or is refused after it.
- Links: archiving doesn't revoke or delete link rows. The claim path refuses because the league is archived.

### Reads

- `listUserLeagues` (`src/db/accounts.ts`) filters out archived leagues. It feeds, through `listViewerLeagues`, the
  homepage list, `/nba`'s "Your leagues", the league switcher's "other leagues" and the NBA stakes
  (`src/server/game-interest.ts`), so this one filter covers all of them. Add a test that an archived league is left out.
- League pages load archived leagues normally (no 404) and render in read-only mode.
- The legacy claim (`/account`, `claimLegacy`) treats seats in archived leagues as nothing to claim: they aren't
  listed or moved, and don't keep the legacy session alive. *My call: moving a seat into an archived league would be
  invisible anyway.*

### UI

- **Settings → "Delete league" panel**, commissioner only, below the existing panels, styled as a danger zone. A
  "Delete league…" button opens a confirm dialog that:
  - says it can't be undone and that members will still be able to view the league read-only, but it disappears from
    their lists and its links stop working;
  - lists every seat: manager label and name, "Open seat" for unclaimed ones, and marks the commissioner;
  - has a text field labelled with the league name to type; the Delete button stays disabled until it matches;
  - on success, goes to the homepage. On error, it shows the error in the dialog.
- **Archived banner** on every league page (shared league layout), e.g. "This league was deleted by its commissioner on
  {date}. It's read-only." Uses existing tokens; no red/green semantics beyond the existing negative token if needed.
- **Read-only mode.** When archived, hide or disable every control that would write:
  - draft lobby: start, reorder, randomize, config, line overrides;
  - draft room: pick, confirm, pause, resume, fade;
  - Overview: refresh records;
  - Settings: invite link controls, seat resets, the Delete panel itself.
  The draft room stops polling once it sees the league is archived (or polls harmlessly; builder's call), and a client
  that was open during the delete shows the banner on its next poll/refresh rather than failing silently.
- **Links page (`/i/{token}`)** for an archived league: "This league was deleted by its commissioner" with a link to view
  the league read-only, never a claim form, whether signed in or out.

## Constraints

- Every write through `withLockedLeague`; never authorize with `getViewerId()`.
- `src/lib/` stays pure and is tested first; decisions colocated tests in `commands.test.ts`.
- Cache Components: anything reading the database stays inside `<Suspense>` as existing pages do.
- Dark theme tokens only; no horizontal scroll at 375px or 1440px; the member list in the dialog must fit at 375px
  (scrolls inside the dialog for 12 managers).
- Before calling it done: `npm test && npm run lint && npm run typecheck && npm run build`, plus a check in the dev server
  with `AUTH_DEV_LOGIN=1` (commissioner deletes; a second account sees the archived league, not in its list, link
  refused).
- Update `CLAUDE.md` (Domain rules / State and identity) with the archive rule.

## Left to the builder

- Exact wording of the banner, dialog and link page.
- Whether the confirm is a modal or an inline expanding panel, following existing UI patterns.
- Error code names beyond `archived` and `name_mismatch`, if more are needed.
- Whether archived leagues are also refused by `/api/leagues` reads or only by writes (reads should keep working).
