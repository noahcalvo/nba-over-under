import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyDraftOrder,
  isDraftOrderFor,
  moveInOrder,
  parseDraftOrder,
  secureRandomIndex,
  shuffled,
} from "@/lib/league/draft-order";
import { seededRandom } from "@/lib/random";
import type { Manager } from "@/lib/types";

const MANAGERS: Manager[] = [
  { id: "m1", seat: 0, displayName: "Ana" },
  { id: "m2", seat: 1, displayName: "Ben" },
  { id: "m3", seat: 2, displayName: null },
  { id: "m4", seat: 3, displayName: null },
];

const ids = (count: number) => Array.from({ length: count }, (_, i) => `m${i + 1}`);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("parseDraftOrder", () => {
  it("reads a list of strings from the body's order", () => {
    expect(parseDraftOrder({ order: ["m2", "m1"] })).toEqual(["m2", "m1"]);
  });

  it("refuses anything else", () => {
    expect(parseDraftOrder(null)).toBeNull();
    expect(parseDraftOrder("m1,m2")).toBeNull();
    expect(parseDraftOrder({})).toBeNull();
    expect(parseDraftOrder({ order: "m1" })).toBeNull();
    expect(parseDraftOrder({ order: ["m1", 2] })).toBeNull();
    expect(parseDraftOrder({ order: [null] })).toBeNull();
  });
});

describe("isDraftOrderFor", () => {
  it("accepts every manager exactly once, in any order", () => {
    expect(isDraftOrderFor(MANAGERS, ["m3", "m1", "m4", "m2"])).toBe(true);
    expect(isDraftOrderFor(MANAGERS, ["m1", "m2", "m3", "m4"])).toBe(true);
  });

  it("refuses missing, duplicate, unknown and extra ids", () => {
    expect(isDraftOrderFor(MANAGERS, ["m1", "m2", "m3"])).toBe(false);
    expect(isDraftOrderFor(MANAGERS, ["m1", "m1", "m3", "m4"])).toBe(false);
    expect(isDraftOrderFor(MANAGERS, ["m1", "m2", "m3", "m9"])).toBe(false);
    expect(isDraftOrderFor(MANAGERS, ["m1", "m2", "m3", "m4", "m5"])).toBe(false);
    expect(isDraftOrderFor(MANAGERS, [])).toBe(false);
  });
});

describe("applyDraftOrder", () => {
  it("renumbers seats to the order and keeps each manager's id and name", () => {
    expect(applyDraftOrder(MANAGERS, ["m3", "m1", "m4", "m2"])).toEqual([
      { id: "m3", seat: 0, displayName: null },
      { id: "m1", seat: 1, displayName: "Ana" },
      { id: "m4", seat: 2, displayName: null },
      { id: "m2", seat: 3, displayName: "Ben" },
    ]);
  });

  it("does not change its input", () => {
    applyDraftOrder(MANAGERS, ["m4", "m3", "m2", "m1"]);
    expect(MANAGERS.map((m) => m.seat)).toEqual([0, 1, 2, 3]);
  });
});

describe("moveInOrder", () => {
  it("moves one item and shifts the rest", () => {
    expect(moveInOrder(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveInOrder(["a", "b", "c", "d"], 3, 0)).toEqual(["d", "a", "b", "c"]);
    expect(moveInOrder(["a", "b", "c", "d"], 1, 1)).toEqual(["a", "b", "c", "d"]);
  });

  it("clamps the target and ignores an out-of-range source", () => {
    expect(moveInOrder(["a", "b", "c"], 0, 9)).toEqual(["b", "c", "a"]);
    expect(moveInOrder(["a", "b", "c"], 2, -1)).toEqual(["c", "a", "b"]);
    expect(moveInOrder(["a", "b", "c"], 5, 0)).toEqual(["a", "b", "c"]);
  });
});

describe("secureRandomIndex", () => {
  it("stays in [0, bound)", () => {
    for (const bound of [1, 2, 3, 7, 12]) {
      for (let i = 0; i < 500; i++) {
        const value = secureRandomIndex(bound);
        expect(Number.isInteger(value) && value >= 0 && value < bound).toBe(true);
      }
    }
  });

  it("rejects draws from the uneven tail instead of folding them (no modulo bias)", () => {
    // For bound 3 the accepted range is [0, 4294967295); 0xffffffff is the one rejected value.
    const draws = [0xffffffff, 5];
    vi.spyOn(crypto, "getRandomValues").mockImplementation(((array: Uint32Array) => {
      array[0] = draws.shift()!;
      return array;
    }) as typeof crypto.getRandomValues);
    expect(secureRandomIndex(3)).toBe(2);
    expect(draws).toEqual([]);
  });

  it("refuses bounds that aren't positive integers", () => {
    expect(() => secureRandomIndex(0)).toThrow(RangeError);
    expect(() => secureRandomIndex(2.5)).toThrow(RangeError);
  });
});

describe("shuffled", () => {
  it("returns a permutation: same items, none missing or duplicated, input untouched", () => {
    for (let count = 2; count <= 12; count++) {
      const order = ids(count);
      for (let run = 0; run < 50; run++) {
        const result = shuffled(order);
        expect(result).toHaveLength(count);
        expect(new Set(result).size).toBe(count);
        expect([...result].sort()).toEqual([...order].sort());
      }
      expect(order).toEqual(ids(count));
    }
  });

  it("is Fisher–Yates: asks for one index per position, from n down to 2", () => {
    const bounds: number[] = [];
    shuffled(ids(5), (bound) => {
      bounds.push(bound);
      return 0;
    });
    expect(bounds).toEqual([5, 4, 3, 2]);
  });

  it("makes every order of three managers about equally likely", () => {
    const random = seededRandom(20261013);
    const randomIndex = (bound: number) => Math.floor(random() * bound);
    const counts = new Map<string, number>();
    const runs = 60_000;
    for (let i = 0; i < runs; i++) {
      const key = shuffled(["a", "b", "c"], randomIndex).join("");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.size).toBe(6);
    // Expected 10 000 each; the standard deviation is about 91, so ±600 is more than 6σ.
    for (const count of counts.values()) expect(Math.abs(count - runs / 6)).toBeLessThan(600);
  });

  it("leaves a single manager alone", () => {
    expect(shuffled(["m1"])).toEqual(["m1"]);
  });
});
