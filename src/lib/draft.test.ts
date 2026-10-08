import { describe, expect, it } from "vitest";
import {
  applyDraftAction,
  createDraftState,
  currentPickNumber,
  findPickForSide,
  managerOnTheClock,
  managerUpNext,
  pickNumberFor,
  picksForManager,
  roundOf,
  seatForPick,
  totalPicks,
  type DraftAction,
} from "@/lib/draft";
import type { DraftState } from "@/lib/types";

const SEATS = ["m1", "m2", "m3", "m4"];
const TEAM_IDS = new Set(["MIN", "OKC", "BOS", "CLE"]);

function mustApply(state: DraftState, action: DraftAction, teamIds: ReadonlySet<string> = TEAM_IDS): DraftState {
  const result = applyDraftAction(state, action, teamIds);
  if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
  return result.state;
}

function liveDraft(seats = SEATS, rounds = 11): DraftState {
  return mustApply(createDraftState(seats, rounds), { type: "start" });
}

describe("snake order", () => {
  it("runs seats forward in odd rounds and backward in even rounds", () => {
    const order = Array.from({ length: 12 }, (_, i) => seatForPick(i + 1, 4));
    expect(order).toEqual([0, 1, 2, 3, 3, 2, 1, 0, 0, 1, 2, 3]);
  });

  it("gives four managers 11 picks each across 11 rounds", () => {
    expect(totalPicks(4, 11)).toBe(44);
    const counts = [0, 0, 0, 0];
    for (let pick = 1; pick <= 44; pick++) counts[seatForPick(pick, 4)]++;
    expect(counts).toEqual([11, 11, 11, 11]);
  });

  it("ends round 11 with the last seat", () => {
    expect(roundOf(44, 4)).toBe(11);
    expect(seatForPick(44, 4)).toBe(3);
  });

  it("pickNumberFor inverts seatForPick", () => {
    for (let pick = 1; pick <= 44; pick++) {
      expect(pickNumberFor(roundOf(pick, 4), seatForPick(pick, 4), 4)).toBe(pick);
    }
  });
});

describe("draft state", () => {
  it("starts not started with seat 1 first", () => {
    const state = createDraftState(SEATS, 11);
    expect(state).toEqual({ status: "not_started", rounds: 11, seatOrder: SEATS, picks: [] });
    expect(currentPickNumber(state)).toBe(1);
    expect(managerOnTheClock(state)).toBe("m1");
    expect(managerUpNext(state)).toBe("m2");
  });
});

