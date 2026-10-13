import { describe, expect, it } from "vitest";
import { SCORING } from "@/config/scoring";
import { STATIC_LINES } from "@/data/static-lines";
import { TEAM_INFO } from "@/data/teams";
import { blockedDraft, seatIds } from "@/lib/draft-scenarios";
import { indexTeams, withLines } from "@/lib/lines";
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
      voidedPicks: [],
      blockedPick: null,
      picks: picks.map(([managerId, teamId, side], index) => ({ pickNumber: index + 1, managerId, teamId, side })),
    },
    fades: fades.map(([managerId, targetPickNumber], index) => ({ id: `f${index + 1}`, managerId, targetPickNumber })),
  };
}

const NO_AWARDS = { ...SCORING, bestPickAward: 0, worstPickAward: 0 };

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
    // Awards off: this is about fades (the awards on MIXED are covered below).
    const { rows } = computeStandings(MIXED, TEAMS, "projected", NO_AWARDS);
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

describe("computeStandings — season awards", () => {
  it("adds each owner's award points to the total once, and ranks on it", () => {
    const standings = computeStandings(MIXED, TEAMS, "projected");
    expect(standings.awards.status).toBe("projected");
    // Best: m1's Q OVER (+1.22). Worst: m2's Q UNDER (−1.22).
    expect(standings.awards.best.map((award) => award.call.pick.pickNumber)).toEqual([1]);
    expect(standings.awards.worst.map((award) => award.call.pick.pickNumber)).toEqual([3]);
    const [m1, m2] = standings.rows;
    expect(m1.managerId).toBe("m1");
    expect(m1.awards.map((award) => award.kind)).toEqual(["best"]);
    expect(m1.awardPoints).toBe(SCORING.bestPickAward);
    expect(m1.totalPoints).toBeCloseTo(0.17083 + 2, 4);
    expect(m2.awardPoints).toBe(SCORING.worstPickAward);
    expect(m2.totalPoints).toBeCloseTo(-0.17083 + 2 - 2, 4);
    for (const row of standings.rows) {
      expect(row.totalPoints).toBeCloseTo(row.callPoints + row.fadePoints + row.awardPoints);
      // Pick scores stay the picks' own: the award is never folded into a call.
      expect(row.callPoints).toBeCloseTo(row.calls.reduce((total, call) => total + (call.evaluation.points ?? 0), 0));
    }
    expect(m2.gapToFirst).toBeCloseTo(m1.totalPoints - m2.totalPoints);
  });

  it("nets out when one manager holds both awards", () => {
    const league = input([
      ["m1", "Q", "OVER"],
      ["m2", "P", "OVER"],
      ["m1", "Q", "UNDER"],
    ]);
    const m1 = computeStandings(league, TEAMS, "projected").rows.find((row) => row.managerId === "m1")!;
    expect(m1.awards.map((award) => award.kind)).toEqual(["best", "worst"]);
    expect(m1.awardPoints).toBe(0);
  });

  it("moves from projected leaders to final winners as records change", () => {
    const league = input([
      ["m1", "X", "OVER"],
      ["m2", "Y", "OVER"],
      ["m1", "W", "UNDER"],
      ["m2", "V", "UNDER"],
    ]);
    const mid: Record<TeamId, Team> = {
      X: team("X", 40.5, 30, 11), // pace 60: the projected Best Pick
      Y: team("Y", 40.5, 20, 21),
      W: team("W", 40.5, 20, 21),
      V: team("V", 40.5, 30, 11), // Under on a pace of 60: the projected Worst Pick
    };
    const end: Record<TeamId, Team> = {
      X: team("X", 40.5, 41, 41),
      Y: team("Y", 40.5, 60, 22), // finishes best
      W: team("W", 40.5, 70, 12), // finishes worst
      V: team("V", 40.5, 42, 40),
    };
    const projected = computeStandings(league, mid, "projected");
    expect(projected.awards.best[0].call.team.id).toBe("X");
    expect(projected.awards.worst[0].call.team.id).toBe("V");
    // Mid-season the final basis has nothing settled: no final awards, no award points.
    const partial = computeStandings(league, mid, "final");
    expect(partial.awards).toMatchObject({ status: "pending", pendingReason: "unsettled" });
    expect(partial.rows.every((row) => row.awardPoints === 0)).toBe(true);

    const final = computeStandings(league, end, "final");
    expect(final.awards.status).toBe("final");
    expect(final.awards.best[0].call.team.id).toBe("Y");
    expect(final.awards.worst[0].call.team.id).toBe("W");
    expect(final.rows.find((row) => row.managerId === "m2")!.awards.map((award) => award.kind)).toEqual(["best"]);
    expect(final.rows.find((row) => row.managerId === "m1")!.awards.map((award) => award.kind)).toEqual(["worst"]);
  });

  it("holds awards back while a drafted team has no games, and before the draft's picks are final", () => {
    const withZ = input([
      ["m1", "Q", "OVER"],
      ["m2", "Z", "OVER"],
    ]);
    const standings = computeStandings(withZ, TEAMS, "projected");
    expect(standings.awards).toMatchObject({ status: "pending", pendingReason: "no_games" });
    expect(standings.rows.every((row) => row.awardPoints === 0 && row.awards.length === 0)).toBe(true);
    const live = input([["m1", "Q", "OVER"]], [], "live");
    expect(computeStandings(live, TEAMS, "projected").awards.pendingReason).toBe("draft");
  });

  it("only considers picks owned by the league's managers", () => {
    const stray = input([
      ["m1", "P", "OVER"],
      ["m9", "Q", "OVER"], // the best score, but no such manager
      ["m2", "Q", "UNDER"],
    ]);
    const { awards } = computeStandings(stray, TEAMS, "projected");
    expect(awards.best.map((award) => award.call.pick.managerId)).toEqual(["m1"]);
    expect(awards.worst.map((award) => award.call.pick.managerId)).toEqual(["m2"]);
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

describe("after an early end", () => {
  it("scores only kept picks", () => {
    const draft = blockedDraft(6, 10, 58);
    const managers = seatIds(6).map((id, seat) => ({ id, seat, displayName: null }));
    const standings = computeStandings({ managers, draft, fades: [] }, indexTeams(withLines(TEAM_INFO, STATIC_LINES)), "projected");
    const scoredPicks = standings.rows.flatMap((row) => row.calls.map((call) => call.pick.pickNumber));
    expect(scoredPicks.sort((a, b) => a - b)).toEqual(Array.from({ length: 54 }, (_, i) => i + 1));
    for (const row of standings.rows) expect(row.calls).toHaveLength(9);
  });

  it("awards only kept picks, never a voided one", () => {
    const draft = blockedDraft(6, 10, 58);
    expect(draft.voidedPicks.length).toBeGreaterThan(0);
    const managers = seatIds(6).map((id, seat) => ({ id, seat, displayName: null }));
    const teams = indexTeams(withLines(TEAM_INFO, STATIC_LINES));
    const { awards } = computeStandings({ managers, draft, fades: [] }, teams, "projected");
    expect(awards.status).toBe("projected");
    const awarded = [...awards.best, ...awards.worst].map((award) => award.call.pick.pickNumber);
    expect(awarded.length).toBeGreaterThanOrEqual(2);
    expect(awarded.every((pickNumber) => pickNumber <= 54)).toBe(true);
  });
});
