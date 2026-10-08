import { LEAGUE_DEFAULTS, SEASON } from "@/config/league";
import type { LinkKind } from "@/lib/access/links";
import { applyDraftAction, createDraftState, currentPickNumber, type DraftAction } from "@/lib/draft";
import { fail, succeed, type Result } from "@/lib/league/errors";
import { findManager } from "@/lib/league/managers";
import { canControlDraft, canManageSeats, canPickNow, canResetSeat } from "@/lib/league/permissions";
import { isCompleteLineSet } from "@/lib/lines";
import type { League, LineSet, Manager, TeamId } from "@/lib/types";

// Pure decisions for every league mutation. src/db/actions.ts runs them inside a transaction that holds the league
// lock and persists what they return; nothing here does I/O.

export const DISPLAY_NAME_MAX = 24;
export const LEAGUE_NAME_MAX = 32;
export const DEFAULT_LEAGUE_NAME = "My League";

const LEAGUE_ID_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const LEAGUE_ID_LENGTH = 6;

/** Trims and collapses whitespace; null when empty or longer than max. */
export function normalizeName(raw: unknown, max: number): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim().replace(/\s+/g, " ");
  return name.length > 0 && name.length <= max ? name : null;
}

export function randomLeagueId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(LEAGUE_ID_LENGTH));
  return Array.from(bytes, (byte) => LEAGUE_ID_ALPHABET[byte % LEAGUE_ID_ALPHABET.length]).join("");
}

/** A fresh 4-seat league with the creator in seat 1 as commissioner. */
export function createLeague(input: { leagueName?: unknown; displayName: unknown }, id: string): Result<League> {
  const name = normalizeName(input.displayName, DISPLAY_NAME_MAX);
  if (!name) return fail("invalid_name");
  const requested =
    typeof input.leagueName === "string" && input.leagueName.trim() !== "" ? input.leagueName : DEFAULT_LEAGUE_NAME;
  const title = normalizeName(requested, LEAGUE_NAME_MAX);
  if (!title) return fail("invalid_league_name");

  const seatOrder = Array.from({ length: LEAGUE_DEFAULTS.managerCount }, (_, seat) => `m${seat + 1}`);
  const managers: Manager[] = seatOrder.map((managerId, seat) => ({
    id: managerId,
    seat,
    displayName: seat === 0 ? name : null,
  }));
  return succeed({
    id,
    name: title,
    seasonLabel: SEASON.label,
    isDemo: false,
    commissionerId: seatOrder[0],
    version: 1,
    managers,
    draft: createDraftState(seatOrder, LEAGUE_DEFAULTS.rounds),
    fades: [],
    lineOverrides: {},
    lines: null,
  });
}

/**
 * Start, pause and resume belong to the commissioner; a confirm belongs to the manager on the clock (or the
 * commissioner for an open seat) and must name the current pick. Start freezes `lines` into the league.
 */
export function decideDraftAction(
  league: League,
  actorId: string | null,
  action: DraftAction,
  teamIds: ReadonlySet<TeamId>,
  lines: LineSet | null,
): Result<League> {
  if (league.isDemo) return fail("demo_league");
  if (action.type === "confirm") {
    if (league.draft.status !== "live") return fail("not_live");
    if (action.pickNumber !== currentPickNumber(league.draft)) return fail("stale_pick");
    if (!canPickNow(league, actorId)) return fail("forbidden");
  } else if (!canControlDraft(league, actorId)) {
    return fail("forbidden");
  }
  const result = applyDraftAction(league.draft, action, teamIds);
  if (!result.ok) return fail(result.error);
  if (action.type !== "start") return succeed({ ...league, draft: result.state });
  if (!lines || !isCompleteLineSet(lines, teamIds)) return fail("lines_unavailable");
  return succeed({ ...league, draft: result.state, lines });
}

export interface ClaimInput {
  /** The open seat chosen on a league invite. Ignored for other links. */
  managerId?: unknown;
  displayName?: unknown;
}

export interface Claim {
  league: League;
  managerId: string;
  /** False when only this browser's seat binding changes (a personal link). */
  changed: boolean;
}

/**
 * Decides a claim of an active link. `browserSeatId` is the seat this browser already holds in the league.
 * - League invite: claims an open seat and names it.
 * - Seat invite: re-claims a reset seat, which stays claimed: no open-seat check, picks kept, name updated.
 * - Personal link: signs this browser in as the seat; the league doesn't change.
 */
export function decideClaim(
  league: League,
  link: { kind: LinkKind; managerId: string | null },
  browserSeatId: string | null,
  input: ClaimInput,
): Result<Claim> {
  if (league.isDemo) return fail("demo_league");
  if (link.kind === "league_invite") {
    if (browserSeatId !== null) return fail("already_joined");
    const seat = findManager(league.managers, typeof input.managerId === "string" ? input.managerId : null);
    if (!seat) return fail("not_found");
    if (seat.displayName !== null) return fail("seat_taken");
    return nameSeat(league, seat.id, input.displayName);
  }
  const seat = findManager(league.managers, link.managerId);
  if (!seat) return fail("not_found");
  if (link.kind === "personal") return succeed({ league, managerId: seat.id, changed: false });
  if (browserSeatId !== null && browserSeatId !== seat.id) return fail("already_joined");
  return nameSeat(league, seat.id, input.displayName);
}

function nameSeat(league: League, managerId: string, rawName: unknown): Result<Claim> {
  const name = normalizeName(rawName, DISPLAY_NAME_MAX);
  if (!name) return fail("invalid_name");
  const managers = league.managers.map((manager) =>
    manager.id === managerId ? { ...manager, displayName: name } : manager,
  );
  return succeed({ league: { ...league, managers }, managerId, changed: true });
}

/** Rotating or revoking the league invite. */
export function decideInviteChange(league: League, actorId: string | null): Result<null> {
  if (league.isDemo) return fail("demo_league");
  return canManageSeats(league, actorId) ? succeed(null) : fail("forbidden");
}

/** Resetting a claimed seat: its devices are signed out and a seat invite replaces its personal link. */
export function decideSeatReset(league: League, actorId: string | null, targetId: string): Result<null> {
  if (league.isDemo) return fail("demo_league");
  if (!canManageSeats(league, actorId)) return fail("forbidden");
  if (!findManager(league.managers, targetId)) return fail("not_found");
  return canResetSeat(league, actorId, targetId) ? succeed(null) : fail("forbidden");
}

/** Resetting your own personal link. Returns your manager id. */
export function decideOwnLinkReset(league: League, actorId: string | null): Result<string> {
  if (league.isDemo) return fail("demo_league");
  return actorId === null ? fail("forbidden") : succeed(actorId);
}
