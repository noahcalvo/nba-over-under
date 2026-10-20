import { describe, expect, it } from "vitest";
import { isNbaNavActive, nbaNavItems } from "./nav-items";

function activeHrefs(pathname: string): string[] {
  return nbaNavItems()
    .filter((item) => isNbaNavActive(item, pathname))
    .map((item) => item.href);
}

describe("nbaNavItems", () => {
  it("lists Home, the schedule and the challenge in order", () => {
    expect(nbaNavItems().map((item) => item.href)).toEqual(["/", "/nba", "/challenge"]);
  });

  it("names the bottom tabs", () => {
    expect(nbaNavItems().map((item) => item.shortLabel)).toEqual(["Home", "Schedule", "Challenge"]);
  });
});

describe("isNbaNavActive", () => {
  it("lights the schedule on /nba and on a game page", () => {
    expect(activeHrefs("/nba")).toEqual(["/nba"]);
    expect(activeHrefs("/nba/games/401909834")).toEqual(["/nba"]);
  });

  it("lights Home only on /", () => {
    expect(activeHrefs("/")).toEqual(["/"]);
  });

  it("lights the challenge on its sub-pages", () => {
    expect(activeHrefs("/challenge")).toEqual(["/challenge"]);
    expect(activeHrefs("/challenge/leaderboard")).toEqual(["/challenge"]);
  });

  it("lights nothing while the path is unknown", () => {
    expect(activeHrefs("")).toEqual([]);
  });
});
