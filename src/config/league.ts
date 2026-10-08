export const LEAGUE_DEFAULTS = {
  managerCount: 4,
  rounds: 11,
} as const;

export const SEASON = {
  label: "2025–26",
  previousLabel: "2024–25",
} as const;

/** How often the draft room asks the server for new picks. */
export const DRAFT_POLL_INTERVAL_MS = 2000;
