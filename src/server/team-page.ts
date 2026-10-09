import "server-only";
import { LINES } from "@/config/lines";
import { TEAM_IDS } from "@/data/teams";
import { latestMarketLine, type TeamPageData } from "@/lib/team-detail";
import type { League } from "@/lib/types";
import { readGameLog } from "@/server/game-log";
import { teamInfoFor } from "@/server/league";
import { readLines } from "@/server/lines";

/** Everything the team page shows. Null for an unknown team id. A failed feed only empties its own panel. */
export async function loadTeamPage(league: League, rawTeamId: string): Promise<TeamPageData | null> {
  const teamId = rawTeamId.toUpperCase();
  if (!TEAM_IDS.has(teamId)) return null;
  const [teamInfo, gameLog, read] = await Promise.all([teamInfoFor(league), readGameLog(league, teamId), readLines()]);
  const info = teamInfo.find((team) => team.id === teamId);
  if (!info) return null;
  return {
    league,
    info,
    lockedLine: league.lines?.values[teamId] ?? null,
    teamOptions: teamInfo
      .map((team) => ({ id: team.id, label: `${team.city} ${team.name}` }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    gameLog,
    market: latestMarketLine(read, LINES.book, league.seasonLabel, teamId),
  };
}
