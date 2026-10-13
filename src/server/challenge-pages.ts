import "server-only";
import { CHALLENGE } from "@/config/challenge";
import { TEAM_DIVISIONS, TEAM_IDS, TEAM_INFO, type Division } from "@/data/teams";
import { listEntries, loadEntry } from "@/db/challenge";
import { lineMove } from "@/lib/challenge/movement";
import { isLocked } from "@/lib/challenge/phase";
import { entryTotal, rankEntries, scoreEntry, type EntryScore } from "@/lib/challenge/scoring";
import type { ChallengeEntry, ChallengePhase, ChallengePick, ChallengeSeason } from "@/lib/challenge/types";
import type { GameLogRead } from "@/lib/game-log/types";
import type { Basis, CallEvaluation } from "@/lib/scoring";
import { teamOptions } from "@/lib/team-detail";
import type { TeamId, TeamInfo } from "@/lib/types";
import { getViewerEntry, prepareChallenge, type PreparedChallenge } from "@/server/challenge";
import { readGameLog } from "@/server/game-log";

// Page loaders for one entry's results, the leaderboard and a team page. Request preparation and the board live in
// src/server/challenge.ts.

// --- One entry's results ------------------------------------------------------------------------------------------

export interface ResultRow {
  team: TeamInfo;
  division: Division;
  pick: ChallengePick;
  currentLine: number | null;
  /** Current line minus the line at pick; only meaningful before the lock. */
  move: number | null;
  frozenLine: number | null;
  projected: CallEvaluation | null;
  final: CallEvaluation | null;
}

export interface EntryResultsData {
  seasonLabel: string;
  phase: ChallengePhase;
  season: ChallengeSeason | null;
  now: string;
  entry: ChallengeEntry;
  isViewer: boolean;
  /** True before the lock for anyone but the owner: the picks are not shown. */
  hidden: boolean;
  /** Team order; empty when hidden. */
  rows: ResultRow[];
  /** Null before the freeze. */
  score: EntryScore | null;
  /** "final" in the final phase, else "projected". */
  basis: Basis;
  rank: number | null;
  entrants: number;
  lines: { book: string; asOf: string | null; error: string | null };
}

const basisFor = (phase: ChallengePhase): Basis => (phase === "final" ? "final" : "projected");

function scoreAgainstFrozen(entry: ChallengeEntry, prepared: PreparedChallenge): EntryScore | null {
  const frozen = prepared.season?.frozen;
  return frozen ? scoreEntry(entry.picks, prepared.teams, frozen.values) : null;
}

/** Every entry of the season ranked on the basis (all unscored, hence unranked, before the freeze). */
async function rankAll(prepared: PreparedChallenge, basis: Basis) {
  const entries = await listEntries(prepared.db, CHALLENGE.seasonYear);
  const scores = new Map(entries.map((entry) => [entry.id, scoreAgainstFrozen(entry, prepared)]));
  const ranked = rankEntries(
    entries.map((entry) => {
      const score = scores.get(entry.id);
      return { entry, score: score ? entryTotal(score, basis) : null };
    }),
  );
  return { entries, ranked, scores };
}

function resultRows(entry: ChallengeEntry, score: EntryScore | null, prepared: PreparedChallenge): ResultRow[] {
  const picks = new Map(entry.picks.map((pick) => [pick.teamId, pick]));
  const scored = new Map(score?.picks.map((item) => [item.pick.teamId, item]));
  return prepared.teams.flatMap((team) => {
    const pick = picks.get(team.id);
    if (!pick) return [];
    const currentLine = prepared.current.values[team.id] ?? null;
    const item = scored.get(team.id);
    return [
      {
        team,
        division: TEAM_DIVISIONS[team.id],
        pick,
        currentLine,
        move: lineMove(pick.lineAtPick, currentLine),
        frozenLine: item?.line ?? null,
        projected: item?.projected ?? null,
        final: item?.final ?? null,
      },
    ];
  });
}

