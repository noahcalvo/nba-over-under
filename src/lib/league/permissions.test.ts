import { describe, expect, it } from "vitest";
import { canControlDraft, canPickNow, type DraftAccess } from "@/lib/league/permissions";
import type { DraftStatus, Manager } from "@/lib/types";

const MANAGERS: Manager[] = [
  { id: "m1", seat: 0, displayName: "Ana" },
  { id: "m2", seat: 1, displayName: "Ben" },
  { id: "m3", seat: 2, displayName: null },
  { id: "m4", seat: 3, displayName: null },
];
const SEATS = ["m1", "m2", "m3", "m4"];
const TEAMS = ["MIN", "OKC", "BOS", "CLE"];

function league(status: DraftStatus, pickCount = 0, isDemo = false): DraftAccess {
  return {
    isDemo,
    commissionerId: "m1",
    managers: MANAGERS,
    draft: {
      status,
      rounds: 2,
      seatOrder: SEATS,
      picks: Array.from({ length: pickCount }, (_, i) => ({
        pickNumber: i + 1,
        managerId: SEATS[i],
        teamId: TEAMS[i],
        side: "OVER" as const,
      })),
    },
  };
}

describe("canControlDraft", () => {
  it("allows only the commissioner, never in the demo league", () => {
    expect(canControlDraft(league("live"), "m1")).toBe(true);
    expect(canControlDraft(league("live"), "m2")).toBe(false);
    expect(canControlDraft(league("live"), null)).toBe(false);
    expect(canControlDraft(league("live", 0, true), "m1")).toBe(false);
  });
});

describe("canPickNow", () => {
  it("lets the manager on the clock pick", () => {
    expect(canPickNow(league("live"), "m1")).toBe(true);
    expect(canPickNow(league("live", 1), "m2")).toBe(true);
  });

  it("blocks other claimed managers and spectators", () => {
    expect(canPickNow(league("live"), "m2")).toBe(false);
    expect(canPickNow(league("live"), null)).toBe(false);
  });

  it("lets the commissioner pick for an open seat, but not for a claimed one", () => {
    expect(canPickNow(league("live", 2), "m1")).toBe(true); // m3 is open
    expect(canPickNow(league("live", 2), "m2")).toBe(false);
    expect(canPickNow(league("live", 1), "m1")).toBe(false); // m2 is claimed
  });

  it("blocks everyone unless the draft is live", () => {
    expect(canPickNow(league("paused"), "m1")).toBe(false);
    expect(canPickNow(league("not_started"), "m1")).toBe(false);
    expect(canPickNow(league("live", 0, true), "m1")).toBe(false);
  });
});
