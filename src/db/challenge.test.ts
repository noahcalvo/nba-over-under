import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { createTestDb } from "@/db/test-db";
import {
  databaseNow,
  freezeChallenge,
  listEntries,
  loadChallengeSeason,
  loadEntry,
  loadEntryForSession,
  loadLatestSnapshot,
  recordLineSnapshot,
  saveChallengeEntry,
  syncChallengeSchedule,
} from "@/db/challenge";
import { createLeagueFor, runDraftAction } from "@/db/actions";
import { loadLeague } from "@/db/leagues";
import { sessions } from "@/db/schema";
import { createSession } from "@/db/sessions";
import { STATIC_LINES } from "@/data/static-lines";
import { TEAM_INFO } from "@/data/teams";
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
  it("uses the database clock when no time is given", async () => {
    const past = { ok: true as const, game: { tipoff: "2020-10-20T23:30:00.000Z", teams: ["BOS", "NYK"] as [string, string] } };
    await syncChallengeSchedule(db, 2021, past, at("2019-01-01T00:00:00Z"));
    const season = await freezeChallenge(db, 2021);
    expect(season?.frozen).not.toBeNull();
    expect(season?.frozen?.missing).toHaveLength(30);
  });
});

const allPicks = (side: "OVER" | "UNDER") => Object.fromEntries(TEAM_INFO.map((team) => [team.id, side]));
const BEFORE = at("2026-10-15T12:00:00Z");

