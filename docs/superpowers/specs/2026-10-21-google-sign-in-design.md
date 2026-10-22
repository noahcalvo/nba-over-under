# Google sign-in and account identity — design

Status: approved scope (Google only, October 21, 2026). The detailed ChatGPT spec from that day was not committed; this
document rebuilds it from the project handoff ("Social login: Google-only scope") and records the decisions taken while
planning. Where the handoff only recommended, the decision below is the one this repository implements.

## Goal

League seats, commissioner rights and 30/30 Challenge entries belong to a durable user account, not to a browser. A user
signs in with Google on any device and finds the same seats and entry. Cookies stay, but only as authentication sessions.

## Out of scope

Apple, Discord or any other provider; email/password in production; profiles, friends, social features; account
deletion; merging two accounts; changing the scoring, draft or challenge rules.

## Decisions taken

1. **Library: Better Auth 1.7 (`better-auth@1.7.12`, exact pin)** with its Drizzle adapter on the existing database
   (Postgres in production, PGlite locally and in tests). Only the Google social provider is enabled in production. The
   provider list lives in one place (`src/server/auth.ts`), so adding one later is a config change plus a button.
2. **Tables.** Better Auth's four core tables, renamed so they can't be confused with the legacy `sessions` table:
   `users`, `auth_sessions`, `auth_accounts`, `auth_verifications` (Drizzle keys `users`, `authSessions`,
   `authAccounts`, `authVerifications`). Ownership tables:
   - `user_seats (user_id, league_id, manager_id)`: primary key `(user_id, league_id)` (one seat per user per league),
     unique `(league_id, manager_id)` (one user per seat), foreign key to `managers` with `ON DELETE CASCADE`, `users`
     with `ON DELETE CASCADE`.
   - `challenge_entries.owner_user_id` (text, references `users`, `ON DELETE SET NULL`), unique `(season, owner_user_id)`
     (one entry per user per season). `owner_session_id` stays for the legacy claim.
   - Legacy `sessions` and `session_seats` stay, read only by the legacy claim. No new legacy session is ever created.
3. **Who is acting.** Every write is authorized by the signed-in user's `user_seats` row, read under the league lock
   (`withLockedLeague(db, leagueId, userId, work)`). The legacy `courtline_session` cookie authorizes nothing and no
   longer marks a viewer as a manager: a viewer is a manager only through their account.
4. **Sign-in required** for: creating a league, claiming any link, every league mutation (draft, fades, config, order,
   lines, invites, seat resets, record refresh), saving a challenge entry, the legacy claim. A signed-out request gets
   `401 { error: "sign_in_required" }`. Public league pages, the NBA schedule, the challenge board, leaderboards, entry
   pages and the guided demo stay open to everyone.
5. **Sign-in page** `/sign-in?next=<path>`: "Continue with Google". `next` must be a same-site path (starts with `/`,
   not `//`, no backslash); anything else becomes `/`. After Google the user lands on `next`.
6. **Invites.** `/i/{token}` signed out: the league and seat are shown with "Sign in with Google to continue", linking
   to `/sign-in?next=/i/{token}`; after sign-in the same claim form as today. Claim rules (account based):
   - league invite: the user already holds a seat in the league → `already_joined`; else an open seat as today.
   - seat invite (after a reset): as today, against the user's seat.
   - personal link (legacy recovery): binds the seat to the user when nobody's account holds it, succeeds unchanged when
     the user already holds it, `seat_owned` when another account holds it, `already_joined` when the user holds a
     different seat in the league. A personal link never moves a seat between accounts.
   - No new personal links are issued (league creation and claims stop issuing them). Existing ones keep working under
     the rule above. The "Your access" panel and `POST /api/leagues/{id}/me/link` are removed.
   - Seat reset (commissioner): removes the seat's `user_seats` row and every legacy `session_seats` row for it, revokes
     its personal link and pending seat invite, issues a new single-use seat invite (unchanged otherwise). This is the
     recovery path for a manager who lost their Google account.
