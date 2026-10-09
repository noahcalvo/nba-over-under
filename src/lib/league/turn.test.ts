import { describe, expect, it } from "vitest";
import { seatForPick } from "@/lib/draft";
import type { DraftAccess } from "@/lib/league/permissions";
import { describeTurn } from "@/lib/league/turn";
import type { DraftStatus, Manager } from "@/lib/types";

const MANAGERS: Manager[] = [
  { id: "m1", seat: 0, displayName: "Ana" },
  { id: "m2", seat: 1, displayName: "Ben" },
  { id: "m3", seat: 2, displayName: null },
  { id: "m4", seat: 3, displayName: null },
];
const SEATS = ["m1", "m2", "m3", "m4"];
const TEAMS = ["MIN", "OKC", "BOS", "CLE", "DEN", "LAL", "CHI", "ORL"];

function league(status: DraftStatus, pickCount = 0): DraftAccess {
  return {
    isDemo: false,
    commissionerId: "m1",
    managers: MANAGERS,
    draft: {
      status,
      rounds: 2,
      seatOrder: SEATS,
      picks: Array.from({ length: pickCount }, (_, i) => ({
        pickNumber: i + 1,
        managerId: SEATS[seatForPick(i + 1, 4)],
        teamId: TEAMS[i],
        side: "OVER" as const,
      })),
    },
  };
}

describe("describeTurn", () => {
  it("reports who picks first before the draft starts", () => {
    expect(describeTurn(league("not_started"), "m2")).toEqual({ kind: "not_started", managerId: "m1" });
  });

  it("tells the manager on the clock it's their turn", () => {
    expect(describeTurn(league("live"), "m1")).toEqual({ kind: "your_turn", managerId: "m1" });
  });

  it("shows everyone else who is on the clock", () => {
    expect(describeTurn(league("live"), "m2")).toEqual({ kind: "on_the_clock", managerId: "m1" });
    expect(describeTurn(league("live"), null)).toEqual({ kind: "on_the_clock", managerId: "m1" });
  });

  it("tells the commissioner when they're picking for an open seat", () => {
    expect(describeTurn(league("live", 2), "m1")).toEqual({ kind: "picking_for_open_seat", managerId: "m3" });
    expect(describeTurn(league("live", 2), "m2")).toEqual({ kind: "on_the_clock", managerId: "m3" });
  });

  it("reports the fade stage without anyone on the clock", () => {
    expect(describeTurn(league("fades", 8), "m1")).toEqual({ kind: "fades", managerId: null });
  });

  it("reports paused and complete drafts", () => {
    expect(describeTurn(league("paused", 1), "m2")).toEqual({ kind: "paused", managerId: "m2" });
    expect(describeTurn(league("complete", 8), "m1")).toEqual({ kind: "complete", managerId: null });
  });
});
