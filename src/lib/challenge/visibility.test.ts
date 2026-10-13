import { describe, expect, it } from "vitest";
import type { ChallengeEntry } from "./types";
import { visibleEntry } from "./visibility";

const entry: ChallengeEntry = {
  id: "abc",
  season: 2027,
  displayName: "Ana",
  createdAt: "2026-10-01T00:00:00.000Z",
  savedAt: "2026-10-02T00:00:00.000Z",
  picks: [{ teamId: "BOS", side: "OVER", lineAtPick: 54.5, pickedAt: "2026-10-02T00:00:00.000Z" }],
};

describe("visibleEntry", () => {
  it("empties the picks when not revealed, keeping the public fields", () => {
    const hidden = visibleEntry(entry, false);
    expect(hidden.picks).toEqual([]);
    expect(hidden).toMatchObject({ id: "abc", displayName: "Ana", season: 2027 });
    expect(entry.picks).toHaveLength(1);
  });

  it("returns the entry unchanged when revealed", () => {
    expect(visibleEntry(entry, true)).toBe(entry);
  });
});
