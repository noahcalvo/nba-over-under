import { describe, expect, it } from "vitest";
import { SCORING, type ScoringConfig } from "@/config/scoring";
import {
  callPoints,
  evaluateCall,
  evaluateFade,
  gamesPlayed,
  isSettled,
  projectWins,
  signedMargin,
} from "@/lib/scoring";
import type { Team } from "@/lib/types";

function team(overrides: Partial<Team> = {}): Team {
  return {
    id: "MIN",
    nbaId: 1610612750,
    city: "Minnesota",
    name: "Timberwolves",
    conference: "West",
    color: "#0C2340",
    line: 49.5,
    prevWins: 49,
    wins: 30,
    losses: 18,
    ...overrides,
  };
}

describe("gamesPlayed", () => {
  it("adds wins and losses", () => {
    expect(gamesPlayed({ wins: 30, losses: 18 })).toBe(48);
  });
});

describe("projectWins", () => {
  it("scales the win rate to an 82-game season", () => {
    expect(projectWins({ wins: 30, losses: 18 })).toBeCloseTo(51.25);
  });

  it("returns null when no games have been played", () => {
    expect(projectWins({ wins: 0, losses: 0 })).toBeNull();
  });

  it("uses the configured season length", () => {
    expect(projectWins({ wins: 10, losses: 10 }, { ...SCORING, seasonGames: 72 })).toBe(36);
  });
});

describe("isSettled", () => {
  it("is false before the regular season ends", () => {
    expect(isSettled({ wins: 50, losses: 31 })).toBe(false);
  });

  it("is true once 82 games are played", () => {
    expect(isSettled({ wins: 50, losses: 32 })).toBe(true);
  });
});

describe("signedMargin", () => {
  it("is wins minus line for an Over", () => {
    expect(signedMargin("OVER", 49.5, 51.25)).toBeCloseTo(1.75);
  });

  it("is line minus wins for an Under", () => {
    expect(signedMargin("UNDER", 41.5, 37.5)).toBeCloseTo(4);
  });
});

describe("callPoints", () => {
  it("adds +1 and a tenth of the margin for a correct call", () => {
    expect(callPoints(1.75)).toBeCloseTo(1.175);
  });

  it("adds −1 and a tenth of the negative margin for a missed call", () => {
    expect(callPoints(-3.4)).toBeCloseTo(-1.34);
  });

  it("reads every weight from the config", () => {
    const config: ScoringConfig = { ...SCORING, correctCall: 3, missedCall: -2, marginWeight: 0.5 };
    expect(callPoints(2, config)).toBeCloseTo(4);
    expect(callPoints(-2, config)).toBeCloseTo(-3);
  });
});

describe("evaluateCall", () => {
  it("scores a projected call from win pace", () => {
    const result = evaluateCall("OVER", team(), "projected");
    expect(result.status).toBe("scored");
    expect(result.wins).toBeCloseTo(51.25);
    expect(result.margin).toBeCloseTo(1.75);
    expect(result.correct).toBe(true);
    expect(result.points).toBeCloseTo(1.175);
  });

  it("marks a projected Under as missed when the pace beats the line", () => {
    const result = evaluateCall("UNDER", team(), "projected");
    expect(result.correct).toBe(false);
    expect(result.margin).toBeCloseTo(-1.75);
    expect(result.points).toBeCloseTo(-1.175);
  });

  it("is not available when the team has played zero games", () => {
    expect(evaluateCall("OVER", team({ wins: 0, losses: 0 }), "projected")).toEqual({
      basis: "projected",
      status: "not_available",
      wins: null,
      margin: null,
      correct: null,
      points: null,
    });
  });

  it("is pending on the final basis until the team finishes the season", () => {
    expect(evaluateCall("OVER", team(), "final")).toEqual({
      basis: "final",
      status: "pending",
      wins: null,
      margin: null,
      correct: null,
      points: null,
    });
  });

  it("scores a settled final call from actual wins", () => {
    const result = evaluateCall("OVER", team({ wins: 52, losses: 30 }), "final");
    expect(result).toMatchObject({ basis: "final", status: "scored", wins: 52, correct: true });
    expect(result.margin).toBeCloseTo(2.5);
    expect(result.points).toBeCloseTo(1.25);
  });
});

describe("evaluateFade", () => {
  it("earns the fade bonus when the targeted pick misses", () => {
    // 36–12 paces to 61.5 wins, under a 62.5 line, so the Over misses.
    const target = evaluateCall("OVER", team({ line: 62.5, wins: 36, losses: 12 }), "projected");
    expect(evaluateFade(target)).toEqual({ basis: "projected", status: "scored", targetMissed: true, points: 2 });
  });

  it("earns nothing when the targeted pick hits", () => {
    const target = evaluateCall("OVER", team(), "projected");
    expect(evaluateFade(target)).toEqual({ basis: "projected", status: "scored", targetMissed: false, points: 0 });
  });

  it("inherits not available and pending from its target", () => {
    expect(evaluateFade(evaluateCall("OVER", team({ wins: 0, losses: 0 }), "projected")).status).toBe("not_available");
    expect(evaluateFade(evaluateCall("OVER", team(), "final")).status).toBe("pending");
  });

  it("reads the bonus from the config", () => {
    const target = evaluateCall("UNDER", team(), "projected");
    expect(evaluateFade(target, { ...SCORING, fadeHit: 5 }).points).toBe(5);
  });
});