describe("applyDraftAction", () => {
  it("records a confirmed pick for the manager on the clock and advances the turn", () => {
    const state = mustApply(liveDraft(), { type: "confirm", teamId: "MIN", side: "OVER" });
    expect(state.picks).toEqual([{ pickNumber: 1, managerId: "m1", teamId: "MIN", side: "OVER" }]);
    expect(currentPickNumber(state)).toBe(2);
    expect(managerOnTheClock(state)).toBe("m2");
    expect(managerUpNext(state)).toBe("m3");
  });

  it("keeps the other side of a drafted team available", () => {
    let state = mustApply(liveDraft(), { type: "confirm", teamId: "MIN", side: "OVER" });
    state = mustApply(state, { type: "confirm", teamId: "MIN", side: "UNDER" });
    expect(state.picks[1]).toEqual({ pickNumber: 2, managerId: "m2", teamId: "MIN", side: "UNDER" });
    expect(findPickForSide(state, "MIN", "UNDER")?.managerId).toBe("m2");
  });

  it("rejects a side that is already drafted", () => {
    const state = mustApply(liveDraft(), { type: "confirm", teamId: "MIN", side: "OVER" });
    expect(applyDraftAction(state, { type: "confirm", teamId: "MIN", side: "OVER" }, TEAM_IDS)).toEqual({
      ok: false,
      error: "side_taken",
    });
  });

  describe("one pick per team per manager", () => {
    // Seat 4 picks 4th and 5th, back to back across the snake turn.
    function seatFourOwnsCle(): DraftState {
      let state = liveDraft();
      const sides: Array<[string, "OVER" | "UNDER"]> = [["MIN", "OVER"], ["OKC", "OVER"], ["BOS", "UNDER"], ["CLE", "OVER"]];
      for (const [teamId, side] of sides) state = mustApply(state, { type: "confirm", teamId, side });
      return state;
    }

    it("rejects the other side of a team the manager already drafted", () => {
      const state = seatFourOwnsCle();
      expect(managerOnTheClock(state)).toBe("m4");
      expect(applyDraftAction(state, { type: "confirm", teamId: "CLE", side: "UNDER" }, TEAM_IDS)).toEqual({
        ok: false,
        error: "team_owned",
      });
    });

    it("lets another manager draft the remaining side", () => {
      let state = mustApply(seatFourOwnsCle(), { type: "confirm", teamId: "MIN", side: "UNDER" });
      expect(managerOnTheClock(state)).toBe("m3");
      state = mustApply(state, { type: "confirm", teamId: "CLE", side: "UNDER" });
      expect(findPickForSide(state, "CLE", "OVER")?.managerId).toBe("m4");
      expect(findPickForSide(state, "CLE", "UNDER")?.managerId).toBe("m3");
    });
  });

  it("rejects unknown teams", () => {
    expect(applyDraftAction(liveDraft(), { type: "confirm", teamId: "XXX", side: "OVER" }, TEAM_IDS)).toEqual({
      ok: false,
      error: "unknown_team",
    });
  });

  it("blocks picks unless the draft is live", () => {
    const pick: DraftAction = { type: "confirm", teamId: "MIN", side: "OVER" };
    expect(applyDraftAction(createDraftState(SEATS, 11), pick, TEAM_IDS)).toEqual({ ok: false, error: "not_live" });
    const paused = mustApply(liveDraft(), { type: "pause" });
    expect(applyDraftAction(paused, pick, TEAM_IDS)).toEqual({ ok: false, error: "not_live" });
  });

  it("pauses and resumes, rejecting invalid transitions", () => {
    const paused = mustApply(liveDraft(), { type: "pause" });
    expect(paused.status).toBe("paused");
    expect(mustApply(paused, { type: "resume" }).status).toBe("live");
    expect(applyDraftAction(paused, { type: "pause" }, TEAM_IDS)).toEqual({ ok: false, error: "invalid_transition" });
    expect(applyDraftAction(liveDraft(), { type: "start" }, TEAM_IDS)).toEqual({
      ok: false,
      error: "invalid_transition",
    });
    expect(applyDraftAction(createDraftState(SEATS, 11), { type: "resume" }, TEAM_IDS)).toEqual({
      ok: false,
      error: "invalid_transition",
    });
  });

  it("snakes across the round boundary", () => {
    let state = liveDraft();
    const sides: Array<[string, "OVER" | "UNDER"]> = [
      ["MIN", "OVER"], ["OKC", "OVER"], ["BOS", "UNDER"], ["CLE", "OVER"], ["MIN", "UNDER"], ["OKC", "UNDER"],
    ];
    for (const [teamId, side] of sides) state = mustApply(state, { type: "confirm", teamId, side });
    expect(state.picks.map((p) => p.managerId)).toEqual(["m1", "m2", "m3", "m4", "m4", "m3"]);
    expect(managerOnTheClock(state)).toBe("m2");
    expect(picksForManager(state, "m4").map((p) => p.pickNumber)).toEqual([4, 5]);
  });

  it("completes after the final pick", () => {
    let state = liveDraft(["m1", "m2"], 2);
    const sides: Array<[string, "OVER" | "UNDER"]> = [
      ["MIN", "OVER"], ["MIN", "UNDER"], ["OKC", "OVER"], ["OKC", "UNDER"],
    ];
    for (const [teamId, side] of sides) state = mustApply(state, { type: "confirm", teamId, side });
    expect(state.status).toBe("complete");
    expect(currentPickNumber(state)).toBeNull();
    expect(managerOnTheClock(state)).toBeNull();
    expect(managerUpNext(state)).toBeNull();
    expect(applyDraftAction(state, { type: "confirm", teamId: "BOS", side: "OVER" }, TEAM_IDS)).toEqual({
      ok: false,
      error: "not_live",
    });
  });
});
