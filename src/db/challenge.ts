import { and, asc, count, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { LINES } from "@/config/lines";
import { TEAM_INFO } from "@/data/teams";
import { base64url } from "@/lib/access/tokens";
import { freezeFromSnapshots } from "@/lib/challenge/freeze";
import { rebasePicks } from "@/lib/challenge/picks";
import { challengeDeadline } from "@/lib/challenge/schedule";
import type { ChallengeEntry, ChallengePick, ChallengeSeason, LineSnapshot, OpeningGame, PickMap } from "@/lib/challenge/types";
import { fail, succeed, type DomainError, type Result } from "@/lib/league/errors";
import { sameLineValues } from "@/lib/lines";
import type { LineSet, TeamId } from "@/lib/types";
import type { Db, Tx } from "./client";
import { challengeEntries, challengeLineSnapshots, challengePicks, challengeSeasons } from "./schema";

type SeasonRow = typeof challengeSeasons.$inferSelect;

const iso = (date: Date | null) => date?.toISOString() ?? null;

function toSeason(row: SeasonRow): ChallengeSeason {
  return {
    season: row.season,
    openingGame: row.openingTipoff
      ? { tipoff: row.openingTipoff.toISOString(), teams: row.openingTeams ?? [null, null] }
      : null,
    deadline: iso(row.deadline),
    scheduleCheckedAt: iso(row.scheduleCheckedAt),
    scheduleError: row.scheduleError,
    frozen:
      row.lockedAt && row.frozenLines && row.frozenLineTimes && row.frozenMissing && row.frozenSource
        ? {
            values: row.frozenLines,
            observedAt: row.frozenLineTimes,
            missing: row.frozenMissing,
            source: row.frozenSource,
            lockedAt: row.lockedAt.toISOString(),
          }
        : null,
  };
}

export async function loadChallengeSeason(db: Db | Tx, season: number): Promise<ChallengeSeason | null> {
  const [row] = await db.select().from(challengeSeasons).where(eq(challengeSeasons.season, season));
  return row ? toSeason(row) : null;
}

/** The database clock now (not the transaction's start), for deadline checks made after waiting on a lock. */
export async function databaseNow(tx: Db | Tx): Promise<Date> {
  // pg and PGlite both return `{ rows }`; the shared Db type leaves the result unknown.
  const result = (await tx.execute(sql`select clock_timestamp() as now`)) as { rows: { now: string | Date }[] };
  return new Date(result.rows[0].now);
}

export type ScheduleRead = { ok: true; game: OpeningGame } | { ok: false; error: string };

/**
 * Stores a schedule read for the season (creating its row): the opening game and deadline on success, only the error
 * on failure. The deadline is `deadlineOverride` when given, else the tip-off minus the lock window. Once the season is
 * locked or its stored deadline has passed, nothing changes any more.
 */
export async function syncChallengeSchedule(
  db: Db,
  season: number,
  read: ScheduleRead,
  now: Date,
  deadlineOverride: string | null = null,
): Promise<ChallengeSeason> {
  return db.transaction(async (tx) => {
    await tx.insert(challengeSeasons).values({ season }).onConflictDoNothing();
    const [row] = await tx.select().from(challengeSeasons).where(eq(challengeSeasons.season, season)).for("update");
    if (row.lockedAt || (row.deadline && row.deadline.getTime() <= now.getTime())) return toSeason(row);
    const set = read.ok
      ? {
          openingTipoff: new Date(read.game.tipoff),
          openingTeams: read.game.teams,
          deadline: new Date(deadlineOverride ?? challengeDeadline(read.game.tipoff)),
          scheduleCheckedAt: now,
          scheduleError: null,
        }
      : { scheduleCheckedAt: now, scheduleError: read.error };
    const [updated] = await tx.update(challengeSeasons).set(set).where(eq(challengeSeasons.season, season)).returning();
    return toSeason(updated);
  });
}

/**
 * Sets a fixed future deadline (creating the season's row), reopening a locked season: the stored freeze is dropped
 * and taken again once the new deadline passes. A deadline at or before `now` changes nothing.
 */
export async function overrideChallengeDeadline(db: Db, season: number, deadline: string, now: Date): Promise<ChallengeSeason> {
  return db.transaction(async (tx) => {
    await tx.insert(challengeSeasons).values({ season }).onConflictDoNothing();
    const [row] = await tx.select().from(challengeSeasons).where(eq(challengeSeasons.season, season)).for("update");
    const time = Date.parse(deadline);
    if (time <= now.getTime() || row.deadline?.getTime() === time) return toSeason(row);
    const [updated] = await tx
      .update(challengeSeasons)
      .set({ deadline: new Date(time), lockedAt: null, frozenLines: null, frozenLineTimes: null, frozenMissing: null, frozenSource: null })
      .where(eq(challengeSeasons.season, season))
      .returning();
    return toSeason(updated);
  });
}

function toSnapshot(row: typeof challengeLineSnapshots.$inferSelect): LineSnapshot {
  return { observedAt: row.observedAt.toISOString(), source: row.source, lines: row.lines };
}

export async function loadLatestSnapshot(db: Db, season: number): Promise<LineSnapshot | null> {
  const [row] = await db
    .select()
    .from(challengeLineSnapshots)
    .where(eq(challengeLineSnapshots.season, season))
    .orderBy(desc(challengeLineSnapshots.observedAt))
    .limit(1);
  return row ? toSnapshot(row) : null;
}

/**
 * Remembers a successful FanDuel read. Values identical to the newest snapshot only move its confirmed time; new
 * values add a snapshot observed at the read's time. The same read recorded twice is stored once.
 */
export async function recordLineSnapshot(db: Db, season: number, lines: LineSet): Promise<void> {
  const observedAt = new Date(lines.asOf);
  const [latest] = await db
    .select()
    .from(challengeLineSnapshots)
    .where(eq(challengeLineSnapshots.season, season))
    .orderBy(desc(challengeLineSnapshots.observedAt))
    .limit(1);
  if (latest && sameLineValues(latest.lines, lines.values)) {
    if (latest.confirmedAt.getTime() < observedAt.getTime()) {
      await db.update(challengeLineSnapshots).set({ confirmedAt: observedAt }).where(eq(challengeLineSnapshots.id, latest.id));
    }
    return;
  }
  await db
    .insert(challengeLineSnapshots)
    .values({ season, source: lines.source, observedAt, confirmedAt: observedAt, lines: { ...lines.values } })
    .onConflictDoNothing();
}

/**
 * Stores the shared frozen lines once the deadline has passed (database clock unless `now` is given). Idempotent:
 * the row lock serializes concurrent calls and a stored freeze is returned as it is. Null for an unknown season.
 */
export async function freezeChallenge(db: Db, season: number, options: { now?: Date } = {}): Promise<ChallengeSeason | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(challengeSeasons).where(eq(challengeSeasons.season, season)).for("update");
    if (!row) return null;
    if (row.lockedAt || !row.deadline) return toSeason(row);
    const now = options.now ?? (await databaseNow(tx));
    if (now.getTime() < row.deadline.getTime()) return toSeason(row);
    const snapshots = await tx
      .select()
      .from(challengeLineSnapshots)
      .where(and(eq(challengeLineSnapshots.season, season), lt(challengeLineSnapshots.observedAt, row.deadline)));
    const freeze = freezeFromSnapshots(snapshots.map(toSnapshot), row.deadline.toISOString(), TEAM_INFO.map((team) => team.id));
    const [updated] = await tx
      .update(challengeSeasons)
      .set({
        lockedAt: now,
        frozenLines: freeze.values,
        frozenLineTimes: freeze.observedAt,
        frozenMissing: freeze.missing,
        frozenSource: freeze.source ?? LINES.book,
      })
      .where(eq(challengeSeasons.season, season))
      .returning();
    return toSeason(updated);
  });
}

