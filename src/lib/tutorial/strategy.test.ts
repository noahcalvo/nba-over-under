import { describe, expect, it } from "vitest";
import { buildTutorialLeague, tutorialTeams } from "@/data/tutorial-league";
import { TEAM_IDS } from "@/data/teams";
import { applyDraftAction } from "@/lib/draft";
import { indexTeams } from "@/lib/lines";
import type { DraftState, Side, TeamId } from "@/lib/types";
import { chooseFadeTarget, chooseSide, eligibleSides, sideEdge } from "./strategy";

const teams = tutorialTeams();
const byId = indexTeams(teams);
const fresh = () => buildTutorialLeague().draft;

function pick(draft: DraftState, teamId: TeamId, side: Side): DraftState {
  const result = applyDraftAction(draft, { type: "confirm", teamId, side, pickNumber: draft.picks.length + 1 }, TEAM_IDS);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

describe("sideEdge", () => {
  it("is last season's wins against the line, signed for the side", () => {
    expect(sideEdge({ prevWins: 50, line: 46.5 }, "OVER")).toBe(3.5);
    expect(sideEdge({ prevWins: 50, line: 46.5 }, "UNDER")).toBe(-3.5);
  });
});

describe("eligibleSides", () => {
  it("offers every side on an empty board", () => {
    expect(eligibleSides(fresh(), "m1", teams)).toHaveLength(60);
  });

  it("drops held sides for everyone and the other side for the holder only", () => {
    const draft = pick(fresh(), "DET", "OVER");
    const forHolder = eligibleSides(draft, "m1", teams);
    const forOther = eligibleSides(draft, "m2", teams);
    expect(forHolder).toHaveLength(58);
    expect(forHolder.some((side) => side.teamId === "DET")).toBe(false);
    expect(forOther).toHaveLength(59);
    expect(forOther).toContainEqual({ teamId: "DET", side: "UNDER" });
  });
});

describe("chooseSide", () => {
  it("takes an eligible side with the biggest edge", () => {
    const draft = pick(fresh(), "DET", "OVER");
    const choice = chooseSide(draft, "m2", teams)!;
    const eligible = eligibleSides(draft, "m2", teams);
    expect(eligible).toContainEqual(choice);
    for (const other of eligible) {
      expect(sideEdge(byId[choice.teamId], choice.side)).toBeGreaterThanOrEqual(sideEdge(byId[other.teamId], other.side));
    }
  });

  it("adapts to the board: never the side just taken, never the other side of a held team", () => {
    const first = chooseSide(fresh(), "m1", teams)!;
    const draft = pick(fresh(), first.teamId, first.side);
    expect(chooseSide(draft, "m2", teams)).not.toEqual(first);
    expect(chooseSide(draft, "m1", teams)!.teamId).not.toBe(first.teamId);
  });

  it("breaks ties by team id, then the Over", () => {
    const base = teams.find((team) => team.id === "DET")!;
    const twins = [
      { ...base, id: "ZZZ", prevWins: 50, line: 45.5 },
      { ...base, id: "AAA", prevWins: 50, line: 45.5 },
    ];
    expect(chooseSide(fresh(), "m1", twins)).toEqual({ teamId: "AAA", side: "OVER" });
  });

  it("returns null when nothing is eligible", () => {
    const draft = pick(fresh(), "DET", "OVER");
    expect(chooseSide(draft, "m1", teams.filter((team) => team.id === "DET"))).toBeNull();
  });
});

describe("chooseFadeTarget", () => {
  it("fades the weakest opponent pick, never its own", () => {
    let draft = fresh();
    for (const [teamId, side] of [["OKC", "OVER"], ["WAS", "OVER"], ["BKN", "UNDER"], ["CLE", "OVER"]] as const) {
      draft = pick(draft, teamId, side);
    }
    const target = chooseFadeTarget(draft, "m1", teams)!;
    const chosen = draft.picks.find((candidate) => candidate.pickNumber === target)!;
    expect(chosen.managerId).not.toBe("m1");
    for (const other of draft.picks.filter((candidate) => candidate.managerId !== "m1")) {
      expect(sideEdge(byId[chosen.teamId], chosen.side)).toBeLessThanOrEqual(sideEdge(byId[other.teamId], other.side));
    }
  });

  it("returns null without opponent picks", () => {
    expect(chooseFadeTarget(fresh(), "m1", teams)).toBeNull();
  });
});
