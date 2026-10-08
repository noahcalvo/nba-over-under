import type { LineSource } from "@/lib/lines";
import type { LineSet, TeamId, TeamInfo } from "@/lib/types";

// FanDuel's NBA page payload (the JSON its website loads) lists one over/under market per team:
// marketType "NBA_REGULAR_SEASON_WINS_O/U", marketName "26-27 NBA Boston Celtics Regular Season Wins", runners
// "Boston Celtics Over 50.5 Wins" and "Boston Celtics Under 50.5 Wins". Undocumented; parse defensively.

const MARKET_TYPE = "NBA_REGULAR_SEASON_WINS_O/U";
const RUNNER = /^(.+) (Over|Under) (\d+(?:\.5)?) Wins$/;

interface Market {
  marketName?: unknown;
  marketType?: unknown;
  marketStatus?: unknown;
  runners?: unknown;
}

interface Runner {
  runnerName?: unknown;
  runnerStatus?: unknown;
}

/**
 * teamId → line for every team whose market is open, for the given season, with active Over and Under runners that
 * name the same line. Other teams are left out. Throws when the payload has no markets at all.
 */
export function parseFanDuelWinTotals(
  payload: unknown,
  teams: readonly TeamInfo[],
  marketSeason: string,
): Record<TeamId, number> {
  const markets = (payload as { attachments?: { markets?: unknown } } | null)?.attachments?.markets;
  if (!markets || typeof markets !== "object") throw new Error("FanDuel's response had no markets.");
  const prefix = `${marketSeason} NBA `;
  const suffix = " Regular Season Wins";
  const values: Record<TeamId, number> = {};
  for (const market of Object.values(markets as Record<string, Market>)) {
    if (market?.marketType !== MARKET_TYPE || market.marketStatus !== "OPEN") continue;
    if (typeof market.marketName !== "string") continue;
    const name = market.marketName;
    if (!name.startsWith(prefix) || !name.endsWith(suffix)) continue;
    const teamName = name.slice(prefix.length, -suffix.length);
    const team = teams.find((candidate) => teamName.endsWith(` ${candidate.name}`));
    if (!team || team.id in values) continue;
    const line = agreedLine(market.runners, teamName);
    if (line !== null) values[team.id] = line;
  }
  return values;
}

function agreedLine(runners: unknown, teamName: string): number | null {
  if (!Array.isArray(runners)) return null;
  const lines = new Map<string, number>();
  for (const runner of runners as Runner[]) {
    if (runner?.runnerStatus !== "ACTIVE" || typeof runner.runnerName !== "string") continue;
    const match = RUNNER.exec(runner.runnerName);
    if (match && match[1] === teamName) lines.set(match[2], Number(match[3]));
  }
  const over = lines.get("Over");
  return over !== undefined && over === lines.get("Under") ? over : null;
}

/** FanDuel's win totals as a LineSource. Rejects when the fetch fails or no team has a line. */
export function fanDuelLineSource(options: {
  fetchJson: () => Promise<unknown>;
  teams: readonly TeamInfo[];
  book: string;
  season: string;
  marketSeason: string;
  now?: () => Date;
}): LineSource {
  const now = options.now ?? (() => new Date());
  return {
    async current(): Promise<LineSet> {
      const values = parseFanDuelWinTotals(await options.fetchJson(), options.teams, options.marketSeason);
      if (Object.keys(values).length === 0) {
        throw new Error(`${options.book} has no ${options.season} win totals posted.`);
      }
      return { values, source: options.book, season: options.season, asOf: now().toISOString(), manual: [] };
    },
  };
}
