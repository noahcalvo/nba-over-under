# Load-time and network optimization log

Production: https://nba-over-under-iota.vercel.app (league `bgtpyh`). Process: `.claude/skills/perf-iteration/SKILL.md`.
Newest entries first. Every number is from production unless it says otherwise.

## Findings that shape the work

- **The database is not the bottleneck.** Functions run in `iad1`; a round trip to Postgres is ~3.5 ms (a new
  connection ~40 ms), and a whole league load is ~5 ms (`/api/debug/latency`, 2026-10-09).
- **Network noise dominates single timings.** From the dev machine even the static favicon alternates between ~40 ms
  and ~450 ms. Compare medians and minimums over several runs; never one request.
- **Partial Prefetching** (on) prefetches each route's App Shell: static content plus fallbacks. Uncached reads
  (every database query) never enter a prefetch, so a first visit to a page always waits one server round trip for
  its data. What can be instant: anything in the shell (static markup, client fallbacks that read the URL or the
  layout's context) and revisits (client cache, `unstable_dynamicStaleTime`).
- **React Activity** keeps previous routes mounted but hidden. Measure with visible elements only
  (`scripts/perf-nav.js`).
- `next dev` never prefetches: loading states users see in production do not appear locally unless you add a delay.
- **A hidden browser pane doesn't paint**, and React's streamed reveals and `<Link>` prefetches wait for a frame. Take
  a screenshot after each load (and between steps) or the numbers measure the pane, not the app.
- Prefetching is cheap: a page load fetches ~12 small RSC prefetches (route trees and App Shells, ~5 KB transferred
  once static assets are cached). Team logos load lazily (6 on the overview's first screen).

## Iterations

### 3. League frame and static content in the HTML shell — `9ca9fb9`
Direct visits got a blank dark page from the CDN (~40 ms TTFB) until the league loaded, because the league layout
wrapped everything, sidebar included, in one Suspense boundary. Now the layout passes the league read as a promise:
the sidebar, top bar and bottom tabs are in the prerendered HTML (nav items render as placeholders, then become
links), and every page renders immediately with its own loading state (header placeholders until the layout knows the
league). Settings' scoring rules are in the static HTML.

| Direct visit (`/l/bgtpyh/settings`) | Before | After |
| --- | --- | --- |
| First bytes from the CDN (~35–45 ms) | blank page | sidebar, title, scoring rules (byte 9.4 K of 73 K) |
| League name, links | end of stream | streamed (byte 42 K) |

Client navigations unchanged (header 4–18 ms; revisits reused). Team pages: content 89–319 ms, streamed panels
(ESPN, FanDuel) 308–401 ms. The two modes (~90 vs ~310 ms) are the dev machine's network, not the server.

### 2. Headers at once, instant revisits — `54705e2`
- Loading states for Overview, Rosters and team pages are client components that read the league from the layout
  (`CurrentLeague` context) and the team from the URL; Settings keeps its title and scoring rules outside Suspense.
- `unstable_dynamicStaleTime = 60` on overview, rosters, settings and team pages; draft actions call
  `router.refresh()`.

| Navigation (real clicks, browser) | Before: loading screen | After: header | After: data |
| --- | --- | --- | --- |
| Overview → Rosters (first) | 13–500 ms "Loading rosters…" | 15 ms | 317 ms |
| Rosters → Overview (revisit) | 360–520 ms "Loading league…" | 16 ms | 16 ms (reused) |
| → Settings (first) | 61–912 ms "Loading settings…" | 22 ms (with scoring rules) | 404 ms |
| Team → team (first) | 300–530 ms "Loading team…" | 8–10 ms | 130–600 ms |
| Team → team (revisit < 60 s) | same | 8 ms | 8 ms |

### 1. League in one round trip — `149034d`
`loadLeague` ran four queries one after another; now they run in parallel. `findLeague` is memoized per request.
Saves a few ms per page (the database is close), so no visible change.

## Ideas not yet done (most promising first)

- Draft room loading state: same header-from-layout pattern.
- First-visit data without a round trip: `"use cache: private"` page data plus `<Link prefetch>` on the sidebar
  (per-link prefetch includes cached content). Trade-off: up to five minutes of client staleness; needs care during a
  live draft.
- Fonts: six Barlow files (~90 KB) are preloaded on every page; check which weights are used.
- Team logos: up to 30 SVGs from cdn.nba.com per page (`unoptimized`); check sizes and lazy loading.
- Remove `/api/debug/latency` when the investigation ends.
