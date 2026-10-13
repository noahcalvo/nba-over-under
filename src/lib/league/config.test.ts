import { describe, expect, it } from "vitest";
import { LEAGUE_DEFAULTS } from "@/config/league";
import {
  isValidLeagueConfig,
  maxRounds,
  minManagerCount,
  parseLeagueConfig,
  resizeSeats,
} from "@/lib/league/config";
import type { Manager } from "@/lib/types";

function seats(names: Array<string | null>): Manager[] {
  return names.map((displayName, seat) => ({ id: `m${seat + 1}`, seat, displayName }));
}

describe("maxRounds", () => {
  it("is the 60 sides divided by the managers, rounded down", () => {
    expect([2, 4, 6, 7, 12].map((managers) => maxRounds(managers))).toEqual([30, 15, 10, 8, 5]);
  });
});

describe("isValidLeagueConfig", () => {
  it("accepts the default and every size up to the side limit", () => {
    expect(isValidLeagueConfig(LEAGUE_DEFAULTS)).toBe(true);
    for (const [managerCount, rounds] of [[6, 10], [7, 8], [2, 30], [12, 5], [12, 1], [2, 1]]) {
      expect(isValidLeagueConfig({ managerCount, rounds })).toBe(true);
    }
  });

  it("rejects sizes outside 2–12 managers or past the side limit", () => {
    for (const [managerCount, rounds] of [[1, 5], [13, 1], [7, 9], [6, 11], [4, 0], [4, -1], [4.5, 11], [4, 2.5]]) {
      expect(isValidLeagueConfig({ managerCount, rounds })).toBe(false);
    }
  });
});

describe("parseLeagueConfig", () => {
  it("keeps integer fields and drops everything else", () => {
    expect(parseLeagueConfig({ managerCount: 6, rounds: 10, extra: true })).toEqual({ managerCount: 6, rounds: 10 });
    // Range checks belong to isValidLeagueConfig, so an out-of-range size still parses.
    expect(parseLeagueConfig({ managerCount: 40, rounds: 1 })).toEqual({ managerCount: 40, rounds: 1 });
  });

  it("rejects bad shapes", () => {
    for (const input of [null, "6x10", {}, { managerCount: "6", rounds: 10 }, { managerCount: 6 }, { managerCount: 6.5, rounds: 10 }]) {
      expect(parseLeagueConfig(input)).toBeNull();
    }
  });
});

describe("minManagerCount", () => {
  it("never drops a claimed seat", () => {
    expect(minManagerCount(seats(["Ana", null, null, null]))).toBe(2);
    expect(minManagerCount(seats(["Ana", null, null, null, null, "Fay"]))).toBe(6);
  });
});

describe("resizeSeats", () => {
  it("adds open seats after the existing ones", () => {
    expect(resizeSeats(seats(["Ana", "Ben", null, null]), 6)).toEqual(
      seats(["Ana", "Ben", null, null, null, null]),
    );
  });

  it("drops seats from the end and keeps names", () => {
    expect(resizeSeats(seats(["Ana", null, "Cal", null, null]), 3)).toEqual(seats(["Ana", null, "Cal"]));
  });
});

describe("resizeSeats after a reorder", () => {
  const reordered: Manager[] = [
    { id: "m4", seat: 0, displayName: null },
    { id: "m1", seat: 1, displayName: "Ana" },
    { id: "m2", seat: 2, displayName: null },
    { id: "m3", seat: 3, displayName: null },
  ];

  it("drops from the end of the draft order", () => {
    expect(resizeSeats(reordered, 3).map((m) => m.id)).toEqual(["m4", "m1", "m2"]);
  });

  it("gives new seats the smallest unused ids, never a taken one", () => {
    const shrunk = resizeSeats(reordered, 3);
    expect(resizeSeats(shrunk, 5)).toEqual([
      { id: "m4", seat: 0, displayName: null },
      { id: "m1", seat: 1, displayName: "Ana" },
      { id: "m2", seat: 2, displayName: null },
      { id: "m3", seat: 3, displayName: null },
      { id: "m5", seat: 4, displayName: null },
    ]);
  });

  it("keeps ids unique at every size from 2 to 12", () => {
    for (let count = 2; count <= 12; count++) {
      const seats = resizeSeats(reordered, count);
      expect(new Set(seats.map((m) => m.id)).size).toBe(count);
      expect(seats.map((m) => m.seat)).toEqual(Array.from({ length: count }, (_, i) => i));
    }
  });
});
