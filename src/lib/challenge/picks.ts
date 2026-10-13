import { CHALLENGE } from "@/config/challenge";
import { normalizeName } from "@/lib/league/commands";
import type { Side, TeamId } from "@/lib/types";
import type { ChallengePick, PickMap } from "./types";

export type SaveError = "invalid_picks" | "incomplete_entry" | "invalid_name";
export type ParsedSave = { ok: true; displayName: string; picks: PickMap } | { ok: false; error: SaveError };

const SIDES: ReadonlySet<unknown> = new Set<Side>(["OVER", "UNDER"]);

/** Checks a save request `{ displayName, picks: [{ teamId, side }] }`: exactly one side for every team, then the name. */
export function parseChallengeSave(body: Readonly<Record<string, unknown>>, teamIds: ReadonlySet<TeamId>): ParsedSave {
  if (!Array.isArray(body.picks)) return { ok: false, error: "invalid_picks" };
  const picks: Record<TeamId, Side> = {};
  for (const item of body.picks as unknown[]) {
    if (!item || typeof item !== "object") return { ok: false, error: "invalid_picks" };
    const { teamId, side } = item as { teamId?: unknown; side?: unknown };
    if (typeof teamId !== "string" || !teamIds.has(teamId) || !SIDES.has(side) || Object.hasOwn(picks, teamId)) {
      return { ok: false, error: "invalid_picks" };
    }
    picks[teamId] = side as Side;
  }
  if (Object.keys(picks).length !== teamIds.size) return { ok: false, error: "incomplete_entry" };
  const displayName = normalizeName(body.displayName, CHALLENGE.nameMaxLength);
  if (!displayName) return { ok: false, error: "invalid_name" };
  return { ok: true, displayName, picks };
}

/**
 * The picks to store for a save. A side that matches the stored one keeps its reference line and time; a new or
 * changed side takes the current line (null when there is none) and `now`. Sorted by team id.
 */
export function rebasePicks(
  stored: readonly ChallengePick[],
  submitted: PickMap,
  currentLines: Readonly<Record<TeamId, number>>,
  now: string,
): ChallengePick[] {
  const previous = new Map(stored.map((pick) => [pick.teamId, pick]));
  return Object.keys(submitted)
    .sort()
    .map((teamId) => {
      const side = submitted[teamId];
      const kept = previous.get(teamId);
      if (kept && kept.side === side) return kept;
      const line = currentLines[teamId];
      return { teamId, side, lineAtPick: Number.isFinite(line) ? line : null, pickedAt: now };
    });
}

export function pickMap(picks: readonly ChallengePick[]): PickMap {
  return Object.fromEntries(picks.map((pick) => [pick.teamId, pick.side]));
}
