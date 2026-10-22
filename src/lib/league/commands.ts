import { LINES } from "@/config/lines";
import { LEAGUE_DEFAULTS } from "@/config/league";
import { TEAM_INFO } from "@/data/teams";
import type { LinkKind } from "@/lib/access/links";
import { applyDraftAction, createDraftState, currentPickNumber } from "@/lib/draft";
import { applyFade, type DraftCommand, type FadeAction } from "@/lib/fades";
import { isValidLeagueConfig, minManagerCount, resizeSeats, type LeagueConfig } from "@/lib/league/config";
import { fail, succeed, type Result } from "@/lib/league/errors";
import { applyDraftOrder, isDraftOrderFor } from "@/lib/league/draft-order";
import { findManager } from "@/lib/league/managers";
import { canControlDraft, canFadeFor, canManageSeats, canPickNow, canResetSeat } from "@/lib/league/permissions";
import { buildLineReview, freezeLines, sameLineValues } from "@/lib/lines";
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

/** A fresh league at the default size (LEAGUE_DEFAULTS) with the creator in seat 1 as commissioner. */
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
    seasonLabel: LINES.season,
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
 * commissioner for an open seat) and must name the current pick. Start freezes the source's lines with the
 * commissioner's overrides on top; when the start names the lines it reviewed, any difference fails with lines_changed.
 * A fade belongs to its manager (or the commissioner for an open seat) during the fade stage.
 */
export function decideDraftAction(
  league: League,
  actorId: string | null,
  action: DraftCommand,
  teamIds: ReadonlySet<TeamId>,
  sourceLines: LineSet | null,
  now: Date = new Date(),
): Result<League> {
  if (league.isDemo) return fail("demo_league");
  if (action.type === "fade") return decideFade(league, actorId, action);
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
  if (!isValidLeagueConfig({ managerCount: league.managers.length, rounds: league.draft.rounds })) {
    return fail("invalid_config");
  }
  const review = buildLineReview(
    TEAM_INFO.filter((team) => teamIds.has(team.id)),
    { lines: sourceLines, error: null },
    league.lineOverrides,
    { book: LINES.book, season: LINES.season },
  );
  if (action.lines && !sameLineValues(action.lines, review.lines)) return fail("lines_changed");
  const lines = freezeLines(review, now);
  if (!lines) return fail("lines_unavailable");
  return succeed({ ...league, draft: result.state, lines });
}

function decideFade(league: League, actorId: string | null, action: FadeAction): Result<League> {
  if (league.draft.status !== "fades") return fail("not_fading");
  if (!findManager(league.managers, action.managerId)) return fail("not_found");
  if (!canFadeFor(league, actorId, action.managerId)) return fail("forbidden");
  const result = applyFade(league, action.managerId, action.targetPickNumber);
  return result.ok ? succeed({ ...league, ...result.value }) : fail(result.error);
}

/** Replaces the commissioner's line overrides. Commissioner only, before the draft starts. Validate values first. */
export function decideLineOverrides(
  league: League,
  actorId: string | null,
  overrides: Readonly<Record<TeamId, number>>,
): Result<League> {
  if (league.isDemo) return fail("demo_league");
  if (!canControlDraft(league, actorId)) return fail("forbidden");
  if (league.draft.status !== "not_started") return fail("lines_locked");
  return succeed({ ...league, lineOverrides: overrides });
}

/**
 * Changes the league size before the draft: seats are added open at the end or removed from the end (open seats only),
 * and the rounds are set. Commissioner only. Parse the request with parseLeagueConfig first.
 */
export function decideLeagueConfig(league: League, actorId: string | null, config: LeagueConfig): Result<League> {
  if (league.isDemo) return fail("demo_league");
  if (!canControlDraft(league, actorId)) return fail("forbidden");
  if (league.draft.status !== "not_started") return fail("config_locked");
  if (!isValidLeagueConfig(config)) return fail("invalid_config");
  if (config.managerCount < minManagerCount(league.managers)) return fail("seats_claimed");
  const managers = resizeSeats(league.managers, config.managerCount);
  return succeed({
    ...league,
    managers,
    draft: { ...league.draft, rounds: config.rounds, seatOrder: managers.map((manager) => manager.id) },
  });
}

/**
 * Sets the draft order before the draft: `order` lists every manager id once, round 1 first. Seats are renumbered;
 * ids, names, links and account seats stay with their manager. Commissioner only. Parse the request with
 * parseDraftOrder first.
 */
export function decideDraftOrder(league: League, actorId: string | null, order: readonly string[]): Result<League> {
  if (league.isDemo) return fail("demo_league");
  if (!canControlDraft(league, actorId)) return fail("forbidden");
  const { draft } = league;
  if (draft.status !== "not_started" || draft.picks.length > 0 || draft.voidedPicks.length > 0) {
    return fail("order_locked");
  }
  if (!isDraftOrderFor(league.managers, order)) return fail("invalid_order");
  return succeed({
    ...league,
    managers: applyDraftOrder(league.managers, order),
    draft: { ...draft, seatOrder: [...order] },
  });
}

export interface ClaimInput {
  /** The open seat chosen on a league invite. Ignored for other links. */
  managerId?: unknown;
  displayName?: unknown;
}

export interface Claim {
  league: League;
  managerId: string;
  /** False when only the account's seat binding changes (a personal link). */
  changed: boolean;
}

/** Who is claiming, as read under the league lock. */
export interface ClaimActor {
  /** The seat the claiming account already holds in the league. */
  seatId: string | null;
  /** Whose account holds the link's seat. Always "none" for a league invite, which names no seat. */
  linkSeatHolder: "none" | "self" | "other";
}

/**
 * Decides an account's claim of an active link.
 * - League invite: claims an open seat and names it.
 * - Seat invite: re-claims a reset seat, which stays claimed: no open-seat check, picks kept, name updated.
 * - Personal link (from before accounts): binds the seat to the account when no account holds it, or succeeds
 *   unchanged when this account already does. It never moves a seat between accounts. The league doesn't change.
 */
export function decideClaim(
  league: League,
  link: { kind: LinkKind; managerId: string | null },
  actor: ClaimActor,
  input: ClaimInput,
): Result<Claim> {
  if (league.isDemo) return fail("demo_league");
  if (link.kind === "league_invite") {
    if (actor.seatId !== null) return fail("already_joined");
    const seat = findManager(league.managers, typeof input.managerId === "string" ? input.managerId : null);
    if (!seat) return fail("not_found");
    if (seat.displayName !== null) return fail("seat_taken");
    return nameSeat(league, seat.id, input.displayName);
  }
  const seat = findManager(league.managers, link.managerId);
  if (!seat) return fail("not_found");
  if (actor.seatId !== null && actor.seatId !== seat.id) return fail("already_joined");
  if (link.kind === "personal") {
    if (actor.linkSeatHolder === "other") return fail("seat_owned");
    return succeed({ league, managerId: seat.id, changed: false });
  }
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

/** Resetting a claimed seat: its account is unbound and a seat invite replaces its personal link. */
export function decideSeatReset(league: League, actorId: string | null, targetId: string): Result<null> {
  if (league.isDemo) return fail("demo_league");
  if (!canManageSeats(league, actorId)) return fail("forbidden");
  if (!findManager(league.managers, targetId)) return fail("not_found");
  return canResetSeat(league, actorId, targetId) ? succeed(null) : fail("forbidden");
}
