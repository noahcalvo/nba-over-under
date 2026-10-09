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
