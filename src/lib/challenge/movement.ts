import { normalizeName } from "@/lib/league/commands";
import { CHALLENGE } from "@/config/challenge";
import type { TeamId } from "@/lib/types";
import { pickMap } from "./picks";
import type { ChallengeEntry, ChallengePick, PickMap } from "./types";

/** The current line minus the line when the pick was saved. Null when either is missing or they are equal. */
export function lineMove(reference: number | null, current: number | null): number | null {
  if (reference === null || current === null) return null;
  const move = current - reference;
  return move === 0 ? null : move;
}

/** Saved picks whose working side is unchanged and whose current line differs from the pick's reference line. */
export function movedTeams(
  saved: readonly ChallengePick[],
  working: PickMap,
  current: Readonly<Record<TeamId, number>>,
): TeamId[] {
  return saved
    .filter((pick) => working[pick.teamId] === pick.side)
    .filter((pick) => lineMove(pick.lineAtPick, Number.isFinite(current[pick.teamId]) ? current[pick.teamId] : null) !== null)
    .map((pick) => pick.teamId);
}

export const SAVE_PICKS = "Save Picks";
export const SAVE_AGAINST_UPDATED = "Save Picks Against Updated Lines";

/** Informational only: saving never changes which lines score. */
export function saveLabel(movedCount: number): string {
  return movedCount > 0 ? SAVE_AGAINST_UPDATED : SAVE_PICKS;
}

/** True when the working picks or name differ from the saved entry (with nothing saved: anything picked or named). */
export function hasUnsavedChanges(saved: ChallengeEntry | null, working: PickMap, name: string): boolean {
  const savedPicks: PickMap = saved ? pickMap(saved.picks) : {};
  const teams = new Set([...Object.keys(savedPicks), ...Object.keys(working)]);
  for (const teamId of teams) if (savedPicks[teamId] !== working[teamId]) return true;
  const typed = normalizeName(name, CHALLENGE.nameMaxLength) ?? name.trim();
  return typed !== (saved?.displayName ?? "");
}
