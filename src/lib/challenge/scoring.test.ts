import { describe, expect, it } from "vitest";
import { TEAM_INFO } from "@/data/teams";
import type { Side, TeamId, TeamInfo } from "@/lib/types";
import { entryTotal, rankEntries, scoreEntry } from "./scoring";
import type { ChallengePick } from "./types";

function team(id: TeamId, wins: number, losses: number): TeamInfo {
  const info = TEAM_INFO.find((candidate) => candidate.id === id);
  if (!info) throw new Error(`Unknown team ${id}`);
  return { ...info, wins, losses };
}
const pick = (teamId: TeamId, side: Side): ChallengePick => ({
  teamId,
  side,
  lineAtPick: 40.5,
  pickedAt: "2026-10-01T00:00:00.000Z",
});

describe("scoreEntry", () => {
  it("scores correct and incorrect Overs and Unders with margins", () => {
    // MIN 30–18 → pace 51.25. Line 47.5.
    const teams = [team("MIN", 30, 18)];
    const over = scoreEntry([pick("MIN", "OVER")], teams, { MIN: 47.5 });
    expect(over.projectedTotal).toBeCloseTo(1 + 0.375);
    const under = scoreEntry([pick("MIN", "UNDER")], teams, { MIN: 47.5 });
    expect(under.projectedTotal).toBeCloseTo(-1 - 0.375);
    expect(over.onPace).toBe(1);
    expect(under.onPace).toBe(0);
  });
  it("scores a push as 0 and not on pace", () => {
    const settled = [team("MIN", 47, 35)];
    const score = scoreEntry([pick("MIN", "OVER")], settled, { MIN: 47 });
    expect(score.finalTotal).toBe(0);
    expect(score.onPace).toBe(0);
  });
  it("leaves totals unavailable, not zero, before any game", () => {
    const score = scoreEntry([pick("MIN", "OVER")], [team("MIN", 0, 0)], { MIN: 47.5 });
    expect(score).toMatchObject({ projectedTotal: null, projectedScored: 0, finalTotal: null });
  });
  it("keeps the final total pending until every pick settles", () => {
    const teams = [team("MIN", 50, 32), team("BOS", 30, 20)];
    const score = scoreEntry([pick("MIN", "OVER"), pick("BOS", "UNDER")], teams, { MIN: 47.5, BOS: 50.5 });
    expect(score.finalScored).toBe(1);
    expect(score.finalTotal).toBeNull();
    expect(score.picks[0].final?.points).toBeCloseTo(1.25);
  });
  it("excludes a team without a frozen line from every total", () => {
    const teams = [team("MIN", 50, 32), team("BOS", 60, 22)];
    const score = scoreEntry([pick("MIN", "OVER"), pick("BOS", "OVER")], teams, { MIN: 47.5 });
    expect(score.unavailable).toBe(1);
    expect(score.picks[1]).toMatchObject({ line: null, projected: null, final: null });
    expect(score.finalTotal).toBeCloseTo(1.25);
  });
  it("gives every entry the same score for the same picks", () => {
    const teams = [team("MIN", 30, 18), team("BOS", 25, 20)];
    const frozen = { MIN: 47.5, BOS: 50.5 };
    const picks = [pick("MIN", "OVER"), pick("BOS", "UNDER")];
    // A different reference line at pick time must not matter: only the shared frozen lines score.
    const other = picks.map((entry) => ({ ...entry, lineAtPick: 60.5, pickedAt: "2026-10-05T00:00:00.000Z" }));
    const a = scoreEntry(picks, teams, frozen);
    const b = scoreEntry(other, teams, frozen);
    expect(a.projectedTotal).toBe(b.projectedTotal);
    expect(a.finalTotal).toBe(b.finalTotal);
    expect(a.onPace).toBe(b.onPace);
  });
  it("selects a total by basis", () => {
    const score = scoreEntry([pick("MIN", "OVER")], [team("MIN", 30, 18)], { MIN: 47.5 });
    expect(entryTotal(score, "projected")).toBeCloseTo(1.375);
    expect(entryTotal(score, "final")).toBeNull();
  });
  it("throws on an unknown team", () => {
    expect(() => scoreEntry([pick("MIN", "OVER")], [], { MIN: 47.5 })).toThrow();
  });
});

describe("rankEntries", () => {
  it("ranks ties together and orders them by name", () => {
    const rows = [
      { entry: { id: "b", displayName: "zed" }, score: 3 },
      { entry: { id: "a", displayName: "Amy" }, score: 3 + 1e-12 },
      { entry: { id: "c", displayName: "Cal" }, score: 5 },
    ];
    expect(rankEntries(rows).map((row) => [row.entry.id, row.rank])).toEqual([["c", 1], ["a", 2], ["b", 2]]);
  });
  it("lists unscored entries by name without ranks", () => {
    const rows = [{ entry: { id: "x", displayName: "bo" }, score: null }, { entry: { id: "y", displayName: "Al" }, score: null }];
    expect(rankEntries(rows).map((row) => [row.entry.id, row.rank])).toEqual([["y", null], ["x", null]]);
  });
  it("skips ranks after a tie (1, 1, 3)", () => {
    const rows = [
      { entry: { id: "a", displayName: "Amy" }, score: 5 },
      { entry: { id: "b", displayName: "Bo" }, score: 5 },
      { entry: { id: "c", displayName: "Cal" }, score: 4 },
    ];
    expect(rankEntries(rows).map((row) => [row.entry.id, row.rank])).toEqual([["a", 1], ["b", 1], ["c", 3]]);
  });
  it("puts unscored entries after scored ones", () => {
    const rows = [
      { entry: { id: "u", displayName: "Al" }, score: null },
      { entry: { id: "s", displayName: "Zed" }, score: -2 },
    ];
    expect(rankEntries(rows).map((row) => [row.entry.id, row.rank])).toEqual([["s", 1], ["u", null]]);
  });
  it("breaks name ties by id", () => {
    const rows = [
      { entry: { id: "b", displayName: "Amy" }, score: 1 },
      { entry: { id: "a", displayName: "amy" }, score: 1 },
    ];
    expect(rankEntries(rows).map((row) => row.entry.id)).toEqual(["a", "b"]);
  });
});
