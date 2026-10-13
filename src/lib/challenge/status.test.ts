import { describe, expect, it } from "vitest";
import type { CallEvaluation } from "@/lib/scoring";
import { movementState, pickStatus } from "./status";

const scored = (basis: "projected" | "final", margin: number): CallEvaluation => ({
  basis,
  status: "scored",
  wins: 40,
  margin,
  correct: margin > 0,
  push: margin === 0,
  points: margin,
});
const none = (basis: "projected" | "final", status: "not_available" | "pending"): CallEvaluation => ({
  basis,
  status,
  wins: null,
  margin: null,
  correct: null,
  push: null,
  points: null,
});

describe("pickStatus", () => {
  it("is Unavailable for a team without a frozen line, only once frozen", () => {
    expect(pickStatus({ frozen: true, line: null, projected: null, final: null }).label).toBe("Unavailable");
    expect(pickStatus({ frozen: false, line: null, projected: null, final: null }).label).toBe("No games yet");
  });

  it("is No games yet before the team plays", () => {
    const status = pickStatus({
      frozen: true,
      line: 40.5,
      projected: none("projected", "not_available"),
      final: none("final", "pending"),
    });
    expect(status).toEqual({ label: "No games yet", tone: "neutral" });
  });

  it("reads the pace while the season runs", () => {
    const pending = none("final", "pending");
    const status = (margin: number) =>
      pickStatus({ frozen: true, line: 40.5, projected: scored("projected", margin), final: pending });
    expect(status(2)).toEqual({ label: "On pace", tone: "good" });
    expect(status(-2)).toEqual({ label: "Off pace", tone: "bad" });
    expect(status(0)).toEqual({ label: "Push pace", tone: "neutral" });
  });

  it("reads the final result once settled, ahead of the pace", () => {
    const status = (margin: number) =>
      pickStatus({ frozen: true, line: 40.5, projected: scored("projected", margin), final: scored("final", margin) });
    expect(status(3)).toEqual({ label: "Hit", tone: "good" });
    expect(status(-3)).toEqual({ label: "Missed", tone: "bad" });
    expect(status(0)).toEqual({ label: "Push", tone: "neutral" });
  });
});

describe("movementState", () => {
  it("is unknown without both lines, unchanged without a move, else moved", () => {
    expect(movementState(null, 40.5, null)).toBe("unknown");
    expect(movementState(40.5, null, null)).toBe("unknown");
    expect(movementState(40.5, 40.5, null)).toBe("unchanged");
    expect(movementState(40.5, 41.5, 1)).toBe("moved");
  });
});
