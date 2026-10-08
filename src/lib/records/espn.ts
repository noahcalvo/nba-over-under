import { RECORDS } from "@/config/records";
import { SCORING } from "@/config/scoring";
import { FeedError } from "@/lib/feed-error";
import type { TeamId } from "@/lib/types";
import { seasonLabelFor } from "./season";
import type { RecordSet, TeamRecord } from "./types";

// ESPN's public standings JSON (unofficial; keyless). Without seasontype it can return preseason records, so we always
// ask for the regular season and refuse anything else. Teams match by nickname: ESPN's abbreviations differ from ours.

const STANDINGS_URL = "https://site.api.espn.com/apis/v2/sports/basketball/nba/standings";
const REGULAR_SEASON = 2;

export function espnStandingsUrl(season: number): string {
  return `${STANDINGS_URL}?season=${season}&seasontype=${REGULAR_SEASON}`;
}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function problem(detail: string): FeedError {
  return new FeedError(`${RECORDS.source} standings ${detail}.`);
}

function statValue(stats: unknown, name: string): number | null {
  if (!Array.isArray(stats)) return null;
  const stat: unknown = stats.find((candidate) => isObject(candidate) && candidate.name === name);
  const value = isObject(stat) ? stat.value : undefined;
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

/** Every team's regular-season record from ESPN's standings payload. Throws FeedError unless all of it checks out. */
export function parseEspnStandings(
  payload: unknown,
  season: number,
  resolveTeam: (name: string) => TeamId | null,
  teamIds: ReadonlySet<TeamId>,
): RecordSet {
  const groups = isObject(payload) ? payload.children : undefined;
  if (!Array.isArray(groups) || groups.length === 0) throw problem("weren't in the expected format");
  const records: Record<TeamId, TeamRecord> = {};
  for (const group of groups) {
    const standings = isObject(group) ? group.standings : undefined;
    if (!isObject(standings) || !Array.isArray(standings.entries)) throw problem("weren't in the expected format");
    if (standings.season !== season || standings.seasonType !== REGULAR_SEASON) {
      throw problem(`were for a different season than ${seasonLabelFor(season)}`);
    }
    for (const entry of standings.entries) {
      const team = isObject(entry) ? entry.team : undefined;
      const name = isObject(team) && typeof team.name === "string" ? team.name : "unnamed";
      const teamId = resolveTeam(name);
      if (teamId === null || !teamIds.has(teamId)) throw problem(`included a team we don't know (${name})`);
      if (teamId in records) throw problem(`listed ${teamId} twice`);
      const stats = isObject(entry) ? entry.stats : undefined;
      const wins = statValue(stats, "wins");
      const losses = statValue(stats, "losses");
      if (wins === null || losses === null) throw problem(`had no usable record for ${teamId}`);
      if (wins + losses > SCORING.seasonGames) throw problem(`gave ${teamId} more than ${SCORING.seasonGames} games`);
      records[teamId] = { wins, losses };
    }
  }
  const missing = [...teamIds].filter((teamId) => !(teamId in records));
  if (missing.length > 0) throw problem(`were missing ${missing.join(", ")}`);
  return { season, records };
}
