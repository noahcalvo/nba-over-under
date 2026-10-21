import { and, eq, isNull, notExists, sql } from "drizzle-orm";
import { decideLegacySeat, type LegacySeatOutcome } from "@/lib/access/legacy";
import { succeed } from "@/lib/league/errors";
import { bindUserSeat, seatHolder } from "./accounts";
import type { Db } from "./client";
import { listSessionLeagues, withLockedLeague, type SeatedLeague } from "./leagues";
import { challengeEntries, sessions, sessionSeats } from "./schema";

/** What a legacy (pre-sign-in) browser session still holds: its seats and the season's unclaimed entry. */
export interface LegacyItems {
  seats: SeatedLeague[];
  entry: { id: string; displayName: string } | null;
}

/** The season's entry this legacy session saved and no account has claimed. */
const legacyEntryOf = (sessionId: string, season: number) =>
  and(eq(challengeEntries.season, season), eq(challengeEntries.ownerSessionId, sessionId), isNull(challengeEntries.ownerUserId));

const entryName = { id: challengeEntries.id, displayName: challengeEntries.displayName };

async function findLegacyEntry(db: Db, sessionId: string, season: number): Promise<LegacyItems["entry"]> {
  const [row] = await db.select(entryName).from(challengeEntries).where(legacyEntryOf(sessionId, season));
  return row ?? null;
}

export async function listLegacyItems(db: Db, sessionId: string, season: number): Promise<LegacyItems> {
  const [seats, entry] = await Promise.all([listSessionLeagues(db, sessionId), findLegacyEntry(db, sessionId, season)]);
  return { seats, entry };
}

export interface LegacyClaimResult {
  seats: { leagueId: string; leagueName: string; managerId: string; outcome: LegacySeatOutcome }[];
  entry: { id: string; displayName: string; outcome: "moved" | "entry_exists" } | null;
  /** True once the legacy session row is gone: the route then deletes the cookie. */
  sessionCleared: boolean;
}

function violatesUnique(error: unknown, constraint: string): boolean {
  for (let cause: unknown = error; cause && typeof cause === "object"; cause = (cause as { cause?: unknown }).cause) {
    const found = cause as { code?: unknown; constraint?: unknown };
    if (found.code === "23505" && found.constraint === constraint) return true;
  }
  return false;
}

/** One legacy seat, under its league's lock. Null when the session no longer holds a seat there (reset, or league gone). */
async function claimSeat(db: Db, sessionId: string, userId: string, seated: SeatedLeague): Promise<LegacyClaimResult["seats"][number] | null> {
  const leagueId = seated.id;
  const result = await withLockedLeague(db, leagueId, userId, async ({ tx, league, actorId }) => {
    // Re-read under the lock: a seat reset deletes the legacy row, and then there is nothing left to move.
    const [legacy] = await tx
      .select({ managerId: sessionSeats.managerId })
      .from(sessionSeats)
      .where(and(eq(sessionSeats.sessionId, sessionId), eq(sessionSeats.leagueId, leagueId)));
    if (!legacy) return succeed(null);
    const { managerId } = legacy;
    const outcome = decideLegacySeat({ userId, managerId, userSeatId: actorId, seatHolderId: await seatHolder(tx, leagueId, managerId) });
    if (outcome === "moved") await bindUserSeat(tx, userId, leagueId, managerId);
    if (outcome === "moved" || outcome === "already_yours") {
      await tx.delete(sessionSeats).where(and(eq(sessionSeats.sessionId, sessionId), eq(sessionSeats.leagueId, leagueId)));
    }
    return succeed({ leagueId, leagueName: league.name, managerId, outcome });
  });
  if (result.ok) return result.value;
  if (result.error === "not_found") return null;
  // A seat write that slipped past the lock: the database's seat constraints refused the move and the legacy row stays.
  if (result.error === "seat_owned" || result.error === "already_joined") {
    return { leagueId, leagueName: seated.name, managerId: seated.manager.id, outcome: result.error };
  }
  throw new Error(`Legacy seat claim failed: ${result.error}`);
}

/**
 * The season's legacy entry moves to the account when the account has none that season, whatever the challenge phase:
 * only `owner_user_id` and `owner_session_id` change, never picks, lines, names or times.
 */
async function claimEntry(db: Db, sessionId: string, userId: string, season: number): Promise<LegacyClaimResult["entry"]> {
  try {
    return await db.transaction(async (tx) => {
      const [entry] = await tx
        .select(entryName)
        .from(challengeEntries)
        .where(legacyEntryOf(sessionId, season))
        .for("update");
      if (!entry) return null;
      const [own] = await tx
        .select({ id: challengeEntries.id })
        .from(challengeEntries)
        .where(and(eq(challengeEntries.season, season), eq(challengeEntries.ownerUserId, userId)));
      if (own) return { ...entry, outcome: "entry_exists" as const };
      await tx.update(challengeEntries).set({ ownerUserId: userId, ownerSessionId: null }).where(eq(challengeEntries.id, entry.id));
      return { ...entry, outcome: "moved" as const };
    });
  } catch (error) {
    // The account saved its own entry while this ran: the database keeps one entry per account per season.
    if (!violatesUnique(error, "challenge_entries_user_unique")) throw error;
    // The update rolled back, so the legacy entry is still unclaimed.
    const entry = await findLegacyEntry(db, sessionId, season);
    return entry && { ...entry, outcome: "entry_exists" };
  }
}

/**
 * Moves what a legacy browser session holds into the signed-in account: each seat under its league's lock, then the
 * season's entry. The session row is deleted once nothing references it (no seats, no entry in any season).
 */
export async function claimLegacy(db: Db, sessionId: string, userId: string, season: number): Promise<LegacyClaimResult> {
  const seats: LegacyClaimResult["seats"] = [];
  for (const league of await listSessionLeagues(db, sessionId)) {
    const claimed = await claimSeat(db, sessionId, userId, league);
    if (claimed) seats.push(claimed);
  }
  const entry = await claimEntry(db, sessionId, userId, season);
  await db
    .delete(sessions)
    .where(
      and(
        eq(sessions.id, sessionId),
        notExists(db.select({ one: sql`1` }).from(sessionSeats).where(eq(sessionSeats.sessionId, sessionId))),
        notExists(db.select({ one: sql`1` }).from(challengeEntries).where(eq(challengeEntries.ownerSessionId, sessionId))),
      ),
    );
  const [remaining] = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.id, sessionId));
  return { seats, entry, sessionCleared: !remaining };
}
