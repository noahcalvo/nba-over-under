import { describe, expect, it } from "vitest";
import { parseDraftAction } from "@/lib/league/parse-action";

describe("parseDraftAction", () => {
  it("accepts control actions", () => {
    expect(parseDraftAction({ type: "start" })).toEqual({ type: "start" });
    expect(parseDraftAction({ type: "pause" })).toEqual({ type: "pause" });
    expect(parseDraftAction({ type: "resume" })).toEqual({ type: "resume" });
  });

  it("accepts a confirm with a team and side, dropping extra fields", () => {
    expect(parseDraftAction({ type: "confirm", teamId: "MIN", side: "OVER", extra: 1 })).toEqual({
      type: "confirm",
      teamId: "MIN",
      side: "OVER",
    });
  });

  it("rejects anything else", () => {
    expect(parseDraftAction(null)).toBeNull();
    expect(parseDraftAction("start")).toBeNull();
    expect(parseDraftAction({ type: "confirm", teamId: "MIN", side: "SIDEWAYS" })).toBeNull();
    expect(parseDraftAction({ type: "confirm", side: "OVER" })).toBeNull();
    expect(parseDraftAction({ type: "delete" })).toBeNull();
  });
});
