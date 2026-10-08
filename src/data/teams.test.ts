import { describe, expect, it } from "vitest";
import { teamIdByNickname } from "@/data/teams";

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
