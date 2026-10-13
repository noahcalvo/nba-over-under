import { describe, expect, it } from "vitest";
import { TEAM_DIVISIONS, TEAM_IDS, TEAM_INFO } from "@/data/teams";
import {
  boardCards,
  countdownParts,
  entryPicks,
  newerEntry,
  parseDraft,
  pickCount,
  saveState,
  type SaveStateInput,
} from "./board";
import type { ChallengeEntry, ChallengePick, PickMap } from "./types";

const teams = TEAM_INFO.map((info) => ({ info, division: TEAM_DIVISIONS[info.id], line: 40.5 as number | null }));
const ids = TEAM_INFO.map((team) => team.id);
const allOver: PickMap = Object.fromEntries(ids.map((id) => [id, "OVER"]));

function entry(overrides: Partial<ChallengeEntry> = {}): ChallengeEntry {
  return {
    id: "e1",
    season: 2027,
    displayName: "Ana",
    createdAt: "2026-10-01T00:00:00.000Z",
    savedAt: "2026-10-01T00:00:00.000Z",
    picks: [],
    ...overrides,
  };
}

describe("parseDraft", () => {
  it("keeps known teams with valid sides and the name", () => {
    expect(parseDraft({ picks: { MIN: "OVER", BOS: "UNDER" }, name: "Ana" }, TEAM_IDS)).toEqual({
      picks: { MIN: "OVER", BOS: "UNDER" },
      name: "Ana",
    });
  });
  it("drops unknown teams and invalid sides", () => {
    expect(parseDraft({ picks: { MIN: "OVER", XYZ: "OVER", BOS: "over", LAL: 3 }, name: "Ana" }, TEAM_IDS)).toEqual({
      picks: { MIN: "OVER" },
      name: "Ana",
    });
  });
  it("treats a missing or non-string name as empty", () => {
    expect(parseDraft({ picks: {}, name: 7 }, TEAM_IDS)).toEqual({ picks: {}, name: "" });
  });
  it("is null for anything that is not a draft", () => {
    expect(parseDraft(null, TEAM_IDS)).toBeNull();
    expect(parseDraft("draft", TEAM_IDS)).toBeNull();
    expect(parseDraft({ name: "Ana" }, TEAM_IDS)).toBeNull();
    expect(parseDraft({ picks: ["OVER"], name: "Ana" }, TEAM_IDS)).toBeNull();
  });
  it("ignores inherited keys", () => {
    const picks = Object.create({ MIN: "OVER" }) as Record<string, string>;
    expect(parseDraft({ picks, name: "" }, TEAM_IDS)).toEqual({ picks: {}, name: "" });
  });
});

describe("boardCards", () => {
  const saved: ChallengePick[] = [
    { teamId: "MIN", side: "UNDER", lineAtPick: 53.5, pickedAt: "2026-10-01T00:00:00.000Z" },
    { teamId: "BOS", side: "OVER", lineAtPick: 40.5, pickedAt: "2026-10-01T00:00:00.000Z" },
    { teamId: "ATL", side: "OVER", lineAtPick: null, pickedAt: "2026-10-01T00:00:00.000Z" },
  ];
  const board = teams.map((team) => (team.info.id === "MIN" ? { ...team, line: 47.5 } : team));

  it("keeps the board order and the working sides", () => {
    const cards = boardCards(board, { MIN: "UNDER", CHI: "OVER" }, saved);
    expect(cards.map((card) => card.info.id)).toEqual(ids);
    expect(cards.find((card) => card.info.id === "CHI")?.side).toBe("OVER");
    expect(cards.find((card) => card.info.id === "DEN")?.side).toBeNull();
  });
  it("measures movement from the saved pick's line when the working side is the saved side", () => {
    const min = boardCards(board, { MIN: "UNDER" }, saved).find((card) => card.info.id === "MIN");
    expect(min).toMatchObject({ savedSide: "UNDER", reference: 53.5, move: -6, line: 47.5 });
  });
  it("shows no movement for a changed side", () => {
    const min = boardCards(board, { MIN: "OVER" }, saved).find((card) => card.info.id === "MIN");
    expect(min).toMatchObject({ savedSide: "UNDER", reference: null, move: null });
  });
  it("shows no movement for an unchanged line or a missing reference", () => {
    const cards = boardCards(board, { BOS: "OVER", ATL: "OVER" }, saved);
    expect(cards.find((card) => card.info.id === "BOS")).toMatchObject({ reference: 40.5, move: null });
    expect(cards.find((card) => card.info.id === "ATL")).toMatchObject({ reference: null, move: null });
  });
  it("has no saved side for a team never saved", () => {
    expect(boardCards(board, { CHI: "OVER" }, saved).find((card) => card.info.id === "CHI")?.savedSide).toBeNull();
  });
});

