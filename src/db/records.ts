import { asc, eq, sql } from "drizzle-orm";
import { RECORDS } from "@/config/records";
import { FeedError } from "@/lib/feed-error";
import type { RecordSource, RecordStatus, TeamRecord } from "@/lib/records/types";
import { checkNoRegression } from "@/lib/records/validate";
import type { TeamId } from "@/lib/types";
import type { Db, Tx } from "./client";
import { leagues, recordRefreshes, teamRecords } from "./schema";

export interface StoredRefresh {
  source: string;
  succeededAt: Date | null;
  attemptedAt: Date;
  error: string | null;
}

export type RefreshOutcome =
  | { ok: true; refresh: StoredRefresh; fetched: boolean }
  | { ok: false; refresh: StoredRefresh; message: string };

const UNEXPECTED = "Something went wrong while refreshing records.";

export async function loadSeasonRecords(db: Db | Tx, season: number): Promise<Record<TeamId, TeamRecord>> {
  const rows = await db.select().from(teamRecords).where(eq(teamRecords.season, season));
  return Object.fromEntries(rows.map((row) => [row.teamId, { wins: row.wins, losses: row.losses }]));
}

export async function loadRefresh(db: Db | Tx, season: number): Promise<StoredRefresh | null> {
  const [row] = await db.select().from(recordRefreshes).where(eq(recordRefreshes.season, season));
  return row ? { source: row.source, succeededAt: row.succeededAt, attemptedAt: row.attemptedAt, error: row.error } : null;
}

/**
 * Reads a season's records from `source` and stores them. The fetch happens before any transaction (no network while
 * holding a lock). Saving locks the season's record_refreshes row, so refreshes of one season run one at a time, and
 * rechecks that no team's games played went down. On any failure the stored records stay as they were; only the
 * attempt time and the reason are saved. A success within RECORDS.minRefreshSeconds is reused unless `force`.
 */
export async function refreshSeasonRecords(
  db: Db,
  season: number,
  source: RecordSource,
  options: { force?: boolean; now?: Date } = {},
): Promise<RefreshOutcome> {
  const now = options.now ?? new Date();
  const current = await loadRefresh(db, season);
  if (
    !options.force &&
    current?.succeededAt &&
    now.getTime() - current.succeededAt.getTime() < RECORDS.minRefreshSeconds * 1000
  ) {
    return { ok: true, refresh: current, fetched: false };
  }
  try {
    const set = await source.fetch(season);
    const refresh = await db.transaction(async (tx) => {
      await tx.insert(recordRefreshes).values({ season, source: source.name, attemptedAt: now }).onConflictDoNothing();
      await tx.select().from(recordRefreshes).where(eq(recordRefreshes.season, season)).for("update");
      checkNoRegression(await loadSeasonRecords(tx, season), set.records);
      const rows = Object.entries(set.records).map(([teamId, record]) => ({
        season,
        teamId,
        wins: record.wins,
        losses: record.losses,
        updatedAt: now,
      }));
      if (rows.length > 0) {
        await tx
          .insert(teamRecords)
          .values(rows)
          .onConflictDoUpdate({
            target: [teamRecords.season, teamRecords.teamId],
            set: { wins: sql`excluded.wins`, losses: sql`excluded.losses`, updatedAt: sql`excluded.updated_at` },
          });
      }
      const [row] = await tx
        .update(recordRefreshes)
        .set({ source: source.name, succeededAt: now, attemptedAt: now, error: null })
        .where(eq(recordRefreshes.season, season))
        .returning();
      return { source: row.source, succeededAt: row.succeededAt, attemptedAt: row.attemptedAt, error: row.error };
    });
    return { ok: true, refresh, fetched: true };
  } catch (error) {
    const message = error instanceof FeedError ? error.message : UNEXPECTED;
    if (!(error instanceof FeedError)) console.error("Team record refresh failed", error);
    await db
      .insert(recordRefreshes)
      .values({ season, source: source.name, attemptedAt: now, error: message })
      .onConflictDoUpdate({ target: recordRefreshes.season, set: { attemptedAt: now, error: message } });
    const refresh = await loadRefresh(db, season);
    if (!refresh) throw error;
    return { ok: false, refresh, message };
  }
}

export function recordStatus(seasonLabel: string, refresh: StoredRefresh | null): RecordStatus {
  return {
    seasonLabel,
    source: refresh?.source ?? RECORDS.source,
    asOf: refresh?.succeededAt?.toISOString() ?? null,
    error: refresh?.error ?? null,
  };
}

/** Every season some stored league plays in. */
export async function seasonsInUse(db: Db): Promise<string[]> {
  const rows = await db
    .selectDistinct({ seasonLabel: leagues.seasonLabel })
    .from(leagues)
    .orderBy(asc(leagues.seasonLabel));
  return rows.map((row) => row.seasonLabel);
}
