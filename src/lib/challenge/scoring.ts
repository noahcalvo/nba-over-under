import { CHALLENGE } from "@/config/challenge";
import { SCORING, type ScoringConfig } from "@/config/scoring";
import { evaluateCall, type Basis, type CallEvaluation } from "@/lib/scoring";
import type { TeamId, TeamInfo } from "@/lib/types";
import type { ChallengePick } from "./types";

export interface ScoredPick {
  pick: ChallengePick;
  team: TeamInfo;
  /** The frozen line; null when the team has none (unavailable for every entry). */
  line: number | null;
  /** Null when the line is missing. */
  projected: CallEvaluation | null;
  final: CallEvaluation | null;
}

export interface EntryScore {
  /** In the order of `picks`. */
  picks: ScoredPick[];
  /** Sum of projected points over picks whose team has played. Null until one has. */
  projectedTotal: number | null;
  projectedScored: number;
  /** Projected picks on the right side of the line (a push is not on pace). */
  onPace: number;
  /** Sum of final points. Null until every pick with a frozen line is settled. */
  finalTotal: number | null;
  finalScored: number;
  /** Picks without a frozen line. */
  unavailable: number;
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

/** An entry against the shared frozen lines, through evaluateCall on both bases. */
export function scoreEntry(
  picks: readonly ChallengePick[],
  teams: readonly TeamInfo[],
  frozen: Readonly<Record<TeamId, number>>,
  config: ScoringConfig = SCORING,
): EntryScore {
  const byId = new Map(teams.map((team) => [team.id, team]));
  const scored = picks.map((pick): ScoredPick => {
    const team = byId.get(pick.teamId);
    if (!team) throw new Error(`Unknown team ${pick.teamId}`);
    const line = Number.isFinite(frozen[pick.teamId]) ? frozen[pick.teamId] : null;
    if (line === null) return { pick, team, line, projected: null, final: null };
    const withLine = { ...team, line };
    return {
      pick,
      team,
      line,
      projected: evaluateCall(pick.side, withLine, "projected", config),
      final: evaluateCall(pick.side, withLine, "final", config),
    };
  });
  const available = scored.filter((entry) => entry.line !== null);
  const projected = available.flatMap((entry) => (entry.projected?.status === "scored" ? [entry.projected] : []));
  const final = available.flatMap((entry) => (entry.final?.status === "scored" ? [entry.final] : []));
  return {
    picks: scored,
    projectedTotal: projected.length > 0 ? sum(projected.map((evaluation) => evaluation.points ?? 0)) : null,
    projectedScored: projected.length,
    onPace: projected.filter((evaluation) => evaluation.correct).length,
    finalTotal:
      available.length > 0 && final.length === available.length ? sum(final.map((evaluation) => evaluation.points ?? 0)) : null,
    finalScored: final.length,
    unavailable: scored.length - available.length,
  };
}

export function entryTotal(score: EntryScore, basis: Basis): number | null {
  return basis === "final" ? score.finalTotal : score.projectedTotal;
}

export interface RankedRow<T> {
  entry: T;
  score: number | null;
  /** Shared by tied scores (1, 1, 3). Null when unscored. */
  rank: number | null;
}

/**
 * Highest score first; ties (within CHALLENGE.tieTolerance) share a rank and list by name, then id. Unscored entries
 * come last, by name, without a rank — before any game every entry is unscored.
 */
export function rankEntries<T extends { id: string; displayName: string }>(
  rows: ReadonlyArray<{ entry: T; score: number | null }>,
  tolerance: number = CHALLENGE.tieTolerance,
): RankedRow<T>[] {
  const byName = (a: T, b: T) =>
    a.displayName.localeCompare(b.displayName, "en", { sensitivity: "base" }) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const scored = rows.filter((row): row is { entry: T; score: number } => row.score !== null);
  scored.sort((a, b) => (Math.abs(a.score - b.score) <= tolerance ? byName(a.entry, b.entry) : b.score - a.score));
  const ranked: RankedRow<T>[] = [];
  scored.forEach((row, index) => {
    const previous = ranked[index - 1];
    const tied = previous?.score != null && Math.abs(previous.score - row.score) <= tolerance;
    ranked.push({ entry: row.entry, score: row.score, rank: tied ? previous.rank : index + 1 });
  });
  const unscored = rows
    .filter((row) => row.score === null)
    .sort((a, b) => byName(a.entry, b.entry))
    .map((row) => ({ entry: row.entry, score: null, rank: null }));
  return [...ranked, ...unscored];
}
