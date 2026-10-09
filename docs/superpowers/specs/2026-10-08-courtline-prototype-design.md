# Courtline prototype — design

Date: 2026-10-08 · Status: approved in chat

Courtline is an NBA season win-total league. Four managers snake-draft Over and Under calls on team win lines, then
score on how those calls play out. This prototype implements **League overview** and **Draft room** from the desktop
mockups in `wiremocks/`, plus the league create/join flow needed for multiple people to draft together.

## Scope

In scope:

- League overview and Draft room pages, matching `wiremocks/overview.png` and `wiremocks/draft-room.png`.
- Navigation for League overview, Rosters, League settings and Draft room. Rosters and League settings are clearly
  marked unfinished ("Soon" in nav, "Not built yet" page).
- Landing page with **Create league**, the viewer's leagues, and a link to the demo league.
- Invite link and join page so other people can claim manager seats.
- One shared mock dataset (teams, lines, prior-season wins, current records, demo league).

Out of scope: authentication, a database, live NBA data, fade creation UI, early clinching, the Rosters and League
settings pages themselves.

## Decisions

| Topic | Decision |
|---|---|
| State | Leagues live in server memory (`globalThis` singleton). Lost on restart. Single long-running Node process only (not serverless). |
| Identity | Cookie `courtline_seats` maps leagueId → managerId. No auth; anyone can edit their cookie. Fine for a prototype. |
| League creation | Landing page form → new league with a short random ID. Creator claims seat 1 (Manager 1) and is commissioner. |
| Joining | `/l/{id}/join` lists open seats; enter a display name to claim one. Joining mid-draft takes over that seat. |
| Open seats | Draft can start any time. When an unclaimed seat is on the clock, the commissioner picks for it. |
| Draft controls | Only the commissioner can start, pause and resume. The server validates turn, availability and status on every action. |
| Draft size | 4 managers × **11 rounds** = **44 picks** (rounds configurable per league, default 11). 60 sides exist (30 teams × Over/Under); 16 go undrafted. |
| Live updates | Draft room polls `GET /api/leagues/{id}/draft` every 2 s. A `version` counter prevents stale responses overwriting newer state. |
| Demo league | `demo` — "National Balla Association", completed draft, one fade per manager, mid-season records, read-only. |
| Mockup data conflicts | The mockups contradict each other (e.g. Celtics UNDER is Manager 1's in the overview but Manager 3's in the draft room). One consistent dataset is used instead; the demo draft's first 8 picks match the draft-room mockup. |
| Logos | Official logos from NBA's CDN (`https://cdn.nba.com/logos/nba/{nbaId}/global/D/logo.svg`) with an abbreviation-badge fallback. Trademark/licensing review needed before any public launch. |
| Mobile nav | Below `lg`, the sidebar becomes a fixed bottom tab bar; the league name moves into a small top header. |
| Fades in new leagues | None (no fade creation UI in scope). The demo league has seeded fades. |

## Scoring

All weights live in one object, `SCORING` in `src/config/scoring.ts`:

| Weight | Value |
|---|---|
| Correct call | +1 |
| Missed call | −1 |
| Margin weight | × 0.1 |
| Fade hit (targeted pick misses) | +2 |
| Fade miss (targeted pick hits) | 0 |
| Season length | 82 games |

- **Signed margin**: Over → wins − line. Under → line − wins.
- **Call points**: (margin > 0 ? correct : missed) + margin × marginWeight. A margin of exactly 0 is a push and earns 0.
- A push (final wins, or a projected pace, exactly on the line) is neither correct nor missed: the pick earns 0 and a fade
  on it earns `fadeMiss` (0). Only whole-number lines can push on the final basis.
- **Projected wins**: wins ÷ games played × 82. Zero games played → "Not available" (call is unscored, adds nothing).
- **Fade**: scores `fadeHit` when its targeted opponent pick misses, otherwise `fadeMiss`. It inherits "Not available"
  or "Pending" from its target.
- **Two bases, shown separately**: `projected` (win pace) and `final` (settled results). A pick **settles** when its team
  has played 82 games. Unsettled picks are "Pending" on the final basis and earn no final points.
- **Standings**: ranked by total points (calls + fades) descending, then total margin, then seat. Margin is shown as
  supporting detail beneath points.
- Totals are always derived from the underlying records (picks, fades, team records). Nothing displayed is hardcoded.

## League overview

- Manager picker (defaults to the viewer's seat, else Manager 1) drives picks, summary stats and fades.
- Basis toggle: **Win pace** / **Final results**. Final results is disabled with the note "Available when results are
  final." until at least one pick is settled. Once enabled it shows final wins, Correct/Missed and points for settled
  picks, "Pending" for the rest, and final standings labeled **Partial results** until every pick and fade is settled
  (and the draft is complete).
- Picks: table on `md+`, readable cards below `md`. Shows the first 5, with "View all N picks" expanding in place.
- League standings: rank, manager, points with margin beneath. The selected manager is highlighted.
- Fade picks for the selected manager: projected status **On track** (target projected to miss) / **Off track** /
  "Not available"; final status "+2 earned" / "No bonus" / "Pending".
- Stat cards: rank, points (with margin and fade bonus beneath), picks on pace (correct / drafted), gap to first.
- Closest calls (projected only): the 3 scored calls with the smallest absolute margin.

## Draft room

- Status bar: who's on the clock ("Your turn · …" / "On the clock · …" / "Picking for … (open seat)"), round and pick
  ("Round 3 · Pick 9 of 44"), up next, Pause/Resume (commissioner only). Lobby state before start (seats, invite link,
  Start draft). Completed state after pick 44.
- Draft board: managers as columns in seat order, rounds as rows (R1 →, R2 ←, …). Each cell shows the drafted side, or
  "On the clock" / "Up next" / "—". Scrolls inside its own container (both axes) and keeps the current pick in view.
- Available picks: search (city, name, abbreviation), conference filter (All / East / West), availability filter
  (Available / All teams). Each team row has separate UNDER and OVER controls; a drafted side shows its manager and is
  disabled. Footer "N of 60 sides available".
- Selecting a side previews it in **Your selection** (logo, team, side + line, who is on the clock and the pick number,
  2024–25 wins). Selection is allowed while the draft is live; **Confirm pick** is enabled only when the viewer may pick
  now. Clear selection resets it. Paused or not-started drafts block selecting and confirming.
- If the selected side is drafted by someone else (seen via polling), the selection clears with a notice.
- Your picks: the viewer's picks (or the on-the-clock manager's, for viewers without a seat), "N / 11 drafted".

## Responsive

- `lg+`: fixed left sidebar. Below `lg`: top header + fixed bottom tab bar; panels stack.
- `md+`: tables. Below `md`: cards.
- The draft board scrolls within its container. The page itself never scrolls horizontally (checked at 375 px).

## Verification

- Vitest unit tests for scoring, formatting, snake order, draft actions, standings, mock-data consistency, permissions,
  store and cookie parsing.
- `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` all pass.
- API smoke test with two cookie jars (create, join, start, pick, permission errors).
- Browser checks at 1440 px and 375 px for both pages; no page-level horizontal scroll.
