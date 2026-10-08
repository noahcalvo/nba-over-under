# Courtline

Courtline — draft Overs and Unders on every NBA season win total (prototype).

## Setup

```bash
npm install
npm run dev
```

Open http://localhost:3000. The demo league is at http://localhost:3000/l/demo (read-only). To draft for real, use **Create league** on the landing page, then share the invite link from the draft room with the other managers.

## Commands

```bash
npm test          # Vitest unit tests
npm run lint
npm run typecheck
npm run build
npm start         # serve the production build
```

## Requirements

Node 20. The project uses Vitest 4.1; Vitest 5 needs Node ≥ 22.12.

## Limitations

- Leagues live in server memory and are wiped on restart. The demo league is re-seeded.
- Works only on a single long-running `next dev` / `next start` process. Not suitable for serverless hosting.
- Identity is a cookie with no authentication.
- Rosters and League settings are not built yet.

## Notices

NBA team logos load from NBA's CDN and are NBA trademarks. Licensing review is required before any public launch.

## Docs

- [CLAUDE.md](CLAUDE.md): project conventions
- [Design spec](docs/superpowers/specs/2026-10-08-courtline-prototype-design.md)
- [Implementation plan](docs/superpowers/plans/2026-10-08-courtline-prototype.md)
- [`wiremocks/`](wiremocks/): desktop mockups
