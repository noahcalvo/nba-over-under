import { describe, expect, it } from "vitest";
import { DEMO_LEAGUE_ID } from "@/data/demo-league";
import { navItems } from "./nav-items";

describe("navItems", () => {
  it("marks every page ready in a stored league", () => {
    expect(navItems("abc234").every((item) => item.ready)).toBe(true);
  });

  it("marks the demo's Overview and Rosters as coming with the scoring chapter", () => {
    const ready = Object.fromEntries(navItems(DEMO_LEAGUE_ID).map((item) => [item.shortLabel, item.ready]));
    expect(ready).toEqual({ Overview: false, Rosters: false, Settings: true, Draft: true });
  });
});
