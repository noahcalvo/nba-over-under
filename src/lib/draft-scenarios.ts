import { TEAM_IDS, TEAM_INFO } from "@/data/teams";
import { applyDraftAction, createDraftState, findPickForSide, holdsTeam, seatForPick } from "@/lib/draft";
import type { DraftState, Side, TeamId } from "@/lib/types";

// Scripted drafts for tests. Every confirm goes through applyDraftAction, so all draft rules (including the early end)
// apply. Seats are m1…mN with all 30 teams.

export interface SideChoice {
  teamId: TeamId;
  side: Side;
}

/** Every side: each team's Over in team order, then each team's Under. */
export const SIDE_ORDER: readonly SideChoice[] = [
  ...TEAM_INFO.map((team) => ({ teamId: team.id, side: "OVER" as const })),
  ...TEAM_INFO.map((team) => ({ teamId: team.id, side: "UNDER" as const })),
];

export function seatIds(managerCount: number): string[] {
  return Array.from({ length: managerCount }, (_, seat) => `m${seat + 1}`);
}

export function startedDraft(managerCount: number, rounds: number): DraftState {
  const result = applyDraftAction(createDraftState(seatIds(managerCount), rounds), { type: "start" }, TEAM_IDS);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

/** Confirms a side for the pick on the clock; throws if the rules refuse it. */
export function confirmNext(state: DraftState, choice: SideChoice): DraftState {
  const pickNumber = state.picks.length + 1;
  const result = applyDraftAction(state, { type: "confirm", ...choice, pickNumber }, TEAM_IDS);
  if (!result.ok) throw new Error(`pick ${pickNumber}: ${result.error}`);
  return result.state;
}

function onClock(state: DraftState): string {
  return state.seatOrder[seatForPick(state.picks.length + 1, state.seatOrder.length)];
}

function canTake(state: DraftState, managerId: string, choice: SideChoice): boolean {
  return !findPickForSide(state, choice.teamId, choice.side) && !holdsTeam(state, managerId, choice.teamId);
}

function playOut(state: DraftState, sidesFor: (managerId: string) => readonly SideChoice[]): DraftState {
  while (state.status === "live") {
    const managerId = onClock(state);
    const choice = sidesFor(managerId).find((candidate) => canTake(state, managerId, candidate));
    if (!choice) throw new Error(`no scripted side for ${managerId} at pick ${state.picks.length + 1}`);
    state = confirmNext(state, choice);
  }
  return state;
}

/** Every pick takes the first side in SIDE_ORDER the manager may hold. Nobody is ever blocked (tested for every size). */
export function plainDraft(managerCount: number, rounds: number): DraftState {
  return playOut(startedDraft(managerCount, rounds), () => SIDE_ORDER);
}

/**
 * Plays picks 1 … blockedPick − 1 so the manager on the clock at blockedPick has no eligible side: they take the Overs of
 * the last teams, everyone else uses up every other side first and then those teams' Unders. Throws unless the draft ends
 * early exactly at blockedPick (it needs blockedPick ≥ 61 − the blocked manager's earlier picks).
 */
export function blockedDraft(managerCount: number, rounds: number, blockedPick: number): DraftState {
  const blockedSeat = seatForPick(blockedPick, managerCount);
  let earlierPicks = 0;
  for (let pickNumber = 1; pickNumber < blockedPick; pickNumber++) {
    if (seatForPick(pickNumber, managerCount) === blockedSeat) earlierPicks++;
  }
  const reserved = TEAM_INFO.slice(TEAM_INFO.length - earlierPicks).map((team) => team.id);
  const blockedSides = reserved.map((teamId) => ({ teamId, side: "OVER" as const }));
  const otherSides = [
    ...SIDE_ORDER.filter((choice) => !reserved.includes(choice.teamId)),
    ...reserved.map((teamId) => ({ teamId, side: "UNDER" as const })),
  ];
  const blocked = seatIds(managerCount)[blockedSeat];
  const state = playOut(startedDraft(managerCount, rounds), (managerId) =>
    managerId === blocked ? blockedSides : otherSides,
  );
  if (state.blockedPick !== blockedPick) {
    throw new Error(`expected the draft to end early at pick ${blockedPick}, got ${state.blockedPick}`);
  }
  return state;
}

/** Every confirm a scripted draft made, kept and voided, in pick order. */
export function confirmsOf(state: DraftState): Array<SideChoice & { pickNumber: number }> {
  return [...state.picks, ...state.voidedPicks]
    .sort((a, b) => a.pickNumber - b.pickNumber)
    .map(({ pickNumber, teamId, side }) => ({ pickNumber, teamId, side }));
}
