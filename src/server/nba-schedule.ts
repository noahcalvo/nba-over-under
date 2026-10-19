import "server-only";
import { NBA_SCHEDULE, NBA_SEASON_YEAR } from "@/config/schedule";
import { TEAM_INFO, teamIdByNickname } from "@/data/teams";
import { FeedError } from "@/lib/feed-error";
import { keyedCache } from "@/lib/feed-cache";
import type { GameLog } from "@/lib/game-log/types";
import { espnScoreboardUrl, espnSummaryUrl, isGameId, parseScoreboard, parseSummary } from "@/lib/nba-schedule/espn";
import { isGameDay, isScheduleDay, scoreboardTtlSeconds, todayGameDay } from "@/lib/nba-schedule/game-day";
import type { GameRead, ScheduleRead } from "@/lib/nba-schedule/types";
import type { TeamId } from "@/lib/types";
import { fetchFeedJson } from "@/server/feed";
import { readGameLog } from "@/server/game-log";

const FEED = { source: NBA_SCHEDULE.source, timeoutMs: NBA_SCHEDULE.fetchTimeoutMs };
const RETRY_MS = NBA_SCHEDULE.retrySeconds * 1000;

const cachedScoreboard = keyedCache(
  async (day: string) => parseScoreboard(await fetchFeedJson(espnScoreboardUrl(day), FEED), NBA_SEASON_YEAR, day, teamIdByNickname),
  {
    ttlMs: (day) => scoreboardTtlSeconds(todayGameDay(new Date()), day) * 1000,
    retryMs: RETRY_MS,
  },
);

const cachedSummary = keyedCache(
  async (id: string) => parseSummary(await fetchFeedJson(espnSummaryUrl(id), FEED), NBA_SEASON_YEAR, teamIdByNickname),
  { ttlMs: () => NBA_SCHEDULE.summaryCacheSeconds * 1000, retryMs: RETRY_MS },
);

/** A message safe to show; anything that is not a FeedError is logged and replaced. */
function messageOf(error: unknown, label: string, fallback: string): string {
  if (error instanceof FeedError) return error.message;
  console.error(label, error);
  return fallback;
}

/** One game day's games. Never rejects; a failure is `error`. A date outside the schedule window is an empty day, unread. */
export async function readGameDay(day: string): Promise<ScheduleRead> {
  if (!isGameDay(day)) {
    return { day: null, source: NBA_SCHEDULE.source, readAt: null, error: "That isn't a valid date." };
  }
  if (!isScheduleDay(day, todayGameDay(new Date()))) {
    return { day: { season: NBA_SEASON_YEAR, day, games: [] }, source: NBA_SCHEDULE.source, readAt: null, error: null };
  }
  try {
    const { value, readAt } = await cachedScoreboard(day);
    return { day: value, source: NBA_SCHEDULE.source, readAt: new Date(readAt).toISOString(), error: null };
  } catch (error) {
    return {
      day: null,
      source: NBA_SCHEDULE.source,
      readAt: null,
      error: messageOf(error, "Schedule read failed", "Games couldn't be read."),
    };
  }
}

/** One game by ESPN event id. Never rejects; `notFound` marks an id ESPN does not have or a game we don't show. */
export async function readGame(id: string): Promise<GameRead> {
  const base = { source: NBA_SCHEDULE.source, game: null, readAt: null, error: null, notFound: false };
  if (!isGameId(id)) return { ...base, notFound: true };
  try {
    const { value, readAt } = await cachedSummary(id);
    if (!value) return { ...base, notFound: true };
    return { ...base, game: value, readAt: new Date(readAt).toISOString() };
  } catch (error) {
    if (error instanceof FeedError && error.status === 404) return { ...base, notFound: true };
    return { ...base, error: messageOf(error, "Game read failed", "This game couldn't be read.") };
  }
}

export interface TeamForms {
  logs: Partial<Record<TeamId, GameLog>>;
  /** The first failure's message; logs that did read are kept. */
  error: string | null;
}

/**
 * Game logs for the given teams (all 30 by default), for the form lines. Never rejects. Follows `readGameLog`: mock
 * logs with RECORD_SOURCE=static, otherwise ESPN with the game-log cache timings (RECORDS).
 */
export async function readTeamForms(teamIds: readonly TeamId[] = TEAM_INFO.map((team) => team.id)): Promise<TeamForms> {
  const reads = await Promise.all(
    teamIds.map((teamId) => readGameLog({ isDemo: false, seasonLabel: NBA_SCHEDULE.season }, teamId)),
  );
  const logs: Partial<Record<TeamId, GameLog>> = {};
  let error: string | null = null;
  reads.forEach((read, index) => {
    if (read.log) logs[teamIds[index]] = read.log;
    else error ??= read.error ?? "Game history couldn't be read.";
  });
  return { logs, error };
}
