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
  | "lines_changed"
  | "lines_locked"
  | "invalid_line"
  | "records_unavailable"
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
  lines_unavailable: "Every team needs a line before the draft can start. Enter the missing lines first.",
  lines_changed: "The lines changed since you checked them. Look them over again, then start.",
  lines_locked: "Lines are locked once the draft starts.",
  invalid_line: "Lines must be between 0.5 and 81.5, in steps of 0.5.",
  records_unavailable: "Team records couldn't be refreshed. Try again in a minute.",
  not_live: "The draft isn't live.",
  side_taken: "That side was just drafted.",
  unknown_team: "Unknown team.",
  invalid_transition: "The draft can't do that from its current state.",
  stale_pick: "The draft moved on. Check the board and pick again.",
  team_already_held: "A manager can't hold both sides of a team.",
  invalid_request: "Invalid request.",
};
