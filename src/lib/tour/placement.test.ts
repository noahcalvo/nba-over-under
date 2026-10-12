import { describe, expect, it } from "vitest";
import { placeCallout, placePointer } from "./placement";

const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height });
const desktop = { width: 1440, height: 900 };
const phone = { width: 375, height: 812 };
const callout = { width: 352, height: 200 };

describe("placeCallout", () => {
  it("goes below the target, centered under it, when it fits", () => {
    expect(placeCallout(rect(300, 100, 800, 120), callout, desktop)).toEqual({ side: "bottom", top: 234, left: 524 });
  });

  it("goes above when there is no room below", () => {
    expect(placeCallout(rect(300, 700, 800, 150), callout, desktop)).toEqual({ side: "top", top: 486, left: 524 });
  });

  it("goes beside a target taller than the viewport", () => {
    expect(placeCallout(rect(288, 0, 700, 900), callout, desktop)).toEqual({ side: "right", top: 350, left: 1002 });
  });

  it("docks to the bottom edge when nothing fits beside it (full-width section on a phone)", () => {
    expect(placeCallout(rect(0, 0, 375, 812), { width: 343, height: 220 }, phone)).toEqual({
      side: "docked",
      top: 576,
      left: 16,
    });
  });

  it("docks bottom-right on a wide screen when the target is not on screen", () => {
    expect(placeCallout(null, callout, desktop)).toEqual({ side: "docked", top: 684, left: 1072 });
  });

  it("stays inside the viewport margins", () => {
    expect(placeCallout(rect(0, 100, 40, 40), callout, desktop)).toEqual({ side: "bottom", top: 154, left: 16 });
  });
});

describe("placePointer", () => {
  it("sits above the target pointing down, or below it pointing up near the top edge", () => {
    expect(placePointer(rect(100, 200, 80, 40), desktop)).toEqual({ direction: "down", top: 166, left: 126 });
    expect(placePointer(rect(100, 10, 80, 40), desktop)).toEqual({ direction: "up", top: 56, left: 126 });
  });

  it("stays inside the viewport horizontally", () => {
    expect(placePointer(rect(1430, 200, 10, 40), desktop).left).toBe(1412);
  });
});
