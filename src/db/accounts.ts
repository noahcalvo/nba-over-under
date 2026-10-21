import { and, desc, eq } from "drizzle-orm";
import type { Db, Tx } from "./client";
import { leagues, managers, userSeats } from "./schema";
import type { SeatedLeague } from "./leagues";

/** The seat this account holds in a league, or null. Call it inside the transaction that holds the league lock. */
export async function userSeatInLeague(db: Db | Tx, userId: string, leagueId: string): Promise<string | null> {
  const [row] = await db
    .select({ managerId: userSeats.managerId })
    .from(userSeats)
    .where(and(eq(userSeats.userId, userId), eq(userSeats.leagueId, leagueId)));
  return row?.managerId ?? null;
}

/** The account holding a seat, or null. Call it inside the transaction that holds the league lock. */
export async function seatHolder(db: Db | Tx, leagueId: string, managerId: string): Promise<string | null> {
  const [row] = await db
    .select({ userId: userSeats.userId })
    .from(userSeats)
    .where(and(eq(userSeats.leagueId, leagueId), eq(userSeats.managerId, managerId)));
  return row?.userId ?? null;
}

/**
 * Seats an account as the manager. A plain insert: the caller decides under the league lock, and the primary key
 * (one seat per account per league) and `user_seats_seat_unique` (one account per seat) reject anything it missed.
 */
export async function bindUserSeat(db: Db | Tx, userId: string, leagueId: string, managerId: string): Promise<void> {
  await db.insert(userSeats).values({ userId, leagueId, managerId });
}

/** Frees a seat: whoever held it no longer does. */
export async function unbindSeatHolder(db: Db | Tx, leagueId: string, managerId: string): Promise<void> {
  await db.delete(userSeats).where(and(eq(userSeats.leagueId, leagueId), eq(userSeats.managerId, managerId)));
}

/** leagueId → managerId for every seat this account holds. */
export async function loadUserSeats(db: Db, userId: string): Promise<Readonly<Record<string, string>>> {
  const rows = await db
    .select({ leagueId: userSeats.leagueId, managerId: userSeats.managerId })
    .from(userSeats)
    .where(eq(userSeats.userId, userId));
  return Object.fromEntries(rows.map((row) => [row.leagueId, row.managerId]));
}

/** The leagues an account holds a seat in, most recently joined first. */
export async function listUserLeagues(db: Db, userId: string): Promise<SeatedLeague[]> {
  const rows = await db
    .select({
      id: leagues.id,
      name: leagues.name,
      seasonLabel: leagues.seasonLabel,
      commissionerId: leagues.commissionerId,
      managerId: managers.id,
      seat: managers.seat,
      displayName: managers.displayName,
    })
    .from(userSeats)
    .innerJoin(leagues, eq(leagues.id, userSeats.leagueId))
    .innerJoin(managers, and(eq(managers.leagueId, userSeats.leagueId), eq(managers.id, userSeats.managerId)))
    .where(eq(userSeats.userId, userId))
    .orderBy(desc(userSeats.createdAt));
  return rows.map(({ managerId, seat, displayName, ...league }) => ({
    ...league,
    manager: { id: managerId, seat, displayName },
  }));
}
