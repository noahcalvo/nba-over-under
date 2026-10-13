import { describe, expect, it } from "vitest";
import { SCORING } from "@/config/scoring";
import { awardPendingText, awardsFor, decideAwards } from "@/lib/awards";
import { evaluateCall, type Basis } from "@/lib/scoring";
import type { ScoredCall } from "@/lib/standings";
import type { DraftStatus, Side, Team } from "@/lib/types";

function team(id: string, line: number, wins: number, losses: number): Team {
  return { id, nbaId: 0, city: id, name: id, conference: "East", color: "#000000", line, prevWins: 40, wins, losses };
}

let nextPick = 1;
function call(managerId: string, t: Team, side: Side, basis: Basis = "projected"): ScoredCall {
  return { pick: { pickNumber: nextPick++, managerId, teamId: t.id, side }, team: t, evaluation: evaluateCall(side, t, basis) };
}

// Projected: A pace 50 vs 40.5 (Over +1.95), B pace 41 vs 40.5 (Over +1.05), C pace 30 vs 40.5 (Over −2.05).
const A = team("A", 40.5, 25, 16);
const B = team("B", 40.5, 24, 24);
const C = team("C", 40.5, 15, 26);
const D = team("D", 40.5, 25, 16); // same record and line as A

const decide = (calls: ScoredCall[], basis: Basis = "projected", status: DraftStatus = "complete") =>
  decideAwards(calls, basis, status);
const ids = (awards: ReturnType<typeof decide>["best"]) => awards.map((award) => award.call.pick.pickNumber);

describe("decideAwards", () => {
  it("names one Best Pick and one Worst Pick from the pick scores, with the configured points", () => {
    const calls = [call("m1", A, "OVER"), call("m2", B, "OVER"), call("m3", C, "OVER")];
    const awards = decide(calls);
    expect(awards.status).toBe("projected");
    expect(awards.pendingReason).toBeNull();
    expect(ids(awards.best)).toEqual([calls[0].pick.pickNumber]);
    expect(ids(awards.worst)).toEqual([calls[2].pick.pickNumber]);
    expect(awards.best[0]).toMatchObject({ kind: "best", points: SCORING.bestPickAward });
    expect(awards.worst[0]).toMatchObject({ kind: "worst", points: SCORING.worstPickAward });
    // The pick's own score is untouched.
    expect(awards.best[0].call.evaluation.points).toBeCloseTo(1.95);
  });

  it("gives every tied pick the full award", () => {
    const calls = [call("m1", A, "OVER"), call("m2", D, "OVER"), call("m3", C, "OVER"), call("m4", C, "OVER")];
    const awards = decide(calls);
    expect(ids(awards.best)).toEqual([calls[0], calls[1]].map((c) => c.pick.pickNumber));
    expect(ids(awards.worst)).toEqual([calls[2], calls[3]].map((c) => c.pick.pickNumber));
    expect([...awards.best, ...awards.worst].every((award) => Math.abs(award.points) === 2)).toBe(true);
  });

  it("treats floating-point noise as a tie, but not a real difference", () => {
    const x = call("m1", A, "OVER");
    const y = { ...call("m2", B, "OVER") };
    y.evaluation = { ...x.evaluation, points: (x.evaluation.points ?? 0) + 1e-12 };
    expect(decide([x, y, call("m3", C, "OVER")]).best).toHaveLength(2);
    y.evaluation = { ...x.evaluation, points: (x.evaluation.points ?? 0) - 0.001 };
    expect(decide([x, y, call("m3", C, "OVER")]).best).toHaveLength(1);
  });

  it("lets one manager win both awards, and one pick win both when it is the only one", () => {
    const both = decide([call("m1", A, "OVER"), call("m2", B, "OVER"), call("m1", C, "OVER")]);
    expect(awardsFor(both, "m1").map((award) => award.kind)).toEqual(["best", "worst"]);
    expect(awardsFor(both, "m2")).toEqual([]);
    const single = decide([call("m1", A, "OVER")]);
    expect(awardsFor(single, "m1").map((award) => award.kind)).toEqual(["best", "worst"]);
  });

  it("ranks a push at its score of 0 like any other pick", () => {
    const push = team("P", 41, 41, 41); // final wins equal the line
    const winner = team("W", 40.5, 50, 32); // +1.95
    const loser = team("L", 40.5, 30, 52); // Over −2.05
    const worst = decide([call("m1", push, "OVER", "final"), call("m2", winner, "OVER", "final")], "final");
    expect(worst.worst[0].call.team.id).toBe("P");
    expect(worst.worst[0].call.evaluation.push).toBe(true);
    const best = decide([call("m1", push, "OVER", "final"), call("m2", loser, "OVER", "final")], "final");
    expect(best.best[0].call.team.id).toBe("P");
  });

  it("is pending, with no winners, until every retained pick has a projection", () => {
    const notPlayed = team("Z", 40.5, 0, 0);
    const awards = decide([call("m1", A, "OVER"), call("m2", notPlayed, "OVER")]);
    expect(awards).toMatchObject({ status: "pending", pendingReason: "no_games", best: [], worst: [] });
  });

  it("is pending on the final basis until every drafted team has finished, then final", () => {
    const settled = team("S", 40.5, 50, 32);
    const midway = team("M", 40.5, 30, 30);
    const partial = decide([call("m1", settled, "OVER", "final"), call("m2", midway, "UNDER", "final")], "final");
    expect(partial).toMatchObject({ status: "pending", pendingReason: "unsettled", best: [], worst: [] });
    const finished = team("M", 40.5, 41, 41);
    const final = decide([call("m1", settled, "OVER", "final"), call("m2", finished, "UNDER", "final")], "final");
    expect(final.status).toBe("final");
    expect(ids(final.best)).toHaveLength(1);
  });

  it("waits for the draft's picks to be final", () => {
    const calls = [call("m1", A, "OVER"), call("m2", C, "OVER")];
    for (const status of ["not_started", "live", "paused"] as const) {
      expect(decide(calls, "projected", status)).toMatchObject({ status: "pending", pendingReason: "draft" });
    }
    expect(decide(calls, "projected", "fades").status).toBe("projected");
    expect(decide([], "projected", "complete")).toMatchObject({ status: "pending", pendingReason: "draft" });
  });
});

describe("awardPendingText", () => {
  it("explains each pending reason without naming a winner", () => {
    expect(awardPendingText("draft")).toBe("Awarded once the draft's picks are final.");
    expect(awardPendingText("no_games")).toContain("every drafted team has played");
    expect(awardPendingText("unsettled")).toContain("all 82 games");
  });
});
