import type { TeamRecord } from "@/lib/records/types";
import { gamesPlayed, isSettled } from "@/lib/scoring";
import type { ChallengePhase, ChallengeSeason } from "./types";

export function challengePhase(
  season: Pick<ChallengeSeason, "deadline" | "frozen"> | null,
  now: Date,
  records: readonly TeamRecord[],
): ChallengePhase {
  if (season?.frozen) {
    if (records.length > 0 && records.every((record) => isSettled(record))) return "final";
    return records.some((record) => gamesPlayed(record) > 0) ? "in_season" : "locked";
  }
  if (!season?.deadline) return "schedule_unknown";
  return now.getTime() < Date.parse(season.deadline) ? "open" : "locking";
}

/** Entries are read-only in every phase but open and schedule_unknown. */
export function isLocked(phase: ChallengePhase): boolean {
  return phase !== "open" && phase !== "schedule_unknown";
}
