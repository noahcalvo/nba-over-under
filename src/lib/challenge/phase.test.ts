import { describe, expect, it } from "vitest";
import { challengePhase, isLocked } from "./phase";
import type { ChallengeSeason, FrozenLines } from "./types";

const DEADLINE = "2026-10-20T18:30:00.000Z";
const frozen: FrozenLines = { values: {}, observedAt: {}, missing: [], source: "FanDuel", lockedAt: "2026-10-20T18:31:00.000Z" };
const open: Pick<ChallengeSeason, "deadline" | "frozen"> = { deadline: DEADLINE, frozen: null };
const locked: Pick<ChallengeSeason, "deadline" | "frozen"> = { deadline: DEADLINE, frozen };
const teams = (wins: number, losses: number, count = 30) => Array.from({ length: count }, () => ({ wins, losses }));
const at = (iso: string) => new Date(iso);

describe("challengePhase", () => {
  it("is schedule_unknown without a season or deadline", () => {
    expect(challengePhase(null, at("2026-10-01T00:00:00Z"), [])).toBe("schedule_unknown");
    expect(challengePhase({ deadline: null, frozen: null }, at("2026-10-01T00:00:00Z"), [])).toBe("schedule_unknown");
  });
  it("is open before the deadline", () => {
    expect(challengePhase(open, at("2026-10-20T18:29:59.999Z"), [])).toBe("open");
  });
  it("is locking at exactly the deadline and after, until frozen", () => {
    expect(challengePhase(open, at(DEADLINE), [])).toBe("locking");
    expect(challengePhase(open, at("2026-10-25T00:00:00Z"), [])).toBe("locking");
  });
  it("is locked when frozen and no games were played", () => {
    expect(challengePhase(locked, at("2026-10-21T00:00:00Z"), teams(0, 0))).toBe("locked");
    expect(challengePhase(locked, at("2026-10-21T00:00:00Z"), [])).toBe("locked");
  });
  it("is in_season once any team has played", () => {
    const records = [{ wins: 1, losses: 0 }, ...teams(0, 0, 29)];
    expect(challengePhase(locked, at("2026-10-22T00:00:00Z"), records)).toBe("in_season");
  });
  it("is in_season while some team is short of 82 games", () => {
    const records = [{ wins: 40, losses: 41 }, ...teams(41, 41, 29)];
    expect(challengePhase(locked, at("2027-04-01T00:00:00Z"), records)).toBe("in_season");
  });
  it("is final once every team has played 82 games", () => {
    expect(challengePhase(locked, at("2027-04-15T00:00:00Z"), teams(41, 41))).toBe("final");
  });
  it("uses frozen over the deadline", () => {
    expect(challengePhase({ deadline: null, frozen }, at("2026-10-01T00:00:00Z"), [])).toBe("locked");
  });
});

describe("isLocked", () => {
  it("is false only for open and schedule_unknown", () => {
    expect(isLocked("open")).toBe(false);
    expect(isLocked("schedule_unknown")).toBe(false);
    for (const phase of ["locking", "locked", "in_season", "final"] as const) expect(isLocked(phase)).toBe(true);
  });
});
