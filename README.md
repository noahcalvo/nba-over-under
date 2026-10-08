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
