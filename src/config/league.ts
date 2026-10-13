export const LEAGUE_DEFAULTS = {
  managerCount: 4,
  rounds: 11,
} as const;

/** League sizes the commissioner can choose before the draft. Rounds run from minRounds to ⌊60 sides ÷ managers⌋. */
export const LEAGUE_LIMITS = {
  minManagers: 2,
  maxManagers: 12,
  minRounds: 1,
} as const;

/** The season the demo and the mock data are labelled with, and the one before it (the draft room's "wins" reference). */
export const SEASON = {
  label: "2026–27",
  previousLabel: "2025–26",
} as const;

/** How often the draft room asks the server for new picks. */
export const DRAFT_POLL_INTERVAL_MS = 2000;
