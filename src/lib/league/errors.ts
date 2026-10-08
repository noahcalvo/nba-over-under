import type { StoreError } from "@/lib/league/store";

export type ApiError = StoreError | "invalid_request";

export const ERROR_MESSAGES: Record<ApiError, string> = {
  not_found: "That league or seat doesn't exist.",
  forbidden: "You can't do that right now.",
  invalid_name: "Enter your name (1–24 characters).",
  invalid_league_name: "League names can be up to 32 characters.",
  seat_taken: "That seat was just claimed. Pick another.",
  already_joined: "You already have a seat in this league.",
  demo_league: "The demo league is read-only.",
  not_live: "The draft isn't live.",
  side_taken: "That side was just drafted.",
  unknown_team: "Unknown team.",
  invalid_transition: "The draft can't do that from its current state.",
  invalid_request: "Invalid request.",
};
