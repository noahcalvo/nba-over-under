import { describe, expect, it } from "vitest";
import { fadeStatus } from "@/lib/fade-status";
import type { FadeEvaluation } from "@/lib/scoring";

const scored = (basis: "projected" | "final", targetMissed: boolean, points: number): FadeEvaluation => ({
  basis,
  status: "scored",
  targetMissed,
  points,
});

describe("fadeStatus", () => {
  it("is On track when the target is projected to miss, Off track otherwise", () => {
    expect(fadeStatus(scored("projected", true, 2))).toEqual({ label: "On track", tone: "accent" });
    expect(fadeStatus(scored("projected", false, 0))).toEqual({ label: "Off track", tone: "danger" });
  });

  it("shows the earned bonus or no bonus once final", () => {
    expect(fadeStatus(scored("final", true, 2))).toEqual({ label: "+2 earned", tone: "accent" });
    expect(fadeStatus(scored("final", false, 0))).toEqual({ label: "No bonus", tone: "neutral" });
  });

  it("passes through not available and pending", () => {
    const base = { targetMissed: null, points: null };
    expect(fadeStatus({ ...base, basis: "projected", status: "not_available" })).toEqual({
      label: "Not available",
      tone: "neutral",
    });
    expect(fadeStatus({ ...base, basis: "final", status: "pending" })).toEqual({ label: "Pending", tone: "neutral" });
  });
});
