import "server-only";
import { RECORDS } from "@/config/records";
import { mockGameLog } from "@/data/game-logs";
import { espnAbbr, TEAM_INFO, teamIdByNickname } from "@/data/teams";
import { FeedError } from "@/lib/feed-error";
import { cachedGameLogSource } from "@/lib/game-log/cache";
import { espnScheduleUrl, parseEspnSchedule } from "@/lib/game-log/espn";
import type { GameLogRead, GameLogSource } from "@/lib/game-log/types";
import { seasonEndYear } from "@/lib/records/season";
import type { League, TeamId } from "@/lib/types";
import { fetchFeedJson } from "@/server/feed";

const espnGameLogSource: GameLogSource = {
  name: RECORDS.source,
  async fetch(season, teamId) {
    const payload = await fetchFeedJson(espnScheduleUrl(espnAbbr(teamId), season), {
      source: RECORDS.source,
      timeoutMs: RECORDS.fetchTimeoutMs,
    });
    return parseEspnSchedule(payload, season, teamId, teamIdByNickname);
  },
};

/** The mock dataset's game logs; they add up to the mock records. */
const mockGameLogSource: GameLogSource = {
  name: "Mock data",
  async fetch(season, teamId) {
    const team = TEAM_INFO.find((candidate) => candidate.id === teamId);
    if (!team) throw new FeedError(`No mock games for ${teamId}.`);
    return mockGameLog(team, season);
  },
};

/** ESPN, cached per team; with RECORD_SOURCE=static the mock game logs, to match the mock records. */
export const gameLogSource: GameLogSource =
  process.env.RECORD_SOURCE === "static"
    ? mockGameLogSource
    : cachedGameLogSource(espnGameLogSource, RECORDS.gameLogCacheSeconds * 1000, RECORDS.gameLogRetrySeconds * 1000);

/** A team's game log for the league's season. The demo league uses the mock log. Never rejects. */
export async function readGameLog(league: Pick<League, "isDemo" | "seasonLabel">, teamId: TeamId): Promise<GameLogRead> {
  const source = league.isDemo ? mockGameLogSource : gameLogSource;
  const season = seasonEndYear(league.seasonLabel);
  if (season === null) return { log: null, source: source.name, error: `Unknown season ${league.seasonLabel}.` };
  try {
    return { log: await source.fetch(season, teamId), source: source.name, error: null };
  } catch (error) {
    if (!(error instanceof FeedError)) console.error("Game log read failed", error);
    return {
      log: null,
      source: source.name,
      error: error instanceof FeedError ? error.message : "Game history couldn't be read.",
    };
  }
}
