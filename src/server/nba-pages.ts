import "server-only";
import { NBA_SCHEDULE } from "@/config/schedule";
import { loadTeamInfo } from "@/db/records";
import { dateStrip, todayGameDay } from "@/lib/nba-schedule/game-day";
import { challengeInterest, interestSummary, leagueInterests, type InterestSummary } from "@/lib/nba-schedule/interest";
import { resolveScheduleParams, type ScheduleParams } from "@/lib/nba-schedule/params";
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

async function loadGames(day: string): Promise<ScheduleGames> {
  const [read, stakes] = await Promise.all([readGameDay(day), stakesOrNone()]);
  const summaries: Record<string, InterestSummary> = {};
  for (const game of read.day?.games ?? []) {
    const teams = { awayId: game.away.teamId, homeId: game.home.teamId };
    summaries[game.id] = interestSummary(
      leagueInterests(stakes.leagues, teams),
      challengeInterest(stakes.challenge, SEASON_YEAR, teams),
    );
  }
  return { read, summaries, hasStakes: stakes.leagues.length > 0 || stakes.challenge !== null };
}

/** The schedule page's data for the raw query parameters. Standings (stored records) are awaited; the feeds are not. */
export async function loadSchedulePage(raw: { date?: string; view?: string; conf?: string }): Promise<SchedulePageData> {
  const db = await getDb();
  const now = new Date();
  const params = resolveScheduleParams(raw, now);
  const teams = await loadTeamInfo(db, { isDemo: false, seasonLabel: NBA_SCHEDULE.season });
  return {
    ...params,
    today: todayGameDay(now),
    strip: dateStrip(params.day, NBA_SCHEDULE.dateStripDays),
    teams,
    games: loadGames(params.day),
    forms: readTeamForms(),
  };
}
