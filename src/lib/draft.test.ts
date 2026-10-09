import { describe, expect, it } from "vitest";
import {
  applyDraftAction,
  createDraftState,
  currentPickNumber,
  findPickForSide,
  holdsTeam,
  managerOnTheClock,
  managerUpNext,
  pickNumberFor,
  picksForManager,
  roundOf,
  seatForPick,
  totalPicks,
  type DraftAction,
} from "@/lib/draft";
import type { DraftState, Side } from "@/lib/types";

const SEATS = ["m1", "m2", "m3", "m4"];
const TEAM_IDS = new Set(["MIN", "OKC", "BOS", "CLE"]);

function mustApply(state: DraftState, action: DraftAction, teamIds: ReadonlySet<string> = TEAM_IDS): DraftState {
  const result = applyDraftAction(state, action, teamIds);
  if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
  return result.state;
}

/** A confirm for the pick that is on the clock now. */
function pick(state: DraftState, teamId: string, side: Side): DraftAction {
  return { type: "confirm", teamId, side, pickNumber: state.picks.length + 1 };
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
    for (let pickNumber = 1; pickNumber <= 44; pickNumber++) counts[seatForPick(pickNumber, 4)]++;
    expect(counts).toEqual([11, 11, 11, 11]);
  });

  it("ends round 11 with the last seat", () => {
    expect(roundOf(44, 4)).toBe(11);
    expect(seatForPick(44, 4)).toBe(3);
  });

  it("pickNumberFor inverts seatForPick", () => {
    for (let pickNumber = 1; pickNumber <= 44; pickNumber++) {
      expect(pickNumberFor(roundOf(pickNumber, 4), seatForPick(pickNumber, 4), 4)).toBe(pickNumber);
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
    const live = liveDraft();
    const state = mustApply(live, pick(live, "MIN", "OVER"));
    expect(state.picks).toEqual([{ pickNumber: 1, managerId: "m1", teamId: "MIN", side: "OVER" }]);
    expect(currentPickNumber(state)).toBe(2);
    expect(managerOnTheClock(state)).toBe("m2");
    expect(managerUpNext(state)).toBe("m3");
  });

  it("keeps the other side of a drafted team available to other managers", () => {
    let state = liveDraft();
    state = mustApply(state, pick(state, "MIN", "OVER"));
    state = mustApply(state, pick(state, "MIN", "UNDER"));
    expect(state.picks[1]).toEqual({ pickNumber: 2, managerId: "m2", teamId: "MIN", side: "UNDER" });
    expect(findPickForSide(state, "MIN", "UNDER")?.managerId).toBe("m2");
  });

  it("rejects a side that is already drafted", () => {
    const live = liveDraft();
    const state = mustApply(live, pick(live, "MIN", "OVER"));
    expect(applyDraftAction(state, pick(state, "MIN", "OVER"), TEAM_IDS)).toEqual({ ok: false, error: "side_taken" });
  });

  it("never lets a manager hold both sides of a team", () => {
    // m4 takes CLE OVER at pick 4, then is on the clock again at pick 5.
    let state = liveDraft();
    for (const [teamId, side] of [["MIN", "OVER"], ["OKC", "OVER"], ["BOS", "OVER"], ["CLE", "OVER"]] as const) {
      state = mustApply(state, pick(state, teamId, side));
    }
    expect(managerOnTheClock(state)).toBe("m4");
    expect(holdsTeam(state, "m4", "CLE")).toBe(true);
    expect(holdsTeam(state, "m4", "MIN")).toBe(false);
    expect(applyDraftAction(state, pick(state, "CLE", "UNDER"), TEAM_IDS)).toEqual({
      ok: false,
      error: "team_already_held",
    });
    expect(mustApply(state, pick(state, "MIN", "UNDER")).picks[4].managerId).toBe("m4");
  });

  it("rejects a confirm for any pick other than the one on the clock", () => {
    const live = liveDraft();
    const state = mustApply(live, pick(live, "MIN", "OVER"));
    // A double click resends pick 1; a screen from the future sends pick 3.
    for (const pickNumber of [1, 3]) {
      expect(applyDraftAction(state, { type: "confirm", teamId: "OKC", side: "OVER", pickNumber }, TEAM_IDS)).toEqual({
        ok: false,
        error: "stale_pick",
      });
    }
  });

  it("rejects unknown teams", () => {
    const live = liveDraft();
    expect(applyDraftAction(live, pick(live, "XXX", "OVER"), TEAM_IDS)).toEqual({ ok: false, error: "unknown_team" });
  });

  it("blocks picks unless the draft is live", () => {
    const notStarted = createDraftState(SEATS, 11);
    expect(applyDraftAction(notStarted, pick(notStarted, "MIN", "OVER"), TEAM_IDS)).toEqual({
      ok: false,
      error: "not_live",
    });
    const paused = mustApply(liveDraft(), { type: "pause" });
    expect(applyDraftAction(paused, pick(paused, "MIN", "OVER"), TEAM_IDS)).toEqual({ ok: false, error: "not_live" });
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
    const sides: Array<[string, Side]> = [
      ["MIN", "OVER"], ["OKC", "OVER"], ["BOS", "UNDER"], ["CLE", "OVER"], ["MIN", "UNDER"], ["OKC", "UNDER"],
    ];
    for (const [teamId, side] of sides) state = mustApply(state, pick(state, teamId, side));
    expect(state.picks.map((p) => p.managerId)).toEqual(["m1", "m2", "m3", "m4", "m4", "m3"]);
    expect(managerOnTheClock(state)).toBe("m2");
    expect(picksForManager(state, "m4").map((p) => p.pickNumber)).toEqual([4, 5]);
  });

  it("opens the fade stage after the final pick", () => {
    let state = liveDraft(["m1", "m2"], 2);
    const sides: Array<[string, Side]> = [
      ["MIN", "OVER"], ["MIN", "UNDER"], ["OKC", "OVER"], ["OKC", "UNDER"],
    ];
    for (const [teamId, side] of sides) state = mustApply(state, pick(state, teamId, side));
    expect(state.status).toBe("fades");
    expect(currentPickNumber(state)).toBeNull();
    expect(managerOnTheClock(state)).toBeNull();
    expect(managerUpNext(state)).toBeNull();
    expect(applyDraftAction(state, pick(state, "BOS", "OVER"), TEAM_IDS)).toEqual({ ok: false, error: "not_live" });
    expect(applyDraftAction(state, { type: "pause" }, TEAM_IDS)).toEqual({ ok: false, error: "invalid_transition" });
  });
});
