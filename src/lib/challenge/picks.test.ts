import { describe, expect, it } from "vitest";
import { TEAM_IDS, TEAM_INFO } from "@/data/teams";
import { parseChallengeSave, pickMap, rebasePicks } from "./picks";
import type { ChallengePick } from "./types";

const all = (side: "OVER" | "UNDER" = "OVER") => TEAM_INFO.map((team) => ({ teamId: team.id, side }));

describe("parseChallengeSave", () => {
  it("accepts one side for every team and a trimmed name", () => {
    const parsed = parseChallengeSave({ displayName: "  Ana  B ", picks: all() }, TEAM_IDS);
    expect(parsed).toMatchObject({ ok: true, displayName: "Ana B" });
    if (parsed.ok) expect(Object.keys(parsed.picks)).toHaveLength(30);
  });
  it("rejects a missing team as incomplete", () => {
    expect(parseChallengeSave({ displayName: "Ana", picks: all().slice(1) }, TEAM_IDS)).toEqual({ ok: false, error: "incomplete_entry" });
  });
  it("rejects duplicates, unknown teams, bad sides and non-arrays", () => {
    const dup = [...all().slice(1), { teamId: "BOS", side: "UNDER" }];
    for (const picks of [
      dup,
      [...all().slice(1), { teamId: "SEA", side: "OVER" }],
      [...all().slice(1), { teamId: TEAM_INFO[0].id, side: "over" }],
      [...all(), null],
      { ATL: "OVER" },
      undefined,
      [...all().slice(1), { teamId: "constructor", side: "OVER" }],
    ]) {
      expect(parseChallengeSave({ displayName: "Ana", picks }, TEAM_IDS)).toEqual({ ok: false, error: "invalid_picks" });
    }
  });
  it("rejects an empty or too-long name", () => {
    expect(parseChallengeSave({ displayName: " ", picks: all() }, TEAM_IDS)).toEqual({ ok: false, error: "invalid_name" });
    expect(parseChallengeSave({ displayName: "x".repeat(25), picks: all() }, TEAM_IDS)).toEqual({ ok: false, error: "invalid_name" });
    expect(parseChallengeSave({ picks: all() }, TEAM_IDS)).toEqual({ ok: false, error: "invalid_name" });
  });
});

describe("rebasePicks", () => {
  const stored: ChallengePick[] = [
    { teamId: "MIN", side: "UNDER", lineAtPick: 49.5, pickedAt: "2026-10-01T00:00:00.000Z" },
    { teamId: "BOS", side: "OVER", lineAtPick: 50.5, pickedAt: "2026-10-01T00:00:00.000Z" },
  ];
  const now = "2026-10-10T12:00:00.000Z";
  const current = { MIN: 43.5, BOS: 52.5 };

  it("keeps an unchanged side's reference even though the line moved", () => {
    expect(rebasePicks(stored, { MIN: "UNDER", BOS: "OVER" }, current, now)).toEqual([
      stored[1],
      stored[0],
    ]);
  });
  it("gives a changed side the current line and time", () => {
    expect(rebasePicks(stored, { MIN: "OVER", BOS: "OVER" }, current, now)[1]).toEqual({
      teamId: "MIN", side: "OVER", lineAtPick: 43.5, pickedAt: now,
    });
  });
  it("gives a new pick the current line, or null without one", () => {
    expect(rebasePicks([], { ATL: "OVER", MIN: "UNDER" }, { MIN: 43.5 }, now)).toEqual([
      { teamId: "ATL", side: "OVER", lineAtPick: null, pickedAt: now },
      { teamId: "MIN", side: "UNDER", lineAtPick: 43.5, pickedAt: now },
    ]);
  });
  it("maps picks to sides", () => {
    expect(pickMap(stored)).toEqual({ MIN: "UNDER", BOS: "OVER" });
  });
});
