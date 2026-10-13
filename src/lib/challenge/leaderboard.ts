import { formatDateTimeET } from "@/lib/format";
import { isLocked } from "./phase";
import type { ChallengePhase } from "./types";

/** The leaderboard's line under the title. `deadline` and `lockedAt` are ISO strings, null when unknown. */
export function leaderboardSubtitle(
  phase: ChallengePhase,
  entries: number,
  deadline: string | null,
  lockedAt: string | null,
): string {
  if (!isLocked(phase)) {
    const count = `${entries} ${entries === 1 ? "entry" : "entries"} saved.`;
    return deadline
      ? `${count} Picks and scores appear when the challenge locks at ${formatDateTimeET(deadline)}.`
      : `${count} Picks and scores appear when the challenge locks.`;
  }
  if (phase === "in_season") return "Ranked by projected score (win pace).";
  if (phase === "final") return "Final standings.";
  const locked = lockedAt ?? deadline;
  return `${locked ? `Locked ${formatDateTimeET(locked)}` : "Locked"}. Scores start with the first games.`;
}

/**
 * "On pace 7/12" in season, "Correct 20/30" once final; null while nothing is scored (never "0 on pace" before a game).
 * `score` null means the entry is unscored.
 */
export function paceText(phase: ChallengePhase, score: number | null, onPace: number, scored: number): string | null {
  if (score === null || scored === 0) return null;
  return `${phase === "final" ? "Correct" : "On pace"} ${onPace}/${scored}`;
}
