import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { createTestDb } from "@/db/test-db";
import {
  databaseNow,
  freezeChallenge,
  loadChallengeSeason,
  loadLatestSnapshot,
  recordLineSnapshot,
  syncChallengeSchedule,
} from "@/db/challenge";
import { STATIC_LINES } from "@/data/static-lines";
import type { LineSet } from "@/lib/types";

const SEASON = 2027;
const TIPOFF = "2026-10-20T23:30:00.000Z";
const DEADLINE = "2026-10-20T23:00:00.000Z";
const at = (iso: string) => new Date(iso);
const lines = (asOf: string, values: Record<string, number>): LineSet => ({ values, source: "FanDuel", season: "2026–27", asOf, manual: [] });
const opening = { ok: true as const, game: { tipoff: TIPOFF, teams: ["BOS", "NYK"] as [string, string] } };

let db: Db;
beforeEach(async () => {
  db = await createTestDb();
});

describe("databaseNow", () => {
  it("returns the database clock as a Date", async () => {
    const now = await databaseNow(db);
    expect(now).toBeInstanceOf(Date);
    expect(Math.abs(now.getTime() - Date.now())).toBeLessThan(60_000);
  });
});

describe("syncChallengeSchedule", () => {
  it("stores the opening game and a deadline 30 minutes before it", async () => {
    const season = await syncChallengeSchedule(db, SEASON, opening, at("2026-10-13T12:00:00Z"));
    expect(season).toMatchObject({ deadline: DEADLINE, openingGame: { tipoff: TIPOFF, teams: ["BOS", "NYK"] }, scheduleError: null, frozen: null });
  });
  it("moves the deadline when the opening game moves before the deadline", async () => {
    await syncChallengeSchedule(db, SEASON, opening, at("2026-10-13T12:00:00Z"));
    const moved = await syncChallengeSchedule(db, SEASON, { ok: true, game: { tipoff: "2026-10-21T00:30:00.000Z", teams: [null, null] } }, at("2026-10-14T12:00:00Z"));
    expect(moved.deadline).toBe("2026-10-21T00:00:00.000Z");
  });
  it("keeps the stored deadline and records the error on a failed read", async () => {
    await syncChallengeSchedule(db, SEASON, opening, at("2026-10-13T12:00:00Z"));
    const failed = await syncChallengeSchedule(db, SEASON, { ok: false, error: "ESPN returned HTTP 503." }, at("2026-10-14T12:00:00Z"));
    expect(failed).toMatchObject({ deadline: DEADLINE, scheduleError: "ESPN returned HTTP 503.", scheduleCheckedAt: "2026-10-14T12:00:00.000Z" });
  });
  it("never changes the deadline once it has passed", async () => {
    await syncChallengeSchedule(db, SEASON, opening, at("2026-10-13T12:00:00Z"));
    const late = await syncChallengeSchedule(db, SEASON, { ok: true, game: { tipoff: "2026-10-22T23:30:00.000Z", teams: [null, null] } }, at("2026-10-20T23:00:00Z"));
    expect(late.deadline).toBe(DEADLINE);
  });
});

describe("recordLineSnapshot", () => {
  it("confirms identical values instead of adding a row, and adds a row when they change", async () => {
    await recordLineSnapshot(db, SEASON, lines("2026-10-10T00:00:00.000Z", { MIN: 49.5 }));
    await recordLineSnapshot(db, SEASON, lines("2026-10-11T00:00:00.000Z", { MIN: 49.5 }));
    expect(await loadLatestSnapshot(db, SEASON)).toEqual({ observedAt: "2026-10-10T00:00:00.000Z", source: "FanDuel", lines: { MIN: 49.5 } });
    await recordLineSnapshot(db, SEASON, lines("2026-10-12T00:00:00.000Z", { MIN: 43.5 }));
    expect((await loadLatestSnapshot(db, SEASON))?.lines).toEqual({ MIN: 43.5 });
  });
  it("records the same read twice only once", async () => {
    const read = lines("2026-10-12T00:00:00.000Z", { MIN: 43.5 });
    await recordLineSnapshot(db, SEASON, read);
    await recordLineSnapshot(db, SEASON, lines("2026-10-11T00:00:00.000Z", { MIN: 40 }));
    await recordLineSnapshot(db, SEASON, lines("2026-10-11T00:00:00.000Z", { MIN: 40 }));
    // No throw; the newest by observation time is still the 12th.
    expect((await loadLatestSnapshot(db, SEASON))?.observedAt).toBe("2026-10-12T00:00:00.000Z");
  });
});