describe("pickCount and entryPicks", () => {
  it("counts the board's teams with a side", () => {
    expect(pickCount(ids, { MIN: "OVER", BOS: "UNDER" })).toBe(2);
    expect(pickCount(ids, allOver)).toBe(30);
  });
  it("lists every team in board order once all are picked", () => {
    const picks = entryPicks(ids, allOver);
    expect(picks?.map((pick) => pick.teamId)).toEqual(ids);
    expect(picks?.every((pick) => pick.side === "OVER")).toBe(true);
  });
  it("is null while a team is unpicked", () => {
    const rest = Object.fromEntries(Object.entries(allOver).filter(([teamId]) => teamId !== "MIN"));
    expect(entryPicks(ids, rest)).toBeNull();
  });
});

describe("newerEntry", () => {
  const older = entry({ savedAt: "2026-10-01T00:00:00.000Z" });
  const newer = entry({ savedAt: "2026-10-02T00:00:00.000Z", displayName: "Bo" });
  it("chooses the later save", () => {
    expect(newerEntry(older, newer)).toBe(newer);
    expect(newerEntry(newer, older)).toBe(newer);
  });
  it("chooses whichever exists", () => {
    expect(newerEntry(null, older)).toBe(older);
    expect(newerEntry(older, null)).toBe(older);
    expect(newerEntry(null, null)).toBeNull();
  });
  it("prefers the first on a tie (the page's data)", () => {
    const same = entry({ displayName: "Same" });
    expect(newerEntry(same, older)).toBe(same);
  });
});

describe("saveState", () => {
  const base: SaveStateInput = { phase: "open", expired: false, selected: 30, total: 30, name: "Ana", dirty: true, hasSaved: false };
  it("can save a complete, named, unsaved entry", () => {
    expect(saveState(base)).toEqual({ canSave: true, reason: null, blocker: null });
  });
  it("asks for the remaining teams first", () => {
    expect(saveState({ ...base, selected: 24, name: "" })).toEqual({ canSave: false, reason: "incomplete", blocker: "Select 6 more teams to save" });
    expect(saveState({ ...base, selected: 29 })).toEqual({ canSave: false, reason: "incomplete", blocker: "Select 1 more team to save" });
  });
  it("asks for a valid name", () => {
    expect(saveState({ ...base, name: "  " })).toEqual({ canSave: false, reason: "no_name", blocker: "Enter a name to save" });
    expect(saveState({ ...base, name: "x".repeat(25) }).canSave).toBe(false);
  });
  it("refuses until the schedule is known", () => {
    expect(saveState({ ...base, phase: "schedule_unknown" })).toEqual({
      canSave: false,
      reason: "schedule",
      blocker: "Saving opens once the NBA schedule is read",
    });
  });
  it("refuses once the deadline passed or the challenge locked", () => {
    expect(saveState({ ...base, expired: true })).toEqual({ canSave: false, reason: "locked", blocker: "Picks are locked" });
    expect(saveState({ ...base, phase: "locked" })).toEqual({ canSave: false, reason: "locked", blocker: "Picks are locked" });
  });
  it("has nothing to save when the saved entry is unchanged", () => {
    expect(saveState({ ...base, dirty: false, hasSaved: true })).toEqual({ canSave: false, reason: null, blocker: null });
  });
});

describe("countdownParts", () => {
  it("splits a duration into days, hours, minutes and seconds", () => {
    const ms = ((((12 * 24 + 4) * 60 + 27) * 60 + 18) * 1000) + 999;
    expect(countdownParts(ms)).toEqual({ days: 12, hours: 4, minutes: 27, seconds: 18 });
  });
  it("stops at zero", () => {
    expect(countdownParts(-5000)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  });
});
