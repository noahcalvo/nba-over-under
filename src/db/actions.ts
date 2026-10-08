import { eq } from "drizzle-orm";
import { ACCESS } from "@/config/access";
import { DEMO_LEAGUE_ID } from "@/data/demo-league";
import { TEAM_IDS } from "@/data/teams";
import { linkStatus } from "@/lib/access/links";
import type { DraftAction } from "@/lib/draft";
import {
  createLeague,
  decideClaim,
  decideDraftAction,
  decideInviteChange,
  decideLineOverrides,
  decideOwnLinkReset,
  decideSeatReset,
  randomLeagueId,
  type ClaimInput,
} from "@/lib/league/commands";
import { fail, succeed, type Result } from "@/lib/league/errors";
import { canRefreshRecords } from "@/lib/league/permissions";
import { seasonEndYear } from "@/lib/records/season";
import type { RecordSource, RecordStatus } from "@/lib/records/types";
import type { League, LineSet, TeamId } from "@/lib/types";
import type { Db } from "./client";
import { insertLeague, saveLeague, withLockedLeague } from "./leagues";
import { findLink, findLinkAt, issueLink, markSeatInviteUsed, revokeLinks } from "./links";
import { recordStatus, refreshSeasonRecords } from "./records";
import { leagues } from "./schema";
import { bindSeat, seatInLeague, unbindSeat } from "./sessions";

// Every league mutation. Each one runs its pure decision from src/lib/league/commands.ts inside withLockedLeague,
// so permissions and links are checked against the locked state, then persists the outcome.

const LEAGUE_ID_ATTEMPTS = 5;

/** Creates a league with its league invite and the commissioner's personal link, and seats this session in seat 1. */
export async function createLeagueFor(
  db: Db,
  sessionId: string,
  input: { leagueName?: unknown; displayName: unknown },
  generateId: () => string = randomLeagueId,
): Promise<Result<{ leagueId: string }>> {
  for (let attempt = 0; attempt < LEAGUE_ID_ATTEMPTS; attempt++) {
    const created = createLeague(input, generateId());
    if (!created.ok) return fail(created.error);
    const league = created.value;
    const inserted = await db.transaction(async (tx) => {
      if (!(await insertLeague(tx, league))) return false;
      await issueLink(tx, { leagueId: league.id, managerId: null, kind: "league_invite" });
      await issueLink(tx, { leagueId: league.id, managerId: league.commissionerId, kind: "personal" });
      await bindSeat(tx, sessionId, league.id, league.commissionerId);
      return true;
    });
    if (inserted) return succeed({ leagueId: league.id });
  }
  throw new Error("Could not generate a unique league id");
}

export interface DraftOutcome {
  league: League;
  /** The seat that acted, as read under the lock. */
  actorId: string | null;
}

/**
 * Start, pause, resume or confirm. Fetch the source's lines before calling (no network calls while holding the lock);
 * the decision adds the stored overrides.
 */
export function runDraftAction(
  db: Db,
  leagueId: string,
  sessionId: string | null,
  action: DraftAction,
  sourceLines: LineSet | null,
): Promise<Result<DraftOutcome>> {
  return withLockedLeague(db, leagueId, sessionId, async ({ tx, league, actorId }) => {
    const decided = decideDraftAction(league, actorId, action, TEAM_IDS, sourceLines);
    if (!decided.ok) return fail(decided.error);
    return succeed({ league: await saveLeague(tx, league, decided.value), actorId });
  });
}

/** Replaces the commissioner's line overrides. Validate the values (parseLineValues) before calling. */
export function setLineOverrides(
  db: Db,
  leagueId: string,
  sessionId: string | null,
  overrides: Readonly<Record<TeamId, number>>,
): Promise<Result<DraftOutcome>> {
  return withLockedLeague(db, leagueId, sessionId, async ({ tx, league, actorId }) => {
    const decided = decideLineOverrides(league, actorId, overrides);
    if (!decided.ok) return fail(decided.error);
    return succeed({ league: await saveLeague(tx, league, decided.value), actorId });
  });
}

export interface ClaimOutcome {
  leagueId: string;
  managerId: string;
}

/** Claims a link for this session. The caller has already verified the token's signature. */
export async function claimLink(db: Db, linkId: string, sessionId: string, input: ClaimInput): Promise<Result<ClaimOutcome>> {
  // Read without the lock only to learn which league to lock. Nothing here is trusted for the write.
  const link = await findLink(db, linkId);
  if (!link) return fail("invalid_link");
  return claimLinkInLeague(db, link.leagueId, linkId, sessionId, input);
}

/**
 * The locked part of a claim. After taking the league lock it re-reads the link and rechecks revocation, expiry and
 * single use against the database clock, so a claim that lost a race to a revoke, rotation, reset or another claim
 * fails with invalid_link.
 */
