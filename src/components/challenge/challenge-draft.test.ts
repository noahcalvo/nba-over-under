import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** A localStorage stand-in whose reads and writes can be made to throw. */
function fakeStorage() {
  const items = new Map<string, string>();
  const fail = { get: false, set: false };
  return {
    fail,
    items,
    getItem: (key: string) => {
      if (fail.get) throw new Error("SecurityError");
      return items.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      if (fail.set) throw new Error("QuotaExceededError");
      items.set(key, value);
    },
    removeItem: (key: string) => {
      if (fail.set) throw new Error("QuotaExceededError");
      items.delete(key);
    },
  };
}

let storage: ReturnType<typeof fakeStorage>;
let store: typeof import("./challenge-draft");
const SEASON = 2027;
const draft = (side: "OVER" | "UNDER", name = "Ana") => ({ picks: { BOS: side }, name });

beforeEach(async () => {
  storage = fakeStorage();
  vi.stubGlobal("window", { localStorage: storage, addEventListener: () => {}, removeEventListener: () => {} });
  vi.resetModules();
  store = await import("./challenge-draft");
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("challenge draft store", () => {
  it("keeps the draft in localStorage", () => {
    store.writeDraft(SEASON, draft("OVER"));
    expect(store.getDraft(SEASON)).toEqual(draft("OVER"));
    expect(storage.items.size).toBe(1);
  });

  it("reads memory when storage refuses every access", () => {
    storage.fail.get = true;
    storage.fail.set = true;
    store.writeDraft(SEASON, draft("UNDER"));
    expect(store.getDraft(SEASON)).toEqual(draft("UNDER"));
  });

  it("prefers the newer memory copy when a write fails but reads still work (quota full)", () => {
    store.writeDraft(SEASON, draft("OVER"));
    storage.fail.set = true;
    store.writeDraft(SEASON, draft("UNDER", "Ana B"));
    expect(store.getDraft(SEASON)).toEqual(draft("UNDER", "Ana B"));
    store.writeDraft(SEASON, null);
    expect(store.getDraft(SEASON)).toBeNull();
  });

  it("goes back to localStorage after a later write succeeds", () => {
    storage.fail.set = true;
    store.writeDraft(SEASON, draft("UNDER"));
    storage.fail.set = false;
    store.writeDraft(SEASON, draft("OVER"));
    storage.items.set(`courtline.challenge.draft.v1.${SEASON}`, JSON.stringify(draft("OVER", "From another tab")));
    expect(store.getDraft(SEASON)).toEqual(draft("OVER", "From another tab"));
  });
});
