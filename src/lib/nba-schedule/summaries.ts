import {
  challengeInterest,
  interestSummary,
  leagueInterests,
  type ChallengeStakeInput,
  type InterestLeague,
  type InterestSummary,
} from "@/lib/nba-schedule/interest";
import type { NbaGame } from "@/lib/nba-schedule/types";

/**
 * Who is on each game, by game id. A game whose summary cannot be built (malformed stored data) is left out rather
 * than failing the others; the caller shows no interest for it.
 */
export function gameSummaries(
  games: readonly NbaGame[],
  stakes: { leagues: readonly InterestLeague[]; challenge: ChallengeStakeInput | null },
  season: number,
): Record<string, InterestSummary> {
  const summaries: Record<string, InterestSummary> = {};
  for (const game of games) {
    try {
      const teams = { awayId: game.away.teamId, homeId: game.home.teamId };
      summaries[game.id] = interestSummary(
        leagueInterests(stakes.leagues, teams),
        challengeInterest(stakes.challenge, season, teams),
      );
    } catch {
      // Skipped: this game shows no interest.
    }
  }
  return summaries;
}