export function claimLinkInLeague(
  db: Db,
  leagueId: string,
  linkId: string,
  sessionId: string,
  input: ClaimInput,
): Promise<Result<ClaimOutcome>> {
  return withLockedLeague(db, leagueId, sessionId, async ({ tx, league, actorId }) => {
    const found = await findLinkAt(tx, linkId);
    if (!found || found.link.leagueId !== league.id || linkStatus(found.link, found.now) !== "active") {
      return fail("invalid_link");
    }
    const { link } = found;
    const decided = decideClaim(league, link, actorId, input);
    if (!decided.ok) return fail(decided.error);
    const { managerId } = decided.value;
    if (link.kind === "seat_invite" && !(await markSeatInviteUsed(tx, link.id))) return fail("invalid_link");
    if (link.kind !== "personal") {
      await revokeLinks(tx, { leagueId: league.id, kind: "personal", managerId });
      await issueLink(tx, { leagueId: league.id, managerId, kind: "personal" });
    }
    await bindSeat(tx, sessionId, league.id, managerId);
    if (decided.value.changed) await saveLeague(tx, league, decided.value.league);
    return succeed({ leagueId: league.id, managerId });
  });
}

/** Commissioner: replace the league invite. The old link stops working. */
export function rotateLeagueInvite(db: Db, leagueId: string, sessionId: string | null): Promise<Result<null>> {
  return withLockedLeague(db, leagueId, sessionId, async ({ tx, league, actorId }) => {
    const decided = decideInviteChange(league, actorId);
    if (!decided.ok) return decided;
    await revokeLinks(tx, { leagueId: league.id, kind: "league_invite" });
    await issueLink(tx, { leagueId: league.id, managerId: null, kind: "league_invite" });
    return decided;
  });
}

/** Commissioner: revoke the league invite without a replacement. */
export function revokeLeagueInvite(db: Db, leagueId: string, sessionId: string | null): Promise<Result<null>> {
  return withLockedLeague(db, leagueId, sessionId, async ({ tx, league, actorId }) => {
    const decided = decideInviteChange(league, actorId);
    if (!decided.ok) return decided;
    await revokeLinks(tx, { leagueId: league.id, kind: "league_invite" });
    return decided;
  });
}

/**
 * Commissioner: sign a claimed seat out everywhere and replace its personal link with a single-use seat invite.
 * The seat stays claimed; its name and picks are kept.
 */
export function resetSeat(db: Db, leagueId: string, sessionId: string | null, targetId: string): Promise<Result<null>> {
  return withLockedLeague(db, leagueId, sessionId, async ({ tx, league, actorId }) => {
    const decided = decideSeatReset(league, actorId, targetId);
    if (!decided.ok) return decided;
    await unbindSeat(tx, league.id, targetId);
    await revokeLinks(tx, { leagueId: league.id, kind: "personal", managerId: targetId });
    await revokeLinks(tx, { leagueId: league.id, kind: "seat_invite", managerId: targetId });
    await issueLink(tx, {
      leagueId: league.id,
      managerId: targetId,
      kind: "seat_invite",
      expiresInDays: ACCESS.seatInviteDays,
    });
    return decided;
  });
}

/** Any seated manager: replace their personal link, optionally signing out their other browsers. */
export function resetOwnLink(
  db: Db,
  leagueId: string,
  sessionId: string | null,
  options: { signOutOtherDevices: boolean },
): Promise<Result<null>> {
  return withLockedLeague(db, leagueId, sessionId, async ({ tx, league, actorId }) => {
    const decided = decideOwnLinkReset(league, actorId);
    if (!decided.ok) return fail(decided.error);
    const managerId = decided.value;
    await revokeLinks(tx, { leagueId: league.id, kind: "personal", managerId });
    await issueLink(tx, { leagueId: league.id, managerId, kind: "personal" });
    if (options.signOutOtherDevices && sessionId) await unbindSeat(tx, league.id, managerId, sessionId);
    return succeed(null);
  });
}

export type RecordRefreshResult =
  | { ok: true; status: RecordStatus }
  | { ok: false; status: RecordStatus; message: string };

/**
 * Commissioner: refresh team records for the league's season (shared by every league in that season). Records are not
 * league state, so this doesn't take the league lock; the seat is still read from the database, never the cookie
 * alone, and refreshSeasonRecords serializes refreshes of a season with its own row lock. Call with no lock held.
 */
export async function refreshLeagueRecords(
  db: Db,
  leagueId: string,
  sessionId: string | null,
  source: RecordSource,
): Promise<Result<RecordRefreshResult>> {
  if (leagueId === DEMO_LEAGUE_ID) return fail("demo_league");
  const [row] = await db
    .select({ commissionerId: leagues.commissionerId, seasonLabel: leagues.seasonLabel })
    .from(leagues)
    .where(eq(leagues.id, leagueId));
  if (!row) return fail("not_found");
  const actorId = sessionId ? await seatInLeague(db, sessionId, leagueId) : null;
  if (!canRefreshRecords({ isDemo: false, commissionerId: row.commissionerId }, actorId)) return fail("forbidden");
  const season = seasonEndYear(row.seasonLabel);
  if (season === null) return fail("records_unavailable");
  const outcome = await refreshSeasonRecords(db, season, source);
  const status = recordStatus(row.seasonLabel, outcome.refresh);
  return succeed(outcome.ok ? { ok: true, status } : { ok: false, status, message: outcome.message });
}
