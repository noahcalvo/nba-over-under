import {
  challengeInterest,
  leagueInterests,
  rootingSplit,
  yourStakes,
  type ChallengeInterest,
  type ChallengeStakeInput,
  type InterestLeague,
  type LeagueInterest,
  type YourStake,
} from "@/lib/nba-schedule/interest";
import type { GameTeams } from "@/lib/nba-schedule/types";
import type { TeamId } from "@/lib/types";

/** What the viewer's leagues and challenge entry have riding on one game. */
export interface GameStakes {
  /** One entry per league the viewer sits in, most recently joined first (the order given). */
  leagues: LeagueInterest[];
  challenge: ChallengeInterest | null;
  /** The viewer's own rows only. */
  yours: YourStake[];
  /** How many rows root for each of the game's two teams. */
  split: Record<TeamId, number>;
  seated: { id: string; name: string }[];
}

export const NO_STAKES: GameStakes = { leagues: [], challenge: null, yours: [], split: {}, seated: [] };

/** All of one game's stakes in one pass. Throws on malformed stored data; the caller decides how to degrade. */
export function gameStakes(
  stakes: {
    leagues: readonly InterestLeague[];
    challenge: ChallengeStakeInput | null;
    seated: readonly { id: string; name: string }[];
  },
  season: number,
  game: GameTeams,
): GameStakes {
  const leagues = leagueInterests(stakes.leagues, game);
  const challenge = challengeInterest(stakes.challenge, season, game);
  return {
    leagues,
    challenge,
    yours: yourStakes(leagues, challenge),
    split: rootingSplit(leagues, challenge, game),
    seated: stakes.seated.map((seat) => ({ id: seat.id, name: seat.name })),
  };
}
