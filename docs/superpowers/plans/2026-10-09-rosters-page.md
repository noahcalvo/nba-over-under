# Rosters Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `NotBuiltYet` Rosters page with a four-column board showing every manager's picks, projected total, rank and fade, matching the mockup.

**Architecture:** The server page loads the `LeagueView` exactly like the overview and hands `league` + `teams` to one client component, `RostersBoard`. All numbers come from `computeStandings(…, "projected")`; a new pure module `src/lib/rosters.ts` only orders managers and groups/sorts each manager's `ScoredCall`s. Presentation is split into `RosterColumn` (one manager), `RosterGroup` (an outlined Overs/Unders block with its rows) and `RosterFade` (the fade footer).

**Tech Stack:** Next.js 16.4 App Router (Cache Components), React 19, TypeScript strict, Tailwind CSS v4 (container queries), Vitest 4.1, lucide-react.

**Spec:** the mockup `wiremocks/rosters.png` (copied in Task 1 from `docs/superpowers/plans/Overs and unders projection dashboard.png` in the main checkout) plus the requirements below. The mockup is the source of truth for layout and styling; its names and numbers are illustrative.

## Global Constraints

- Match the mockup as closely as possible: page title "Rosters", subtitle "{league name} • {season}", "Demo data" tag top right, controls row (Show projected switch, sort select, "Points include fades" note), one column per manager, footnote at the bottom.
- Each column: avatar, manager label, "{n} picks", and (projected only) "Rank N", "Projected", "+x.xx pts"; then the Overs group, the Unders group, then the fade footer.
- Groups: Overs outlined in lime (`over` token), Unders outlined in purple (`under` token) — the mockup's red is overridden by the project's Under = purple rule. The heading text ("Overs" / "Unders", uppercase display font, same color as its outline) sits on and interrupts the top border.
- No per-row side labels, arrows, or "PROJ. PTS" captions in the grouped view.
- Default sort "Traditional": Overs group first, then Unders; within each group by frozen line (`team.line`), highest first; ties by pick number.
- Secondary sort "Pick quality" (select label "Sort: Pick quality"): one ungrouped list per manager by projected pick points, highest first; ties by line (highest first), then pick number. Because there are no groups in this mode, each row shows a small `SidePill` so the direction stays visible.
- One "Show projected" switch, on by default. Off hides: column rank, "Projected" caption and total, pick points, pace, fade status badge and fade projected points, the "Points include fades" note. Off keeps: teams, frozen lines, pick directions (group outlines / side pills), fade target manager and team, fade target line. The sort is independent of the switch: "Pick quality" still orders picks by projected points when the numbers are hidden, so the order alone shows which picks are doing well or poorly.
- Two decimals wherever they add accuracy: pick points, column totals and pace use two decimals (`SignedValue digits={2}`, `formatNumber(x, 2)`). Lines stay one decimal (they are always whole or .5). Fade points are whole numbers: `formatSigned(points, 0)` + " projected pts".
- Before a team has played (evaluation not scored), its pick is projected at 0 points: `projectedPoints(call)` from `src/lib/rosters.ts` (`evaluation.points ?? 0`) is the single place that rule lives, used for display and for the Pick quality sort. Its pace shows "Pace —". Totals and ranks always show (unscored picks contribute 0, as `computeStandings` already does). An unscored fade shows "0 projected pts" and no status badge. This is a Rosters-page rule; the overview is unchanged.
- Every number comes from `src/lib/scoring.ts` / `src/lib/standings.ts`; never recompute scoring in a component.
- Columns in seat order (M1…M4), not rank order. Columns stretch to equal height so the fade footers line up.
- Responsive via a container query on the board: 1 column by default, 2 at `@2xl` (42rem), 4 at `@5xl` (64rem). At 1440px wide (content ≈ 1120px) that gives 4 columns; at 375px one. The page must never scroll horizontally.
- Dark theme tokens only (`bg-ink-850`, `text-fog-400`, …); team colors from data are the only raw colors.
- Before claiming done: `npm test && npm run lint && npm run typecheck && npm run build`.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Structure