7. **Legacy claim (explicit).** A signed-in user whose browser still carries a valid legacy `courtline_session` sees a
   notice "This browser has seats or a 30/30 entry from before sign-in" linking to `/account`, which lists each item and a
   single "Move to my account" button (`POST /api/account/legacy`). Per item:
   - league seat: under that league's lock. Moves when the seat has no account holder and the user has no seat in that
     league; "already yours" when the user already holds that same seat (the legacy row is just dropped); conflict
     `already_joined` (user holds another seat there) or `seat_owned` (another account holds it) otherwise. A moved or
     already-yours seat's `session_seats` row is deleted.
   - challenge entry: the season's entry whose `owner_session_id` is this session and `owner_user_id` is null. Moves
     (`owner_user_id` = user, `owner_session_id` = null) when the user has no entry that season, whatever the challenge
     phase: only the owner association changes, never picks, lines, names or times. Conflict `entry_exists` otherwise;
     the legacy entry then stays on the leaderboard, uneditable, as before.
   - When nothing claimable is left, the legacy session row is deleted and the cookie cleared.
   The page shows each outcome. Conflicts are final for that item: nothing is merged.
8. **Session lifetime** follows `ACCESS`: an auth session expires `sessionIdleDays` (90) after last use and is renewed
   at most every `sessionRenewHours` (24). Cookie prefix `courtline` (Better Auth's cookie
   `courtline.session_token`). Better Auth telemetry is off.
9. **Configuration.** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_SECRET` (≥ 32 characters) and
   `BETTER_AUTH_URL` (the site origin; on Vercel falls back to `https://$VERCEL_PROJECT_PRODUCTION_URL`). A missing
   value never takes the site down: `register()` logs what is missing, `/api/auth/*` answers 503, the sign-in page says
   "Sign-in isn't available right now", and reads keep working. Outside production `BETTER_AUTH_SECRET` falls back to a
   development constant and `BETTER_AUTH_URL` to `http://localhost:3000`.
10. **Development sign-in.** Only when `NODE_ENV !== "production"` and `AUTH_DEV_LOGIN=1`, Better Auth's
    email/password sign-up and sign-in are enabled and `/sign-in` shows a "Development sign-in" form (name, email,
    password). This keeps `scripts/smoke.sh` and local two-browser testing possible without Google credentials. It can
    never be on in a production build.
11. **Account UI.** Every shell (league `AppShell`, `ChallengeShell`, `NbaShell`) shows the account control: "Sign in"
    when signed out; the user's Google picture (or initials) and name with a menu holding the email and "Sign out" when
    signed in. The landing page's Create league panel shows "Sign in with Google to create a league" when signed out.
    League settings show a "Your account" panel (signed in as {email}; "Your seat follows your Google account.") in
    place of "Your access".
12. **Challenge save.** Signed out, the save button reads "Sign in to save" and goes to
    `/sign-in?next=/challenge`. The unsaved picks and name are the existing local draft
    (`courtline.challenge.draft.v1.{season}` in `localStorage`), so they survive the Google redirect. The how-it-works
    "identity" copy changes to: the entry belongs to your Google account; sign in anywhere to edit it until the
    deadline.
13. **Display names** stay what managers and entrants type; the Google name only pre-fills empty name fields.

## Must-haves (from the handoff)

- Existing league seats and draft ownership are preserved: no league, manager, pick or fade row changes in the
  migration. Existing seats become usable through an account only after an explicit legacy claim, a personal link or a
  commissioner seat reset.
- One seat per user per league; one challenge entry per user per season (database constraints, not only checks).
- Pure draft rules and transaction locking unchanged: decisions stay in `src/lib/league/commands.ts`, writes in
  `withLockedLeague`.
- Historical and locked challenge entries change only by verified owner association (legacy session proof).
- No account takeover through a link: a link can only bind a seat no account holds.

## Known limits

- Someone with access to a browser's legacy cookie can claim its seats into their account; that cookie already granted
  the seats.
- Google must list each redirect URI (`{origin}/api/auth/callback/google`); preview deployments can't sign in unless
  their URL is registered.
