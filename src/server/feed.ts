import "server-only";
import { FeedError } from "@/lib/feed-error";

/**
 * GETs JSON from an outside feed. Every failure — timeout, network, HTTP status, unreadable body — becomes a FeedError
 * whose message names the source and can be shown to users.
 */
export async function fetchFeedJson(url: string, { source, timeoutMs }: { source: string; timeoutMs: number }): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError");
    throw new FeedError(
      timedOut ? `${source} didn't respond within ${Math.round(timeoutMs / 1000)} s.` : `Couldn't reach ${source}.`,
    );
  }
  if (!response.ok) throw new FeedError(`${source} returned HTTP ${response.status}.`);
  try {
    return await response.json();
  } catch {
    throw new FeedError(`${source} sent a response we couldn't read.`);
  }
}
