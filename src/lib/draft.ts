import type { DraftPick, DraftState, Side, TeamId } from "@/lib/types";

export function totalPicks(managerCount: number, rounds: number): number {
  return managerCount * rounds;
}

/** 1-based round for a 1-based overall pick number. */
export function roundOf(pickNumber: number, managerCount: number): number {
  return Math.ceil(pickNumber / managerCount);
}

/** 0-based seat on the clock for a 1-based overall pick. Odd rounds run forward, even rounds backward. */
export function seatForPick(pickNumber: number, managerCount: number): number {
  const indexInRound = (pickNumber - 1) % managerCount;
  return roundOf(pickNumber, managerCount) % 2 === 1 ? indexInRound : managerCount - 1 - indexInRound;
}

/** Overall pick number for a 1-based round and a 0-based seat. Inverse of seatForPick. */
export function pickNumberFor(round: number, seat: number, managerCount: number): number {
  const indexInRound = round % 2 === 1 ? seat : managerCount - 1 - seat;
  return (round - 1) * managerCount + indexInRound + 1;
}

export function createDraftState(seatOrder: string[], rounds: number): DraftState {
  return { status: "not_started", rounds, seatOrder, picks: [] };
}

export function draftTotalPicks(state: DraftState): number {
  return totalPicks(state.seatOrder.length, state.rounds);
}

/** The pick being made now, or null once every pick is in. */
export function currentPickNumber(state: DraftState): number | null {
  const next = state.picks.length + 1;
  return next > draftTotalPicks(state) ? null : next;
}

function managerForPick(state: DraftState, pickNumber: number): string | null {
  if (pickNumber > draftTotalPicks(state)) return null;
  return state.seatOrder[seatForPick(pickNumber, state.seatOrder.length)];
}

export function managerOnTheClock(state: DraftState): string | null {
  const pickNumber = currentPickNumber(state);
  return pickNumber === null ? null : managerForPick(state, pickNumber);
}

export function managerUpNext(state: DraftState): string | null {
  const pickNumber = currentPickNumber(state);
  return pickNumber === null ? null : managerForPick(state, pickNumber + 1);
}

export function findPickForSide(state: DraftState, teamId: TeamId, side: Side): DraftPick | undefined {
  return state.picks.find((pick) => pick.teamId === teamId && pick.side === side);
}

export function picksForManager(state: DraftState, managerId: string): DraftPick[] {
  return state.picks.filter((pick) => pick.managerId === managerId);
}

/** True when the manager already holds a side of this team. A manager may hold at most one side per team. */
export function holdsTeam(state: DraftState, managerId: string, teamId: TeamId): boolean {
  return state.picks.some((pick) => pick.managerId === managerId && pick.teamId === teamId);
}

export type DraftAction =
  /** `lines` are the lines the commissioner reviewed; the start fails with lines_changed if they no longer match. */
  | { type: "start"; lines?: Readonly<Record<TeamId, number>> }
  | { type: "pause" }
  | { type: "resume" }
  /** pickNumber is the pick the client believes it is making; a stale screen or a double click fails with stale_pick. */
  | { type: "confirm"; teamId: TeamId; side: Side; pickNumber: number };

export type DraftError =
  | "invalid_transition"
  | "not_live"
  | "side_taken"
  | "unknown_team"
  | "stale_pick"
  | "team_already_held";

export type DraftResult = { ok: true; state: DraftState } | { ok: false; error: DraftError };

/**
 * Applies one draft action. Who is allowed to act is decided by the caller (see league/permissions);
 * this only enforces draft rules: status transitions, the expected pick number, side availability, one side per team
 * per manager, and snake order.
 */
export function applyDraftAction(state: DraftState, action: DraftAction, teamIds: ReadonlySet<TeamId>): DraftResult {
  switch (action.type) {
    case "start":
      return state.status === "not_started" ? ok({ ...state, status: "live" }) : fail("invalid_transition");
    case "pause":
      return state.status === "live" ? ok({ ...state, status: "paused" }) : fail("invalid_transition");
    case "resume":
      return state.status === "paused" ? ok({ ...state, status: "live" }) : fail("invalid_transition");
    case "confirm": {
      if (state.status !== "live") return fail("not_live");
      const pickNumber = state.picks.length + 1;
      if (action.pickNumber !== pickNumber) return fail("stale_pick");
      if (!teamIds.has(action.teamId)) return fail("unknown_team");
      if (findPickForSide(state, action.teamId, action.side)) return fail("side_taken");
      const managerId = managerForPick(state, pickNumber);
      if (managerId === null) return fail("not_live");
      if (holdsTeam(state, managerId, action.teamId)) return fail("team_already_held");
      const picks = [...state.picks, { pickNumber, managerId, teamId: action.teamId, side: action.side }];
      return ok({ ...state, picks, status: picks.length === draftTotalPicks(state) ? "complete" : "live" });
    }
  }
}

function ok(state: DraftState): DraftResult {
  return { ok: true, state };
}

function fail(error: DraftError): DraftResult {
  return { ok: false, error };
}
