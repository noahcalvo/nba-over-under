import { interestSummary, leagueInterests, type InterestLeague, type InterestSummary } from "@/lib/nba-schedule/interest";
import type { NbaGame } from "@/lib/nba-schedule/types";

/**
 * Who is on each game, by game id (league picks and fades; see `interestSummary`). A game whose summary cannot be built
 * (malformed stored data) is left out rather than failing the others and counted in `skipped`, so the caller can log
 * it (this module has no logging).
 */
export function gameSummaries(
  games: readonly NbaGame[],
  stakes: { leagues: readonly InterestLeague[] },
): { summaries: Record<string, InterestSummary>; skipped: number } {
  const summaries: Record<string, InterestSummary> = {};
  let skipped = 0;
  for (const game of games) {
    try {
      const teams = { awayId: game.away.teamId, homeId: game.home.teamId };
      summaries[game.id] = interestSummary(leagueInterests(stakes.leagues, teams));
    } catch {
      skipped += 1;
    }
  }
  return { summaries, skipped };
}
