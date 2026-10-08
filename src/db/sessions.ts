import { and, eq, gt, ne, sql } from "drizzle-orm";
import { ACCESS } from "@/config/access";
import type { Db } from "./client";
import { sessions, sessionSeats } from "./schema";

export interface SessionRecord {
  id: string;
  /** leagueId → managerId for every seat this browser holds. */
  seats: Readonly<Record<string, string>>;
}

const renewedExpiry = () => sql`now() + make_interval(days => ${ACCESS.sessionIdleDays})`;

export async function createSession(db: Db, tokenHash: string): Promise<string> {
  const [row] = await db.insert(sessions).values({ tokenHash, expiresAt: renewedExpiry() }).returning({ id: sessions.id });
  return row.id;
}

/**
 * The unexpired session for a token hash, with its seats. An expired session is deleted. An unexpired one has its
 * expiry pushed back, at most once per ACCESS.sessionRenewHours.
 */
export async function findSession(db: Db, tokenHash: string): Promise<SessionRecord | null> {
  const [row] = await db
    .select({
      id: sessions.id,
      expired: sql<boolean>`${sessions.expiresAt} <= now()`,
      renewDue: sql<boolean>`${sessions.lastSeenAt} < now() - make_interval(hours => ${ACCESS.sessionRenewHours})`,
    })
    .from(sessions)
    .where(eq(sessions.tokenHash, tokenHash));
  if (!row) return null;
  if (row.expired) {
    await db.delete(sessions).where(eq(sessions.id, row.id));
    return null;
  }
  if (row.renewDue) {
    await db.update(sessions).set({ lastSeenAt: sql`now()`, expiresAt: renewedExpiry() }).where(eq(sessions.id, row.id));
  }
  const seats = await db
    .select({ leagueId: sessionSeats.leagueId, managerId: sessionSeats.managerId })
    .from(sessionSeats)
    .where(eq(sessionSeats.sessionId, row.id));
  return { id: row.id, seats: Object.fromEntries(seats.map((seat) => [seat.leagueId, seat.managerId])) };
}

/** The seat this session holds in a league, or null. Call it inside the transaction that holds the league lock. */
export async function seatInLeague(db: Db, sessionId: string, leagueId: string): Promise<string | null> {
  const [row] = await db
    .select({ managerId: sessionSeats.managerId })
    .from(sessionSeats)
    .innerJoin(sessions, eq(sessions.id, sessionSeats.sessionId))
    .where(
      and(eq(sessionSeats.sessionId, sessionId), eq(sessionSeats.leagueId, leagueId), gt(sessions.expiresAt, sql`now()`)),
    );
  return row?.managerId ?? null;
}

/** Seats this session as the manager, replacing any seat it held in the league. */
export async function bindSeat(db: Db, sessionId: string, leagueId: string, managerId: string): Promise<void> {
  await db
    .insert(sessionSeats)
    .values({ sessionId, leagueId, managerId })
    .onConflictDoUpdate({ target: [sessionSeats.sessionId, sessionSeats.leagueId], set: { managerId, createdAt: sql`now()` } });
}

/** Signs a seat out on every browser, or on every browser except `keepSessionId`. */
export async function unbindSeat(db: Db, leagueId: string, managerId: string, keepSessionId?: string): Promise<void> {
  await db
    .delete(sessionSeats)
    .where(
      and(
        eq(sessionSeats.leagueId, leagueId),
        eq(sessionSeats.managerId, managerId),
        keepSessionId ? ne(sessionSeats.sessionId, keepSessionId) : undefined,
      ),
    );
}
