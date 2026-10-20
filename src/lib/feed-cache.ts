interface Entry<T> {
  success: { value: T; at: number } | null;
  failure: { error: unknown; at: number } | null;
  inflight: Promise<{ value: T; readAt: number }> | null;
}

/**
 * Wraps a keyed read: a success is reused for `ttlMs(key)`, a failure for `retryMs`, and concurrent callers for one key
 * share one read. `readAt` is when the successful read finished (from `now`). Per server instance, like
 * `cachedGameLogSource`. Keys may come from request input, so when a new key arrives the entries that are past both
 * times (and not being read) are dropped; `size()` counts the entries held.
 */
export function keyedCache<T>(
  read: (key: string) => Promise<T>,
  options: { ttlMs: (key: string) => number; retryMs: number; now?: () => number },
): ((key: string) => Promise<{ value: T; readAt: number }>) & { size(): number } {
  const { ttlMs, retryMs, now = Date.now } = options;
  const entries = new Map<string, Entry<T>>();
  const sweep = () => {
    for (const [key, entry] of entries) {
      if (entry.inflight) continue;
      const successExpired = !entry.success || now() - entry.success.at >= ttlMs(key);
      const failureExpired = !entry.failure || now() - entry.failure.at >= retryMs;
      if (successExpired && failureExpired) entries.delete(key);
    }
  };
  const cached = (key: string): Promise<{ value: T; readAt: number }> => {
    let entry = entries.get(key);
    if (!entry) {
      sweep();
      entry = { success: null, failure: null, inflight: null };
      entries.set(key, entry);
    }
    const current = entry;
    if (current.success && now() - current.success.at < ttlMs(key)) {
      return Promise.resolve({ value: current.success.value, readAt: current.success.at });
    }
    if (current.failure && now() - current.failure.at < retryMs) return Promise.reject(current.failure.error);
    current.inflight ??= read(key).then(
      (value) => {
        const at = now();
        current.success = { value, at };
        current.failure = null;
        current.inflight = null;
        return { value, readAt: at };
      },
      (error: unknown) => {
        current.failure = { error, at: now() };
        current.inflight = null;
        throw error;
      },
    );
    return current.inflight;
  };
  return Object.assign(cached, { size: () => entries.size });
}
