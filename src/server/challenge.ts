import "server-only";
import { CHALLENGE } from "@/config/challenge";
import { LINES } from "@/config/lines";
import { MOCK_OPENING_GAME } from "@/data/schedule";
import { TEAM_DIVISIONS, TEAM_INFO, type Division } from "@/data/teams";
import type { Db } from "@/db/client";
import {
  freezeChallenge,
  loadChallengeSeason,
  loadEntryForSession,
  loadLatestSnapshot,
  recordLineSnapshot,
  syncChallengeSchedule,
  type ScheduleRead,
} from "@/db/challenge";
import { loadSeasonRecords } from "@/db/records";
import { challengePhase } from "@/lib/challenge/phase";
import { openingGame } from "@/lib/challenge/schedule";
import type { ChallengeEntry, ChallengePhase, ChallengeSeason } from "@/lib/challenge/types";
import { FeedError } from "@/lib/feed-error";
import { withRecords } from "@/lib/records/merge";
import type { TeamId, TeamInfo } from "@/lib/types";
import { getDb } from "@/server/db";
import { gameLogSource } from "@/server/game-log";
import { readLines } from "@/server/lines";
import { getSession } from "@/server/session";

// --- Request preparation: schedule, current lines, freeze ---------------------------------------------------------

/** The opening game from ESPN's schedules, or (RECORD_SOURCE=static) the mock one / CHALLENGE_MOCK_TIPOFF. */
async function readOpeningGame(): Promise<ScheduleRead> {
  if (process.env.RECORD_SOURCE === "static") {
    const override = process.env.CHALLENGE_MOCK_TIPOFF;
    if (!override) return { ok: true, game: MOCK_OPENING_GAME };
    const time = Date.parse(override);
    if (Number.isNaN(time)) return { ok: false, error: "CHALLENGE_MOCK_TIPOFF is not a valid date." };
    return { ok: true, game: { tipoff: new Date(time).toISOString(), teams: MOCK_OPENING_GAME.teams } };
  }
  try {
    const logs = await Promise.all(TEAM_INFO.map((team) => gameLogSource.fetch(CHALLENGE.seasonYear, team.id)));
    const game = openingGame(logs);
    return game ? { ok: true, game } : { ok: false, error: "ESPN's schedule has no dated regular-season games yet." };
  } catch (error) {
    if (error instanceof FeedError) return { ok: false, error: error.message };
    console.error("Challenge schedule read failed", error);
    return { ok: false, error: "The season schedule couldn't be read." };
  }
}

/** True when the stored schedule should be read again: no row yet, or still open to change and stale (or forced). */
function scheduleDue(season: ChallengeSeason | null, now: Date, force: boolean): boolean {
  if (!season) return true;
  if (season.frozen) return false;
  if (season.deadline && Date.parse(season.deadline) <= now.getTime()) return false;
  if (force || !season.scheduleCheckedAt) return true;
  return now.getTime() - Date.parse(season.scheduleCheckedAt) > CHALLENGE.scheduleCheckMinutes * 60_000;
}

export interface CurrentLines {
  /** teamId → line; empty when no read ever succeeded. */
  values: Readonly<Record<TeamId, number>>;
  book: string;
  asOf: string | null;
  /** Why the latest read failed (older lines may still be shown). */
  error: string | null;
}

/** FanDuel's latest lines for the challenge season (recorded as a snapshot), else the newest stored snapshot. */
async function readCurrentLines(db: Db, frozen: boolean): Promise<CurrentLines> {
  const read = await readLines();
  if (read.lines?.season === CHALLENGE.season) {
    // A failed read returns older lines, which an earlier successful read already recorded; after the freeze
    // snapshots serve no purpose.
    if (read.error === null && !frozen) await recordLineSnapshot(db, CHALLENGE.seasonYear, read.lines);
    const book = read.lines.source === "static" ? LINES.book : read.lines.source;
    return { values: read.lines.values, book, asOf: read.lines.asOf, error: read.error };
  }
  const error = read.error ?? `No current ${LINES.book} lines for ${CHALLENGE.season}.`;
  const snapshot = await loadLatestSnapshot(db, CHALLENGE.seasonYear);
  if (!snapshot) return { values: {}, book: LINES.book, asOf: null, error };
  return { values: snapshot.lines, book: snapshot.source, asOf: snapshot.observedAt, error };
}

export interface PreparedChallenge {
  db: Db;
  season: ChallengeSeason | null;
  current: CurrentLines;
  /** Teams with the season's stored records. */
  teams: TeamInfo[];
  phase: ChallengePhase;
  now: Date;
}

/**
 * Brings the challenge up to date for this request: reads the schedule when due, records the current lines, and
 * stores the freeze once the deadline passed. Every page and the save route start here.
 */
export async function prepareChallenge(options: { forceSchedule?: boolean } = {}): Promise<PreparedChallenge> {
  const db = await getDb();
  const now = new Date();
  let season = await loadChallengeSeason(db, CHALLENGE.seasonYear);
  if (scheduleDue(season, now, options.forceSchedule ?? false)) {
    season = await syncChallengeSchedule(db, CHALLENGE.seasonYear, await readOpeningGame(), now);
  }
  const [current, records] = await Promise.all([readCurrentLines(db, season?.frozen != null), loadSeasonRecords(db, CHALLENGE.seasonYear)]);
  if (season?.deadline && !season.frozen && Date.parse(season.deadline) <= now.getTime()) {
    season = await freezeChallenge(db, CHALLENGE.seasonYear);
  }
  const teams = withRecords(TEAM_INFO, records);
  return { db, season, current, teams, phase: challengePhase(season, now, teams), now };
}

/** This browser's entry for the season. For rendering only: saves authorize under the season lock. */
export async function getViewerEntry(db: Db): Promise<ChallengeEntry | null> {
  const session = await getSession();
  return session ? loadEntryForSession(db, CHALLENGE.seasonYear, session.id) : null;
}

// --- The board ----------------------------------------------------------------------------------------------------

export interface BoardTeam {
  info: TeamInfo;
  division: Division;
  line: number | null;
}

export interface ChallengeBoardData {
  seasonLabel: string;
  phase: ChallengePhase;
  now: string;
  season: ChallengeSeason | null;
  /** TEAM_INFO order; line = current before the lock, frozen after. */
  teams: BoardTeam[];
  lines: { book: string; asOf: string | null; error: string | null; frozen: boolean };
  entry: ChallengeEntry | null;
}

export async function loadChallengeBoard(): Promise<ChallengeBoardData> {
  const { db, season, current, teams, phase, now } = await prepareChallenge();
  const frozen = season?.frozen ?? null;
  const lineFor = (teamId: TeamId) => (frozen ? frozen.values : current.values)[teamId] ?? null;
  return {
    seasonLabel: CHALLENGE.season,
    phase,
    now: now.toISOString(),
    season,
    teams: teams.map((info) => ({ info, division: TEAM_DIVISIONS[info.id], line: lineFor(info.id) })),
    lines: frozen
      ? { book: frozen.source, asOf: frozen.lockedAt, error: null, frozen: true }
      : { book: current.book, asOf: current.asOf, error: current.error, frozen: false },
    entry: await getViewerEntry(db),
  };
}
