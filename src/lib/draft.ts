import type { DraftPick, DraftState, Side, TeamId } from "@/lib/types";

const ALL_SIDES: readonly Side[] = ["OVER", "UNDER"];

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
  return { status: "not_started", rounds, seatOrder, picks: [], voidedPicks: [], blockedPick: null };
}

export function draftTotalPicks(state: DraftState): number {
  return totalPicks(state.seatOrder.length, state.rounds);
}

/** The pick being made now, or null once regular drafting is over (every pick in, or ended early). */
export function currentPickNumber(state: DraftState): number | null {
  if (state.status === "fades" || state.status === "complete") return null;
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

/** Rounds every manager finished. After an early end, the rounds whose picks were kept. */
export function completedRounds(state: DraftState): number {
  return Math.floor(state.picks.length / state.seatOrder.length);
}

/** True when the manager may take at least one open side: a side nobody holds, on a team they don't hold. */
export function hasEligibleSide(state: DraftState, managerId: string, teamIds: ReadonlySet<TeamId>): boolean {
  for (const teamId of teamIds) {
    if (holdsTeam(state, managerId, teamId)) continue;
    if (ALL_SIDES.some((side) => !findPickForSide(state, teamId, side))) return true;
  }
  return false;
}

/**
 * Ends regular drafting because the manager on the clock at blockedPick has no eligible side. Only fully completed
 * rounds are kept; the cut-short round's picks are voided (their sides are unclaimed again) and the fade stage opens.
 */
function endEarly(state: DraftState, blockedPick: number): DraftState {
  const managerCount = state.seatOrder.length;
  const kept = Math.floor((blockedPick - 1) / managerCount) * managerCount;
  return {
    ...state,
    status: "fades",
    picks: state.picks.slice(0, kept),
    voidedPicks: state.picks.slice(kept),
    blockedPick,
  };
}

/** Why and where regular drafting stopped early, for the draft room. */
export interface EarlyEnd {
  blockedPick: number;
  /** The manager who had no eligible side at blockedPick. */
  blockedManagerId: string;
  /** The round regular drafting stopped in. */
  blockedRound: number;
  configuredRounds: number;
  completedRounds: number;
  /** The cut-short round's picks; empty when it stopped on a round's first pick. */
  voidedPicks: DraftPick[];
  /** Every side nobody holds, voided ones included, in team order with the Over first. */
  unclaimedSides: Array<{ teamId: TeamId; side: Side }>;
}

/** Null unless the draft ended early. teamIds gives the order of unclaimedSides. */
export function earlyEnd(state: DraftState, teamIds: readonly TeamId[]): EarlyEnd | null {
  if (state.blockedPick === null) return null;
  const managerCount = state.seatOrder.length;
  return {
    blockedPick: state.blockedPick,
    blockedManagerId: state.seatOrder[seatForPick(state.blockedPick, managerCount)],
    blockedRound: roundOf(state.blockedPick, managerCount),
    configuredRounds: state.rounds,
    completedRounds: completedRounds(state),
    voidedPicks: state.voidedPicks,
    unclaimedSides: teamIds.flatMap((teamId) =>
      ALL_SIDES.filter((side) => !findPickForSide(state, teamId, side)).map((side) => ({ teamId, side })),
    ),
  };
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
 * per manager, and snake order. The last pick opens the fade stage (see fades.ts); so does a pick after which the next manager has no eligible side (see endEarly).
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
      const next: DraftState = { ...state, picks };
      if (picks.length === draftTotalPicks(state)) return ok({ ...next, status: "fades" });
      // Never end early while the next manager has a side to take; when they have none, nobody drafts again.
      const nextManagerId = managerForPick(next, pickNumber + 1)!;
      return ok(hasEligibleSide(next, nextManagerId, teamIds) ? next : endEarly(next, pickNumber + 1));
    }
  }
}

function ok(state: DraftState): DraftResult {
  return { ok: true, state };
}

function fail(error: DraftError): DraftResult {
  return { ok: false, error };
}
