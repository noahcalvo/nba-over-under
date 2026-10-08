import "server-only";
import { notFound } from "next/navigation";
import { buildDemoLeague, DEMO_LEAGUE_ID } from "@/data/demo-league";
import { TEAM_INFO } from "@/data/teams";
import { listSessionLeagues, loadLeague, type SeatedLeague } from "@/db/leagues";
import { withLines } from "@/lib/lines";
import type { League, LeagueView, Team } from "@/lib/types";
import { getDb } from "@/server/db";
import { lineSource } from "@/server/lines";
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

/** Every team with the lines this league scores against: frozen at draft start, the current lines before that. */
export async function teamsFor(league: League): Promise<Team[]> {
  return withLines(TEAM_INFO, league.lines ?? (await lineSource.current()));
}

/** Pass viewerId when it is already known (e.g. the actor a mutation read under the lock). */
export async function toLeagueView(league: League, viewerId?: string | null): Promise<LeagueView> {
  return {
    league,
    viewerId: viewerId === undefined ? await getViewerId(league.id) : viewerId,
    teams: await teamsFor(league),
    lineReview: null,
  };
}

/** The leagues this browser holds a seat in, most recently joined first. */
export async function listViewerLeagues(): Promise<SeatedLeague[]> {
  const session = await getSession();
  return session ? listSessionLeagues(await getDb(), session.id) : [];
}