| File | Status | Responsibility |
| --- | --- | --- |
| `wiremocks/rosters.png` | create | The mockup, kept with the other mockups |
| `src/lib/rosters.ts` | create | `RosterSort`, `projectedPoints`, `rosterColumns` (seat order + rank + fade), `rosterGroups` (grouping and sorting) |
| `src/lib/rosters.test.ts` | create | Unit tests for the above |
| `src/components/ui/Switch.tsx` | create | Accessible on/off switch primitive |
| `src/components/ui/SignedValue.tsx` | modify | Optional `suffix` (for "+4.95 pts") |
| `src/components/shell/PageHeader.tsx` | modify | Optional `actions` slot under the tag |
| `src/components/rosters/RostersBoard.tsx` | create | Client root: state (switch, sort), standings, header, grid, footnote |
| `src/components/rosters/RosterColumn.tsx` | create | One manager: header card, groups, fade footer |
| `src/components/rosters/RosterGroup.tsx` | create | Outlined group (or plain list in points mode) and its pick rows |
| `src/components/rosters/RosterFade.tsx` | create | Fade footer |
| `src/app/l/[leagueId]/rosters/page.tsx` | modify | Load the league view and render `RostersBoard` |
| `src/components/shell/nav-items.ts` | modify | Rosters `ready: true` (drops the "Soon" badge) |
| `CLAUDE.md` | modify | Note the Rosters-page number rules |

---

### Task 1: Roster ordering logic (`src/lib/rosters.ts`)

Suggested model: haiku (complete code below).

**Files:**
- Create: `wiremocks/rosters.png`
- Create: `src/lib/rosters.ts`
- Test: `src/lib/rosters.test.ts`

**Interfaces:**
- Consumes: `computeStandings`, `Standings`, `StandingRow`, `ScoredCall`, `ScoredFade` from `@/lib/standings`; `findManager` from `@/lib/league/managers`; `Manager`, `Side` from `@/lib/types`.
- Produces:
  - `type RosterSort = "traditional" | "quality"`
  - `function projectedPoints(call: ScoredCall): number` — the call's projected points, 0 when not scored.
  - `interface RosterGroup { side: Side | null; calls: ScoredCall[] }` — `side` is null in quality mode.
  - `interface RosterColumn { manager: Manager; standing: StandingRow; fade: ScoredFade | null; fadeTarget: Manager | null }`
  - `function rosterColumns(managers: readonly Manager[], standings: Standings): RosterColumn[]`
  - `function rosterGroups(calls: readonly ScoredCall[], sort: RosterSort): RosterGroup[]`

- [ ] **Step 1: Copy the mockup into the worktree**

```bash
cp "/Users/noah/Desktop/projects/nba-over-under-draft/docs/superpowers/plans/Overs and unders projection dashboard.png" wiremocks/rosters.png
```

- [ ] **Step 2: Write the failing tests**

