import { TEAM_IDS } from "@/data/teams";
import type { DraftCommand } from "@/lib/fades";
import { decideDraftAction } from "@/lib/league/commands";
import type { Result } from "@/lib/league/errors";
import type { League } from "@/lib/types";

/**
 * Applies one command to the demo league exactly as the draft endpoint decides it (decideDraftAction: permissions, turn,
 * pick number, side and team rules, fade rules), then bumps the version as a save would. Nothing is stored or sent.
 */
export function applyTutorialCommand(league: League, actorId: string, command: DraftCommand): Result<League> {
  const result = decideDraftAction(league, actorId, command, TEAM_IDS, null);
  return result.ok ? { ok: true, value: { ...result.value, version: league.version + 1 } } : result;
}
