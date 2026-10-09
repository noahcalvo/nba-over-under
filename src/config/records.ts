/** Where team win–loss records come from and how often they may be fetched. */
export const RECORDS = {
  /** Display name of the records source. */
  source: "ESPN",
  /** A refresh within this long of the last success reuses the stored records instead of calling the source. */
  minRefreshSeconds: 60,
  fetchTimeoutMs: 8000,
  /** A team's game log (season-progress chart) is reused this long after a successful read. */
  gameLogCacheSeconds: 600,
  /** After a failed game-log read, wait this long before asking again. */
  gameLogRetrySeconds: 30,
} as const;
