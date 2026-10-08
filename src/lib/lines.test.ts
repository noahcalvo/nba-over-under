import { describe, expect, it } from "vitest";
import { indexTeams, isCompleteLineSet, staticLineSource, withLines } from "@/lib/lines";
import type { LineSet, TeamInfo } from "@/lib/types";

const INFO: TeamInfo[] = [
  { id: "MIN", nbaId: 1, city: "Minnesota", name: "Timberwolves", conference: "West", color: "#0C2340", prevWins: 49, wins: 30, losses: 18 },
  { id: "OKC", nbaId: 2, city: "Oklahoma City", name: "Thunder", conference: "West", color: "#007AC1", prevWins: 68, wins: 36, losses: 12 },
];
const LINES: LineSet = { source: "test", asOf: "2026-10-01T00:00:00.000Z", values: { MIN: 49.5, OKC: 62.5 } };

describe("withLines", () => {
  it("adds each team's line to its metadata", () => {
    expect(withLines(INFO, LINES).map((team) => [team.id, team.line, team.name])).toEqual([
      ["MIN", 49.5, "Timberwolves"],
      ["OKC", 62.5, "Thunder"],
    ]);
  });

  it("throws when a team has no line", () => {
    expect(() => withLines(INFO, { ...LINES, values: { MIN: 49.5 } })).toThrow("No line for OKC");
  });
});

describe("isCompleteLineSet", () => {
  const ids = new Set(["MIN", "OKC"]);

  it("needs a finite line for every team", () => {
    expect(isCompleteLineSet(LINES, ids)).toBe(true);
    expect(isCompleteLineSet({ ...LINES, values: { MIN: 49.5 } }, ids)).toBe(false);
    expect(isCompleteLineSet({ ...LINES, values: { MIN: 49.5, OKC: Number.NaN } }, ids)).toBe(false);
  });
});

describe("indexTeams and staticLineSource", () => {
  it("indexes teams by id", () => {
    expect(indexTeams(withLines(INFO, LINES)).OKC.line).toBe(62.5);
  });

  it("serves the same lines every time", async () => {
    await expect(staticLineSource(LINES).current()).resolves.toBe(LINES);
  });
});
