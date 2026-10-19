import type { TeamId } from "@/lib/types";

/** Where a game is in its life: before tip-off, in play, finished, postponed or canceled. */
export type GameStatus = "scheduled" | "live" | "final" | "postponed" | "canceled";

/** One team's side of a game. `score` is null until the game is live or final. */
export interface NbaGameSide {
  teamId: TeamId;
  score: number | null;
  winner: boolean;
}

/** A pre-game moneyline from one sportsbook, in American odds (integers, never 0). */
export interface GameOdds {
  book: string;
  away: number;
  home: number;
}

/** One NBA game as the schedule and game pages show it. */
export interface NbaGame {
  id: string;
  season: number;
  /** Tip-off time as an ISO instant. */
  tipoff: string;
  /** The Central calendar date (`YYYY-MM-DD`) the game is counted on. */
  gameDay: string;
  status: GameStatus;
  /** ESPN's short status text: "Final", "Final/OT", "Q3 4:12", or for a scheduled game its Eastern time ("10/21 - 7:00 PM EDT"). The UI never shows it for a scheduled game (it uses `tipoff` in CT). */
  statusDetail: string;
  away: NbaGameSide;
  home: NbaGameSide;
  venue: string | null;
  broadcasts: string[];
  odds: GameOdds | null;
}

/** Every game on one Central game day, sorted by tip-off then id. */
export interface GameDay {
  season: number;
  /** The Central calendar date (`YYYY-MM-DD`). */
  day: string;
  games: NbaGame[];
}

/** The result of reading one game day. Reads never reject; a failure is `error`, not a throw. */
export interface ScheduleRead {
  day: GameDay | null;
  source: string;
  /** When the read happened (ISO instant), or null when it failed before any read. */
  readAt: string | null;
  error: string | null;
}

/** The result of reading one game by id. Reads never reject; `notFound` marks a game the source does not have. */
export interface GameRead {
  game: NbaGame | null;
  source: string;
  readAt: string | null;
  error: string | null;
  notFound: boolean;
}

/** The two teams of a game, by id. */
export interface GameTeams {
  awayId: TeamId;
  homeId: TeamId;
}
