import "server-only";
import { notFound } from "next/navigation";
import { buildDemoLeague, DEMO_LEAGUE_ID } from "@/data/demo-league";
import { TEAM_INFO } from "@/data/teams";
import { listSessionLeagues, loadLeague, type SeatedLeague } from "@/db/leagues";
import { loadRefresh, loadTeamInfo, recordStatus } from "@/db/records";
import { LINES } from "@/config/lines";
import { buildLineReview, withAvailableLines, withLines } from "@/lib/lines";
import { seasonEndYear } from "@/lib/records/season";
import type { RecordStatus } from "@/lib/records/types";
import type { League, LeagueView, LineReview, TeamInfo } from "@/lib/types";
import { getDb } from "@/server/db";
import { readLines } from "@/server/lines";
import { getSession, getViewerId } from "@/server/session";

/** The demo league lives in code, never in the database. */
const DEMO_LEAGUE = buildDemoLeague();

export async function findLeague(leagueId: string): Promise<League | null> {
  if (leagueId === DEMO_LEAGUE_ID) return DEMO_LEAGUE;
  return loadLeague(await getDb(), leagueId);
}

export async function getLeagueOrNotFound(leagueId: string): Promise<League> {
  const league = await findLeague(leagueId);
  if (!league) notFound();
  return league;
}

/** Before the draft: the source's lines with the commissioner's overrides on top. */
export async function reviewLines(league: League): Promise<LineReview> {
  return buildLineReview(TEAM_INFO, await readLines(), league.lineOverrides, { book: LINES.book, season: LINES.season });
}

/** Team metadata with this league's records (see `loadTeamInfo`). */
export async function teamInfoFor(league: League): Promise<TeamInfo[]> {
  return loadTeamInfo(await getDb(), league);
}

async function recordStatusFor(league: League): Promise<RecordStatus | null> {
  if (league.isDemo) return null;
  const season = seasonEndYear(league.seasonLabel);
  return recordStatus(league.seasonLabel, season === null ? null : await loadRefresh(await getDb(), season));
}

/** Pass viewerId when it is already known (e.g. the actor a mutation read under the lock). */
export async function toLeagueView(league: League, viewerId?: string | null): Promise<LeagueView> {
  const [lineReview, teamInfo, records, resolvedViewerId] = await Promise.all([
    league.lines ? null : reviewLines(league),
    teamInfoFor(league),
    recordStatusFor(league),
    viewerId === undefined ? getViewerId(league.id) : viewerId,
  ]);
  return {
    league,
    viewerId: resolvedViewerId,
    teams: league.lines ? withLines(teamInfo, league.lines) : withAvailableLines(teamInfo, lineReview!.lines),
    lineReview,
    records,
  };
}

/** The leagues this browser holds a seat in, most recently joined first. */
export async function listViewerLeagues(): Promise<SeatedLeague[]> {
  const session = await getSession();
  return session ? listSessionLeagues(await getDb(), session.id) : [];
}
