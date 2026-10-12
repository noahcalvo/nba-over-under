# Season Awards (Best Pick / Worst Pick) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or superpowers:subagent-driven-development) to
> implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Two league-wide season awards: **Best Pick** (+2 to its owner) and **Worst Pick** (−2 to its owner), chosen by
individual pick score across every retained pick. Projected and provisional during the season, final once every drafted
team has played 82 games, counted in standings, shown on the League overview, explained in League settings and taught by
the guided demo at all three checkpoints.

**Architecture:** One pure decision, `decideAwards` in `src/lib/awards.ts`, reads the `ScoredCall`s that
`computeStandings` already builds (so pick scores come from `evaluateCall` and nothing is re-scored), and
`computeStandings` adds each manager's award points to `totalPoints` and ranks on that. Every page that reads standings
(Overview, Rosters, the guided season) gets awards for free; the demo uses the same function on its simulated records.
The award points live in `SCORING` (`src/config/scoring.ts`), not in league settings.

**Tech Stack:** Next.js 16.4 App Router, React 19, TypeScript strict, Tailwind CSS v4, Vitest 4.1. No new dependencies.

## Requirements (condensed from the request of 2026-10-12)

- Best Pick = highest individual pick score among retained picks; Worst Pick = lowest. Scores from the existing rules,
  before any award points. Ties: every tied pick gets the full award. One manager may win several awards, both kinds.
- Excluded: voided picks (never in `draft.picks`), undrafted (unclaimed) sides, picks of managers not in the league,
  fades. Awards never change a pick's own score.
- During the season: projected leaders from projected pick scores, labelled provisional, counted in projected standings
  with a breakdown, recalculated whenever records change. Pending (no invented winners) until projections exist. Final
  only when the regular season is complete for every drafted team; then the final basis is used.
- UI: compact Season Awards panel on the overview (team, side, owner, locked line, pick score, ±2, projected/final);
  award points in manager breakdowns (standings, summary, rosters); a Season awards group in How scoring works.
- Demo: Draft complete introduces the awards (no winners); Midseason shows projected leaders and their effect on the
  projected standings; Final reveals the actual winners, their effect on the final standings and winner, and what changed
  since Midseason. Same simulation and scoring as real leagues; never rigged.
- Tests: unique winners, ties, different managers, same manager both awards, pushes, missing records, incomplete season,
  projected → final, voided picks, totals and ranks without double counting, demo at all checkpoints, persistence.

## Findings (read before Task 1)

- `computeStandings` is the only place totals are summed; Overview, Rosters and the guided season all call it. Adding
  `awardPoints` there is the single integration point. `ScoredCall.evaluation.points` stays the pick's own score.
- Voided picks are kept in `draft.voidedPicks`, never in `draft.picks`, so they are excluded by construction.
- **Decision — when awards exist:** picks are final once the draft reaches `fades` (or `complete`). Projected awards need
  every retained pick scored (each drafted team has played at least once), otherwise a partial field would crown a
  leader from whoever has played; final awards need every retained pick settled (82 games). Otherwise `pending` with a
  reason (`draft`, `no_games`, `unsettled`), and no award points on that basis.
- **Decision — ties:** pick scores are compared unrounded, with a 1e-9 tolerance for floating-point noise only (two
  equal paces computed by different divisions).
- **Decision — basis at season end:** the overview opens on the final basis once final standings are complete (the
  demo already did this at Final results), so a finished league shows final awards rather than "projected" ones.
- The guided season had at most six steps per checkpoint (test). Midseason needs one more step for the awards; the limit
  becomes seven.
- Superpowers skills are not installed in this environment: the plan is executed inline, test-first, task by task.

## Found during execution

