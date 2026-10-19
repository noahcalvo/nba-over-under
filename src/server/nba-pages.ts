import "server-only";
import { NBA_SCHEDULE } from "@/config/schedule";
import { loadTeamInfo } from "@/db/records";
import { dateStrip, todayGameDay } from "@/lib/nba-schedule/game-day";
import type { InterestSummary } from "@/lib/nba-schedule/interest";
import { resolveScheduleParams, type ScheduleParams } from "@/lib/nba-schedule/params";
import { gameSummaries } from "@/lib/nba-schedule/summaries";
import type { ScheduleRead } from "@/lib/nba-schedule/types";
import { seasonEndYear } from "@/lib/records/season";
import type { TeamInfo } from "@/lib/types";
import { getDb } from "@/server/db";
import { loadPlayerStakes, type PlayerStakes } from "@/server/game-interest";
import { readGameDay, readTeamForms, type TeamForms } from "@/server/nba-schedule";

const SEASON_YEAR = seasonEndYear(NBA_SCHEDULE.season) ?? 0;

export interface ScheduleGames {
  read: ScheduleRead;
  /** Who is on each game of the day, by game id. */
  summaries: Record<string, InterestSummary>;
  /** False when the viewer has no league and no challenge entry for the season, so no interest column is shown. */
  hasStakes: boolean;
}

/** Everything the schedule page shows. The games and the form lines stream as promises that never reject. */
export interface SchedulePageData extends ScheduleParams {
  today: string;
  strip: string[];
  teams: TeamInfo[];
  games: Promise<ScheduleGames>;
  forms: Promise<TeamForms>;
}

async function stakesOrNone(): Promise<PlayerStakes> {
  try {
    return await loadPlayerStakes();
  } catch (error) {
    console.error("Player stakes load failed", error);
    return { leagues: [], challenge: null, seated: [] };
  }
}

/** The day's games and who is on them. Never rejects: a failure building the interest column only hides that column. */
async function loadGames(day: string): Promise<ScheduleGames> {
  const [read, stakes] = await Promise.all([readGameDay(day), stakesOrNone()]);
  try {
    return {
      read,
      summaries: gameSummaries(read.day?.games ?? [], stakes, SEASON_YEAR),
      hasStakes: stakes.leagues.length > 0 || stakes.challenge !== null,
    };
  } catch (error) {
    console.error("Game interest failed", error);
    return { read, summaries: {}, hasStakes: false };
  }
}

/** The schedule page's data for the raw query parameters. Standings (stored records) are awaited; the feeds are not. */
export async function loadSchedulePage(raw: { date?: string; view?: string; conf?: string }): Promise<SchedulePageData> {
  const db = await getDb();
  const now = new Date();
  const params = resolveScheduleParams(raw, now);
  // The feeds start now and stream; only the stored standings are awaited.
  const games = loadGames(params.day);
  const forms = readTeamForms();
  const teams = await loadTeamInfo(db, { isDemo: false, seasonLabel: NBA_SCHEDULE.season });
  return {
    ...params,
    today: todayGameDay(now),
    strip: dateStrip(params.day, NBA_SCHEDULE.dateStripDays),
    teams,
    games,
    forms,
  };
}
