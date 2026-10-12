import { SCORING, type ScoringConfig } from "@/config/scoring";
import type { Basis } from "@/lib/scoring";
import type { ScoredCall } from "@/lib/standings";
import type { DraftStatus } from "@/lib/types";

// Season awards: Best Pick and Worst Pick are the retained picks with the highest and lowest individual pick score on a
// basis, across the whole league. Pick scores come from evaluateCall (via the ScoredCalls computeStandings builds) and
// are compared before any award points, so an award never changes which pick wins one. Fades never take part.

export type AwardKind = "best" | "worst";

/** "pending": not decided on this basis yet, so nobody holds an award and no award points count. */
export type AwardStatus = "projected" | "final" | "pending";

/**
 * draft: the draft's picks aren't final yet. no_games: a drafted team hasn't played, so not every pick has a projection.
 * unsettled: a drafted team hasn't finished its regular season.
 */
export type AwardPendingReason = "draft" | "no_games" | "unsettled";

export interface PickAward {
  kind: AwardKind;
  /** The winning pick, with its own (unchanged) score. */
  call: ScoredCall;
  /** Award points to the pick's owner: SCORING.bestPickAward or worstPickAward. */
  points: number;
}

export interface SeasonAwards {
  basis: Basis;
  status: AwardStatus;
  pendingReason: AwardPendingReason | null;
  /** Every pick tied for the highest score, in pick order. Empty while pending. */
  best: PickAward[];
  /** Every pick tied for the lowest score, in pick order. Empty while pending. */
  worst: PickAward[];
}

/** Pick scores are compared unrounded; this only absorbs floating-point noise (equal paces from different divisions). */
const TIE_TOLERANCE = 1e-9;

/** Picks are final once regular drafting is over. */
const PICKS_FINAL: ReadonlySet<DraftStatus> = new Set(["fades", "complete"]);

/**
 * The awards on a basis, from every retained pick (the caller passes only eligible picks: kept, not voided, owned by a
 * league manager). Decided only when every pick is scored: projected once each drafted team has played, final once each
 * has finished. Otherwise pending, with no winners.
 */
export function decideAwards(
  calls: readonly ScoredCall[],
  basis: Basis,
  draftStatus: DraftStatus,
  config: ScoringConfig = SCORING,
): SeasonAwards {
  const pending = (pendingReason: AwardPendingReason): SeasonAwards => ({
    basis,
    status: "pending",
    pendingReason,
    best: [],
    worst: [],
  });
  if (!PICKS_FINAL.has(draftStatus) || calls.length === 0) return pending("draft");
  if (calls.some((call) => call.evaluation.status !== "scored")) {
    return pending(basis === "projected" ? "no_games" : "unsettled");
  }

  const score = (call: ScoredCall) => call.evaluation.points ?? 0;
  const ordered = [...calls].sort((a, b) => a.pick.pickNumber - b.pick.pickNumber);
  const high = Math.max(...ordered.map(score));
  const low = Math.min(...ordered.map(score));
  const winners = (kind: AwardKind, target: number, points: number): PickAward[] =>
    ordered.filter((call) => Math.abs(score(call) - target) <= TIE_TOLERANCE).map((call) => ({ kind, call, points }));
  return {
    basis,
    status: basis,
    pendingReason: null,
    best: winners("best", high, config.bestPickAward),
    worst: winners("worst", low, config.worstPickAward),
  };
}

/** The awards a manager's picks hold: Best Pick awards first, each in pick order. */
export function awardsFor(awards: SeasonAwards, managerId: string): PickAward[] {
  return [...awards.best, ...awards.worst].filter((award) => award.call.pick.managerId === managerId);
}

/** new: there was no leader before. held: the same picks lead. changed: different picks lead. */
export type AwardChange = "new" | "held" | "changed";

/** How each award's leaders moved between two decisions (e.g. the midseason projection and the final result). */
export function awardChanges(before: SeasonAwards, after: SeasonAwards): Record<AwardKind, AwardChange> {
  const change = (a: PickAward[], b: PickAward[]): AwardChange => {
    if (a.length === 0) return "new";
    const key = (list: PickAward[]) => list.map((award) => award.call.pick.pickNumber).join(",");
    return key(a) === key(b) ? "held" : "changed";
  };
  return { best: change(before.best, after.best), worst: change(before.worst, after.worst) };
}
