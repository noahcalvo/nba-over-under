import { describe, expect, it } from "vitest";
import { seatForPick } from "@/lib/draft";
import { applyFade, fadeFor, fadeTargets, openFadeSeats, type FadeStage } from "@/lib/fades";
import type { DraftStatus, Fade, Manager } from "@/lib/types";

const SEATS = ["m1", "m2", "m3", "m4"];
const MANAGERS: Manager[] = [
  { id: "m1", seat: 0, displayName: "Ana" },
  { id: "m2", seat: 1, displayName: "Ben" },
  { id: "m3", seat: 2, displayName: null },
  { id: "m4", seat: 3, displayName: null },
];
const TEAMS = ["MIN", "OKC", "BOS", "CLE", "DEN", "LAL", "CHI", "ORL"];

function stage(status: DraftStatus = "fades", fades: Fade[] = []): FadeStage & { isDemo: boolean; commissionerId: string } {
  return {
    isDemo: false,
    commissionerId: "m1",
    managers: MANAGERS,
    fades,
    draft: {
      status,
      rounds: 2,
      seatOrder: SEATS,
      picks: TEAMS.map((teamId, i) => ({
        pickNumber: i + 1,
        managerId: SEATS[seatForPick(i + 1, 4)],
        teamId,
        side: "OVER" as const,
      })),
    },
  };
}

function must(result: ReturnType<typeof applyFade>) {
  if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
  return result.value;
}

describe("applyFade", () => {
  it("adds the manager's fade and keeps the stage open until every manager has one", () => {
    const after = must(applyFade(stage(), "m1", 2));
    expect(after.fades).toEqual([{ id: "fade-m1", managerId: "m1", targetPickNumber: 2 }]);
    expect(after.draft.status).toBe("fades");
  });

  it("lets several managers fade the same pick", () => {
    let league = stage();
    for (const managerId of ["m2", "m3", "m4"]) league = { ...league, ...must(applyFade(league, managerId, 1)) };
    expect(league.fades.map((fade) => fade.targetPickNumber)).toEqual([1, 1, 1]);
  });

  it("completes the draft with the last fade", () => {
    let league = stage();
    for (const [managerId, target] of [["m1", 2], ["m2", 1], ["m3", 1], ["m4", 1]] as const) {
      league = { ...league, ...must(applyFade(league, managerId, target)) };
    }
    expect(league.draft.status).toBe("complete");
    expect(league.fades).toHaveLength(4);
  });

  it("locks a confirmed fade", () => {
    const league = { ...stage(), ...must(applyFade(stage(), "m1", 2)) };
    expect(applyFade(league, "m1", 2)).toEqual({ ok: false, error: "fade_locked" });
    expect(applyFade(league, "m1", 3)).toEqual({ ok: false, error: "fade_locked" });
  });

  it("refuses your own pick, a pick that doesn't exist and an unknown manager", () => {
    expect(applyFade(stage(), "m1", 1)).toEqual({ ok: false, error: "own_pick" });
    expect(applyFade(stage(), "m1", 8)).toEqual({ ok: false, error: "own_pick" }); // snake: pick 8 is m1's
    expect(applyFade(stage(), "m1", 9)).toEqual({ ok: false, error: "unknown_pick" });
    expect(applyFade(stage(), "m9", 2)).toEqual({ ok: false, error: "not_found" });
  });

  it("only runs during the fade stage", () => {
    for (const status of ["not_started", "live", "paused", "complete"] as const) {
      expect(applyFade(stage(status), "m1", 2)).toEqual({ ok: false, error: "not_fading" });
    }
  });
});

describe("fadeTargets and fadeFor", () => {
  it("lists every opponent pick in pick order", () => {
    expect(fadeTargets(stage().draft, "m1").map((pick) => pick.pickNumber)).toEqual([2, 3, 4, 5, 6, 7]);
  });

  it("finds a manager's fade", () => {
    const fades = [{ id: "fade-m2", managerId: "m2", targetPickNumber: 1 }];
    expect(fadeFor(fades, "m2")?.targetPickNumber).toBe(1);
    expect(fadeFor(fades, "m1")).toBeUndefined();
  });
});

describe("openFadeSeats", () => {
  it("gives a manager their own seat and the commissioner every unclaimed seat, until each has a fade", () => {
    expect(openFadeSeats(stage(), "m1")).toEqual(["m1", "m3", "m4"]);
    expect(openFadeSeats(stage(), "m2")).toEqual(["m2"]);
    expect(openFadeSeats(stage(), null)).toEqual([]);
    const fades = [{ id: "fade-m3", managerId: "m3", targetPickNumber: 1 }];
    expect(openFadeSeats(stage("fades", fades), "m1")).toEqual(["m1", "m4"]);
  });

  it("is empty outside the fade stage and in the demo league", () => {
    expect(openFadeSeats(stage("live"), "m1")).toEqual([]);
    expect(openFadeSeats({ ...stage(), isDemo: true }, "m1")).toEqual([]);
  });
});
