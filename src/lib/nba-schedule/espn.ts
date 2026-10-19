import { NBA_SCHEDULE } from "@/config/schedule";
import { FeedError } from "@/lib/feed-error";
import type { TeamId } from "@/lib/types";
import { gameDayOf, espnDate } from "./game-day";
import { parseAmerican } from "./odds";
import type { GameDay, GameOdds, GameStatus, NbaGame, NbaGameSide } from "./types";

// ESPN's public scoreboard and summary JSON (unofficial; keyless). One scoreboard request returns one game day, one
// summary request one game. Only the 2026-27 style regular season counts; the NBA Cup Championship ("CC") is dropped,
// as the game log does. Teams match by display name. An event with a team outside our 30 is skipped (it is not our
// game), but a payload that is shaped wrongly throws a FeedError.

const API = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";
const REGULAR_SEASON = 2;
const CUP_CHAMPIONSHIP = "CC";
const GAME_ID_PATTERN = /^\d{1,12}$/;

export function espnScoreboardUrl(day: string): string {
  return `${API}/scoreboard?dates=${espnDate(day)}`;
}

export function espnSummaryUrl(id: string): string {
  return `${API}/summary?event=${id}`;
}

/** True for a plausible ESPN event id: 1 to 12 digits. Check before building a summary url from outside input. */
export function isGameId(value: string): boolean {
  return GAME_ID_PATTERN.test(value);
}

type Json = Record<string, unknown>;
type ResolveTeam = (name: string) => TeamId | null;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asObject(value: unknown): Json | null {
  return isObject(value) ? value : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

const BAD_FORMAT = "wasn't in the expected format";

function problem(feed: "scoreboard" | "summary", detail: string): FeedError {
  return new FeedError(`${NBA_SCHEDULE.source} ${feed} ${detail}.`);
}

interface Source {
  feed: "scoreboard" | "summary";
  id: unknown;
  season: unknown;
  /** The competition object (`competitors`, `status`, `type`, `date`). */
  competition: unknown;
  /** Used when the competition carries no date. */
  fallbackDate: unknown;
  venue: string | null;
  broadcasts: string[];
  odds: GameOdds | null;
}

function statusOf(feed: Source["feed"], status: Json): { status: GameStatus; detail: string } {
  const type = asObject(status.type);
  if (!type || typeof type.name !== "string" || typeof type.state !== "string") throw problem(feed, BAD_FORMAT);
  const detail = typeof type.shortDetail === "string" ? type.shortDetail : "";
  if (type.name === "STATUS_POSTPONED") return { status: "postponed", detail };
  if (type.name === "STATUS_CANCELED") return { status: "canceled", detail };
  if (type.state === "in") return { status: "live", detail };
  if (type.state === "post" && type.completed === true) return { status: "final", detail };
  if (type.state === "pre") return { status: "scheduled", detail };
  throw problem(feed, `had a game in an unknown state (${type.name})`);
}

function scoreOf(feed: Source["feed"], value: unknown): number {
  const score = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (value === "" || !Number.isInteger(score) || score < 0) throw problem(feed, "had a game without a valid score");
  return score;
}

/**
 * The one place a scoreboard event or a summary becomes an `NbaGame`. Null means "not a game we show": another season or
 * season type, the Cup final, or a team outside our 30. Anything shaped wrongly throws.
 */
function normalizeCompetition(source: Source, resolveTeam: ResolveTeam): NbaGame | null {
  const { feed } = source;
  const season = asObject(source.season);
  if (!season || typeof season.year !== "number" || typeof season.type !== "number") throw problem(feed, BAD_FORMAT);
  const competition = asObject(source.competition);
  if (!competition) throw problem(feed, BAD_FORMAT);
  if (season.type !== REGULAR_SEASON) return null;
  if (asObject(competition.type)?.abbreviation === CUP_CHAMPIONSHIP) return null;

  const id = nonEmptyString(source.id);
  const dateText = nonEmptyString(competition.date) ?? nonEmptyString(source.fallbackDate);
  const statusObject = asObject(competition.status);
  if (!id || !dateText || !statusObject || Number.isNaN(Date.parse(dateText))) throw problem(feed, BAD_FORMAT);
  const { status, detail } = statusOf(feed, statusObject);

  const competitors = Array.isArray(competition.competitors) ? competition.competitors : [];
  if (competitors.length !== 2 || !competitors.every(isObject)) throw problem(feed, BAD_FORMAT);
  const away = competitors.find((competitor) => competitor.homeAway === "away");
  const home = competitors.find((competitor) => competitor.homeAway === "home");
  if (!away || !home) throw problem(feed, "had a game without a home and an away team");
  const ids = [away, home].map((competitor) => {
    const name = nonEmptyString(asObject(competitor.team)?.displayName);
    if (!name) throw problem(feed, BAD_FORMAT);
    return resolveTeam(name);
  });
  if (ids[0] === null || ids[1] === null) return null;
  if (ids[0] === ids[1]) throw problem(feed, "had a game of a team against itself");

  const shown = status === "live" || status === "final";
  const winners = competitors.filter((competitor) => competitor.winner === true).length;
  if (status === "final" && winners !== 1) throw problem(feed, "had a finished game without one winner");
  const side = (competitor: Json, teamId: TeamId): NbaGameSide => ({
    teamId,
    score: shown ? scoreOf(feed, competitor.score) : null,
    winner: status === "final" && competitor.winner === true,
  });

  return {
    id,
    season: season.year,
    tipoff: dateText,
    gameDay: gameDayOf(dateText),
    status,
    statusDetail: detail,
    away: side(away, ids[0]),
    home: side(home, ids[1]),
    venue: source.venue,
    broadcasts: source.broadcasts,
    odds: source.odds,
  };
}

/** The moneyline of one odds object (a scoreboard `odds[0]` or a summary `pickcenter[0]`), or null when anything is off. */
function parseOdds(value: unknown): GameOdds | null {
  const odds = asObject(Array.isArray(value) ? value[0] : null);
  if (!odds) return null;
  const book = nonEmptyString(asObject(odds.provider)?.name);
  const moneyline = asObject(odds.moneyline);
  if (!book || !moneyline) return null;
  const closing = (side: string) => parseAmerican(asObject(asObject(moneyline[side])?.close)?.odds);
  const away = closing("away");
  const home = closing("home");
  return away === null || home === null ? null : { book, away, home };
}

function uniqueNames(names: Iterable<unknown>): string[] {
  const seen = new Set<string>();
  for (const name of names) {
    const text = nonEmptyString(name)?.trim();
    if (text) seen.add(text);
  }
  return [...seen];
}

function scoreboardBroadcasts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueNames(value.flatMap((entry) => (isObject(entry) && Array.isArray(entry.names) ? entry.names : [])));
}

