import type { ChallengeEntry, FrozenLines } from "@/lib/challenge/types";
import { findManager } from "@/lib/league/managers";
import type { GameTeams } from "@/lib/nba-schedule/types";
import type { DraftPick, League, Manager, Side, TeamId } from "@/lib/types";

export interface InterestLeague {
  league: League;
  viewerId: string;
}

/** A fade row's `teamId`, `side` and `line` describe the faded pick; `manager` is the fader. */
export interface InterestRow {
  kind: "pick" | "fade";
  manager: Manager;
  teamId: TeamId;
  side: Side;
  line: number;
  rootingFor: TeamId;
  isViewer: boolean;
  /** The faded pick's manager; null for picks. */
  targetManager: Manager | null;
}

export interface LeagueInterest {
  leagueId: string;
  leagueName: string;
  state: "not_started" | "none" | "rows";
  rows: InterestRow[];
}

export interface ChallengeStakeInput {
  entry: ChallengeEntry;
  frozen: FrozenLines | null;
}

export interface ChallengeRow {
  teamId: TeamId;
  side: Side;
  line: number | null;
  lineKind: "frozen" | "at_pick" | "unavailable";
  rootingFor: TeamId;
}

export interface ChallengeInterest {
  entryName: string;
  rows: ChallengeRow[];
}

export interface YourStake {
  source: { kind: "league"; leagueId: string; leagueName: string } | { kind: "challenge" };
  kind: "pick" | "fade" | "challenge";
  teamId: TeamId;
  side: Side;
  line: number | null;
  rootingFor: TeamId;
  targetManager: Manager | null;
}

export interface InterestSummary {
  managers: { leagueId: string; manager: Manager }[];
  count: number;
  viewerInvolved: boolean;
}

function opponentOf(teamId: TeamId, game: GameTeams): TeamId {
  return teamId === game.awayId ? game.homeId : game.awayId;
}

/** An Over roots for its own team, an Under for the opponent. */
function pickRooting(teamId: TeamId, side: Side, game: GameTeams): TeamId {
  return side === "OVER" ? teamId : opponentOf(teamId, game);
}

function teamOrder(teamId: TeamId, game: GameTeams): number {
  return teamId === game.awayId ? 0 : 1;
}

function leagueInterest({ league, viewerId }: InterestLeague, game: GameTeams): LeagueInterest {
  const base = { leagueId: league.id, leagueName: league.name };
  if (league.draft.status === "not_started" || !league.lines) {
    return { ...base, state: "not_started", rows: [] };
  }
  const lines = league.lines.values;
  const inGame = (teamId: TeamId) => teamId === game.awayId || teamId === game.homeId;

  const picks: { pick: DraftPick; manager: Manager }[] = [];
  for (const pick of league.draft.picks) {
    if (!inGame(pick.teamId)) continue;
    const manager = findManager(league.managers, pick.managerId);
    if (manager) picks.push({ pick, manager });
  }

  const pickRows: InterestRow[] = picks.map(({ pick, manager }) => ({
    kind: "pick",
    manager,
    teamId: pick.teamId,
    side: pick.side,
    line: lines[pick.teamId],
    rootingFor: pickRooting(pick.teamId, pick.side, game),
    isViewer: manager.id === viewerId,
    targetManager: null,
  }));

  const fadeRows: InterestRow[] = [];
  for (const fade of league.fades) {
    const fader = findManager(league.managers, fade.managerId);
    const target = picks.find(({ pick }) => pick.pickNumber === fade.targetPickNumber);
    if (!fader || !target) continue;
    fadeRows.push({
      kind: "fade",
      manager: fader,
      teamId: target.pick.teamId,
      side: target.pick.side,
      line: lines[target.pick.teamId],
      rootingFor: opponentOf(pickRooting(target.pick.teamId, target.pick.side, game), game),
      isViewer: fader.id === viewerId,
      targetManager: target.manager,
    });
  }

  const byTeamThenSeat = (a: InterestRow, b: InterestRow) =>
    teamOrder(a.teamId, game) - teamOrder(b.teamId, game) || a.manager.seat - b.manager.seat;
  const rows = [...pickRows.sort(byTeamThenSeat), ...fadeRows.sort(byTeamThenSeat)];
  return { ...base, state: rows.length > 0 ? "rows" : "none", rows };
}

