import "server-only";
import { after } from "next/server";
import { cache } from "react";
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
  overrideChallengeDeadline,
  recordLineSnapshot,
  syncChallengeSchedule,
  type ScheduleRead,
} from "@/db/challenge";
import { loadSeasonRecords } from "@/db/records";
import { challengePhase } from "@/lib/challenge/phase";
import { needsDeadlineOverride, openingGame, scheduleCheck } from "@/lib/challenge/schedule";
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

/** Reads and stores the schedule; one read at a time per server instance. */
let scheduleSyncInFlight: Promise<ChallengeSeason> | null = null;
function syncSchedule(db: Db): Promise<ChallengeSeason> {
  scheduleSyncInFlight ??= (async () => syncChallengeSchedule(db, CHALLENGE.seasonYear, await readOpeningGame(), new Date(), CHALLENGE.deadlineOverride))().finally(() => {
    scheduleSyncInFlight = null;
  });
  return scheduleSyncInFlight;
}

export interface CurrentLines {
  /** teamId → line; empty when no read ever succeeded. */
  values: Readonly<Record<TeamId, number>>;
  book: string;
  asOf: string | null;
  /** Why the latest read failed (older lines may still be shown). */
  error: string | null;
}

/**
 * FanDuel's latest lines for the challenge season (recorded as a snapshot), else the newest stored snapshot. Once
 * frozen, nothing is read: every page shows the frozen lines and the current ones are only used before the lock.
 */
async function readCurrentLines(db: Db, season: ChallengeSeason | null): Promise<CurrentLines> {
  if (season?.frozen) return { values: {}, book: season.frozen.source, asOf: null, error: null };
  const read = await readLines();
  if (read.lines?.season === CHALLENGE.season) {
    // A failed read returns older lines, which an earlier successful read already recorded.
    if (read.error === null) await recordLineSnapshot(db, CHALLENGE.seasonYear, read.lines);
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
 * Brings the challenge up to date for this request: applies CHALLENGE.deadlineOverride while it is in the future (reopening
 * a locked season), reads the schedule when due (after the response when a future
 * deadline is already stored), reads the current lines until the freeze, and stores the freeze once the deadline passed.
 * The save route and the cron start here; pages use the per-request `prepareChallenge`.
 */
async function prepare(forceSchedule: boolean): Promise<PreparedChallenge> {
  const db = await getDb();
  const now = new Date();
  let season = await loadChallengeSeason(db, CHALLENGE.seasonYear);
  if (needsDeadlineOverride(season, CHALLENGE.deadlineOverride, now)) {
    season = await overrideChallengeDeadline(db, CHALLENGE.seasonYear, CHALLENGE.deadlineOverride, now);
  }
  const check = scheduleCheck(season, now, forceSchedule);
  if (check === "now") season = await syncSchedule(db);
  if (check === "after") {
    after(async () => {
      try {
        await syncSchedule(db);
      } catch (error) {
        console.error("Challenge schedule sync failed", error);
      }
    });
  }
  // Lines are read before the freeze: a cached read observed before the deadline is still recorded for it.
  const [current, records] = await Promise.all([readCurrentLines(db, season), loadSeasonRecords(db, CHALLENGE.seasonYear)]);
  if (season?.deadline && !season.frozen && Date.parse(season.deadline) <= now.getTime()) {
    season = await freezeChallenge(db, CHALLENGE.seasonYear);
  }
  const teams = withRecords(TEAM_INFO, records);
  return { db, season, current, teams, phase: challengePhase(season, now, teams), now };
}

/** The challenge prepared once per request (React `cache`; a route handler gets a fresh run per call). */
export const prepareChallenge = cache((): Promise<PreparedChallenge> => prepare(false));

/** The cron's run: always re-reads the schedule (until the deadline), never cached. */
export function refreshChallenge(): Promise<PreparedChallenge> {
  return prepare(true);
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
