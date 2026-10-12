import { describe, expect, it } from "vitest";
import { clipRect, inflateRect, intersectRects, sameRects } from "./geometry";

const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height });

describe("intersectRects", () => {
  it("returns the overlap, or null when the rects only touch or miss", () => {
    expect(intersectRects(rect(0, 0, 100, 100), rect(50, 60, 100, 100))).toEqual(rect(50, 60, 50, 40));
    expect(intersectRects(rect(0, 0, 100, 100), rect(100, 0, 50, 50))).toBeNull();
    expect(intersectRects(rect(0, 0, 10, 10), rect(20, 20, 5, 5))).toBeNull();
  });
});

describe("clipRect", () => {
  it("keeps the part inside every clip (scroll containers, then the viewport)", () => {
    const board = rect(300, 400, 800, 300);
    const cell = rect(900, 650, 200, 120);
    expect(clipRect(cell, [board, rect(0, 0, 1440, 900)])).toEqual(rect(900, 650, 200, 50));
    expect(clipRect(rect(0, 1000, 10, 10), [rect(0, 0, 1440, 900)])).toBeNull();
  });
});

describe("inflateRect", () => {
  it("grows on every side", () => {
    expect(inflateRect(rect(10, 20, 30, 40), 8)).toEqual(rect(2, 12, 46, 56));
  });
});

describe("sameRects", () => {
  it("compares lists rect by rect", () => {
    expect(sameRects([rect(1, 2, 3, 4)], [rect(1, 2, 3, 4)])).toBe(true);
    expect(sameRects([rect(1, 2, 3, 4)], [rect(1, 2, 3, 5)])).toBe(false);
    expect(sameRects([], [rect(1, 2, 3, 4)])).toBe(false);
  });
});
