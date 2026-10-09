import { describe, expect, it, vi } from "vitest";
import { cachedGameLogSource } from "@/lib/game-log/cache";
import type { GameLog, GameLogSource } from "@/lib/game-log/types";

const log = (teamId: string): GameLog => ({ season: 2027, teamId, games: [] });

function fakeSource() {
  const fetch = vi.fn(async (season: number, teamId: string) => log(teamId));
  const source: GameLogSource = { name: "ESPN", fetch };
  return { source, fetch };
}

describe("cachedGameLogSource", () => {
  it("reuses a success until the cache time passes", async () => {
    let now = 0;
    const { source, fetch } = fakeSource();
    const cached = cachedGameLogSource(source, 1000, 100, () => now);
    await cached.fetch(2027, "ORL");
    now = 999;
    await cached.fetch(2027, "ORL");
    expect(fetch).toHaveBeenCalledTimes(1);
    now = 1000;
    await cached.fetch(2027, "ORL");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("caches each season and team separately", async () => {
    const { source, fetch } = fakeSource();
    const cached = cachedGameLogSource(source, 1000, 100, () => 0);
    await cached.fetch(2027, "ORL");
    await cached.fetch(2027, "BOS");
    await cached.fetch(2026, "ORL");
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("repeats a failure until the retry time passes", async () => {
    let now = 0;
    const fetch = vi.fn(async () => {
      throw new Error("down");
    });
    const cached = cachedGameLogSource({ name: "ESPN", fetch }, 1000, 100, () => now);
    await expect(cached.fetch(2027, "ORL")).rejects.toThrow("down");
    now = 99;
    await expect(cached.fetch(2027, "ORL")).rejects.toThrow("down");
    expect(fetch).toHaveBeenCalledTimes(1);
    now = 100;
    await expect(cached.fetch(2027, "ORL")).rejects.toThrow("down");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("shares one read between concurrent callers", async () => {
    const { source, fetch } = fakeSource();
    const cached = cachedGameLogSource(source, 1000, 100, () => 0);
    await Promise.all([cached.fetch(2027, "ORL"), cached.fetch(2027, "ORL")]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps the source's name", () => {
    expect(cachedGameLogSource(fakeSource().source, 1000, 100).name).toBe("ESPN");
  });
});
