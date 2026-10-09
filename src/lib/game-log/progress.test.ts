import { describe, expect, it } from "vitest";
import {
  actualSeries,
  gamesRemaining,
  lockedPace,
  projectedAt,
  winsNeededForOver,
} from "@/lib/game-log/progress";
import type { Game } from "@/lib/game-log/types";
import { projectWins } from "@/lib/scoring";

/** "WL-": W and L are completed games, "-" an upcoming one. */
function games(results: string): Game[] {
  return [...results].map((r, i) => ({
    number: i + 1,
    date: null,
    opponentId: null,
    home: null,
    result: r === "-" ? null : (r as "W" | "L"),
  }));
}
const record = (wins: number, losses: number) => ({ wins, losses });
const wins = (series: ReturnType<typeof actualSeries>) => series.points.map((p) => [p.game, p.wins]);

describe("actualSeries", () => {
  it("adds one per win and nothing per loss, through the last completed game", () => {
    const series = actualSeries(games("WLW--"), record(2, 1));
    expect(wins(series)).toEqual([
      [1, 1],
      [2, 1],
      [3, 2],
    ]);
    expect(series.status).toBe("complete");
    expect(series.points[2].source.number).toBe(3);
  });

  it("stops at the stored record's games played when the log is ahead", () => {
    const series = actualSeries(games("WLWW-"), record(2, 1));
    expect(wins(series)).toEqual([
      [1, 1],
      [2, 1],
      [3, 2],
    ]);
    expect(series.status).toBe("complete");
  });

  it("is partial when the log has fewer completed games than the record", () => {
    const series = actualSeries(games("WL"), record(2, 1));
    expect(series.points).toHaveLength(2);
    expect(series.status).toBe("partial");
  });

  it("is a mismatch when the log's wins differ from the record's", () => {
    expect(actualSeries(games("WLL"), record(2, 1)).status).toBe("mismatch");
  });

  it("is empty before the first game", () => {
    expect(actualSeries(games("--"), record(0, 0))).toEqual({ points: [], status: "complete" });
  });
});

describe("lockedPace", () => {
  it("is the line spread evenly over 82 games", () => {
    expect(lockedPace(51.5, 0)).toBe(0);
    expect(lockedPace(51.5, 41)).toBeCloseTo(25.75);
    expect(lockedPace(51.5, 82)).toBeCloseTo(51.5);
  });
});

describe("projectedAt", () => {
  it("continues from the current wins at the season win rate", () => {
    expect(projectedAt(record(30, 18), 48)).toBeCloseTo(30);
    expect(projectedAt(record(30, 18), 50)).toBeCloseTo(31.25);
  });

  it("reaches the league's projected wins at game 82", () => {
    expect(projectedAt(record(30, 18), 82)).toBeCloseTo(projectWins(record(30, 18))!);
  });

  it("is null before the first game", () => {
    expect(projectedAt(record(0, 0), 10)).toBeNull();
  });
});

describe("winsNeededForOver", () => {
  it("needs one more than the line's whole part", () => {
    expect(winsNeededForOver(51.5, 30)).toBe(22);
  });

  it("needs to beat an integer line outright, because a push is not a hit", () => {
    expect(winsNeededForOver(50, 30)).toBe(21);
  });

  it("never goes below zero", () => {
    expect(winsNeededForOver(51.5, 52)).toBe(0);
  });
});

describe("gamesRemaining", () => {
  it("counts down from 82", () => {
    expect(gamesRemaining(record(30, 18))).toBe(34);
    expect(gamesRemaining(record(41, 41))).toBe(0);
  });
});