Create `src/lib/rosters.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildDemoLeague } from "@/data/demo-league";
import { TEAM_INFO } from "@/data/teams";
import { indexTeams, withLines } from "@/lib/lines";
import { projectedPoints, rosterColumns, rosterGroups } from "@/lib/rosters";
import { computeStandings, type ScoredCall } from "@/lib/standings";
import type { Side } from "@/lib/types";

function call(pickNumber: number, side: Side, line: number, points: number | null): ScoredCall {
  const id = `T${pickNumber}`;
  return {
    pick: { pickNumber, managerId: "m1", teamId: id, side },
    team: { id, nbaId: 0, city: id, name: id, conference: "East", color: "#000000", line, prevWins: 40, wins: 0, losses: 0 },
    evaluation: {
      basis: "projected",
      status: points === null ? "not_available" : "scored",
      wins: null,
      margin: null,
      correct: null,
      points,
    },
  };
}

const picks = (calls: ScoredCall[]) => calls.map((c) => c.pick.pickNumber);

describe("rosterGroups", () => {
  const calls = [
    call(1, "UNDER", 40.5, 1.1),
    call(2, "OVER", 30.5, -1.4),
    call(3, "OVER", 50.5, 1.3),
    call(4, "UNDER", 55.5, -1.2),
    call(5, "OVER", 50.5, null),
  ];

  it("traditional: Overs then Unders, each by line highest first, ties by pick number", () => {
    const groups = rosterGroups(calls, "traditional");
    expect(groups.map((g) => g.side)).toEqual(["OVER", "UNDER"]);
    expect(picks(groups[0].calls)).toEqual([3, 5, 2]);
    expect(picks(groups[1].calls)).toEqual([4, 1]);
  });

  it("traditional: leaves out an empty side", () => {
    const groups = rosterGroups([call(1, "UNDER", 40.5, 1)], "traditional");
    expect(groups.map((g) => g.side)).toEqual(["UNDER"]);
  });

  it("traditional: no picks gives no groups", () => {
    expect(rosterGroups([], "traditional")).toEqual([]);
  });

  it("quality: one ungrouped list by points highest first, unscored picks counted as 0", () => {
    const groups = rosterGroups(calls, "quality");
    expect(groups).toHaveLength(1);
    expect(groups[0].side).toBeNull();
    expect(picks(groups[0].calls)).toEqual([3, 1, 5, 4, 2]);
  });

  it("quality: ties by line highest first, then pick number", () => {
    const tied = [call(1, "OVER", 30.5, 1), call(2, "UNDER", 40.5, 1), call(3, "OVER", 40.5, 1)];
    expect(picks(rosterGroups(tied, "quality")[0].calls)).toEqual([2, 3, 1]);
  });

  it("quality: an unscored pick ties with a 0-point pick and falls back to line", () => {
    const tied = [call(1, "OVER", 30.5, 0), call(2, "UNDER", 40.5, null)];
    expect(picks(rosterGroups(tied, "quality")[0].calls)).toEqual([2, 1]);
  });

  it("does not reorder the input", () => {
    rosterGroups(calls, "quality");
    expect(picks(calls)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("projectedPoints", () => {
  it("is the evaluation's points when scored", () => {
    expect(projectedPoints(call(1, "OVER", 40.5, -1.25))).toBe(-1.25);
  });

  it("is 0 before the team has played", () => {
    expect(projectedPoints(call(1, "OVER", 40.5, null))).toBe(0);
  });
});

describe("rosterColumns", () => {
  const league = buildDemoLeague();
  const standings = computeStandings(league, indexTeams(withLines(TEAM_INFO, league.lines!)), "projected");
  const columns = rosterColumns(league.managers, standings);

  it("lists managers in seat order with their standing row", () => {
    expect(columns.map((c) => c.manager.id)).toEqual(["m1", "m2", "m3", "m4"]);
    for (const column of columns) {
      expect(column.standing.managerId).toBe(column.manager.id);
      expect(column.standing.calls).toHaveLength(11);
    }
    expect(columns.map((c) => c.standing.rank).sort()).toEqual([1, 2, 3, 4]);
  });

  it("attaches each manager's fade and the owner of the faded pick", () => {
    const m1 = columns[0];
    expect(m1.fade?.fade.targetPickNumber).toBe(2);
    expect(m1.fadeTarget?.id).toBe(m1.fade?.target.pick.managerId);
    expect(m1.fadeTarget?.id).not.toBe("m1");
  });

  it("has no fade before one is placed", () => {
    const noFades = computeStandings({ ...league, fades: [] }, indexTeams(withLines(TEAM_INFO, league.lines!)), "projected");
    const [first] = rosterColumns(league.managers, noFades);
    expect(first.fade).toBeNull();
    expect(first.fadeTarget).toBeNull();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/lib/rosters.test.ts`
Expected: FAIL — cannot resolve `@/lib/rosters`.

- [ ] **Step 4: Implement `src/lib/rosters.ts`**

