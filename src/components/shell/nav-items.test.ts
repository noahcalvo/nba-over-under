import { describe, expect, it } from "vitest";
import { DEMO_LEAGUE_ID } from "@/data/demo-league";
import { isActive, navItems } from "./nav-items";

describe("navItems", () => {
  it("marks every page ready in a stored league", () => {
    expect(navItems("abc234").every((item) => item.ready)).toBe(true);
  });

  it("marks every demo page ready: the guided season shows the demo's Overview and Rosters", () => {
    expect(navItems(DEMO_LEAGUE_ID).every((item) => item.ready)).toBe(true);
  });

  it("names the Overview link for the guided season's way back", () => {
    expect(navItems(DEMO_LEAGUE_ID).filter((item) => item.tour === "nav-overview").map((item) => item.href)).toEqual([
      `/l/${DEMO_LEAGUE_ID}`,
    ]);
  });

  it("lists the league pages, then the draft room and the NBA schedule", () => {
    expect(navItems("abc234").map((i) => i.label)).toEqual([
      "League overview",
      "Rosters",
      "League settings",
      "Draft room",
      "NBA schedule",
    ]);
  });

  it("groups the draft room and the NBA schedule under more", () => {
    expect(navItems("abc234").filter((i) => i.group === "more").map((i) => i.href)).toEqual(["/l/abc234/draft", "/nba"]);
  });

  it("marks only the draft room with the clock", () => {
    expect(navItems("abc234").filter((i) => i.clock).map((i) => i.label)).toEqual(["Draft room"]);
  });

  it("omits the NBA schedule from the demo league", () => {
    expect(navItems(DEMO_LEAGUE_ID).some((i) => i.href === "/nba")).toBe(false);
  });

  it("never marks the NBA schedule active inside a league", () => {
    expect(isActive(navItems("abc234")[4], "/l/abc234")).toBe(false);
  });
});
