import { RECORDS } from "@/config/records";
import { SCORING } from "@/config/scoring";
import { FeedError } from "@/lib/feed-error";
import { seasonLabelFor } from "@/lib/records/season";
import type { TeamId } from "@/lib/types";
import type { Game, GameLog, GameResult } from "./types";

// ESPN's public team schedule JSON (unofficial; keyless). We always ask for the regular season. Two quirks: the NBA Cup
// Championship is listed as a regular-season game (competition type "CC") but doesn't count in the standings, and a
// postponed game stays listed as postponed next to its make-up game. Both are dropped. Teams match by name.

const SCHEDULE_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams";
const REGULAR_SEASON = 2;
const CUP_CHAMPIONSHIP = "CC";
const DROPPED_STATUSES: ReadonlySet<string> = new Set(["STATUS_POSTPONED", "STATUS_CANCELED"]);

export function espnScheduleUrl(espnAbbr: string, season: number): string {
  return `${SCHEDULE_URL}/${espnAbbr}/schedule?season=${season}&seasontype=${REGULAR_SEASON}`;
}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function problem(detail: string): FeedError {
  return new FeedError(`${RECORDS.source} schedule ${detail}.`);
}

const BAD_FORMAT = "wasn't in the expected format";

/** One team's regular-season games from ESPN's schedule payload. Throws FeedError unless all of it checks out. */
export function parseEspnSchedule(
  payload: unknown,
  season: number,
  teamId: TeamId,
  resolveTeam: (name: string) => TeamId | null,
): GameLog {
  if (!isObject(payload) || !Array.isArray(payload.events)) throw problem(BAD_FORMAT);
  const requested = isObject(payload.requestedSeason) ? payload.requestedSeason : null;
  if (requested?.year !== season || requested?.type !== REGULAR_SEASON) {
    throw problem(`was for a different season than ${seasonLabelFor(season)}`);
  }

  const rows: Omit<Game, "number">[] = [];
  for (const event of payload.events) {
    if (!isObject(event)) throw problem(BAD_FORMAT);
    if (!isObject(event.seasonType) || event.seasonType.type !== REGULAR_SEASON) continue;
    const competition = Array.isArray(event.competitions) ? event.competitions[0] : undefined;
    if (!isObject(competition)) throw problem(BAD_FORMAT);
    if (isObject(competition.type) && competition.type.abbreviation === CUP_CHAMPIONSHIP) continue;
    const status = isObject(competition.status) && isObject(competition.status.type) ? competition.status.type : null;
    if (!status || typeof status.name !== "string") throw problem(BAD_FORMAT);
    if (DROPPED_STATUSES.has(status.name)) continue;

    const competitors = Array.isArray(competition.competitors) ? competition.competitors.filter(isObject) : [];
    const ids = competitors.map((competitor) =>
      isObject(competitor.team) && typeof competitor.team.displayName === "string"
        ? resolveTeam(competitor.team.displayName)
        : null,
    );
    const ownIndex = ids.indexOf(teamId);
    if (competitors.length !== 2 || ownIndex === -1) throw problem(`listed a game without ${teamId}`);
    const own = competitors[ownIndex];

    let result: GameResult | null = null;
    if (status.completed === true) {
      const winners = competitors.filter((competitor) => competitor.winner === true).length;
      if (winners !== 1) throw problem("had a finished game without one winner");
      result = own.winner === true ? "W" : "L";
    }
    rows.push({
      date: typeof event.date === "string" ? event.date : null,
      opponentId: ids[1 - ownIndex],
      home: own.homeAway === "home" ? true : own.homeAway === "away" ? false : null,
      result,
    });
  }

  if (rows.length > SCORING.seasonGames) throw problem(`listed more than ${SCORING.seasonGames} games for ${teamId}`);
  rows.sort((a, b) => timeOf(a.date) - timeOf(b.date));
  return { season, teamId, games: rows.map((row, index) => ({ number: index + 1, ...row })) };
}

/** Undated games sort last. */
function timeOf(date: string | null): number {
  const time = date === null ? Number.NaN : Date.parse(date);
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}
