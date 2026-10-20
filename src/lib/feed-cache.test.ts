import { describe, expect, it, vi } from "vitest";
import { keyedCache } from "@/lib/feed-cache";

describe("keyedCache", () => {
  it("reuses a success until the key's cache time passes", async () => {
    let now = 0;
    const read = vi.fn(async (key: string) => key.toUpperCase());
    const cached = keyedCache(read, { ttlMs: () => 1000, retryMs: 100, now: () => now });
    await cached("a");
    now = 999;
    await cached("a");
    expect(read).toHaveBeenCalledTimes(1);
    now = 1000;
    await cached("a");
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("takes each key's cache time from ttlMs", async () => {
    let now = 0;
    const read = vi.fn(async (key: string) => key);
    const cached = keyedCache(read, { ttlMs: (key) => (key === "short" ? 10 : 1000), retryMs: 100, now: () => now });
    await cached("short");
    await cached("long");
    now = 10;
    await cached("short");
    await cached("long");
    expect(read.mock.calls.map(([key]) => key)).toEqual(["short", "long", "short"]);
  });

  it("caches each key separately", async () => {
    const read = vi.fn(async (key: string) => key);
    const cached = keyedCache(read, { ttlMs: () => 1000, retryMs: 100, now: () => 0 });
    await cached("a");
    await cached("b");
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("repeats a failure until the retry time passes", async () => {
    let now = 0;
    const read = vi.fn(async (): Promise<string> => {
      throw new Error("down");
    });
    const cached = keyedCache(read, { ttlMs: () => 1000, retryMs: 100, now: () => now });
    await expect(cached("a")).rejects.toThrow("down");
    now = 99;
    await expect(cached("a")).rejects.toThrow("down");
    expect(read).toHaveBeenCalledTimes(1);
    now = 100;
    await expect(cached("a")).rejects.toThrow("down");
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("shares one read between concurrent callers", async () => {
    const read = vi.fn(async (key: string) => key);
    const cached = keyedCache(read, { ttlMs: () => 1000, retryMs: 100, now: () => 0 });
    const [first, second] = await Promise.all([cached("a"), cached("a")]);
    expect(read).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
  });

  it("reports when the successful read finished, and keeps it while reused", async () => {
    let now = 5;
    const read = vi.fn(async (key: string) => {
      now = 42;
      return key;
    });
    const cached = keyedCache(read, { ttlMs: () => 1000, retryMs: 100, now: () => now });
    expect(await cached("a")).toEqual({ value: "a", readAt: 42 });
    now = 500;
    expect(await cached("a")).toEqual({ value: "a", readAt: 42 });
  });

  it("recovers after a failure once a later read succeeds", async () => {
    let now = 0;
    const read = vi.fn(async (key: string) => {
      if (read.mock.calls.length === 1) throw new Error("down");
      return key;
    });
    const cached = keyedCache(read, { ttlMs: () => 1000, retryMs: 100, now: () => now });
    await expect(cached("a")).rejects.toThrow("down");
    now = 100;
    await expect(cached("a")).resolves.toEqual({ value: "a", readAt: 100 });
  });

  it("drops expired entries for other keys when a new key arrives", async () => {
    let now = 0;
    const read = vi.fn(async (key: string) => {
      if (key === "bad") throw new Error("down");
      return key;
    });
    const cached = keyedCache(read, { ttlMs: () => 1000, retryMs: 100, now: () => now });
    await cached("old");
    await expect(cached("bad")).rejects.toThrow("down");
    expect(cached.size()).toBe(2);
    now = 99;
    await cached("fresh");
    expect(cached.size()).toBe(3);
    now = 100;
    await cached("next"); // "bad" has passed its retry time; "old" and "fresh" have not expired
    expect(cached.size()).toBe(3); // old, fresh, next
    now = 1100;
    await cached("later");
    expect(cached.size()).toBe(1); // "old", "fresh" and "next" have all passed their cache time
  });

  it("keeps an entry that is still being read", async () => {
    let now = 0;
    let release: () => void = () => {};
    const read = vi.fn(async (key: string) => {
      if (key === "slow") await new Promise<void>((resolve) => (release = resolve));
      return key;
    });
    const cached = keyedCache(read, { ttlMs: () => 10, retryMs: 10, now: () => now });
    const slow = cached("slow");
    now = 1000;
    await cached("other");
    expect(cached.size()).toBe(2);
    release();
    await slow;
  });
});
