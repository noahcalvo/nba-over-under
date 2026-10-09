import { describe, expect, it } from "vitest";
import { chartWindow, windowSubtitle, yAxis } from "@/lib/chart-window";

describe("chartWindow", () => {
  it("shows the last 8 completed games and the next 2", () => {
    expect(chartWindow(48, "last8")).toEqual({ first: 41, last: 50, completed: 8, upcoming: 2, current: 48 });
  });

  it("shows fewer completed games early in the season", () => {
    expect(chartWindow(3, "last8")).toEqual({ first: 1, last: 5, completed: 3, upcoming: 2, current: 3 });
    expect(chartWindow(0, "last8")).toEqual({ first: 1, last: 2, completed: 0, upcoming: 2, current: 0 });
  });

  it("never runs past game 82", () => {
    expect(chartWindow(81, "last8")).toEqual({ first: 74, last: 82, completed: 8, upcoming: 1, current: 81 });
    expect(chartWindow(82, "last8")).toEqual({ first: 75, last: 82, completed: 8, upcoming: 0, current: 82 });
  });

  it("shows every game in the full season", () => {
    expect(chartWindow(48, "full")).toEqual({ first: 1, last: 82, completed: 48, upcoming: 34, current: 48 });
  });
});

describe("windowSubtitle", () => {
  it("counts completed and upcoming positions", () => {
    expect(windowSubtitle(chartWindow(48, "last8"), "last8")).toBe("8 completed games + 2 upcoming");
    expect(windowSubtitle(chartWindow(1, "last8"), "last8")).toBe("1 completed game + 2 upcoming");
    expect(windowSubtitle(chartWindow(81, "last8"), "last8")).toBe("8 completed games + 1 upcoming");
    expect(windowSubtitle(chartWindow(82, "last8"), "last8")).toBe("8 completed games");
    expect(windowSubtitle(chartWindow(0, "last8"), "last8")).toBe("No games played yet · 2 upcoming");
  });

  it("describes the full season", () => {
    expect(windowSubtitle(chartWindow(48, "full"), "full")).toBe("48 of 82 games played");
  });
});

describe("yAxis (Last 8)", () => {
  it("fits the data to 70% of the height with 15% padding above and below", () => {
    const axis = yAxis([10, 20], "last8");
    const span = axis.max - axis.min;
    expect((20 - 10) / span).toBeCloseTo(0.7);
    expect((axis.max - 20) / span).toBeCloseTo(0.15);
    expect((10 - axis.min) / span).toBeCloseTo(0.15);
  });

  it("uses readable ticks inside the range", () => {
    const axis = yAxis([25, 30.6], "last8");
    expect(axis.min).toBeCloseTo(23.8);
    expect(axis.max).toBeCloseTo(31.8);
    expect(axis.ticks).toEqual([24, 26, 28, 30]);
  });

  it("keeps a 4-win minimum span when the values are equal", () => {
    expect(yAxis([30, 30], "last8")).toEqual({ min: 28, max: 32, ticks: [28, 29, 30, 31, 32] });
  });

  it("never goes below zero and doesn't start at zero otherwise", () => {
    expect(yAxis([0, 1], "last8")).toEqual({ min: 0, max: 4, ticks: [0, 1, 2, 3, 4] });
    expect(yAxis([25, 30.6], "last8").min).toBeGreaterThan(0);
  });

  it("has a default range with no values", () => {
    expect(yAxis([], "last8")).toEqual({ min: 0, max: 4, ticks: [0, 1, 2, 3, 4] });
  });
});

describe("yAxis (Full season)", () => {
  it("starts at zero with headroom above the highest value", () => {
    expect(yAxis([0, 30, 51.5], "full")).toEqual({ min: 0, max: 60, ticks: [0, 10, 20, 30, 40, 50, 60] });
  });

  it("has a default range with no wins yet", () => {
    expect(yAxis([0], "full")).toEqual({ min: 0, max: 10, ticks: [0, 2, 4, 6, 8, 10] });
  });
});
