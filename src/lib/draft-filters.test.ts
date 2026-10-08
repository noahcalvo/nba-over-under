import { describe, expect, it } from "vitest";
import { TEAMS } from "@/data/teams";
import { createDraftState } from "@/lib/draft";
import { availableSideCount, DEFAULT_FILTERS, filterTeams } from "@/lib/draft-filters";
import type { DraftState, Side } from "@/lib/types";

const EMPTY = createDraftState(["m1", "m2", "m3", "m4"], 11);

function withPicks(picks: Array<[string, Side]>): DraftState {
  return {
    ...EMPTY,
    status: "live",
    picks: picks.map(([teamId, side], index) => ({
      pickNumber: index + 1,
      managerId: EMPTY.seatOrder[index % 4],
      teamId,
      side,
    })),
  };
}

describe("filterTeams", () => {
  it("returns every team alphabetically by default", () => {
    const teams = filterTeams(TEAMS, EMPTY, DEFAULT_FILTERS);
    expect(teams).toHaveLength(30);
    expect(teams[0].id).toBe("ATL");
    expect(teams[teams.length - 1].id).toBe("WAS");
  });

  it("searches city, name and abbreviation, ignoring case", () => {
    const ids = (query: string) => filterTeams(TEAMS, EMPTY, { ...DEFAULT_FILTERS, query }).map((team) => team.id);
    expect(ids("magic")).toEqual(["ORL"]);
    expect(ids("Los Angeles")).toEqual(["LAL"]);
    expect(ids("okc")).toEqual(["OKC"]);
    expect(ids("  ")).toHaveLength(30);
  });

  it("filters by conference", () => {
    const east = filterTeams(TEAMS, EMPTY, { ...DEFAULT_FILTERS, conference: "East" });
    expect(east).toHaveLength(15);
    expect(east.every((team) => team.conference === "East")).toBe(true);
  });

  it("hides fully drafted teams only when showing available teams", () => {
    const draft = withPicks([
      ["MIN", "OVER"],
      ["MIN", "UNDER"],
      ["OKC", "OVER"],
    ]);
    const available = filterTeams(TEAMS, draft, DEFAULT_FILTERS).map((team) => team.id);
    expect(available).not.toContain("MIN");
    expect(available).toContain("OKC");
    expect(available).toHaveLength(29);
    expect(filterTeams(TEAMS, draft, { ...DEFAULT_FILTERS, availability: "all" })).toHaveLength(30);
  });
});

describe("availableSideCount", () => {
  it("counts undrafted sides out of 60", () => {
    expect(availableSideCount(EMPTY, 30)).toBe(60);
    expect(availableSideCount(withPicks([["MIN", "OVER"], ["MIN", "UNDER"], ["OKC", "OVER"]]), 30)).toBe(57);
  });
});
