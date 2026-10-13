import { and, desc, eq, lt, sql } from "drizzle-orm";
import { LINES } from "@/config/lines";
import { TEAM_INFO } from "@/data/teams";
import { freezeFromSnapshots } from "@/lib/challenge/freeze";
import { challengeDeadline } from "@/lib/challenge/schedule";
import type { ChallengeSeason, LineSnapshot, OpeningGame } from "@/lib/challenge/types";
import { sameLineValues } from "@/lib/lines";
import type { LineSet } from "@/lib/types";
import type { Db, Tx } from "./client";
import { challengeLineSnapshots, challengeSeasons } from "./schema";

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
 * on failure. Once the season is locked or its stored deadline has passed, nothing changes any more.
 */
export async function syncChallengeSchedule(db: Db, season: number, read: ScheduleRead, now: Date): Promise<ChallengeSeason> {
  return db.transaction(async (tx) => {
    await tx.insert(challengeSeasons).values({ season }).onConflictDoNothing();
    const [row] = await tx.select().from(challengeSeasons).where(eq(challengeSeasons.season, season)).for("update");
    if (row.lockedAt || (row.deadline && row.deadline.getTime() <= now.getTime())) return toSeason(row);
    const set = read.ok
      ? {
          openingTipoff: new Date(read.game.tipoff),
          openingTeams: read.game.teams,
          deadline: new Date(challengeDeadline(read.game.tipoff)),
          scheduleCheckedAt: now,
          scheduleError: null,
        }
      : { scheduleCheckedAt: now, scheduleError: read.error };
    const [updated] = await tx.update(challengeSeasons).set(set).where(eq(challengeSeasons.season, season)).returning();
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