```ts
import { findManager } from "@/lib/league/managers";
import type { ScoredCall, ScoredFade, StandingRow, Standings } from "@/lib/standings";
import type { Manager, Side } from "@/lib/types";

/** "traditional": Overs then Unders, each by line. "quality": one list by projected pick points. */
export type RosterSort = "traditional" | "quality";

/** A pick's projected points; a pick whose team has not played yet is projected at 0. */
export function projectedPoints(call: ScoredCall): number {
  return call.evaluation.points ?? 0;
}

/** One block of a roster. side is null when the sort mixes Overs and Unders. */
export interface RosterGroup {
  side: Side | null;
  calls: ScoredCall[];
}

export interface RosterColumn {
  manager: Manager;
  standing: StandingRow;
  /** The manager's fade, or null before it is placed. */
  fade: ScoredFade | null;
  /** The manager whose pick is faded. Null without a fade. */
  fadeTarget: Manager | null;
}

/** One column per manager, in seat order, with their standing row and fade. */
export function rosterColumns(managers: readonly Manager[], standings: Standings): RosterColumn[] {
  return [...managers]
    .sort((a, b) => a.seat - b.seat)
    .map((manager) => {
      const standing = standings.rows.find((row) => row.managerId === manager.id)!;
      const fade = standing.fades[0] ?? null;
      const fadeTarget = fade ? (findManager(managers, fade.target.pick.managerId) ?? null) : null;
      return { manager, standing, fade, fadeTarget };
    });
}

const SIDES: readonly Side[] = ["OVER", "UNDER"];

export function rosterGroups(calls: readonly ScoredCall[], sort: RosterSort): RosterGroup[] {
  if (sort === "quality") return [{ side: null, calls: [...calls].sort(byQuality) }];
  return SIDES.map((side) => ({ side, calls: calls.filter((call) => call.pick.side === side).sort(byLine) })).filter(
    (group) => group.calls.length > 0,
  );
}

function byLine(a: ScoredCall, b: ScoredCall): number {
  return b.team.line - a.team.line || a.pick.pickNumber - b.pick.pickNumber;
}

/** Highest projected points first. */
function byQuality(a: ScoredCall, b: ScoredCall): number {
  return projectedPoints(b) - projectedPoints(a) || byLine(a, b);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/rosters.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 6: Commit**

```bash
git add wiremocks/rosters.png src/lib/rosters.ts src/lib/rosters.test.ts
git commit -m "$(cat <<'EOF'
feat: roster ordering for the Rosters page (traditional and pick-quality sorts)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: UI primitives (Switch, SignedValue suffix, PageHeader actions)

Suggested model: haiku (complete code below). These are additive; existing callers must render exactly as before.

**Files:**
- Create: `src/components/ui/Switch.tsx`
- Modify: `src/components/ui/SignedValue.tsx`
- Modify: `src/components/shell/PageHeader.tsx`

**Interfaces:**
- Produces:
  - `Switch({ checked: boolean; onChange: (checked: boolean) => void; label: string })`
  - `SignedValue` accepts `suffix?: string` (appended after a space, same color; not shown for `empty`)
  - `PageHeader` accepts `actions?: ReactNode`, rendered under the tag, right-aligned from `sm`

- [ ] **Step 1: Create `src/components/ui/Switch.tsx`**

