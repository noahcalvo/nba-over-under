import "server-only";
import { connection } from "next/server";
import { NBA_SCHEDULE, NBA_SEASON_YEAR } from "@/config/schedule";
import { loadTeamInfo } from "@/db/records";
import { dateStrip, isGameDay, todayGameDay } from "@/lib/nba-schedule/game-day";
import { gameStakes, NO_STAKES, type GameStakes } from "@/lib/nba-schedule/game-stakes";
import type { InterestSummary } from "@/lib/nba-schedule/interest";
import { resolveScheduleParams, type ScheduleParams } from "@/lib/nba-schedule/params";
import { gameSummaries } from "@/lib/nba-schedule/summaries";
import type { NbaGame, ScheduleRead } from "@/lib/nba-schedule/types";
import type { TeamInfo } from "@/lib/types";
import { getDb } from "@/server/db";
import { loadPlayerStakes, type PlayerStakes } from "@/server/game-interest";
import { readGame, readGameDay, readTeamForms, type TeamForms } from "@/server/nba-schedule";

export interface ScheduleGames {
  read: ScheduleRead;
  /** Who is on each game of the day, by game id. */
  summaries: Record<string, InterestSummary>;
  /** False when the viewer has no league in the season, so no interest column is shown. */
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
    return { leagues: [], challenge: null, seated: [], failed: true };
  }
}

/** The day's games and who is on them. Never rejects: a failure building the interest column only hides that column. */
async function loadGames(day: string): Promise<ScheduleGames> {
  const [read, stakes] = await Promise.all([readGameDay(day), stakesOrNone()]);
  try {
    const games = read.day?.games ?? [];
    const { summaries, skipped } = gameSummaries(games, stakes);
    if (skipped > 0) console.error(`Game interest skipped ${skipped} of ${games.length} games`);
    return { read, summaries, hasStakes: stakes.leagues.length > 0 };
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

export type { GameStakes };

/** Everything the game page shows. The team forms and the stakes stream as promises that never reject. */
export interface GamePageData {
  game: NbaGame;
  source: string;
  readAt: string;
  /** The schedule day the back link returns to. */
  backDay: string;
  teams: TeamInfo[];
  forms: Promise<TeamForms>;
  stakes: Promise<GameStakes>;
}

export type GamePageResult =
  | { kind: "not_found" }
  | { kind: "error"; message: string; backDay: string }
  | { kind: "ok"; data: GamePageData };

/** The viewer's stakes in one game. Never rejects: a failed interest computation only empties the stakes panel. */
async function loadGameStakes(game: NbaGame): Promise<GameStakes> {
  const stakes = await stakesOrNone();
  try {
    return gameStakes(stakes, NBA_SEASON_YEAR, { awayId: game.away.teamId, homeId: game.home.teamId });
  } catch (error) {
    console.error("Game stakes failed", error);
    return { ...NO_STAKES, seated: stakes.seated, failed: true };
  }
}

/**
 * One game for the game page. `dateParam` is the schedule day the visitor came from (only a real date is kept);
 * without it the back link returns to the game's own day. Unknown ids and other seasons are `not_found`; a failed read
 * is `error`. The records are awaited; the forms and stakes are not.
 */
export async function loadGamePage(id: string, dateParam: string | undefined): Promise<GamePageResult> {
  await connection();
  const now = new Date();
  const read = await readGame(id);
  if (read.notFound) return { kind: "not_found" };
  const dateDay = isGameDay(dateParam) ? dateParam : null;
  if (!read.game) {
    return { kind: "error", message: read.error ?? "This game couldn't be read.", backDay: dateDay ?? todayGameDay(now) };
  }
  const { game } = read;
  const forms = readTeamForms([game.away.teamId, game.home.teamId]);
  const stakes = loadGameStakes(game);
  const db = await getDb();
  const teams = await loadTeamInfo(db, { isDemo: false, seasonLabel: NBA_SCHEDULE.season });
  return {
    kind: "ok",
    data: {
      game,
      source: read.source,
      readAt: read.readAt ?? now.toISOString(),
      backDay: dateDay ?? game.gameDay,
      teams,
      forms,
      stakes,
    },
  };
}