const ENTRY_ID_BYTES = 9; // 12 base64url characters

function createEntryId(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(ENTRY_ID_BYTES)));
}

type EntryRow = typeof challengeEntries.$inferSelect;
type PickRow = typeof challengePicks.$inferSelect;

function toPick(row: PickRow): ChallengePick {
  return { teamId: row.teamId, side: row.side, lineAtPick: row.lineAtPick, pickedAt: row.pickedAt.toISOString() };
}

function toEntry(row: EntryRow, picks: PickRow[]): ChallengeEntry {
  return {
    id: row.id,
    season: row.season,
    displayName: row.displayName,
    createdAt: row.createdAt.toISOString(),
    savedAt: row.savedAt.toISOString(),
    picks: picks
      .filter((pick) => pick.entryId === row.id)
      .map(toPick)
      .sort((a, b) => (a.teamId < b.teamId ? -1 : a.teamId > b.teamId ? 1 : 0)),
  };
}

async function withPicks(db: Db | Tx, rows: EntryRow[]): Promise<ChallengeEntry[]> {
  if (rows.length === 0) return [];
  const picks = await db.select().from(challengePicks).where(inArray(challengePicks.entryId, rows.map((row) => row.id)));
  return rows.map((row) => toEntry(row, picks));
}

export async function loadEntry(db: Db | Tx, entryId: string): Promise<ChallengeEntry | null> {
  const rows = await db.select().from(challengeEntries).where(eq(challengeEntries.id, entryId));
  return (await withPicks(db, rows))[0] ?? null;
}