```tsx
"use client";

/** On/off switch. The label text names the control and toggles it on click. */
export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-3 text-base font-medium text-fog-50">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
          checked ? "border-accent bg-accent" : "border-ink-600 bg-ink-800"
        }`}
      >
        <span
          aria-hidden
          className={`size-5 rounded-full bg-fog-50 shadow transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`}
        />
      </button>
      {label}
    </label>
  );
}
```

- [ ] **Step 2: Add `suffix` to `src/components/ui/SignedValue.tsx`**

Replace the component with:

```tsx
export function SignedValue({
  value,
  digits = 1,
  empty = NOT_AVAILABLE,
  suffix,
  className = "",
}: {
  value: number | null;
  digits?: number;
  /** Shown when value is null. */
  empty?: ReactNode;
  /** Unit after the number, e.g. "pts". Not shown with `empty`. */
  suffix?: string;
  className?: string;
}) {
  if (value === null) return <span className={`text-fog-400 ${className}`}>{empty}</span>;
  const text = formatSigned(value, digits);
  const tone = text.startsWith("+") ? "text-positive" : text.startsWith("−") ? "text-negative" : "text-fog-300";
  return <span className={`tabular-nums ${tone} ${className}`}>{suffix ? `${text} ${suffix}` : text}</span>;
}
```

- [ ] **Step 3: Add `actions` to `src/components/shell/PageHeader.tsx`**

Replace the file with:

```tsx
import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  tag,
  actions,
}: {
  title: string;
  subtitle: ReactNode;
  tag?: string;
  /** Controls shown under the tag, right-aligned from sm. */
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="font-display text-3xl font-bold leading-tight text-fog-50 sm:text-5xl">{title}</h1>
        <p className="mt-1 text-lg text-link sm:text-2xl">{subtitle}</p>
      </div>
      {(tag || actions) && (
        <div className="flex min-w-0 flex-col items-start gap-3 sm:items-end">
          {tag && <span className="pt-2 text-xs font-semibold uppercase tracking-[0.2em] text-link">{tag}</span>}
          {actions}
        </div>
      )}
    </header>
  );
}
```

- [ ] **Step 4: Verify**

Run: `npm run lint && npm run typecheck && npm test`
Expected: all pass (no behavior change for existing callers). If `typecheck` fails on files under `.next` named `* 2.*`, delete those iCloud duplicates and rerun.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/Switch.tsx src/components/ui/SignedValue.tsx src/components/shell/PageHeader.tsx
git commit -m "$(cat <<'EOF'
feat: Switch primitive, SignedValue suffix, PageHeader actions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Rosters page

Suggested model: sonnet (UI and integration; needs browser verification against the mockup).

**Files:**
- Create: `src/components/rosters/RosterGroup.tsx`
- Create: `src/components/rosters/RosterFade.tsx`
- Create: `src/components/rosters/RosterColumn.tsx`
- Create: `src/components/rosters/RostersBoard.tsx`
- Modify: `src/app/l/[leagueId]/rosters/page.tsx`
- Modify: `src/components/shell/nav-items.ts:18`
- Modify: `CLAUDE.md` (UI conventions)

**Interfaces:**
- Consumes: `rosterColumns`, `rosterGroups`, `projectedPoints`, `RosterColumn`, `RosterGroup`, `RosterSort` (Task 1); `Switch`, `SignedValue` with `suffix`, `PageHeader` with `actions` (Task 2); `computeStandings` (`@/lib/standings`), `indexTeams` (`@/lib/lines`), `fadeStatus` (`@/lib/fade-status`), `formatNumber`, `formatSigned` (`@/lib/format`), `managerLabel` (`@/lib/league/managers`); existing `TeamLogo`, `ManagerAvatar`, `SidePill`, `Badge`, `Panel`, `buttonClasses`, `PageFallback`; `toLeagueView`, `getLeagueOrNotFound` (`@/server/league`).
- Produces: `RostersBoard({ league: League; teams: Team[] })`.

- [ ] **Step 1: Create `src/components/rosters/RosterGroup.tsx`**

The Overs/Unders block. The heading is absolutely positioned on the top border with the column background behind it, which interrupts the outline. In quality mode (`side === null`) the block has a neutral outline, no heading, and each row shows a small side pill.

```tsx
import { SidePill } from "@/components/ui/SidePill";
import { SignedValue } from "@/components/ui/SignedValue";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { formatNumber } from "@/lib/format";
import { projectedPoints, type RosterGroup as Group } from "@/lib/rosters";
import type { ScoredCall } from "@/lib/standings";
import type { Side } from "@/lib/types";

const GROUPS: Record<Side, { label: string; box: string; heading: string }> = {
  OVER: {
    label: "Overs",
    box: "border-over/80 bg-over/[0.06] shadow-[0_0_18px_-6px_var(--color-over)]",
    heading: "text-over",
  },
  UNDER: {
    label: "Unders",
    box: "border-under/80 bg-under/[0.08] shadow-[0_0_18px_-6px_var(--color-under)]",
    heading: "text-under",
  },
};

export function RosterGroup({
  id,
  group,
  showProjected,
}: {
  /** Unique per page, for the heading's id. */
  id: string;
  group: Group;
  showProjected: boolean;
}) {
  if (group.side === null) {
    return (
      <section aria-label="Picks by quality" className="-mx-px rounded-xl border-2 border-ink-600 px-3 py-1">
        <PickList calls={group.calls} showProjected={showProjected} showSide />
      </section>
    );
  }
  const style = GROUPS[group.side];
  return (
    <section aria-labelledby={id} className={`relative -mx-px rounded-xl border-2 px-3 pb-1 pt-4 ${style.box}`}>
      <h3
        id={id}
        className={`absolute -top-3.5 left-3 bg-ink-850 px-1.5 font-display text-2xl font-bold uppercase leading-none tracking-wide ${style.heading}`}
      >
        {style.label}
      </h3>
      <PickList calls={group.calls} showProjected={showProjected} showSide={false} />
    </section>
  );
}

