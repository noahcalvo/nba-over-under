import { describe, expect, it } from "vitest";
import { TEAM_DIVISIONS, TEAM_INFO } from "@/data/teams";
import { filterTeams, sortTeams, type GridTeam } from "./grid";
import type { Side } from "@/lib/types";

function grid(overrides: Record<string, Partial<Pick<GridTeam, "line" | "move" | "side">>> = {}): GridTeam[] {
  return TEAM_INFO.map((info) => ({
    info,
    division: TEAM_DIVISIONS[info.id],
    line: 40,
    move: null,
    side: "OVER" as Side | null,
    ...overrides[info.id],
  }));
}
const ids = (teams: readonly GridTeam[]) => teams.map((team) => team.info.id);

describe("filterTeams", () => {
  it("all keeps 30", () => {
    expect(filterTeams(grid(), "all", false)).toHaveLength(30);
  });
  it("unpicked keeps only teams without a side", () => {
    const teams = grid({ ATL: { side: null }, MIN: { side: null } });
    expect(ids(filterTeams(teams, "unpicked", false)).sort()).toEqual(["ATL", "MIN"]);
  });
  it("East and West keep 15 each", () => {
    expect(filterTeams(grid(), "East", false)).toHaveLength(15);
    expect(filterTeams(grid(), "West", false)).toHaveLength(15);
    expect(filterTeams(grid(), "East", false).every((team) => team.info.conference === "East")).toBe(true);
  });
  it("movedOnly keeps only teams with a move, within the filter", () => {
    const teams = grid({ BOS: { move: -6 }, MIN: { move: 2 } });
    expect(ids(filterTeams(teams, "all", true)).sort()).toEqual(["BOS", "MIN"]);
    expect(ids(filterTeams(teams, "East", true))).toEqual(["BOS"]);
  });
});

describe("sortTeams", () => {
  it("conference puts ATL first and UTA last", () => {
    const sorted = sortTeams(grid(), "conference");
    expect(sorted[0].info.id).toBe("ATL");
    expect(sorted[29].info.id).toBe("UTA");
    expect(sorted[14].info.conference).toBe("East");
    expect(sorted[15].info.conference).toBe("West");
  });
  it("team sorts by full name", () => {
    const sorted = sortTeams(grid(), "team");
    expect(sorted[0].info.id).toBe("ATL");
    expect(sorted[29].info.id).toBe("WAS");
  });
  it("line_desc puts the highest first and null lines last", () => {
    const sorted = sortTeams(grid({ MIN: { line: 55.5 }, BOS: { line: null }, ATL: { line: 30.5 } }), "line_desc");
    expect(sorted[0].info.id).toBe("MIN");
    expect(sorted[29].info.id).toBe("BOS");
  });
  it("line_asc puts the lowest first and null lines last", () => {
    const sorted = sortTeams(grid({ MIN: { line: 55.5 }, BOS: { line: null }, ATL: { line: 30.5 } }), "line_asc");
    expect(sorted[0].info.id).toBe("ATL");
    expect(sorted[29].info.id).toBe("BOS");
  });
  it("movement orders by size, largest first, nulls last", () => {
    const sorted = sortTeams(grid({ BOS: { move: -6 }, MIN: { move: 2 } }), "movement");
    expect(ids(sorted).slice(0, 2)).toEqual(["BOS", "MIN"]);
    expect(sorted[2].move).toBeNull();
  });
  it("does not mutate its input", () => {
    const teams = grid();
    const before = ids(teams);
    sortTeams(teams, "line_desc");
    sortTeams(teams, "team");
    expect(ids(teams)).toEqual(before);
  });
});
