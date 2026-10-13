import { describe, expect, it } from "vitest";
import { hasUnsavedChanges, lineMove, movedTeams, SAVE_AGAINST_UPDATED, SAVE_PICKS, saveLabel } from "./movement";
import { pickMap } from "./picks";
import type { ChallengeEntry, ChallengePick } from "./types";

const saved: ChallengePick[] = [
  { teamId: "BOS", side: "OVER", lineAtPick: 50.5, pickedAt: "2026-10-01T00:00:00.000Z" },
  { teamId: "MIN", side: "UNDER", lineAtPick: 49.5, pickedAt: "2026-10-01T00:00:00.000Z" },
];
const entry: ChallengeEntry = {
  id: "e1",
  season: 2027,
  displayName: "Ana",
  createdAt: "2026-10-01T00:00:00.000Z",
  savedAt: "2026-10-01T00:00:00.000Z",
  picks: saved,
};

describe("lineMove", () => {
  it("is current minus reference", () => {
    expect(lineMove(49.5, 43.5)).toBe(-6);
    expect(lineMove(40, 42)).toBe(2);
  });
  it("is null when equal or either is missing", () => {
    expect(lineMove(49.5, 49.5)).toBeNull();
    expect(lineMove(null, 40)).toBeNull();
    expect(lineMove(40, null)).toBeNull();
  });
});

describe("movedTeams", () => {
  it("lists a saved pick whose side is unchanged and whose line moved", () => {
    expect(movedTeams(saved, { BOS: "OVER", MIN: "UNDER" }, { BOS: 50.5, MIN: 43.5 })).toEqual(["MIN"]);
  });
  it("excludes a pick whose working side changed", () => {
    expect(movedTeams(saved, { BOS: "OVER", MIN: "OVER" }, { BOS: 50.5, MIN: 43.5 })).toEqual([]);
  });
  it("excludes a pick whose working side was cleared", () => {
    expect(movedTeams(saved, { BOS: "OVER" }, { BOS: 50.5, MIN: 43.5 })).toEqual([]);
  });
  it("excludes a team with no current line", () => {
    expect(movedTeams(saved, { BOS: "OVER", MIN: "UNDER" }, { BOS: 50.5 })).toEqual([]);
  });
});

describe("saveLabel", () => {
  it("names the update only when lines moved", () => {
    expect(saveLabel(0)).toBe(SAVE_PICKS);
    expect(saveLabel(0)).toBe("Save Picks");
    expect(saveLabel(2)).toBe(SAVE_AGAINST_UPDATED);
    expect(saveLabel(2)).toBe("Save Picks Against Updated Lines");
  });
});

describe("hasUnsavedChanges", () => {
  it("is false with nothing saved and nothing entered", () => {
    expect(hasUnsavedChanges(null, {}, "")).toBe(false);
    expect(hasUnsavedChanges(null, {}, "   ")).toBe(false);
  });
  it("is true with nothing saved and something picked or named", () => {
    expect(hasUnsavedChanges(null, {}, "Ana")).toBe(true);
    expect(hasUnsavedChanges(null, { BOS: "OVER" }, "")).toBe(true);
  });
  it("is false when working matches the saved entry", () => {
    expect(hasUnsavedChanges(entry, pickMap(entry.picks), entry.displayName)).toBe(false);
  });
  it("is true for a flipped side, a removed pick or a new name", () => {
    expect(hasUnsavedChanges(entry, { ...pickMap(entry.picks), BOS: "UNDER" }, "Ana")).toBe(true);
    expect(hasUnsavedChanges(entry, { BOS: "OVER" }, "Ana")).toBe(true);
    expect(hasUnsavedChanges(entry, pickMap(entry.picks), "Bea")).toBe(true);
  });
  it("ignores surrounding whitespace in the name", () => {
    expect(hasUnsavedChanges(entry, pickMap(entry.picks), "  Ana ")).toBe(false);
    expect(hasUnsavedChanges(entry, pickMap(entry.picks), "Ana   ")).toBe(false);
  });
});
