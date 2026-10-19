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
  /** True when something the viewer has riding on the game could not be loaded, so what shows may be incomplete. */
  failed: boolean;
}

export const NO_STAKES: GameStakes = { leagues: [], challenge: null, yours: [], split: {}, seated: [], failed: false };

/** What the "Who's on this game?" panel shows: the leagues and challenge, a note over partial data, an error, or the join prompt. */
export type StakesPanelState = "content" | "partial" | "failed" | "join";

export function stakesPanelState(stakes: Pick<GameStakes, "leagues" | "challenge" | "failed">): StakesPanelState {
  const loaded = stakes.leagues.length > 0 || stakes.challenge !== null;
  if (stakes.failed) return loaded ? "partial" : "failed";
  return loaded ? "content" : "join";
}

/** All of one game's stakes in one pass. Throws on malformed stored data; the caller decides how to degrade. */
export function gameStakes(
  stakes: {
    leagues: readonly InterestLeague[];
    challenge: ChallengeStakeInput | null;
    seated: readonly { id: string; name: string }[];
    failed: boolean;
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
    failed: stakes.failed,
  };
}
