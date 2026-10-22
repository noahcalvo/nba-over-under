import { describe, expect, it } from "vitest";
import { DEMO_LEAGUE_ID } from "@/data/demo-league";
import { globalNavItems, isActive, navItems } from "./nav-items";

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

  it("lists the league pages, then the draft room, the NBA schedule and the 30/30 Challenge", () => {
    expect(navItems("abc234").map((i) => i.label)).toEqual([
      "League overview",
      "Rosters",
      "League settings",
      "Draft room",
      "NBA schedule",
      "30/30 Challenge",
    ]);
  });

  it("groups the draft room, the NBA schedule and the 30/30 Challenge under more", () => {
    expect(navItems("abc234").filter((i) => i.group === "more").map((i) => i.href)).toEqual([
      "/l/abc234/draft",
      "/nba",
      "/challenge",
    ]);
  });

  it("marks only the draft room with the clock", () => {
    expect(navItems("abc234").filter((i) => i.clock).map((i) => i.label)).toEqual(["Draft room"]);
  });

  it("omits the NBA schedule from the demo league", () => {
    expect(navItems(DEMO_LEAGUE_ID).some((i) => i.href === "/nba")).toBe(false);
  });

  it("omits the 30/30 Challenge from the demo league", () => {
    expect(navItems(DEMO_LEAGUE_ID).some((i) => i.href === "/challenge")).toBe(false);
  });

  it("marks only the NBA schedule and the 30/30 Challenge global (the mobile top bar)", () => {
    expect(navItems("abc234").filter((i) => i.global).map((i) => i.href)).toEqual(["/nba", "/challenge"]);
    expect(globalNavItems().map((i) => i.href)).toEqual(["/nba", "/challenge"]);
  });

  it("leaves four league tabs for the bottom bar, in the demo league too", () => {
    expect(navItems("abc234").filter((i) => !i.global)).toHaveLength(4);
    expect(navItems(DEMO_LEAGUE_ID).filter((i) => !i.global)).toHaveLength(4);
  });

  it("never marks the NBA schedule or the 30/30 Challenge active inside a league", () => {
    const outside = navItems("abc234").filter((i) => i.href === "/nba" || i.href === "/challenge");
    expect(outside).toHaveLength(2);
    expect(outside.some((i) => isActive(i, "/l/abc234"))).toBe(false);
  });
});
