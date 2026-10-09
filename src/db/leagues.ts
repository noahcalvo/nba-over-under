import { and, asc, desc, eq } from "drizzle-orm";
import { DEMO_LEAGUE_ID } from "@/data/demo-league";
import { fail, type DomainError, type Result } from "@/lib/league/errors";
import type { League, Manager } from "@/lib/types";
import type { Db, Tx } from "./client";
import { fades, leagues, managers, picks, sessionSeats } from "./schema";
import { seatInLeague } from "./sessions";

type LeagueRow = typeof leagues.$inferSelect;

type LeagueParts = [
  managerRows: (typeof managers.$inferSelect)[],
  pickRows: (typeof picks.$inferSelect)[],
  fadeRows: (typeof fades.$inferSelect)[],
];

/** A league's managers, picks and fades. On a pool the three queries run at once; a transaction runs them in turn. */
function loadParts(db: Db, leagueId: string): Promise<LeagueParts> {
  return Promise.all([
    db.select().from(managers).where(eq(managers.leagueId, leagueId)).orderBy(asc(managers.seat)),
    db.select().from(picks).where(eq(picks.leagueId, leagueId)).orderBy(asc(picks.pickNumber)),
    db
      .select()
      .from(fades)
      .where(eq(fades.leagueId, leagueId))
      .orderBy(asc(fades.createdAt), asc(fades.managerId)),
  ]);
}

async function assemble(db: Db, row: LeagueRow, parts?: LeagueParts): Promise<League> {
  const [managerRows, pickRows, fadeRows] = parts ?? (await loadParts(db, row.id));
  const roster: Manager[] = managerRows.map((manager) => ({
    id: manager.id,
    seat: manager.seat,
    displayName: manager.displayName,
  }));
  return {
    id: row.id,
    name: row.name,
    seasonLabel: row.seasonLabel,
    isDemo: false,
    commissionerId: row.commissionerId,
    version: row.version,
    managers: roster,
    draft: {
      status: row.draftStatus,
      rounds: row.rounds,
      seatOrder: roster.map((manager) => manager.id),
      picks: pickRows.map((pick) => ({
        pickNumber: pick.pickNumber,
        managerId: pick.managerId,
        teamId: pick.teamId,
        side: pick.side,
      })),
    },
    fades: fadeRows.map((fade) => ({
      id: `fade-${fade.managerId}`,
      managerId: fade.managerId,
      targetPickNumber: fade.targetPickNumber,
    })),
    lineOverrides: row.lineOverrides,
    lines:
      row.lines && row.linesSource && row.linesAsOf
        ? {
            values: row.lines,
            source: row.linesSource,
            season: row.linesSeason ?? row.seasonLabel,
            asOf: row.linesAsOf.toISOString(),
            manual: row.linesManual ?? [],
          }
        : null,
  };
}

/** A stored league, or null. The demo league is never stored; see src/server/league.ts. */
export async function loadLeague(db: Db, leagueId: string): Promise<League | null> {
  // One round trip: the league row and its parts are read together (an unknown id just finds no parts).
  const [[row], parts] = await Promise.all([
    db.select().from(leagues).where(eq(leagues.id, leagueId)),
    loadParts(db, leagueId),
  ]);
  return row ? assemble(db, row, parts) : null;
}

/** Inserts a new league and its managers. False when the id is already taken. */
export async function insertLeague(tx: Tx, league: League): Promise<boolean> {
  const inserted = await tx
    .insert(leagues)
    .values({
      id: league.id,
      name: league.name,
      seasonLabel: league.seasonLabel,
      commissionerId: league.commissionerId,
      rounds: league.draft.rounds,
      draftStatus: league.draft.status,
      lineOverrides: league.lineOverrides,
      version: league.version,
    })
    .onConflictDoNothing()
    .returning({ id: leagues.id });
  if (inserted.length === 0) return false;
  await tx.insert(managers).values(
    league.managers.map((manager) => ({
      leagueId: league.id,
      id: manager.id,
      seat: manager.seat,
      displayName: manager.displayName,
    })),
  );
  return true;
}