function PickList({ calls, showProjected, showSide }: { calls: ScoredCall[]; showProjected: boolean; showSide: boolean }) {
  return (
    <ul className="divide-y divide-ink-700/60">
      {calls.map((call) => {
        const { pick, team, evaluation } = call;
        return (
        <li key={pick.pickNumber} className="flex items-center gap-3 py-2">
          <TeamLogo team={team} size={36} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-fog-50">{team.name}</p>
            <p className="flex min-w-0 items-center gap-1.5 text-sm text-fog-400">
              <span className="font-semibold tabular-nums text-fog-50">
                <span className="sr-only">Line </span>
                {formatNumber(team.line)}
              </span>
              {showProjected && (
                <>
                  <span aria-hidden>·</span>
                  <span className="truncate tabular-nums">
                    Pace {evaluation.wins === null ? "—" : formatNumber(evaluation.wins, 2)}
                  </span>
                </>
              )}
            </p>
          </div>
          {showSide && <SidePill side={pick.side} size="sm" />}
          {showProjected && (
            <span className="shrink-0 font-display text-xl font-bold">
              <SignedValue value={projectedPoints(call)} digits={2} />
              <span className="sr-only"> points</span>
            </span>
          )}
        </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 2: Create `src/components/rosters/RosterFade.tsx`**

```tsx
import { Crosshair } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { fadeStatus } from "@/lib/fade-status";
import { formatNumber, formatSigned } from "@/lib/format";
import { managerLabel } from "@/lib/league/managers";
import type { RosterColumn } from "@/lib/rosters";

export function RosterFade({
  fade,
  fadeTarget,
  showProjected,
}: Pick<RosterColumn, "fade" | "fadeTarget"> & { showProjected: boolean }) {
  return (
    <footer className="mt-auto border-t border-ink-700 px-4 py-3">
      <p className="flex items-center gap-2 text-sm font-medium text-fog-50">
        <Crosshair aria-hidden className="size-4 shrink-0 text-fog-300" />
        {fade && fadeTarget ? `Fading ${managerLabel(fadeTarget)}` : "No fade yet"}
      </p>
      {fade && (
        <div className="mt-2 flex items-center gap-3">
          <TeamLogo team={fade.target.team} size={36} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-fog-50">{fade.target.team.name}</p>
            <p className="flex min-w-0 items-center gap-1.5 text-sm text-fog-400">
              <span className="font-semibold tabular-nums text-fog-50">
                <span className="sr-only">Line </span>
                {formatNumber(fade.target.team.line)}
              </span>
              {showProjected && (
                <>
                  <span aria-hidden>·</span>
                  <span className="truncate tabular-nums">
                    Pace {fade.target.evaluation.wins === null ? "—" : formatNumber(fade.target.evaluation.wins, 2)}
                  </span>
                </>
              )}
            </p>
          </div>
          {showProjected && <FadeProjection evaluation={fade.evaluation} />}
        </div>
      )}
    </footer>
  );
}

/** Before the target's team has played, the fade is projected at 0 points with no status. */
function FadeProjection({ evaluation }: { evaluation: NonNullable<RosterColumn["fade"]>["evaluation"] }) {
  const status = evaluation.status === "scored" ? fadeStatus(evaluation) : null;
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      {status && <Badge tone={status.tone}>{status.label}</Badge>}
      <p className="text-xs tabular-nums text-fog-400">{formatSigned(evaluation.points ?? 0, 0)} projected pts</p>
    </div>
  );
}
```

- [ ] **Step 3: Create `src/components/rosters/RosterColumn.tsx`**

```tsx
import { ManagerAvatar } from "@/components/ui/ManagerAvatar";
import { SignedValue } from "@/components/ui/SignedValue";
import { managerLabel } from "@/lib/league/managers";
import { rosterGroups, type RosterColumn as Column, type RosterSort } from "@/lib/rosters";
import { RosterFade } from "./RosterFade";
import { RosterGroup } from "./RosterGroup";

export function RosterColumn({
  column,
  sort,
  showProjected,
}: {
  column: Column;
  sort: RosterSort;
  showProjected: boolean;
}) {
  const { manager, standing, fade, fadeTarget } = column;
  const label = managerLabel(manager);
  const count = standing.calls.length;
  const groups = rosterGroups(standing.calls, sort);
  return (
    <article aria-label={`${label}'s roster`} className="flex min-w-0 flex-col rounded-xl border border-ink-700 bg-ink-850">
      <header className="flex items-center gap-3 px-4 py-3">
        <ManagerAvatar manager={manager} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold text-fog-50">{label}</h2>
          <p className="text-sm text-fog-300">
            {count} {count === 1 ? "pick" : "picks"}
          </p>
        </div>
        {showProjected && (
          <div className="shrink-0 text-right">
            <p className="text-sm text-fog-50">Rank {standing.rank}</p>
            <p className="text-xs text-fog-400">Projected</p>
            <SignedValue
              value={standing.totalPoints}
              digits={2}
              suffix="pts"
              className="block font-display text-2xl font-bold leading-tight"
            />
          </div>
        )}
      </header>
      <div className="flex flex-col gap-6 pb-3 pt-4">
        {groups.length === 0 ? (
          <p className="px-4 text-sm text-fog-400">No picks yet.</p>
        ) : (
          groups.map((group) => (
            <RosterGroup
              key={group.side ?? "all"}
              id={`roster-${manager.id}-${group.side ?? "all"}`}
              group={group}
              showProjected={showProjected}
            />
          ))
        )}
      </div>
      <RosterFade fade={fade} fadeTarget={fadeTarget} showProjected={showProjected} />
    </article>
  );
}
```

- [ ] **Step 4: Create `src/components/rosters/RostersBoard.tsx`**

```tsx
"use client";

import { Info } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { buttonClasses } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { indexTeams } from "@/lib/lines";
import { rosterColumns, type RosterSort } from "@/lib/rosters";
import { computeStandings } from "@/lib/standings";
import type { League, Team } from "@/lib/types";
import { RosterColumn } from "./RosterColumn";

export function RostersBoard({ league, teams }: { league: League; teams: Team[] }) {
  const [showProjected, setShowProjected] = useState(true);
  const [sort, setSort] = useState<RosterSort>("traditional");

  const teamsById = useMemo(() => indexTeams(teams), [teams]);
  const standings = useMemo(() => computeStandings(league, teamsById, "projected"), [league, teamsById]);
  const columns = useMemo(() => rosterColumns(league.managers, standings), [league.managers, standings]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Rosters"
        subtitle={`${league.name} • ${league.seasonLabel}`}
        tag={league.isDemo ? "Demo data" : undefined}
        actions={
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <Switch checked={showProjected} onChange={setShowProjected} label="Show projected" />
            <Select
              label="Sort picks"
              value={sort}
              onChange={setSort}
              className="w-48"
              options={[
                { value: "traditional", label: "Sort: Traditional" },
                { value: "quality", label: "Sort: Pick quality" },
              ]}
            />
            {showProjected && (
              <p className="flex items-center gap-1.5 text-sm text-fog-300">
                <Info aria-hidden className="size-4" />
                Points include fades
              </p>
            )}
          </div>
        }
      />

      {league.draft.picks.length === 0 ? (
        <Panel bodyClassName="flex flex-col items-start gap-3 px-4 py-8 sm:px-5">
          <p className="text-fog-300">No picks yet. Rosters fill in as the draft runs.</p>
          <Link href={`/l/${league.id}/draft`} className={buttonClasses("secondary", "sm")}>
            Go to the draft room
          </Link>
        </Panel>
      ) : (
        <div className="@container">
          <div className="grid gap-4 @2xl:grid-cols-2 @5xl:grid-cols-4">
            {columns.map((column) => (
              <RosterColumn
                key={column.manager.id}
                column={column}
                sort={sort}
                showProjected={showProjected}
              />
            ))}
          </div>
        </div>
      )}

      <p className="text-sm text-fog-400">
        {showProjected
          ? "Turn off Show projected to hide projected scores and pace."
          : "Turn on Show projected to see projected scores and pace."}
      </p>
    </div>
  );
}
```

- [ ] **Step 5: Replace `src/app/l/[leagueId]/rosters/page.tsx`**

Same Suspense pattern as the overview (`src/app/l/[leagueId]/page.tsx`).

```tsx
import { Suspense } from "react";
import { RostersBoard } from "@/components/rosters/RostersBoard";
import { PageFallback } from "@/components/ui/PageFallback";
import { getLeagueOrNotFound, toLeagueView } from "@/server/league";

export default function RostersPage({ params }: PageProps<"/l/[leagueId]/rosters">) {
  return (
    <Suspense fallback={<PageFallback label="Loading rosters…" />}>
      <Rosters params={params} />
    </Suspense>
  );
}

async function Rosters({ params }: { params: PageProps<"/l/[leagueId]/rosters">["params"] }) {
  const { leagueId } = await params;
  const view = await toLeagueView(await getLeagueOrNotFound(leagueId));
  return <RostersBoard league={view.league} teams={view.teams} />;
}
```

- [ ] **Step 6: Mark Rosters ready in `src/components/shell/nav-items.ts`**

```ts
    { href: `${base}/rosters`, label: "Rosters", shortLabel: "Rosters", icon: UserRound, ready: true, exact: false },
```

- [ ] **Step 7: Note the page's number rules in `CLAUDE.md`**

Under `## UI conventions`, after the line starting `- Format numbers at the edge`, add:

```markdown
- Rosters page: points, totals and pace show two decimals (lines stay one); a pick whose team has not played is
  projected at 0 points (`projectedPoints` in `src/lib/rosters.ts`). The overview keeps "Not available".
```

- [ ] **Step 8: Static checks**

Run: `npm test && npm run lint && npm run typecheck && npm run build`
Expected: all pass.

- [ ] **Step 9: Verify in the browser against `wiremocks/rosters.png`**

`preview_start` reads the main checkout's `.claude/launch.json`, so for this worktree add a temporary config there named `rosters-wt` running `npm --prefix <this worktree> run dev -- -p 3001` with `"port": 3001` and env `RECORD_SOURCE=static LINE_SOURCE=static`; remove it afterwards. Then open `http://localhost:3001/l/demo/rosters` and check:

1. At 1440×900: four columns in seat order, each with avatar, "Manager N", "11 picks", "Rank N", "Projected", signed total with "pts" (two decimals); Overs (lime) then Unders (purple) blocks with the heading sitting on and breaking the top border; rows show logo, team name, line · Pace (two decimals), signed points (two decimals) on the right; no side pills, arrows or "PROJ. PTS" captions; fade footers aligned across columns showing "Fading Manager N", team, line · pace, On/Off track badge and "+2 projected pts" / "0 projected pts".
2. Within each group lines run highest → lowest. Spot-check one manager's total against the overview's standings panel (`/l/demo`) — same rank and value (overview rounds to one decimal).
3. Choose "Sort: Pick quality": each column becomes one neutral list, points descending, each row with an OVER/UNDER pill.
4. Toggle Show projected off: rank, "Projected", totals, pace, pick points, fade badge and fade points and the "Points include fades" note disappear; teams, lines, Overs/Unders outlines (or side pills), fade target manager and team and line remain; the sort keeps working — with "Pick quality" selected the order is unchanged from step 3; the footnote reads "Turn on Show projected…".
5. Zero-games case: open a stored league whose draft has picks but whose records are all 0–0 (or rely on the `projectedPoints` unit tests if none exists): picks show "Pace —" and "0.00", totals "0.00 pts", ranks shown, fade "0 projected pts" with no badge.
6. At 375×812 (`resize_window` mobile, reload): one column, no horizontal page scroll (`document.documentElement.scrollWidth === 375` via `javascript_tool`), header controls wrap below the title, bottom nav shows Rosters active without "Soon". At 1024 wide: two columns.
7. The sidebar shows "Rosters" active without the "Soon" badge.
8. `read_console_messages` shows no errors.

Fix anything that diverges from the mockup, rerun Step 8, then take a 1440 screenshot as proof. Reset the viewport with preset `desktop`.

- [ ] **Step 10: Commit**

```bash
git add src/components/rosters src/app/l/\[leagueId\]/rosters/page.tsx src/components/shell/nav-items.ts CLAUDE.md
git commit -m "$(cat <<'EOF'
feat: Rosters page with Overs/Unders groups, pick-quality sort and a Show projected switch

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```
