import { LEAGUE_LIMITS } from "@/config/league";
import { TOTAL_SIDES } from "@/data/teams";
import type { DraftError } from "@/lib/draft";
import type { FadeError } from "@/lib/fades";

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
  | "invalid_config"
  | "config_locked"
  | "seats_claimed"
  | "order_locked"
  | "invalid_order"
  | "challenge_locked"
  | "deadline_unavailable"
  | "incomplete_entry"
  | "invalid_picks"
  | DraftError
  | FadeError;

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
  invalid_config: `Leagues have ${LEAGUE_LIMITS.minManagers}–${LEAGUE_LIMITS.maxManagers} managers, and managers × rounds can't exceed the ${TOTAL_SIDES} sides.`,
  config_locked: "League size is locked once the draft starts.",
  seats_claimed: "Claimed seats can't be removed. Only open seats at the end of the order can go.",
  order_locked: "Draft order is locked once the draft starts.",
  invalid_order: "The seats changed since you set this order. Check it and save again.",
  not_live: "The draft isn't live.",
  side_taken: "That side was just drafted.",
  unknown_team: "Unknown team.",
  invalid_transition: "The draft can't do that from its current state.",
  stale_pick: "The draft moved on. Check the board and pick again.",
  team_already_held: "A manager can't hold both sides of a team.",
  not_fading: "Fades open once every team pick is in.",
  fade_locked: "That fade is already locked in.",
  unknown_pick: "That pick doesn't exist.",
  voided_pick: "That pick was voided when the draft ended early. Fade a kept pick.",
  own_pick: "Fade another manager's pick, not your own.",
  challenge_locked: "The challenge is locked: picks can't change after the deadline.",
  deadline_unavailable: "The season schedule hasn't been read yet, so saving is paused. Try again in a few minutes.",
  incomplete_entry: "Pick Over or Under for all 30 teams before saving.",
  invalid_picks: "Those picks weren't valid. Reload the page and try again.",
  invalid_request: "Invalid request.",
};
