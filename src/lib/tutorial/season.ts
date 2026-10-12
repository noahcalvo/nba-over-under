import { SCORING } from "@/config/scoring";
import { TUTORIAL_SEASON } from "@/config/tour";
import type { Game, GameLog, GameResult } from "@/lib/game-log/types";
import { normalSample, seededRandom, seedFor } from "@/lib/random";
import type { TeamRecord } from "@/lib/records/types";
import type { DraftState, Team, TeamId } from "@/lib/types";

// The guided demo's season: one synthetic 82-game win/loss sequence per team, derived from the completed demo draft so
// the same draft always plays the same season. Each checkpoint shows a prefix of that one sequence, so Midseason is the
// first half of the final season by construction. Nothing here is a real game: no dates, opponents or venues.

export type SeasonCheckpoint = "draft" | "midseason" | "final";

export const SEASON_CHECKPOINTS: readonly SeasonCheckpoint[] = ["draft", "midseason", "final"];

/** Games every team has played at the checkpoint. */
export function checkpointGames(checkpoint: SeasonCheckpoint): number {
  if (checkpoint === "draft") return 0;
  return checkpoint === "midseason" ? TUTORIAL_SEASON.midseasonGames : SCORING.seasonGames;
}

export function nextCheckpoint(checkpoint: SeasonCheckpoint): SeasonCheckpoint | null {
  return SEASON_CHECKPOINTS[SEASON_CHECKPOINTS.indexOf(checkpoint) + 1] ?? null;
}

/** Games simulated by advancing from the checkpoint (0 at the last one). */
export function advanceCheckpointGames(checkpoint: SeasonCheckpoint): number {
  const next = nextCheckpoint(checkpoint);
  return next ? checkpointGames(next) - checkpointGames(checkpoint) : 0;
}

/** Every team's results in game order. */
export type SeasonResults = Readonly<Record<TeamId, readonly GameResult[]>>;

/** The seed a completed draft plays its season with: its picks in order. */
export function draftSeed(draft: Pick<DraftState, "picks">): string {
  return draft.picks.map((pick) => `${pick.teamId}${pick.side === "OVER" ? "O" : "U"}`).join(",");
}

/**
 * Each team gets a hidden strength (its line plus a normal spread, in full-season wins) and plays every game as a coin
 * weighted by it. Only the seed and each team's id and line are read: owners, records and history play no part.
 */
export function simulateSeason(teams: readonly Pick<Team, "id" | "line">[], seed: string): SeasonResults {
  const { strengthSpreadWins, minStrengthWins, maxStrengthWins } = TUTORIAL_SEASON;
  const games = SCORING.seasonGames;
  return Object.fromEntries(
    teams.map((team) => {
      const random = seededRandom(seedFor(`${seed}|${team.id}`));
      const strength = team.line + normalSample(random) * strengthSpreadWins;
      const winChance = Math.min(Math.max(strength, minStrengthWins), maxStrengthWins) / games;
      const results = Array.from({ length: games }, (): GameResult => (random() < winChance ? "W" : "L"));
      return [team.id, results];
    }),
  );
}

/** Wins and losses after the first `games` games. */
export function recordAfter(results: readonly GameResult[], games: number): TeamRecord {
  const played = results.slice(0, games);
  const wins = played.filter((result) => result === "W").length;
  return { wins, losses: played.length - wins };
}

/** The teams with their records after `games` games; everything else (lines included) unchanged. */
export function teamsAt<T extends Team>(teams: readonly T[], season: SeasonResults, games: number): T[] {
  return teams.map((team) => ({ ...team, ...recordAfter(season[team.id] ?? [], games) }));
}

/** A team's whole season as a game log: results for the first `games`, the rest upcoming. Nothing else is known. */
export function seasonGameLog(season: SeasonResults, teamId: TeamId, games: number, seasonYear: number): GameLog {
  const results = season[teamId] ?? [];
  return {
    season: seasonYear,
    teamId,
    games: results.map(
      (result, index): Game => ({
        number: index + 1,
        date: null,
        opponentId: null,
        home: null,
        result: index < games ? result : null,
      }),
    ),
  };
}
