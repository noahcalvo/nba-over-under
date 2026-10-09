---
name: perf-iteration
description: One iteration of the Courtline load-time and network optimization loop — measure production, make one change, ship it to main, re-measure, log the result. Use when asked to keep optimizing page speed, or run repeatedly with `/loop /perf-iteration`.
---

# Performance iteration (Courtline)

One iteration = one focused change, shipped and measured on production. Read `docs/perf/log.md` first: it holds the
findings so far, every past iteration with numbers, and the ranked list of ideas. Don't repeat a rejected idea.

## 1. Pick

Take the most promising open idea from the log (or one you found while measuring). One change per iteration, so the
numbers can be attributed. If nothing promising is left, say so and stop the loop.

## 2. Measure before (production)

Production is https://nba-over-under-iota.vercel.app, league `bgtpyh`. Read-only: never draft, refresh records, reset
links or claim seats there.

- Server responses: `node scripts/perf.mjs` (medians and p90s of documents and RSC payloads). Network noise from the dev
  machine is large (~40 ms vs ~450 ms modes), so trust medians across runs, not single numbers.
- Client navigations (what the user feels): open the page in the browser pane, paste `scripts/perf-nav.js` with
  `javascript_tool`, then navigate with real `computer` clicks (never `element.click()` on a Link: it can become a full
  page load) or `window.__perfNav.push(path)` for the team selector. Read `window.__perfNav.table()`: per navigation,
  when the URL changed, when the new page's heading was visible, and when nothing was loading.
- Network: `read_network_requests` or `performance.getEntriesByType("resource")` for counts and bytes.

## 3. Change

Follow CLAUDE.md (Cache Components rules, tokens, `src/lib` test-first). Read `node_modules/next/dist/docs/` for any
Next API you haven't used. Local loading states only appear in `next dev` with an artificial delay (e.g. a temporary
`setTimeout` in `getLeagueOrNotFound`); remove it before committing. Check 375 px and 1440 px.

Then: `npm test && npm run lint && npm run typecheck && npm run build`.

## 4. Ship

Commit on the worktree branch (message ends with the Co-Authored-By trailer) and push to main:
`git push origin HEAD:main`. Vercel deploys in ~1–2 minutes; poll for something only the new build serves
(e.g. `curl -s <url> | grep -q '<new markup>'`) rather than sleeping blindly.

## 5. Measure after, log, decide

Repeat step 2 on production. Add an entry to `docs/perf/log.md` (newest first) with the commit, what changed, a
before/after table, and anything learned; update the ideas list. If the change made things worse or no better, revert
it on main and log why.
