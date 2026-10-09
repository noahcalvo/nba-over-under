import { SCORING, type ScoringConfig } from "@/config/scoring";
import type { TeamRecord } from "@/lib/records/types";
import { gamesPlayed, projectWins } from "@/lib/scoring";
import type { Game } from "./types";

/** Cumulative wins after a game. `source` is the game itself (for date, opponent and result). */
export interface WinPoint {
  game: number;
  wins: number;
  source: Game;
}

/** "partial": the log has fewer completed games than the record. "mismatch": its wins differ from the record's. */
export type HistoryStatus = "complete" | "partial" | "mismatch";

export interface ActualSeries {
  points: WinPoint[];
  status: HistoryStatus;
}

/**
 * Cumulative wins after each completed game, cut at the stored record's games played so the chart never runs ahead of
 * the numbers the league scores on. Never fills gaps.
 */
export function actualSeries(games: readonly Game[], record: TeamRecord): ActualSeries {
  const completed = games.filter((game) => game.result !== null).slice(0, gamesPlayed(record));
  let wins = 0;
  const points = completed.map((game, index) => {
    if (game.result === "W") wins += 1;
    return { game: index + 1, wins, source: game };
  });
  const status: HistoryStatus =
    points.length < gamesPlayed(record) ? "partial" : wins !== record.wins ? "mismatch" : "complete";
  return { points, status };
}

/** Wins the locked line implies after `game` games. */
export function lockedPace(line: number, game: number, config: ScoringConfig = SCORING): number {
  return (line * game) / config.seasonGames;
}

/** Current wins plus the season win rate for each game after the current one. Equals `projectWins` at game 82. */
export function projectedAt(record: TeamRecord, game: number, config: ScoringConfig = SCORING): number | null {
  const projected = projectWins(record, config);
  if (projected === null) return null;
  return record.wins + (game - gamesPlayed(record)) * (projected / config.seasonGames);
}

/** Wins still needed for the Over to hit. A push misses, so an integer line needs one more than the line. */
export function winsNeededForOver(line: number, wins: number): number {
  return Math.max(0, Math.floor(line) + 1 - wins);
}

export function gamesRemaining(record: TeamRecord, config: ScoringConfig = SCORING): number {
  return Math.max(0, config.seasonGames - gamesPlayed(record));
}