describe("saveChallengeEntry", () => {
  let session: string;
  beforeEach(async () => {
    await syncChallengeSchedule(db, SEASON, opening, at("2026-10-13T12:00:00Z"));
    session = await createSession(db, "hash-a");
  });
  const save = (overrides: Partial<Parameters<typeof saveChallengeEntry>[1]> = {}, now = BEFORE) =>
    saveChallengeEntry(db, { season: SEASON, sessionId: session, displayName: "Ana", picks: allPicks("OVER"), currentLines: STATIC_LINES.values, ...overrides }, { now });

  it("creates the session's entry with every pick and its reference line", async () => {
    const result = await save();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.picks).toHaveLength(30);
    expect(result.value.picks.find((pick) => pick.teamId === "MIN")).toEqual({ teamId: "MIN", side: "OVER", lineAtPick: STATIC_LINES.values.MIN, pickedAt: BEFORE.toISOString() });
    expect(await loadEntryForSession(db, SEASON, session)).toEqual(result.value);
    expect(await loadEntry(db, result.value.id)).toEqual(result.value);
  });
  it("updates the same entry and keeps unchanged references when lines moved", async () => {
    const first = await save();
    const moved = { ...STATIC_LINES.values, MIN: 40.5, BOS: 55.5 };
    const second = await save({ displayName: "Ana B", picks: { ...allPicks("OVER"), BOS: "UNDER" }, currentLines: moved }, at("2026-10-16T12:00:00Z"));
    if (!first.ok || !second.ok) throw new Error("save failed");
    expect(second.value.id).toBe(first.value.id);
    expect(second.value.displayName).toBe("Ana B");
    expect(second.value.picks.find((pick) => pick.teamId === "MIN")).toEqual(first.value.picks.find((pick) => pick.teamId === "MIN"));
    expect(second.value.picks.find((pick) => pick.teamId === "BOS")).toMatchObject({ side: "UNDER", lineAtPick: 55.5, pickedAt: "2026-10-16T12:00:00.000Z" });
    expect(second.value.savedAt).toBe("2026-10-16T12:00:00.000Z");
    expect(await listEntries(db, SEASON)).toHaveLength(1);
  });
  it("gives another session its own entry and never touches the first", async () => {
    const first = await save();
    const other = await createSession(db, "hash-b");
    const second = await saveChallengeEntry(db, { season: SEASON, sessionId: other, displayName: "Ben", picks: allPicks("UNDER"), currentLines: {} }, { now: BEFORE });
    if (!first.ok || !second.ok) throw new Error("save failed");
    expect(second.value.id).not.toBe(first.value.id);
    expect(await loadEntry(db, first.value.id)).toEqual(first.value);
    expect(await listEntries(db, SEASON)).toHaveLength(2);
  });
  it("lists entries oldest first", async () => {
    const other = await createSession(db, "hash-b");
    await saveChallengeEntry(db, { season: SEASON, sessionId: other, displayName: "Ben", picks: allPicks("UNDER"), currentLines: {} }, { now: at("2026-10-14T12:00:00Z") });
    await save();
    expect((await listEntries(db, SEASON)).map((entry) => entry.displayName)).toEqual(["Ben", "Ana"]);
  });
  it("refuses a save at and after the deadline", async () => {
    await save();
    expect(await save({ picks: allPicks("UNDER") }, at(DEADLINE))).toEqual({ ok: false, error: "challenge_locked" });
    expect(await save({ picks: allPicks("UNDER") }, at("2026-10-21T00:00:00Z"))).toEqual({ ok: false, error: "challenge_locked" });
    const stored = await loadEntryForSession(db, SEASON, session);
    expect(stored?.picks.every((pick) => pick.side === "OVER")).toBe(true);
  });
  it("refuses a save once the freeze is stored, whatever the clock says", async () => {
    await freezeChallenge(db, SEASON, { now: at(DEADLINE) });
    expect(await save()).toEqual({ ok: false, error: "challenge_locked" });
  });
  it("refuses a save before any deadline is known", async () => {
    const fresh = await createTestDb();
    const owner = await createSession(fresh, "hash-c");
    expect(await saveChallengeEntry(fresh, { season: SEASON, sessionId: owner, displayName: "Ana", picks: allPicks("OVER"), currentLines: {} }, { now: BEFORE })).toEqual({ ok: false, error: "deadline_unavailable" });
  });
  it("keeps the entry when its session is deleted", async () => {
    const result = await save();
    if (!result.ok) throw new Error("save failed");
    await db.delete(sessions).where(eq(sessions.id, session));
    expect(await loadEntry(db, result.value.id)).toEqual(result.value);
  });
  it("uses the database clock when no time is given", async () => {
    const past = { ok: true as const, game: { tipoff: "2020-10-20T23:30:00.000Z", teams: ["BOS", "NYK"] as [string, string] } };
    await syncChallengeSchedule(db, 2021, past, at("2019-01-01T00:00:00Z"));
    const result = await saveChallengeEntry(db, { season: 2021, sessionId: session, displayName: "Ana", picks: allPicks("OVER"), currentLines: {} });
    expect(result).toEqual({ ok: false, error: "challenge_locked" });
  });
});

describe("league lines", () => {
  it("are untouched by challenge writes", async () => {
    const owner = await createSession(db, "hash-league");
    await createLeagueFor(db, owner, { leagueName: "Hoops", displayName: "Ana" }, () => "lg0001");
    const started = await runDraftAction(db, "lg0001", owner, { type: "start" }, STATIC_LINES);
    expect(started.ok).toBe(true);
    await syncChallengeSchedule(db, SEASON, opening, at("2026-10-13T12:00:00Z"));
    const saved = await saveChallengeEntry(
      db,
      { season: SEASON, sessionId: owner, displayName: "Ana", picks: allPicks("OVER"), currentLines: { ...STATIC_LINES.values, MIN: 30.5 } },
      { now: BEFORE },
    );
    expect(saved.ok).toBe(true);
    await recordLineSnapshot(db, SEASON, lines("2026-10-20T22:00:00.000Z", { ...STATIC_LINES.values, MIN: 31.5 }));
    await freezeChallenge(db, SEASON, { now: at(DEADLINE) });
    const league = await loadLeague(db, "lg0001");
    expect(league?.lines?.values).toEqual(STATIC_LINES.values);
  });
});
