/** A failed read of an outside data feed. The message is written for users and safe to show them. */
export class FeedError extends Error {
  override name = "FeedError";
}