/** Every pick and fade on either team of the game, per league, in the order given. */
export function leagueInterests(leagues: readonly InterestLeague[], game: GameTeams): LeagueInterest[] {
  return leagues.map((entry) => leagueInterest(entry, game));
}

/** The viewer's own 30/30 Challenge sides on the game's two teams, or null without an entry for this season. */
export function challengeInterest(
  stake: ChallengeStakeInput | null,
  season: number,
  game: GameTeams,
): ChallengeInterest | null {
  if (!stake || stake.entry.season !== season) return null;
  const { entry, frozen } = stake;
  const rows: ChallengeRow[] = [];
  for (const teamId of [game.awayId, game.homeId]) {
    const pick = entry.picks.find((p) => p.teamId === teamId);
    if (!pick) continue;
    let line: number | null;
    let lineKind: ChallengeRow["lineKind"];
    if (frozen) {
      const value = frozen.missing.includes(teamId) ? undefined : frozen.values[teamId];
      line = value ?? null;
      lineKind = value === undefined ? "unavailable" : "frozen";
    } else {
      line = pick.lineAtPick;
      lineKind = line === null ? "unavailable" : "at_pick";
    }
    rows.push({ teamId, side: pick.side, line, lineKind, rootingFor: pickRooting(teamId, pick.side, game) });
  }
  return { entryName: entry.displayName, rows };
}

/** Only the viewer's rows: league picks and fades, then challenge sides. Nothing is merged. */
export function yourStakes(leagues: readonly LeagueInterest[], challenge: ChallengeInterest | null): YourStake[] {
  const stakes: YourStake[] = [];
  for (const league of leagues) {
    for (const row of league.rows) {
      if (!row.isViewer) continue;
      stakes.push({
        source: { kind: "league", leagueId: league.leagueId, leagueName: league.leagueName },
        kind: row.kind,
        teamId: row.teamId,
        side: row.side,
        line: row.line,
        rootingFor: row.rootingFor,
        targetManager: row.targetManager,
      });
    }
  }
  for (const row of challenge?.rows ?? []) {
    stakes.push({
      source: { kind: "challenge" },
      kind: "challenge",
      teamId: row.teamId,
      side: row.side,
      line: row.line,
      rootingFor: row.rootingFor,
      targetManager: null,
    });
  }
  return stakes;
}

/** How many rows (league picks, fades, challenge sides) root for each of the game's teams. */
export function rootingSplit(
  leagues: readonly LeagueInterest[],
  challenge: ChallengeInterest | null,
  game: GameTeams,
): Record<TeamId, number> {
  const split: Record<TeamId, number> = { [game.awayId]: 0, [game.homeId]: 0 };
  for (const league of leagues) {
    for (const row of league.rows) split[row.rootingFor] = (split[row.rootingFor] ?? 0) + 1;
  }
  for (const row of challenge?.rows ?? []) split[row.rootingFor] = (split[row.rootingFor] ?? 0) + 1;
  return split;
}

export function interestSummary(
  leagues: readonly LeagueInterest[],
  challenge: ChallengeInterest | null,
): InterestSummary {
  const seen = new Set<string>();
  const managers: InterestSummary["managers"] = [];
  let count = 0;
  let viewerInvolved = false;
  for (const league of leagues) {
    for (const row of league.rows) {
      count += 1;
      if (row.isViewer) viewerInvolved = true;
      const key = `${league.leagueId}\u0000${row.manager.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      managers.push({ leagueId: league.leagueId, manager: row.manager });
    }
  }
  const challengeRows = challenge?.rows.length ?? 0;
  return { managers, count: count + challengeRows, viewerInvolved: viewerInvolved || challengeRows > 0 };
}
