import type { TeamId } from "@/lib/types";
import type { GameLog, GameLogSource } from "./types";

interface Entry {
  success: { log: GameLog; at: number } | null;
  failure: { error: unknown; at: number } | null;
  inflight: Promise<GameLog> | null;
}

/**
 * Reuses each team's successful read for `ttlMs` and a failure for `retryMs`, so page views don't hit the source every
 * time. Concurrent callers for one team share one read. Like `cachedLineSource`, per server instance.
 */
export function cachedGameLogSource(
  source: GameLogSource,
  ttlMs: number,
  retryMs: number,
  now: () => number = Date.now,
): GameLogSource {
  const entries = new Map<string, Entry>();
  return {
    name: source.name,
    fetch(season: number, teamId: TeamId) {
      const key = `${season}:${teamId}`;
      let entry = entries.get(key);
      if (!entry) {
        entry = { success: null, failure: null, inflight: null };
        entries.set(key, entry);
      }
      const current = entry;
      if (current.success && now() - current.success.at < ttlMs) return Promise.resolve(current.success.log);
      if (current.failure && now() - current.failure.at < retryMs) return Promise.reject(current.failure.error);
      current.inflight ??= source.fetch(season, teamId).then(
        (log) => {
          current.success = { log, at: now() };
          current.failure = null;
          current.inflight = null;
          return log;
        },
        (error: unknown) => {
          current.failure = { error, at: now() };
          current.inflight = null;
          throw error;
        },
      );
      return current.inflight;
    },
  };
}