describe("freezeChallenge", () => {
  beforeEach(async () => {
    await syncChallengeSchedule(db, SEASON, opening, at("2026-10-13T12:00:00Z"));
  });
  it("does nothing before the deadline", async () => {
    await recordLineSnapshot(db, SEASON, STATIC_LINES);
    expect((await freezeChallenge(db, SEASON, { now: at("2026-10-20T22:59:59Z") }))?.frozen).toBeNull();
  });
  it("freezes the latest pre-deadline lines and reports missing teams", async () => {
    const withoutMin = Object.fromEntries(Object.entries(STATIC_LINES.values).filter(([id]) => id !== "MIN"));
    await recordLineSnapshot(db, SEASON, lines("2026-10-15T00:00:00.000Z", STATIC_LINES.values));
    await recordLineSnapshot(db, SEASON, lines("2026-10-20T22:00:00.000Z", { ...withoutMin, BOS: 52.5 }));
    const season = await freezeChallenge(db, SEASON, { now: at("2026-10-20T23:00:00Z") });
    expect(season?.frozen?.values.BOS).toBe(52.5);
    expect(season?.frozen?.values.MIN).toBe(STATIC_LINES.values.MIN);
    expect(season?.frozen?.observedAt.MIN).toBe("2026-10-15T00:00:00.000Z");
    expect(season?.frozen?.missing).toEqual([]);
  });
  it("ignores snapshots observed at or after the deadline", async () => {
    await recordLineSnapshot(db, SEASON, lines("2026-10-20T22:00:00.000Z", { MIN: 49.5 }));
    await recordLineSnapshot(db, SEASON, lines(DEADLINE, { MIN: 40.5 }));
    await recordLineSnapshot(db, SEASON, lines("2026-10-21T01:00:00.000Z", { MIN: 41.5, BOS: 50.5 }));
    const season = await freezeChallenge(db, SEASON, { now: at("2026-10-21T02:00:00Z") });
    expect(season?.frozen?.values).toEqual({ MIN: 49.5 });
    expect(season?.frozen?.missing).toHaveLength(29);
  });
  it("is idempotent: a second freeze keeps the first snapshot", async () => {
    await recordLineSnapshot(db, SEASON, lines("2026-10-20T22:00:00.000Z", { MIN: 49.5 }));
    const first = await freezeChallenge(db, SEASON, { now: at("2026-10-20T23:00:00Z") });
    await recordLineSnapshot(db, SEASON, lines("2026-10-20T22:30:00.000Z", { MIN: 47.5 }));
    const second = await freezeChallenge(db, SEASON, { now: at("2026-10-21T00:00:00Z") });
    expect(second?.frozen).toEqual(first?.frozen);
    expect(await loadChallengeSeason(db, SEASON)).toEqual(second);
  });
  it("freezes with every team missing when no line was ever read", async () => {
    const season = await freezeChallenge(db, SEASON, { now: at("2026-10-21T00:00:00Z") });
    expect(season?.frozen?.missing).toHaveLength(30);
    expect(season?.frozen?.values).toEqual({});
  });
  it("returns null for a season that was never set up", async () => {
    expect(await freezeChallenge(db, 2030)).toBeNull();
  });
});
