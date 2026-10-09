import "server-only";
import { LINES } from "@/config/lines";
import { TEAM_IDS } from "@/data/teams";
import { latestMarketLine, type TeamPageData } from "@/lib/team-detail";
import type { League } from "@/lib/types";
import { readGameLog } from "@/server/game-log";
import { teamInfoFor } from "@/server/league";
import { readLines } from "@/server/lines";

/** Everything the team page shows. Null for an unknown team id. The feed reads stream as promises; a failed feed only empties its own panel. */
export async function loadTeamPage(league: League, rawTeamId: string): Promise<TeamPageData | null> {
  const teamId = rawTeamId.toUpperCase();
  if (!TEAM_IDS.has(teamId)) return null;
  const teamInfo = await teamInfoFor(league);
  const info = teamInfo.find((team) => team.id === teamId);
  if (!info) return null;
  // The outside feeds are not awaited: the page renders now and each panel streams in when its read settles.
  // Both reads catch their own failures, so neither promise rejects.
  const gameLog = readGameLog(league, teamId);
  const market = readLines().then((read) => latestMarketLine(read, LINES.book, league.seasonLabel, teamId));
  return {
    league,
    info,
    lockedLine: league.lines?.values[teamId] ?? null,
    teamOptions: teamInfo
      .map((team) => ({ id: team.id, label: `${team.city} ${team.name}` }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    gameLog,
    market,
  };
}
