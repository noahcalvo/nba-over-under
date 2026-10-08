import { describe, expect, it } from "vitest";
import { withRecords } from "@/lib/records/merge";

describe("withRecords", () => {
  const teams = [
    { id: "BOS", name: "Celtics", wins: 22, losses: 26 },
    { id: "MIN", name: "Timberwolves", wins: 30, losses: 18 },
  ];

  it("replaces each team's record and zeroes teams with none", () => {
    expect(withRecords(teams, { BOS: { wins: 3, losses: 1 } })).toEqual([
      { id: "BOS", name: "Celtics", wins: 3, losses: 1 },
      { id: "MIN", name: "Timberwolves", wins: 0, losses: 0 },
    ]);
  });
});
