/** Where team win–loss records come from and how often they may be fetched. */
export const RECORDS = {
  /** Display name of the records source. */
  source: "ESPN",
  /** A refresh within this long of the last success reuses the stored records instead of calling the source. */
  minRefreshSeconds: 60,
  fetchTimeoutMs: 8000,
} as const;