async function buildResults(entry: ChallengeEntry, prepared: PreparedChallenge, viewer: ChallengeEntry | null): Promise<EntryResultsData> {
  const { season, phase, now, current } = prepared;
  const isViewer = viewer?.id === entry.id;
  const hidden = !isViewer && !isLocked(phase);
  const basis = basisFor(phase);
  const score = hidden ? null : scoreAgainstFrozen(entry, prepared);
  const { entries, ranked } = await rankAll(prepared, basis);
  return {
    seasonLabel: CHALLENGE.season,
    phase,
    season,
    now: now.toISOString(),
    entry,
    isViewer,
    hidden,
    rows: hidden ? [] : resultRows(entry, score, prepared),
    score,
    basis,
    rank: ranked.find((row) => row.entry.id === entry.id)?.rank ?? null,
    entrants: entries.length,
    lines: { book: current.book, asOf: current.asOf, error: current.error },
  };
}

/** The viewer's own entry; null without one. */
export async function loadMyResults(): Promise<EntryResultsData | null> {
  const prepared = await prepareChallenge();
  const entry = await getViewerEntry(prepared.db);
  return entry ? buildResults(entry, prepared, entry) : null;
}

/** Any entry of the season by public id; null for an unknown id or another season's entry. */
export async function loadEntryResults(entryId: string): Promise<EntryResultsData | null> {
  const prepared = await prepareChallenge();
  const entry = await loadEntry(prepared.db, entryId);
  if (!entry || entry.season !== CHALLENGE.seasonYear) return null;
  return buildResults(entry, prepared, await getViewerEntry(prepared.db));
}

// --- Leaderboard and team page -----------------------------------------------------------------------------------

export interface LeaderboardRow {
  id: string;
  displayName: string;
  rank: number | null;
  score: number | null;
  onPace: number;
  scored: number;
  isViewer: boolean;
}

export interface LeaderboardData {
  seasonLabel: string;
  phase: ChallengePhase;
  season: ChallengeSeason | null;
  basis: Basis;
  rows: LeaderboardRow[];
  viewerEntryId: string | null;
  now: string;
}

export async function loadLeaderboard(): Promise<LeaderboardData> {
  const prepared = await prepareChallenge();
  const basis = basisFor(prepared.phase);
  const viewer = await getViewerEntry(prepared.db);
  const { ranked, scores } = await rankAll(prepared, basis);
  return {
    seasonLabel: CHALLENGE.season,
    phase: prepared.phase,
    season: prepared.season,
    basis,
    rows: ranked.map(({ entry, score, rank }) => {
      const detail = scores.get(entry.id);
      return {
        id: entry.id,
        displayName: entry.displayName,
        rank,
        score,
        onPace: detail?.onPace ?? 0,
        scored: detail ? (basis === "final" ? detail.finalScored : detail.projectedScored) : 0,
        isViewer: viewer?.id === entry.id,
      };
    }),
    viewerEntryId: viewer?.id ?? null,
    now: prepared.now.toISOString(),
  };
}

export interface ChallengeTeamData {
  seasonLabel: string;
  phase: ChallengePhase;
  info: TeamInfo;
  division: Division;
  frozenLine: number | null;
  currentLine: number | null;
  /** The viewer's own pick of this team. */
  pick: ChallengePick | null;
  projected: CallEvaluation | null;
  final: CallEvaluation | null;
  /** Streams: not awaited, never rejects. */
  gameLog: Promise<GameLogRead>;
  teamNames: Record<TeamId, string>;
}

/** One team's challenge page. Null for an unknown team id. */
export async function loadChallengeTeam(rawTeamId: string): Promise<ChallengeTeamData | null> {
  const teamId = rawTeamId.toUpperCase();
  if (!TEAM_IDS.has(teamId)) return null;
  const prepared = await prepareChallenge();
  const info = prepared.teams.find((team) => team.id === teamId);
  if (!info) return null;
  const gameLog = readGameLog({ isDemo: false, seasonLabel: CHALLENGE.season }, teamId);
  const entry = await getViewerEntry(prepared.db);
  const pick = entry?.picks.find((candidate) => candidate.teamId === teamId) ?? null;
  const frozen = prepared.season?.frozen ?? null;
  const scored = pick && frozen ? scoreEntry([pick], prepared.teams, frozen.values).picks[0] : null;
  return {
    seasonLabel: CHALLENGE.season,
    phase: prepared.phase,
    info,
    division: TEAM_DIVISIONS[teamId],
    frozenLine: frozen?.values[teamId] ?? null,
    currentLine: prepared.current.values[teamId] ?? null,
    pick,
    projected: scored?.projected ?? null,
    final: scored?.final ?? null,
    gameLog,
    teamNames: Object.fromEntries(teamOptions(TEAM_INFO).map((option) => [option.id, option.label])),
  };
}