/** Writes what changed between two versions of a locked league (new picks and fades, names, status, lines) and bumps version. */
export async function saveLeague(tx: Tx, before: League, after: League): Promise<League> {
  const newPicks = after.draft.picks.slice(before.draft.picks.length);
  if (newPicks.length > 0) {
    await tx.insert(picks).values(newPicks.map((pick) => ({ leagueId: after.id, ...pick })));
  }
  const newFades = after.fades.filter((fade) => !before.fades.some((old) => old.managerId === fade.managerId));
  if (newFades.length > 0) {
    await tx.insert(fades).values(
      newFades.map((fade) => ({ leagueId: after.id, managerId: fade.managerId, targetPickNumber: fade.targetPickNumber })),
    );
  }
  for (const manager of after.managers) {
    const previous = before.managers.find((candidate) => candidate.id === manager.id);
    if (previous?.displayName === manager.displayName) continue;
    await tx
      .update(managers)
      .set({ displayName: manager.displayName })
      .where(and(eq(managers.leagueId, after.id), eq(managers.id, manager.id)));
  }
  const version = before.version + 1;
  await tx
    .update(leagues)
    .set({
      draftStatus: after.draft.status,
      lines: after.lines?.values ?? null,
      linesSource: after.lines?.source ?? null,
      linesAsOf: after.lines ? new Date(after.lines.asOf) : null,
      linesSeason: after.lines?.season ?? null,
      linesManual: after.lines ? [...after.lines.manual] : null,
      lineOverrides: after.lineOverrides,
      version,
    })
    .where(eq(leagues.id, after.id));
  return { ...after, version };
}

export interface LockedLeague {
  tx: Tx;
  league: League;
  /** This session's seat in the league, read under the lock. Null for spectators and signed-out browsers. */
  actorId: string | null;
}

/** Carries a domain error out of the transaction callback so the transaction rolls back. */
class Abort extends Error {
  constructor(readonly code: DomainError) {
    super(code);
  }
}

/** Backstops: if the lock and the rules ever miss a duplicate, the database still refuses it. */
const UNIQUE_VIOLATIONS: Readonly<Record<string, DomainError>> = {
  picks_pkey: "stale_pick",
  picks_side_unique: "side_taken",
  picks_manager_team_unique: "team_already_held",
  fades_pkey: "fade_locked",
};

function uniqueViolation(error: unknown): DomainError | null {
  for (let cause: unknown = error; cause && typeof cause === "object"; cause = (cause as { cause?: unknown }).cause) {
    const { code, constraint } = cause as { code?: unknown; constraint?: unknown };
    if (code === "23505" && typeof constraint === "string") return UNIQUE_VIOLATIONS[constraint] ?? null;
  }
  return null;
}

/**
 * The only way to write to a league. In one transaction: lock the league row (SELECT … FOR UPDATE), read this
 * session's seat under the lock, load the league, then run `work`. An error result rolls back everything `work`
 * wrote. Writers to one league run one at a time; reads are not blocked.
 */
export async function withLockedLeague<T>(
  db: Db,
  leagueId: string,
  sessionId: string | null,
  work: (locked: LockedLeague) => Promise<Result<T>>,
): Promise<Result<T>> {
  if (leagueId === DEMO_LEAGUE_ID) return fail("demo_league");
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx.select().from(leagues).where(eq(leagues.id, leagueId)).for("update");
      if (!row) return fail<T>("not_found");
      const actorId = sessionId ? await seatInLeague(tx, sessionId, leagueId) : null;
      const result = await work({ tx, league: await assemble(tx, row), actorId });
      if (!result.ok) throw new Abort(result.error);
      return result;
    });
  } catch (error) {
    if (error instanceof Abort) return fail(error.code);
    const violation = uniqueViolation(error);
    if (violation) return fail(violation);
    throw error;
  }
}

export interface SeatedLeague {
  id: string;
  name: string;
  seasonLabel: string;
  commissionerId: string;
  manager: Manager;
}

/** The leagues a session holds a seat in, most recently joined first. */
export async function listSessionLeagues(db: Db, sessionId: string): Promise<SeatedLeague[]> {
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
    .from(sessionSeats)
    .innerJoin(leagues, eq(leagues.id, sessionSeats.leagueId))
    .innerJoin(managers, and(eq(managers.leagueId, sessionSeats.leagueId), eq(managers.id, sessionSeats.managerId)))
    .where(eq(sessionSeats.sessionId, sessionId))
    .orderBy(desc(sessionSeats.createdAt));
  return rows.map(({ managerId, seat, displayName, ...league }) => ({
    ...league,
    manager: { id: managerId, seat, displayName },
  }));
}
