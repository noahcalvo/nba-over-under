import { describe, expect, it } from "vitest";
import { SCORING } from "@/config/scoring";
import { closestCalls, computeStandings, type ScoringInput } from "@/lib/standings";
import type { DraftStatus, Manager, Side, Team, TeamId } from "@/lib/types";

function team(id: string, line: number, wins: number, losses: number): Team {
  return { id, nbaId: 0, city: id, name: id, conference: "East", color: "#000000", line, prevWins: 40, wins, losses };
}

const TEAMS: Record<TeamId, Team> = {
  P: team("P", 40.5, 24, 24), // pace 41.0
  R: team("R", 40.5, 24, 24), // same record and line as P
  Q: team("Q", 40.5, 25, 23), // pace 42.708
  Z: team("Z", 30.5, 0, 0), // no games played
  F: team("F", 45.5, 50, 32), // settled: 50 wins
  G: team("G", 45.5, 40, 42), // settled: 40 wins
};

const MANAGERS: Manager[] = [
  { id: "m1", seat: 0, displayName: "Ann" },
  { id: "m2", seat: 1, displayName: "Bo" },
];

function input(
  picks: Array<[string, TeamId, Side]>,
  fades: Array<[string, number]> = [],
  status: DraftStatus = "complete",
): ScoringInput {
  return {
    managers: MANAGERS,
    draft: {
      status,
      rounds: 2,
      seatOrder: ["m1", "m2"],
      picks: picks.map(([managerId, teamId, side], index) => ({ pickNumber: index + 1, managerId, teamId, side })),
    },
    fades: fades.map(([managerId, targetPickNumber], index) => ({ id: `f${index + 1}`, managerId, targetPickNumber })),
  };
}

// m1: Q OVER (hit) + P UNDER (miss). m2: P OVER (hit) + Q UNDER (miss), and fades m1's P UNDER (pick 4).
const MIXED = input(
  [
    ["m1", "Q", "OVER"],
    ["m2", "P", "OVER"],
    ["m2", "Q", "UNDER"],
    ["m1", "P", "UNDER"],
  ],
  [["m2", 4]],
);

describe("computeStandings — projected", () => {
  it("sums each manager's call points and margins from the underlying picks", () => {
    const m1 = computeStandings(MIXED, TEAMS, "projected").rows.find((row) => row.managerId === "m1")!;
    expect(m1.callPoints).toBeCloseTo(0.17083, 4);
    expect(m1.totalMargin).toBeCloseTo(1.70833, 4);
    expect(m1.correctCalls).toBe(1);
    expect(m1.scoredCalls).toBe(2);
    expect(m1.calls.map((call) => call.pick.pickNumber)).toEqual([1, 4]);
  });

  it("adds projected fade bonuses and ranks by total points, not margin", () => {
    const { rows } = computeStandings(MIXED, TEAMS, "projected");
    expect(rows.map((row) => row.managerId)).toEqual(["m2", "m1"]);
    const [m2, m1] = rows;
    expect(m2.fadePoints).toBe(2);
    expect(m2.totalPoints).toBeCloseTo(1.82917, 4);
    expect(m2.totalMargin).toBeLessThan(m1.totalMargin);
    expect(m2.rank).toBe(1);
    expect(m2.gapToFirst).toBe(0);
    expect(m1.rank).toBe(2);
    expect(m1.gapToFirst).toBeCloseTo(1.65833, 4);
  });

  it("breaks ties on points by margin, using the configured weights", () => {
    // marginWeight 0: both managers score exactly 1. m2 (seat 1) has the larger margin, so it must rank first.
    const tied = input([
      ["m1", "P", "OVER"], // margin +0.5
      ["m2", "Q", "OVER"], // margin +2.208
    ]);
    const { rows } = computeStandings(tied, TEAMS, "projected", { ...SCORING, marginWeight: 0 });
    expect(rows.map((row) => row.totalPoints)).toEqual([1, 1]);
    expect(rows.map((row) => row.managerId)).toEqual(["m2", "m1"]);
  });

  it("breaks ties on points and margin by seat", () => {
    const tied = input([
      ["m2", "R", "OVER"],
      ["m1", "P", "OVER"],
    ]);
    // Managers listed out of seat order, so only the seat tie-break can put m1 first.
    const reordered = { ...tied, managers: [...MANAGERS].reverse() };
    const { rows } = computeStandings(reordered, TEAMS, "projected");
    expect(rows[0].totalPoints).toBeCloseTo(rows[1].totalPoints);
    expect(rows[0].totalMargin).toBeCloseTo(rows[1].totalMargin);
    expect(rows.map((row) => row.managerId)).toEqual(["m1", "m2"]);
  });

  it("leaves zero-games teams out of totals", () => {
    const withZ = input([
      ["m1", "Q", "OVER"],
      ["m2", "P", "OVER"],
      ["m2", "Z", "OVER"],
    ]);
    const m2 = computeStandings(withZ, TEAMS, "projected").rows.find((row) => row.managerId === "m2")!;
    expect(m2.calls[1].evaluation.status).toBe("not_available");
    expect(m2.callPoints).toBeCloseTo(1.05);
    expect(m2.scoredCalls).toBe(1);
    expect(m2.pendingItems).toBe(1);
  });
});

describe("computeStandings — final", () => {
  it("scores only settled picks and fades, and reports partial results", () => {
    const partial = input(
      [
        ["m1", "F", "OVER"],
        ["m2", "P", "OVER"],
        ["m2", "G", "UNDER"],
        ["m1", "P", "UNDER"],
      ],
      [["m2", 4]],
    );
    const standings = computeStandings(partial, TEAMS, "final");
    expect(standings.anyScored).toBe(true);
    expect(standings.complete).toBe(false);
    const [first, second] = standings.rows;
    expect(first.managerId).toBe("m2");
    expect(first.totalPoints).toBeCloseTo(1.55);
    expect(first.fades[0].evaluation.status).toBe("pending");
    expect(first.pendingItems).toBe(2);
    expect(second.totalPoints).toBeCloseTo(1.45);
  });

  it("reports nothing scored before any team finishes", () => {
    const standings = computeStandings(input([["m1", "P", "OVER"]]), TEAMS, "final");
    expect(standings.anyScored).toBe(false);
    expect(standings.complete).toBe(false);
    expect(standings.rows.every((row) => row.totalPoints === 0)).toBe(true);
  });

  it("is complete once the draft is done and every pick and fade is settled", () => {
    const settled = input(
      [
        ["m1", "F", "OVER"],
        ["m2", "G", "UNDER"],
      ],
      [["m1", 2]],
    );
    const standings = computeStandings(settled, TEAMS, "final");
    expect(standings.complete).toBe(true);
    expect(standings.rows.find((row) => row.managerId === "m1")!.fadePoints).toBe(0);
    expect(computeStandings({ ...settled, draft: { ...settled.draft, status: "live" } }, TEAMS, "final").complete).toBe(
      false,
    );
  });
});

describe("closestCalls", () => {
  it("returns scored calls ordered by smallest absolute margin", () => {
    const league = input([
      ["m1", "Q", "OVER"],
      ["m2", "P", "OVER"],
      ["m2", "Q", "UNDER"],
      ["m1", "P", "UNDER"],
      ["m1", "Z", "OVER"],
    ]);
    const m1 = computeStandings(league, TEAMS, "projected").rows.find((row) => row.managerId === "m1")!;
    expect(closestCalls(m1).map((call) => `${call.team.id} ${call.pick.side}`)).toEqual(["P UNDER", "Q OVER"]);
    expect(closestCalls(m1, 1)).toHaveLength(1);
  });
});
