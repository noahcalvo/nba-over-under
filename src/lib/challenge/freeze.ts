import { isValidLine } from "@/lib/lines";
import type { TeamId } from "@/lib/types";
import type { LineSnapshot } from "./types";

export interface FreezeResult {
  values: Record<TeamId, number>;
  observedAt: Record<TeamId, string>;
  /** Sorted. */
  missing: TeamId[];
  /** The newest pre-deadline snapshot's source; null without one. */
  source: string | null;
}

/**
 * The shared scoring lines: for each team, its line in the newest snapshot observed strictly before the deadline that
 * has one. A team never observed before the deadline is missing — never filled in, never zero.
 */
export function freezeFromSnapshots(
  snapshots: readonly LineSnapshot[],
  deadline: string,
  teamIds: readonly TeamId[],
): FreezeResult {
  const cutoff = Date.parse(deadline);
  const before = snapshots
    .filter((snapshot) => Date.parse(snapshot.observedAt) < cutoff)
    .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt));
  const values: Record<TeamId, number> = {};
  const observedAt: Record<TeamId, string> = {};
  const missing: TeamId[] = [];
  for (const teamId of teamIds) {
    const snapshot = before.find((candidate) => isValidLine(candidate.lines[teamId]));
    if (snapshot) {
      values[teamId] = snapshot.lines[teamId];
      observedAt[teamId] = snapshot.observedAt;
    } else missing.push(teamId);
  }
  return { values, observedAt, missing: missing.sort(), source: before[0]?.source ?? null };
}
