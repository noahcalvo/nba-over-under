import { describe, expect, it } from "vitest";
import { DEMO_LEAGUE_ID } from "@/data/demo-league";
import { navItems } from "./nav-items";

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
});
