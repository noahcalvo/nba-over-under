/** Where live lines come from. One sportsbook for every team: never mix books. */
export const LINES = {
  /** Display name of the sportsbook, shown wherever lines are. */
  book: "FanDuel",
  /** The season new leagues draft. */
  season: "2026–27",
  /** How FanDuel names the season in market names: "26-27 NBA Boston Celtics Regular Season Wins". */
  fanDuelSeason: "26-27",
  /** A successful read is reused this long. */
  cacheSeconds: 300,
  /** After a failed read, wait this long before asking the book again. */
  retrySeconds: 30,
  fetchTimeoutMs: 8000,
} as const;
