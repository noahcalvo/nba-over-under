/**
 * A failed read of an outside data feed. The message is written for users and safe to show them. `status` is the HTTP
 * status when the feed answered with one, so callers can tell "not there" (404) from "down".
 */
export class FeedError extends Error {
  override name = "FeedError";
  readonly status: number | null;

  constructor(message: string, options: { status?: number } = {}) {
    super(message);
    this.status = options.status ?? null;
  }
}
