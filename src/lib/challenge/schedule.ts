import { CHALLENGE } from "@/config/challenge";
import type { GameLog } from "@/lib/game-log/types";
import type { TeamId } from "@/lib/types";
import type { ChallengeSeason, OpeningGame } from "./types";

/**
 * The season's first regular-season game across team game logs: the earliest dated game (logs already drop postponed
 * games and the NBA Cup Championship). Null when no game has a date. Pass every team's log: the opening game is in
 * both teams' logs, so one missing log can't hide it, but the server still requires all 30.
 */
export function openingGame(logs: readonly GameLog[]): OpeningGame | null {
  let best: { time: number; game: OpeningGame } | null = null;
  for (const log of logs) {
    for (const game of log.games) {
      if (game.date === null) continue;
      const time = Date.parse(game.date);
      if (Number.isNaN(time) || (best && best.time <= time)) continue;
      const teams: [TeamId | null, TeamId | null] =
        game.home === true ? [game.opponentId, log.teamId] : [log.teamId, game.opponentId];
      best = { time, game: { tipoff: new Date(time).toISOString(), teams } };
    }
  }
  return best?.game ?? null;
}

/** The lock time: the opening tip-off minus CHALLENGE.lockMinutesBeforeTipoff. */
export function challengeDeadline(tipoff: string, minutesBefore: number = CHALLENGE.lockMinutesBeforeTipoff): string {
  return new Date(Date.parse(tipoff) - minutesBefore * 60_000).toISOString();
}

/**
 * Whether a request re-reads the season schedule. skip: frozen, past the stored deadline, or checked within
 * CHALLENGE.scheduleCheckMinutes (unless forced). now: no row, or no deadline yet and stale (the page needs it), or
 * forced (the cron). after: a future deadline is stored and the check is stale, so the read runs after the response.
 */
export function scheduleCheck(
  season: Pick<ChallengeSeason, "deadline" | "frozen" | "scheduleCheckedAt"> | null,
  now: Date,
  force: boolean,
): "skip" | "now" | "after" {
  if (!season) return "now";
  if (season.frozen) return "skip";
  if (season.deadline && Date.parse(season.deadline) <= now.getTime()) return "skip";
  if (force) return "now";
  const checkedRecently =
    season.scheduleCheckedAt !== null && now.getTime() - Date.parse(season.scheduleCheckedAt) <= CHALLENGE.scheduleCheckMinutes * 60_000;
  if (checkedRecently) return "skip";
  return season.deadline ? "after" : "now";
}
