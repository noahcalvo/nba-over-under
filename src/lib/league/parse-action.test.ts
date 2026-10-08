import { describe, expect, it } from "vitest";
import { parseDraftAction } from "@/lib/league/parse-action";

describe("parseDraftAction", () => {
  it("accepts control actions", () => {
    expect(parseDraftAction({ type: "start" })).toEqual({ type: "start" });
    expect(parseDraftAction({ type: "pause" })).toEqual({ type: "pause" });
    expect(parseDraftAction({ type: "resume" })).toEqual({ type: "resume" });
  });

  it("accepts a start with reviewed lines, and a plain start without them", () => {
    expect(parseDraftAction({ type: "start", lines: { BOS: 50.5 } })).toEqual({ type: "start", lines: { BOS: 50.5 } });
    expect(parseDraftAction({ type: "start" })).toEqual({ type: "start" });
    expect(parseDraftAction({ type: "start", lines: "x" })).toBeNull();
    expect(parseDraftAction({ type: "start", lines: [1] })).toBeNull();
    expect(parseDraftAction({ type: "start", lines: { BOS: "50.5" } })).toBeNull();
  });

  it("accepts a confirm with a team, side and pick number, dropping extra fields", () => {
    expect(parseDraftAction({ type: "confirm", teamId: "MIN", side: "OVER", pickNumber: 3, extra: 1 })).toEqual({
      type: "confirm",
      teamId: "MIN",
      side: "OVER",
      pickNumber: 3,
    });
  });

  it("rejects anything else", () => {
    expect(parseDraftAction(null)).toBeNull();
    expect(parseDraftAction("start")).toBeNull();
    expect(parseDraftAction({ type: "confirm", teamId: "MIN", side: "SIDEWAYS", pickNumber: 1 })).toBeNull();
    expect(parseDraftAction({ type: "confirm", side: "OVER", pickNumber: 1 })).toBeNull();
    expect(parseDraftAction({ type: "delete" })).toBeNull();
  });

  it("requires a positive whole pick number on a confirm", () => {
    for (const pickNumber of [undefined, 0, -1, 1.5, "1", Number.NaN]) {
      expect(parseDraftAction({ type: "confirm", teamId: "MIN", side: "OVER", pickNumber })).toBeNull();
    }
  });
});
