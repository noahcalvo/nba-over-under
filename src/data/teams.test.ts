import { describe, expect, it } from "vitest";
import { TEAM_DIVISIONS, TEAM_INFO, teamIdByNickname } from "@/data/teams";

describe("teamIdByNickname", () => {
  it("matches a nickname, ignoring case and spaces", () => {
    expect(teamIdByNickname("Trail Blazers")).toBe("POR");
    expect(teamIdByNickname("  76ers ")).toBe("PHI");
    expect(teamIdByNickname("timberwolves")).toBe("MIN");
  });

  it("matches a full name that ends in a nickname", () => {
    expect(teamIdByNickname("Los Angeles Clippers")).toBe("LAC");
    expect(teamIdByNickname("LA Clippers")).toBe("LAC");
    expect(teamIdByNickname("Portland Trail Blazers")).toBe("POR");
  });

  it("returns null for anything else", () => {
    expect(teamIdByNickname("")).toBeNull();
    expect(teamIdByNickname("Sonics")).toBeNull();
    expect(teamIdByNickname("Blazers")).toBeNull();
    expect(teamIdByNickname("Clippersx")).toBeNull();
  });
});

describe("TEAM_DIVISIONS", () => {
  const EAST = new Set(["Atlantic", "Central", "Southeast"]);
  it("puts every team in a division of its own conference, five per division", () => {
    expect(Object.keys(TEAM_DIVISIONS).sort()).toEqual(TEAM_INFO.map((team) => team.id).sort());
    for (const team of TEAM_INFO) expect(EAST.has(TEAM_DIVISIONS[team.id])).toBe(team.conference === "East");
    const counts = Object.values(TEAM_DIVISIONS).reduce<Record<string, number>>((acc, d) => ({ ...acc, [d]: (acc[d] ?? 0) + 1 }), {});
    expect(Object.values(counts)).toEqual([5, 5, 5, 5, 5, 5]);
  });
});
