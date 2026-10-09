import { SCORING, type ScoringConfig } from "@/config/scoring";
import type { Side, Team } from "@/lib/types";

export type Basis = "projected" | "final";
export type EvaluationStatus = "scored" | "not_available" | "pending";

type RecordLike = Pick<Team, "wins" | "losses">;

export function gamesPlayed(record: RecordLike): number {
  return record.wins + record.losses;
}

/** Wins ÷ games played × season length. Null when no games have been played. */
export function projectWins(record: RecordLike, config: ScoringConfig = SCORING): number | null {
  const played = gamesPlayed(record);
  if (played === 0) return null;
  return (record.wins / played) * config.seasonGames;
}

/** A pick settles once its team has completed the regular season. */
export function isSettled(record: RecordLike, config: ScoringConfig = SCORING): boolean {
  return gamesPlayed(record) >= config.seasonGames;
}

/** Over: wins − line. Under: line − wins. Positive means the call is on the right side. */
export function signedMargin(side: Side, line: number, wins: number): number {
  return side === "OVER" ? wins - line : line - wins;
}

/** A margin of exactly 0 is a push: final wins (or the pace) equal the line, and the call earns nothing. */
export function callPoints(margin: number, config: ScoringConfig = SCORING): number {
  if (margin === 0) return 0;
  const base = margin > 0 ? config.correctCall : config.missedCall;
  return base + margin * config.marginWeight;
}

export interface CallEvaluation {
  basis: Basis;
  status: EvaluationStatus;
  /** Projected wins (projected basis) or final wins (final basis). Null unless scored. */
  wins: number | null;
  margin: number | null;
  correct: boolean | null;
  /** True when the margin is exactly 0. A push is neither correct nor missed. Null unless scored. */
  push: boolean | null;
  points: number | null;
}

export function evaluateCall(
  side: Side,
  team: Team,
  basis: Basis,
  config: ScoringConfig = SCORING,
): CallEvaluation {
  let wins: number | null;
  if (basis === "projected") {
    wins = projectWins(team, config);
    if (wins === null) return unscored(basis, "not_available");
  } else {
    if (!isSettled(team, config)) return unscored(basis, "pending");
    wins = team.wins;
  }
  const margin = signedMargin(side, team.line, wins);
  return { basis, status: "scored", wins, margin, correct: margin > 0, push: margin === 0, points: callPoints(margin, config) };
}

function unscored(basis: Basis, status: Exclude<EvaluationStatus, "scored">): CallEvaluation {
  return { basis, status, wins: null, margin: null, correct: null, push: null, points: null };
}

export interface FadeEvaluation {
  basis: Basis;
  status: EvaluationStatus;
  /** True when the targeted pick misses (a push is not a miss). Null unless scored. */
  targetMissed: boolean | null;
  points: number | null;
}

/** A fade scores off its target: the bonus when the target misses, nothing when it hits or pushes. */
export function evaluateFade(target: CallEvaluation, config: ScoringConfig = SCORING): FadeEvaluation {
  if (target.status !== "scored") {
    return { basis: target.basis, status: target.status, targetMissed: null, points: null };
  }
  const targetMissed = target.correct === false && target.push === false;
  return {
    basis: target.basis,
    status: "scored",
    targetMissed,
    points: targetMissed ? config.fadeHit : config.fadeMiss,
  };
}
