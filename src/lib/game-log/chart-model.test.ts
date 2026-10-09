import { describe, expect, it } from "vitest";
import { buildChartModel } from "@/lib/game-log/chart-model";
import type { Game } from "@/lib/game-log/types";

/** 30 wins and 18 losses (W and L alternating, then wins), then upcoming games with known opponents. */
function orlGames(): Game[] {
  const results = [..."WL".repeat(18), ..."W".repeat(12)];
  const completed: Game[] = results.map((r, i) => ({
    number: i + 1,
    date: null,
    opponentId: null,
    home: null,
    result: r as "W" | "L",
  }));
  const upcoming: Game[] = Array.from({ length: 34 }, (_, i) => ({
    number: 49 + i,
    date: "2027-03-01T00:00Z",
    opponentId: i === 0 ? "MIA" : "BOS",
    home: i === 0,
    result: null,
  }));
  return [...completed, ...upcoming];
}
const record = { wins: 30, losses: 18 };

describe("buildChartModel", () => {
  it("covers the last 8 completed games and the next 2", () => {
    const model = buildChartModel({ games: orlGames(), record, line: 51.5, mode: "last8", showProjected: true });
    expect(model.points.map((p) => p.game)).toEqual([41, 42, 43, 44, 45, 46, 47, 48, 49, 50]);
    expect(model.subtitle).toBe("8 completed games + 2 upcoming");
    expect(model.history).toBe("complete");
    expect(model.historyGames).toBe(48);
  });

  it("stops actual wins at the current game and starts the projection there", () => {
    const model = buildChartModel({ games: orlGames(), record, line: 51.5, mode: "last8", showProjected: true });
    const at = (game: number) => model.points.find((p) => p.game === game)!;
    expect(at(48).actual).toBe(30);
    expect(at(48).projected).toBeCloseTo(30);
    expect(at(49).actual).toBeNull();
    expect(at(49).projected).toBeCloseTo(30.625);
    expect(at(47).projected).toBeNull();
    expect(at(41).pace).toBeCloseTo(25.75);
    expect(model.showsProjected).toBe(true);
  });

  it("attaches each game's details: completed games, then upcoming ones in order", () => {
    const model = buildChartModel({ games: orlGames(), record, line: 51.5, mode: "last8", showProjected: true });
    const at = (game: number) => model.points.find((p) => p.game === game)!;
    expect(at(48).detail?.result).toBe("W");
    expect(at(49).detail).toMatchObject({ opponentId: "MIA", home: true, result: null });
    expect(at(50).detail?.opponentId).toBe("BOS");
  });

  it("drops the projection and refits the axis without it", () => {
    // A 40-win line keeps pace below the projection, so the projection sets the top of the axis.
    const withProjection = buildChartModel({ games: orlGames(), record, line: 40, mode: "last8", showProjected: true });
    const without = buildChartModel({ games: orlGames(), record, line: 40, mode: "last8", showProjected: false });
    expect(without.points.every((p) => p.projected === null)).toBe(true);
    expect(without.showsProjected).toBe(false);
    expect(without.axis).not.toEqual(withProjection.axis);
  });

  it("has no pace before lines are frozen", () => {
    const model = buildChartModel({ games: orlGames(), record, line: null, mode: "last8", showProjected: true });
    expect(model.points.every((p) => p.pace === null)).toBe(true);
  });

  it("has no actual wins without a game log", () => {
    const model = buildChartModel({ games: null, record, line: 51.5, mode: "last8", showProjected: true });
    expect(model.points.every((p) => p.actual === null)).toBe(true);
    expect(model.history).toBeNull();
    expect(model.hasData).toBe(true);
  });

  it("shows the whole season from zero", () => {
    const model = buildChartModel({ games: orlGames(), record, line: 51.5, mode: "full", showProjected: true });
    expect(model.points).toHaveLength(82);
    expect(model.axis.min).toBe(0);
    expect(model.points[81].projected).toBeCloseTo(51.25);
    expect(model.points[81].pace).toBeCloseTo(51.5);
  });

  it("has nothing to draw before the draft and the first game", () => {
    const model = buildChartModel({ games: [], record: { wins: 0, losses: 0 }, line: null, mode: "last8", showProjected: true });
    expect(model.hasData).toBe(false);
  });

  it("reports a partial game log", () => {
    const model = buildChartModel({ games: orlGames().slice(0, 40), record, line: 51.5, mode: "last8", showProjected: true });
    expect(model.history).toBe("partial");
    expect(model.historyGames).toBe(40);
  });

  it("draws no projection for a settled season and says so", () => {
    const results = [..."W".repeat(52), ..."L".repeat(30)];
    const games: Game[] = results.map((r, i) => ({
      number: i + 1,
      date: null,
      opponentId: null,
      home: null,
      result: r as "W" | "L",
    }));
    const model = buildChartModel({ games, record: { wins: 52, losses: 30 }, line: 51.5, mode: "last8", showProjected: true });
    expect(model.points.map((p) => p.game)).toEqual([75, 76, 77, 78, 79, 80, 81, 82]);
    expect(model.showsProjected).toBe(false);
    expect(model.hasActual).toBe(true);
  });

  it("has pace but no actual wins before the first game", () => {
    const model = buildChartModel({ games: [], record: { wins: 0, losses: 0 }, line: 43.5, mode: "last8", showProjected: true });
    expect(model.points.map((p) => p.game)).toEqual([1, 2]);
    expect(model.hasActual).toBe(false);
    expect(model.points.every((p) => p.pace !== null)).toBe(true);
    expect(model.showsProjected).toBe(false);
  });
});
