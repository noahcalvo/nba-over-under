import type { TeamId } from "@/lib/types";

export type GameResult = "W" | "L";

/** One regular-season game of one team. */
export interface Game {
  /** 1-based game number within the regular season, by date. */
  number: number;
  /** ISO 8601 tip-off time; null when unknown (mock data). */
  date: string | null;
  /** Our team id; null when the opponent is not one of the 30, or unknown (mock data). */
  opponentId: TeamId | null;
  /** Null when unknown (mock data). */
  home: boolean | null;
  /** Null until the game is completed. */
  result: GameResult | null;
}

/** A team's regular-season games, completed and upcoming, in game-number order. */
export interface GameLog {
  /** Season end year: 2027 for 2026–27. */
  season: number;
  teamId: TeamId;
  games: Game[];
}

/** Where game logs come from. `fetch` rejects with a FeedError whose message is safe to show users. */
export interface GameLogSource {
  /** Display name, e.g. "ESPN". */
  readonly name: string;
  fetch(season: number, teamId: TeamId): Promise<GameLog>;
}

/** A game-log read for a page: the log, or null with the reason. Never a rejection. */
export interface GameLogRead {
  log: GameLog | null;
  source: string;
  error: string | null;
}
