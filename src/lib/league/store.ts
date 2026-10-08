import { LEAGUE_DEFAULTS, SEASON } from "@/config/league";
import { applyDraftAction, createDraftState, type DraftAction, type DraftError } from "@/lib/draft";
import { canControlDraft, canPickNow } from "@/lib/league/permissions";
import type { League, Manager, TeamId } from "@/lib/types";

export type StoreError =
  | "not_found"
  | "forbidden"
  | "invalid_name"
  | "invalid_league_name"
  | "seat_taken"
  | "already_joined"
  | "demo_league"
  | DraftError;

export type StoreResult<T> = { ok: true; value: T } | { ok: false; error: StoreError };

export const DISPLAY_NAME_MAX = 24;
export const LEAGUE_NAME_MAX = 32;
export const DEFAULT_LEAGUE_NAME = "My League";

const LEAGUE_ID_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const LEAGUE_ID_LENGTH = 6;

export interface LeagueStore {
  get(leagueId: string): League | undefined;
  create(input: { leagueName?: unknown; displayName: unknown }): StoreResult<{ league: League; managerId: string }>;
  join(
    leagueId: string,
    input: { managerId: unknown; displayName: unknown; currentManagerId: string | null },
  ): StoreResult<{ league: League; managerId: string }>;
  act(leagueId: string, actorId: string | null, action: DraftAction): StoreResult<League>;
}

export interface LeagueStoreOptions {
  teamIds: ReadonlySet<TeamId>;
  seed?: readonly League[];
  generateId?: () => string;
}

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

export function createLeagueStore({
  teamIds,
  seed = [],
  generateId = randomLeagueId,
}: LeagueStoreOptions): LeagueStore {
  const leagues = new Map<string, League>(seed.map((league) => [league.id, league]));

  function save(league: League): League {
    const next = { ...league, version: league.version + 1 };
    leagues.set(next.id, next);
    return next;
  }

  function uniqueId(): string {
    for (let attempt = 0; attempt < 10; attempt++) {
      const id = generateId();
      if (!leagues.has(id)) return id;
    }
    throw new Error("Could not generate a unique league id");
  }

  return {
    get: (leagueId) => leagues.get(leagueId),

    create({ leagueName, displayName }) {
      const name = normalizeName(displayName, DISPLAY_NAME_MAX);
      if (!name) return fail("invalid_name");
      const requested = typeof leagueName === "string" && leagueName.trim() !== "" ? leagueName : DEFAULT_LEAGUE_NAME;
      const title = normalizeName(requested, LEAGUE_NAME_MAX);
      if (!title) return fail("invalid_league_name");

      const seatOrder = Array.from({ length: LEAGUE_DEFAULTS.managerCount }, (_, seat) => `m${seat + 1}`);
      const managers: Manager[] = seatOrder.map((id, seat) => ({ id, seat, displayName: seat === 0 ? name : null }));
      const league: League = {
        id: uniqueId(),
        name: title,
        seasonLabel: SEASON.label,
        isDemo: false,
        commissionerId: seatOrder[0],
        version: 1,
        managers,
        draft: createDraftState(seatOrder, LEAGUE_DEFAULTS.rounds),
        fades: [],
      };
      leagues.set(league.id, league);
      return succeed({ league, managerId: seatOrder[0] });
    },

    join(leagueId, { managerId, displayName, currentManagerId }) {
      const league = leagues.get(leagueId);
      if (!league) return fail("not_found");
      if (league.isDemo) return fail("demo_league");
      const alreadySeated = league.managers.some((m) => m.id === currentManagerId && m.displayName !== null);
      if (alreadySeated) return fail("already_joined");
      const seat = league.managers.find((m) => m.id === managerId);
      if (!seat) return fail("not_found");
      if (seat.displayName !== null) return fail("seat_taken");
      const name = normalizeName(displayName, DISPLAY_NAME_MAX);
      if (!name) return fail("invalid_name");
      const managers = league.managers.map((m) => (m.id === seat.id ? { ...m, displayName: name } : m));
      return succeed({ league: save({ ...league, managers }), managerId: seat.id });
    },

    act(leagueId, actorId, action) {
      const league = leagues.get(leagueId);
      if (!league) return fail("not_found");
      if (league.isDemo) return fail("demo_league");
      if (action.type === "confirm") {
        if (league.draft.status !== "live") return fail("not_live");
        if (!canPickNow(league, actorId)) return fail("forbidden");
      } else if (!canControlDraft(league, actorId)) {
        return fail("forbidden");
      }
      const result = applyDraftAction(league.draft, action, teamIds);
      if (!result.ok) return fail(result.error);
      return succeed(save({ ...league, draft: result.state }));
    },
  };
}

function succeed<T>(value: T): StoreResult<T> {
  return { ok: true, value };
}

function fail<T>(error: StoreError): StoreResult<T> {
  return { ok: false, error };
}
