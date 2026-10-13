import { SCORING, type ScoringConfig } from "@/config/scoring";
import { awardsFor, decideAwards, type PickAward, type SeasonAwards } from "@/lib/awards";
import { evaluateCall, evaluateFade, type Basis, type CallEvaluation, type FadeEvaluation } from "@/lib/scoring";
import type { DraftPick, Fade, League, Team, TeamId } from "@/lib/types";

export type TeamLookup = Readonly<Record<TeamId, Team>>;
export type ScoringInput = Pick<League, "managers" | "draft" | "fades">;

export interface ScoredCall {
  pick: DraftPick;
  team: Team;
  evaluation: CallEvaluation;
}

export interface ScoredFade {
  fade: Fade;
  target: ScoredCall;
  evaluation: FadeEvaluation;
}

export interface ManagerResult {
  managerId: string;
  /** In pick order. */
  calls: ScoredCall[];
  fades: ScoredFade[];
  /** Season awards this manager's picks hold on this basis (Best Pick first). Empty while awards are pending. */
  awards: PickAward[];
  callPoints: number;
  fadePoints: number;
  /** Sum of the awards' points: kept apart from callPoints, so a pick's own score never includes an award. */
  awardPoints: number;
  /** callPoints + fadePoints + awardPoints. */
  totalPoints: number;
  /** Sum of signed margins over scored calls. */
  totalMargin: number;
  /** Scored calls on the right side of the line. */
  correctCalls: number;
  scoredCalls: number;
  /** Calls and fades that are not scored yet (pending or not available). */
  pendingItems: number;
}

export interface StandingRow extends ManagerResult {
  rank: number;
  gapToFirst: number;
}

export interface Standings {
  basis: Basis;
  /** Ranked by total points, then total margin, then seat. */
  rows: StandingRow[];
  /** The draft is complete and every pick and fade is scored. Final standings are "Partial results" until then. */
  complete: boolean;
  /** At least one call is scored on this basis. */
  anyScored: boolean;
  /** Best Pick and Worst Pick on this basis, already counted in each owner's total. */
  awards: SeasonAwards;
}

export function computeStandings(
  input: ScoringInput,
  teams: TeamLookup,
  basis: Basis,
  config: ScoringConfig = SCORING,
): Standings {
  const callsByPick = new Map<number, ScoredCall>();
  for (const pick of input.draft.picks) {
    const team = teams[pick.teamId];
    if (!team) throw new Error(`Unknown team ${pick.teamId} at pick ${pick.pickNumber}`);
    callsByPick.set(pick.pickNumber, { pick, team, evaluation: evaluateCall(pick.side, team, basis, config) });
  }
  const managerIds = new Set(input.managers.map((manager) => manager.id));
  const awards = decideAwards(
    [...callsByPick.values()].filter((call) => managerIds.has(call.pick.managerId)),
    basis,
    input.draft.status,
    config,
  );

  const results = input.managers.map((manager): ManagerResult & { seat: number } => {
    const calls = input.draft.picks
      .filter((pick) => pick.managerId === manager.id)
      .map((pick) => callsByPick.get(pick.pickNumber)!);
    const fades = input.fades
      .filter((fade) => fade.managerId === manager.id)
      .flatMap((fade): ScoredFade[] => {
        const target = callsByPick.get(fade.targetPickNumber);
        return target ? [{ fade, target, evaluation: evaluateFade(target.evaluation, config) }] : [];
      });
    const scored = calls.filter((call) => call.evaluation.status === "scored");
    const callPoints = sum(scored.map((call) => call.evaluation.points ?? 0));
    const fadePoints = sum(fades.map((fade) => fade.evaluation.points ?? 0));
    const managerAwards = awardsFor(awards, manager.id);
    const awardPoints = sum(managerAwards.map((award) => award.points));
    return {
      managerId: manager.id,
      seat: manager.seat,
      calls,
      fades,
      awards: managerAwards,
      callPoints,
      fadePoints,
      awardPoints,
      totalPoints: callPoints + fadePoints + awardPoints,
      totalMargin: sum(scored.map((call) => call.evaluation.margin ?? 0)),
      correctCalls: scored.filter((call) => call.evaluation.correct).length,
      scoredCalls: scored.length,
      pendingItems:
        calls.length - scored.length + fades.filter((fade) => fade.evaluation.status !== "scored").length,
    };
  });

  results.sort((a, b) => b.totalPoints - a.totalPoints || b.totalMargin - a.totalMargin || a.seat - b.seat);
  const leaderPoints = results[0]?.totalPoints ?? 0;
  const rows = results.map((result, index): StandingRow => ({
    managerId: result.managerId,
    calls: result.calls,
    fades: result.fades,
    awards: result.awards,
    callPoints: result.callPoints,
    fadePoints: result.fadePoints,
    awardPoints: result.awardPoints,
    totalPoints: result.totalPoints,
    totalMargin: result.totalMargin,
    correctCalls: result.correctCalls,
    scoredCalls: result.scoredCalls,
    pendingItems: result.pendingItems,
    rank: index + 1,
    gapToFirst: leaderPoints - result.totalPoints,
  }));

  const allCalls = [...callsByPick.values()];
  return {
    basis,
    rows,
    complete: input.draft.status === "complete" && rows.every((row) => row.pendingItems === 0),
    anyScored: allCalls.some((call) => call.evaluation.status === "scored"),
    awards,
  };
}

/** Scored calls closest to flipping, by smallest absolute margin. */
export function closestCalls(result: ManagerResult, count = 3): ScoredCall[] {
  return result.calls
    .filter((call) => call.evaluation.status === "scored")
    .sort(
      (a, b) =>
        Math.abs(a.evaluation.margin ?? 0) - Math.abs(b.evaluation.margin ?? 0) || a.pick.pickNumber - b.pick.pickNumber,
    )
    .slice(0, count);
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
