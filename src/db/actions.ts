import { ACCESS } from "@/config/access";
import { TEAM_IDS } from "@/data/teams";
import { linkStatus } from "@/lib/access/links";
import type { DraftAction } from "@/lib/draft";
import {
  createLeague,
  decideClaim,
  decideDraftAction,
  decideInviteChange,
  decideOwnLinkReset,
  decideSeatReset,
  randomLeagueId,
  type ClaimInput,
} from "@/lib/league/commands";
import { fail, succeed, type Result } from "@/lib/league/errors";
import type { League, LineSet } from "@/lib/types";
import type { Db } from "./client";
import { insertLeague, saveLeague, withLockedLeague } from "./leagues";
import { findLink, findLinkAt, issueLink, markSeatInviteUsed, revokeLinks } from "./links";
import { bindSeat, unbindSeat } from "./sessions";

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

/** Start, pause, resume or confirm. Fetch `lines` before calling (no network calls while holding the lock). */
export function runDraftAction(
  db: Db,
  leagueId: string,
  sessionId: string | null,
  action: DraftAction,
  lines: LineSet | null,
): Promise<Result<DraftOutcome>> {
  return withLockedLeague(db, leagueId, sessionId, async ({ tx, league, actorId }) => {
    const decided = decideDraftAction(league, actorId, action, TEAM_IDS, lines);
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