/** The account's entry for the season (never a legacy session entry). */
export async function loadEntryForUser(db: Db, season: number, userId: string): Promise<ChallengeEntry | null> {
  const rows = await db
    .select()
    .from(challengeEntries)
    .where(and(eq(challengeEntries.season, season), eq(challengeEntries.ownerUserId, userId)));
  return (await withPicks(db, rows))[0] ?? null;
}

/** Every saved entry of the season, oldest first. Owners' sessions are never read. */
export async function listEntries(db: Db, season: number): Promise<ChallengeEntry[]> {
  const rows = await db
    .select()
    .from(challengeEntries)
    .where(eq(challengeEntries.season, season))
    .orderBy(asc(challengeEntries.createdAt), asc(challengeEntries.id));
  return withPicks(db, rows);
}

/** How many entries the season has. */
export async function countEntries(db: Db, season: number): Promise<number> {
  const [row] = await db.select({ count: count() }).from(challengeEntries).where(eq(challengeEntries.season, season));
  return row?.count ?? 0;
}

export type ChallengeEntrant = Pick<ChallengeEntry, "id" | "displayName">;

/** The season's entrants (ids and names only, no picks), oldest first. Owners' sessions are never read. */
export async function listEntrants(db: Db, season: number): Promise<ChallengeEntrant[]> {
  return db
    .select({ id: challengeEntries.id, displayName: challengeEntries.displayName })
    .from(challengeEntries)
    .where(eq(challengeEntries.season, season))
    .orderBy(asc(challengeEntries.createdAt), asc(challengeEntries.id));
}

export interface SaveEntryInput {
  season: number;
  userId: string;
  displayName: string;
  /** All 30 teams (checked by parseChallengeSave). */
  picks: PickMap;
  /** The server's current FanDuel lines: the reference for new or changed sides. */
  currentLines: Readonly<Record<TeamId, number>>;
}

class Abort extends Error {
  constructor(readonly code: DomainError) {
    super(code);
  }
}

/**
 * Saves the account's entry for the season in one transaction. The season row is locked FOR SHARE (a schedule change or
 * the freeze waits, and waits for this), then the clock is read: at or after the deadline, or once frozen, nothing is
 * written (`challenge_locked`); without a deadline, `deadline_unavailable`. Unchanged sides keep their reference line
 * and time (rebasePicks). `options.now` replaces the database clock in tests.
 */
export async function saveChallengeEntry(db: Db, input: SaveEntryInput, options: { now?: Date } = {}): Promise<Result<ChallengeEntry>> {
  try {
    return await db.transaction(async (tx) => {
      const [season] = await tx.select().from(challengeSeasons).where(eq(challengeSeasons.season, input.season)).for("share");
      if (!season?.deadline) throw new Abort("deadline_unavailable");
      const now = options.now ?? (await databaseNow(tx));
      if (season.lockedAt || now.getTime() >= season.deadline.getTime()) throw new Abort("challenge_locked");

      await tx
        .insert(challengeEntries)
        .values({ id: createEntryId(), season: input.season, ownerUserId: input.userId, displayName: input.displayName, createdAt: now, savedAt: now })
        .onConflictDoNothing();
      const [entry] = await tx
        .select()
        .from(challengeEntries)
        .where(and(eq(challengeEntries.season, input.season), eq(challengeEntries.ownerUserId, input.userId)))
        .for("update");
      if (!entry) throw new Error("Challenge entry was not created");
      const stored = await tx.select().from(challengePicks).where(eq(challengePicks.entryId, entry.id));
      const next = rebasePicks(stored.map(toPick), input.picks, input.currentLines, now.toISOString());
      await tx.delete(challengePicks).where(eq(challengePicks.entryId, entry.id));
      await tx.insert(challengePicks).values(
        next.map((pick) => ({ entryId: entry.id, teamId: pick.teamId, side: pick.side, lineAtPick: pick.lineAtPick, pickedAt: new Date(pick.pickedAt) })),
      );
      await tx.update(challengeEntries).set({ displayName: input.displayName, savedAt: now }).where(eq(challengeEntries.id, entry.id));
      const saved = await loadEntry(tx, entry.id);
      if (!saved) throw new Error("Challenge entry vanished");
      return succeed(saved);
    });
  } catch (error) {
    if (error instanceof Abort) return fail(error.code);
    throw error;
  }
}
