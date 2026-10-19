import { NBA_SCHEDULE } from "@/config/schedule";
import type { Game, GameLog } from "@/lib/game-log/types";
import type { Conference, TeamId, TeamInfo } from "@/lib/types";
import { gameDayOf } from "@/lib/nba-schedule/game-day";

export type Heat = "hot" | "cold";

export interface ConferenceRow {
  rank: number;
  team: TeamInfo;
  wins: number;
  losses: number;
  /** Wins ÷ games played; null before the team has played. Compared unrounded. */
  pct: number | null;
}

/** A team's last `n` completed games, newest last. Unplayed games are skipped. */
export function recentResults(log: GameLog, n: number): Game[] {
  const played = log.games.filter((game) => game.result !== null);
  return n > 0 ? played.slice(-n) : [];
}

function winCount(results: readonly Game[]): number {
  return results.filter((game) => game.result === "W").length;
}

/** Hot or cold from a full set of form games; null when the set is not full or the team is neither. */
export function heat(results: readonly Game[]): Heat | null {
  if (results.length !== NBA_SCHEDULE.formGames) return null;
  const wins = winCount(results);
  if (wins >= NBA_SCHEDULE.hotWins) return "hot";
  if (wins <= NBA_SCHEDULE.coldWins) return "cold";
  return null;
}

/** "Hot: 4 wins in last 5"; null when the team is neither hot nor cold. */
export function heatLabel(results: readonly Game[]): string | null {
  const state = heat(results);
  if (state === null) return null;
  const wins = winCount(results);
  const noun = wins === 1 ? "win" : "wins";
  const name = state === "hot" ? "Hot" : "Cold";
  return `${name}: ${wins} ${noun} in last ${NBA_SCHEDULE.formGames}`;
}

function nameOf(team: TeamInfo): string {
  return `${team.city} ${team.name}`;
}

/** Win percentage first (teams with no games last), then wins, then name. */
function byStanding(a: Omit<ConferenceRow, "rank">, b: Omit<ConferenceRow, "rank">): number {
  if (a.pct !== b.pct) {
    if (a.pct === null) return 1;
    if (b.pct === null) return -1;
    return b.pct - a.pct;
  }
  return b.wins - a.wins || nameOf(a.team).localeCompare(nameOf(b.team), "en");
}

/** One conference's standings from the teams' records, ranked 1..n. */
export function conferenceTable(teams: readonly TeamInfo[], conference: Conference): ConferenceRow[] {
  const rows = teams
    .filter((team) => team.conference === conference)
    .map((team): Omit<ConferenceRow, "rank"> => {
      const games = team.wins + team.losses;
      return { team, wins: team.wins, losses: team.losses, pct: games === 0 ? null : team.wins / games };
    })
    .sort(byStanding);
  return rows.map((row, i) => ({ ...row, rank: i + 1 }));
}

/** A team's rank in its own conference; null when the team is unknown or has not played. */
export function conferencePosition(
  teams: readonly TeamInfo[],
  teamId: TeamId,
): { rank: number; conference: Conference } | null {
  const subject = teams.find((team) => team.id === teamId);
  if (!subject) return null;
  const row = conferenceTable(teams, subject.conference).find((r) => r.team.id === teamId);
  if (!row || row.pct === null) return null;
  return { rank: row.rank, conference: subject.conference };
}

/** A win percentage as baseball-style three decimals with no leading zero: ".750", "1.000"; "—" when null. */
export function formatPct(pct: number | null): string {
  if (pct === null) return "—";
  const text = pct.toFixed(3);
  return text.startsWith("0.") ? text.slice(1) : text;
}

/** The earliest Central game day after `afterDay` across the logs; undated games are ignored. */
export function nextGameDay(logs: readonly GameLog[], afterDay: string): string | null {
  let next: string | null = null;
  for (const log of logs) {
    for (const game of log.games) {
      if (game.date === null || Number.isNaN(Date.parse(game.date))) continue;
      const day = gameDayOf(game.date);
      if (day > afterDay && (next === null || day < next)) next = day;
    }
  }
  return next;
}