function summaryBroadcasts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueNames(value.map((entry) => (isObject(entry) ? asObject(entry.media)?.shortName : null)));
}

function timeOf(game: NbaGame): number {
  return Date.parse(game.tipoff);
}

/** One game day's regular-season games from ESPN's scoreboard payload. Throws FeedError unless the payload is well formed. */
export function parseScoreboard(payload: unknown, season: number, day: string, resolveTeam: ResolveTeam): GameDay {
  if (!isObject(payload) || !Array.isArray(payload.events)) throw problem("scoreboard", BAD_FORMAT);
  const games: NbaGame[] = [];
  for (const event of payload.events) {
    if (!isObject(event)) throw problem("scoreboard", BAD_FORMAT);
    const competition = Array.isArray(event.competitions) ? event.competitions[0] : undefined;
    const game = normalizeCompetition(
      {
        feed: "scoreboard",
        id: event.id,
        season: event.season,
        competition,
        fallbackDate: event.date,
        venue: nonEmptyString(asObject(asObject(competition)?.venue)?.fullName),
        broadcasts: scoreboardBroadcasts(asObject(competition)?.broadcasts),
        odds: parseOdds(asObject(competition)?.odds),
      },
      resolveTeam,
    );
    if (game && game.season === season) games.push(game);
  }
  games.sort((a, b) => timeOf(a) - timeOf(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { season, day, games };
}

/**
 * One game from ESPN's summary payload. Null means the game isn't one we show (another season, not the regular season,
 * the Cup final, or a team outside our 30), so the page 404s. Throws FeedError when the payload is shaped wrongly.
 */
export function parseSummary(payload: unknown, season: number, resolveTeam: ResolveTeam): NbaGame | null {
  if (!isObject(payload)) throw problem("summary", BAD_FORMAT);
  const header = asObject(payload.header);
  if (!header) throw problem("summary", BAD_FORMAT);
  const competition = Array.isArray(header.competitions) ? header.competitions[0] : undefined;
  const game = normalizeCompetition(
    {
      feed: "summary",
      id: header.id,
      season: header.season,
      competition,
      fallbackDate: null,
      venue: nonEmptyString(asObject(asObject(payload.gameInfo)?.venue)?.fullName),
      broadcasts: summaryBroadcasts(asObject(competition)?.broadcasts),
      odds: parseOdds(payload.pickcenter),
    },
    resolveTeam,
  );
  return game && game.season === season ? game : null;
}
