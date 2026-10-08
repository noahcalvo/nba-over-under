import type { DraftError } from "@/lib/draft";

/** Every way a league action can fail. Route handlers map these to HTTP statuses in src/server/http.ts. */
export type DomainError =
  | "not_found"
  | "forbidden"
  | "invalid_name"
  | "invalid_league_name"
  | "seat_taken"
  | "already_joined"
  | "demo_league"
  | "invalid_link"
  | "lines_unavailable"
  | DraftError;

export type ApiError = DomainError | "invalid_request";

export type Result<T> = { ok: true; value: T } | { ok: false; error: DomainError };

export function succeed<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function fail<T>(error: DomainError): Result<T> {
  return { ok: false, error };
}

export const ERROR_MESSAGES: Record<ApiError, string> = {
  not_found: "That league or seat doesn't exist.",
  forbidden: "You can't do that right now.",
  invalid_name: "Enter your name (1–24 characters).",
  invalid_league_name: "League names can be up to 32 characters.",
  seat_taken: "That seat was just claimed. Pick another.",
  already_joined: "You already have a seat in this league.",
  demo_league: "The demo league is read-only.",
  invalid_link: "This link no longer works. Ask your commissioner for a new one.",
  lines_unavailable: "Lines aren't available right now. Try again in a minute.",
  not_live: "The draft isn't live.",
  side_taken: "That side was just drafted.",
  unknown_team: "Unknown team.",
  invalid_transition: "The draft can't do that from its current state.",
  stale_pick: "The draft moved on. Check the board and pick again.",
  team_already_held: "A manager can't hold both sides of a team.",
  invalid_request: "Invalid request.",
};