- Both sides of one team are often drafted, and their scores mirror each other, so Best Pick and Worst Pick are often
  the Over and Under of the same team (the demo's default draft shows it). That is the scoring, not a bug; nothing is
  special-cased.
- The summary card's sub line truncates; award points got their own line there.
- `next start` refuses to boot without `DATABASE_URL`/`LINK_SECRET`; the browser walk used
  `RECORD_SOURCE=static LINE_SOURCE=static next dev` with a stored demo snapshot per checkpoint (1440px and 375px, no
  horizontal scroll, steps survive reloads and route changes, no page errors).
- PGlite tests (`src/db/client.test.ts`) can time out at 5 s when the whole suite runs on a busy machine; they pass on
  their own and are unrelated.

## Tour steps added

| Checkpoint | Step | Spotlight | Says |
| --- | --- | --- | --- |
| Draft complete | `draft-awards` (after `draft-standings`) | season awards | Two awards exist, ±2, nothing to award before games |
| Midseason | `mid-awards` (after `mid-standings`) | season awards, standings | The projected leaders (real demo numbers), provisional, how they move the projected standings; the user's award line |
| Final results | `final-awards` (after `final-standings`) | season awards, standings | The actual winners and owners, ±2, whether the awards changed the winner, what changed since Midseason |

## File Structure

| File | Status | Responsibility |
| --- | --- | --- |
| `src/config/scoring.ts` | modify | `bestPickAward`, `worstPickAward` |
| `src/lib/awards.ts` (+ test) | create | `decideAwards`, `awardsFor`, `awardChanges` |
| `src/lib/standings.ts` (+ test) | modify | `awards` on `Standings`, `awards`/`awardPoints` per manager, totals and rank include them |
| `src/lib/tutorial/season-steps.ts`, `season-copy.ts`, `season-story.ts` (+ tests) | modify | New steps, copy, `awardsStory`, award row in the standings breakdown |
| `src/lib/tutorial/season.test.ts` | modify | Demo awards at all three checkpoints, deterministic |
| `src/lib/tour/targets.ts` | modify | `season-awards` |
| `src/components/overview/SeasonAwardsPanel.tsx` | create | The overview panel |
| `src/components/overview/{LeagueOverview,StandingsPanel,SummaryStats}.tsx` | modify | Panel, award breakdowns, final basis at season end |
| `src/components/rosters/{RostersBoard,RosterColumn}.tsx` | modify | Award line in the column header |
| `src/components/settings/ScoringRulesPanel.tsx` | modify | Season awards group |
| `src/components/tutorial/SeasonTour.tsx` | modify | Award stories at the three steps |
| `CLAUDE.md` | modify | Domain rule and architecture notes |

## Tasks

### Task 1: Award decision (`src/config/scoring.ts`, `src/lib/awards.ts`)
- [x] Failing tests: unique winners; ties; same manager both; push as a candidate; missing records → pending
  (`no_games`); incomplete season → pending (`unsettled`); draft not finished → pending; fades ignored; voided picks
  never considered; unknown manager excluded; a single pick wins both.
- [x] Implement `decideAwards(calls, basis, draftStatus, managerIds, config)`, `awardsFor(awards, managerId)`.

### Task 2: Standings include awards (`src/lib/standings.ts`)
- [x] Failing tests: totals = calls + fades + awards (no double counting), ranks move with awards, projected vs final
  awards on the same league, partial final standings carry no award points, early-end draft only awards kept picks.
- [x] Update existing expectations that now include award points.

### Task 3: Overview, rosters and settings UI
- [x] `SeasonAwardsPanel` (tour id `season-awards`) in the overview's right column under the standings.
- [x] Award breakdown in `StandingsPanel` rows, `SummaryStats`, `RosterColumn`; "Points include fades and awards".
- [x] Season awards group in `ScoringRulesPanel`.

### Task 4: Guided demo
- [x] Steps `draft-awards`, `mid-awards`, `final-awards`; copy; `awardsStory`, `awardChanges`; standings breakdown row.
- [x] Tests: demo awards at 0 / 41 / 82 games, deterministic, step walk, stored progress with the new ids.

### Task 5: Verify
- [x] `npm test && npm run lint && npm run typecheck && npm run build`; walk the demo in a browser at 375px and 1440px.
- [x] CLAUDE.md.
