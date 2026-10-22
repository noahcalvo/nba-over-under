# Courtline

Courtline — draft Overs and Unders on every NBA season win total (prototype).

## Setup

```bash
npm install
npm run dev
```

Open http://localhost:3000. The 30/30 Challenge (pick Over or Under on all 30 teams, one entry per Google account, locked before the first game) is at http://localhost:3000/challenge. The demo league is at http://localhost:3000/l/demo (read-only). To draft for real, use **Create league** on the landing page, then send the league invite link from the draft room to the other managers. Creating a league, joining one and saving a 30/30 entry need sign-in; seats and entries follow the Google account, so they are the same on every device.

Without Google credentials, run `AUTH_DEV_LOGIN=1 npm run dev`: `/sign-in` then shows a **Development sign-in** form (name, email, password). It never turns on in a production build.

Locally the app stores leagues in PGlite (Postgres in WebAssembly) under `.data/pglite`. Delete that folder to start over. Set `DATABASE_URL=postgres://…` to use a real Postgres instead.

## Deploying to Vercel

1. Add Neon Postgres from the Vercel Marketplace. It sets `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED`; enable a database branch per preview deployment.
2. Set `LINK_SECRET` to at least 32 random characters, e.g. `openssl rand -base64 48`, for both Production and Preview, using a different value for each: Neon preview branches copy the link table, so a shared secret would make production links work against preview data. Changing it invalidates every invite and personal link (not sign-in sessions).
3. Set `CRON_SECRET` (any random string; Vercel sends it as a bearer token) so the daily jobs at `/api/cron/refresh-records` (10:00 UTC, `vercel.json`) and `/api/cron/challenge` (16:00 UTC: challenge schedule, lines and freeze) can run; team records come from ESPN. Without it the route returns 503. `RECORD_SOURCE=static` uses the mock records instead of ESPN.
4. Set up Google sign-in (below).
5. Deploy. `vercel-build` runs `npm run db:migrate` (over the unpooled URL) before `next build`, so a deployment without a database fails instead of going live.

A production server started without `DATABASE_URL` or `LINK_SECRET` refuses to serve: every request returns 500 and the log names what is missing. To try a production build locally, run `DATABASE_URL=pglite:.data/prod LINK_SECRET=$(openssl rand -base64 48) npm start`.

## Google sign-in

Accounts use [Better Auth](https://www.better-auth.com/) with Google as the only provider.

1. In the [Google Cloud console](https://console.cloud.google.com/apis/credentials), configure the OAuth consent screen, then create an **OAuth client ID** of type **Web application**.
2. Add the site origin (e.g. `https://your-site.vercel.app`, and `http://localhost:3000` for local work) under **Authorized JavaScript origins**, and `{origin}/api/auth/callback/google` (e.g. `https://your-site.vercel.app/api/auth/callback/google`) under **Authorized redirect URIs**.
3. Set these environment variables on Vercel (Production):
   - `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`: from the OAuth client.
   - `BETTER_AUTH_SECRET`: at least 32 random characters, e.g. `openssl rand -base64 32`.
   - `BETTER_AUTH_URL`: the site origin, e.g. `https://your-site.vercel.app`. On Vercel it falls back to `https://$VERCEL_PROJECT_PRODUCTION_URL`.
4. Optional, sign-in on preview deployments: Google takes no wildcard redirect URIs, so previews sign in through production
   (Better Auth's OAuth proxy: production completes the Google sign-in and hands the encrypted profile back to the preview).
   Set `AUTH_PREVIEW_HOSTS` to your project's preview host pattern, e.g. `your-project-*-your-team.vercel.app` (comma-separate
   several; a wildcard needs a fixed prefix, so `*.vercel.app` is refused), and set it, the Google pair, `BETTER_AUTH_SECRET`
   (the same value) and `BETTER_AUTH_URL` (the production origin) for **both** Production and Preview. Nothing more is
   registered with Google. Previews then sign in on their own URL; without `AUTH_PREVIEW_HOSTS` they can't sign in.
   Production must already run this sign-in code: until then a preview's Google callback lands on production's 404.
   A preview that shares the production database creates real accounts and sessions in it. Without these variables the site still serves every page (the server log says what is missing), but `/sign-in` reports that sign-in isn't available and nothing can be created or saved. Outside production the secret and URL fall back to development values, so only the Google pair (or `AUTH_DEV_LOGIN=1`) is needed locally. Browsers that held seats or a 30/30 entry from before sign-in see a notice that links to `/account`, where one button moves them to the signed-in account.

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
scripts/smoke.sh http://localhost:3000   # two-browser API smoke test (server started with AUTH_DEV_LOGIN=1)
```

## Requirements

Node 20. The project uses Vitest 4.1; Vitest 5 needs Node ≥ 22.12.

## Limitations

- Only Google sign-in. One person can still enter the 30/30 Challenge from several Google accounts.
- A manager who loses their Google account needs the commissioner to reset the seat; a commissioner who loses their Google account cannot recover the commissioner seat: they can't reset their own seat, and an old personal link only works while no account holds the seat.
- Lines are the prototype's static mock values; team records are mock data too.
- Rosters, and the scoring and round settings, are not built yet.

## Notices

NBA team logos load from NBA's CDN and are NBA trademarks. Licensing review is required before any public launch.

## Docs

- [CLAUDE.md](CLAUDE.md): project conventions
- [Design spec](docs/superpowers/specs/2026-10-08-courtline-prototype-design.md)
- [Implementation plan](docs/superpowers/plans/2026-10-08-courtline-prototype.md)
- [30/30 Challenge spec](docs/superpowers/specs/2026-10-13-30-30-challenge-design.md)
- [Durable storage and sessions spec](docs/superpowers/specs/2026-10-08-durable-storage-sessions-design.md) and [plan](docs/superpowers/plans/2026-10-08-durable-storage-sessions.md)
- [`wiremocks/`](wiremocks/): desktop mockups
