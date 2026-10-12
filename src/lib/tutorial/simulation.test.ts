import { describe, expect, it } from "vitest";
import { TUTORIAL } from "@/config/tour";
import { buildTutorialLeague, TUTORIAL_VIEWER_ID, tutorialTeams } from "@/data/tutorial-league";
import { seatForPick } from "@/lib/draft";
import { fadeFor, fadeTargets } from "@/lib/fades";
import type { Result } from "@/lib/league/errors";
import type { League, Side, TeamId } from "@/lib/types";
import { applyTutorialCommand } from "./session";
import { simulateAll, simulateStep } from "./simulation";
import { eligibleSides } from "./strategy";

const teams = tutorialTeams();
const TOTAL = TUTORIAL.managerCount * TUTORIAL.rounds;

function must(result: Result<League>): League {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

/** The demo right after the viewer's own first pick. */
function opened(teamId: TeamId, side: Side): League {
  return must(
    applyTutorialCommand(buildTutorialLeague(), TUTORIAL_VIEWER_ID, { type: "confirm", teamId, side, pickNumber: 1 }),
  );
}

function fade(league: League, managerId: string, targetPickNumber: number): Result<League> {
  return applyTutorialCommand(league, managerId, { type: "fade", managerId, targetPickNumber });
}

/** Every opening the viewer could make: all 60 sides. */
const OPENINGS = eligibleSides(buildTutorialLeague().draft, TUTORIAL_VIEWER_ID, teams);

function expectValidDraft(league: League) {
  const { draft } = league;
  expect(draft.status).toBe("fades");
  expect(draft.picks).toHaveLength(TOTAL);
  expect(draft.voidedPicks).toEqual([]);
  expect(draft.blockedPick).toBeNull();
  const sides = new Set<string>();
  const holdings = new Set<string>();
  draft.picks.forEach((pick, index) => {
    expect(pick.pickNumber).toBe(index + 1);
    expect(pick.managerId).toBe(draft.seatOrder[seatForPick(pick.pickNumber, draft.seatOrder.length)]);
    const side = `${pick.teamId} ${pick.side}`;
    const holding = `${pick.managerId} ${pick.teamId}`;
    expect(sides.has(side)).toBe(false);
    expect(holdings.has(holding)).toBe(false);
    sides.add(side);
    holdings.add(holding);
  });
  for (const managerId of draft.seatOrder) {
    expect(draft.picks.filter((pick) => pick.managerId === managerId)).toHaveLength(TUTORIAL.rounds);
  }
}

describe("simulating the draft", () => {
  it("finishes a valid 4 × 11 draft after every legal opening and keeps the viewer's pick", () => {
    expect(OPENINGS).toHaveLength(60);
    for (const opening of OPENINGS) {
      const league = simulateAll(opened(opening.teamId, opening.side), teams, "draft");
      expectValidDraft(league);
      expect(league.draft.picks[0]).toEqual({ pickNumber: 1, managerId: TUTORIAL_VIEWER_ID, ...opening });
    }
  });

  it("is deterministic", () => {
    expect(simulateAll(opened("DET", "UNDER"), teams, "draft")).toEqual(simulateAll(opened("DET", "UNDER"), teams, "draft"));
  });

  it("adapts to the opening", () => {
    const drafts = new Set(
      OPENINGS.map((opening) =>
        JSON.stringify(simulateAll(opened(opening.teamId, opening.side), teams, "draft").draft.picks.slice(1)),
      ),
    );
    expect(drafts.size).toBeGreaterThan(1);
  });

  it("ends the same whether watched pick by pick or skipped", () => {
    const start = opened("DET", "UNDER");
    let watched = start;
    for (let step = 0; step < 7; step++) watched = simulateStep(watched, teams, "draft");
    expect(watched.draft.picks).toHaveLength(8);
    expect(simulateAll(watched, teams, "draft")).toEqual(simulateAll(start, teams, "draft"));
  });

  it("lets different managers hold opposite sides of a team", () => {
    const { picks } = simulateAll(opened("DET", "UNDER"), teams, "draft").draft;
    const shared = picks.filter((pick) => picks.some((other) => other.teamId === pick.teamId && other.side !== pick.side));
    expect(shared.length).toBeGreaterThan(0);
  });

  it("does nothing outside a live draft", () => {
    const drafted = simulateAll(opened("DET", "UNDER"), teams, "draft");
    expect(simulateStep(drafted, teams, "draft")).toBe(drafted);
  });
});

describe("simulating fades", () => {
  it("completes the draft after any fade the viewer chooses, after any opening", () => {
    for (const opening of OPENINGS) {
      const drafted = simulateAll(opened(opening.teamId, opening.side), teams, "draft");
      for (const target of fadeTargets(drafted.draft, TUTORIAL_VIEWER_ID)) {
        const done = simulateAll(must(fade(drafted, TUTORIAL_VIEWER_ID, target.pickNumber)), teams, "fades");
        expect(done.draft.status).toBe("complete");
        expect(done.fades).toHaveLength(TUTORIAL.managerCount);
        expect(fadeFor(done.fades, TUTORIAL_VIEWER_ID)?.targetPickNumber).toBe(target.pickNumber);
        for (const locked of done.fades) {
          const faded = done.draft.picks.find((pick) => pick.pickNumber === locked.targetPickNumber)!;
          expect(faded.managerId).not.toBe(locked.managerId);
        }
      }
    }
  });

  it("never fades for the viewer, and accepts the viewer's fade last (no order dependency)", () => {
    const drafted = simulateAll(opened("DET", "UNDER"), teams, "draft");
    const others = simulateAll(drafted, teams, "fades");
    expect(others.draft.status).toBe("fades");
    expect(others.fades).toHaveLength(TUTORIAL.managerCount - 1);
    expect(fadeFor(others.fades, TUTORIAL_VIEWER_ID)).toBeUndefined();
    const target = fadeTargets(others.draft, TUTORIAL_VIEWER_ID)[0];
    expect(must(fade(others, TUTORIAL_VIEWER_ID, target.pickNumber)).draft.status).toBe("complete");
  });

  it("applies the real fade rules to the viewer", () => {
    const drafted = simulateAll(opened("DET", "UNDER"), teams, "draft");
    expect(fade(drafted, TUTORIAL_VIEWER_ID, 1)).toEqual({ ok: false, error: "own_pick" });
    const locked = must(fade(drafted, TUTORIAL_VIEWER_ID, 2));
    expect(fade(locked, TUTORIAL_VIEWER_ID, 3)).toEqual({ ok: false, error: "fade_locked" });
  });
});
