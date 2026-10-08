import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { createLeagueFor } from "@/db/actions";
import { loadRefresh, loadSeasonRecords, loadTeamInfo, recordStatus, refreshSeasonRecords, seasonsInUse } from "@/db/records";
import { createSession } from "@/db/sessions";
import { createTestDb } from "@/db/test-db";
import { TEAM_INFO } from "@/data/teams";
import { FeedError } from "@/lib/feed-error";
import type { RecordSource, SeasonRecords } from "@/lib/records/types";

const SEASON = 2027;
const T0 = new Date("2026-11-01T10:00:00.000Z");
const later = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

function source(records: SeasonRecords | Error): RecordSource & { calls: number } {
  const s = {
    name: "ESPN",
    calls: 0,
    async fetch(season: number) {
      s.calls++;
      if (records instanceof Error) throw records;
      return { season, records };
    },
  };
  return s;
}

let db: Db;
beforeEach(async () => {
  db = await createTestDb();
});

describe("refreshSeasonRecords", () => {
  it("stores every team's record and the success time", async () => {
    const outcome = await refreshSeasonRecords(
      db,
      SEASON,
      source({ BOS: { wins: 3, losses: 1 }, MIN: { wins: 2, losses: 2 } }),
      { now: T0 },
    );
    expect(outcome).toMatchObject({ ok: true, fetched: true });
    expect(await loadSeasonRecords(db, SEASON)).toEqual({ BOS: { wins: 3, losses: 1 }, MIN: { wins: 2, losses: 2 } });
    expect(await loadRefresh(db, SEASON)).toEqual({ source: "ESPN", succeededAt: T0, attemptedAt: T0, error: null });
    expect(await loadSeasonRecords(db, 2026)).toEqual({});
  });

  it("keeps the stored records and saves the reason when the source fails", async () => {
    await refreshSeasonRecords(db, SEASON, source({ BOS: { wins: 3, losses: 1 } }), { now: T0 });
    const outcome = await refreshSeasonRecords(db, SEASON, source(new FeedError("ESPN returned HTTP 503.")), {
      now: later(120),
    });
    expect(outcome).toMatchObject({ ok: false, message: "ESPN returned HTTP 503." });
    expect(await loadSeasonRecords(db, SEASON)).toEqual({ BOS: { wins: 3, losses: 1 } });
    expect(await loadRefresh(db, SEASON)).toEqual({
      source: "ESPN",
      succeededAt: T0,
      attemptedAt: later(120),
      error: "ESPN returned HTTP 503.",
    });
  });

  it("records a failure even when nothing was ever stored", async () => {
    const outcome = await refreshSeasonRecords(db, SEASON, source(new FeedError("Couldn't reach ESPN.")), { now: T0 });
    expect(outcome.ok).toBe(false);
    expect(outcome.refresh).toEqual({ source: "ESPN", succeededAt: null, attemptedAt: T0, error: "Couldn't reach ESPN." });
  });

  it("hides unexpected errors behind a generic message", async () => {
    const outcome = await refreshSeasonRecords(db, SEASON, source(new Error("connection reset by peer at 10.0.0.1")), {
      now: T0,
    });
    expect(outcome).toMatchObject({ ok: false, message: "Something went wrong while refreshing records." });
  });

  it("rejects standings with fewer games than stored", async () => {
    await refreshSeasonRecords(db, SEASON, source({ BOS: { wins: 3, losses: 1 } }), { now: T0 });
    const outcome = await refreshSeasonRecords(db, SEASON, source({ BOS: { wins: 2, losses: 1 } }), { now: later(120) });
    expect(outcome.ok).toBe(false);
    expect(await loadSeasonRecords(db, SEASON)).toEqual({ BOS: { wins: 3, losses: 1 } });
  });

  it("clears the last error after a success", async () => {
    await refreshSeasonRecords(db, SEASON, source(new FeedError("Couldn't reach ESPN.")), { now: T0 });
    await refreshSeasonRecords(db, SEASON, source({ BOS: { wins: 1, losses: 0 } }), { now: later(5) });
    expect((await loadRefresh(db, SEASON))?.error).toBeNull();
  });

  it("reuses a success from the last minute without calling the source, unless forced", async () => {
    await refreshSeasonRecords(db, SEASON, source({ BOS: { wins: 1, losses: 0 } }), { now: T0 });
    const second = source({ BOS: { wins: 2, losses: 0 } });
    expect(await refreshSeasonRecords(db, SEASON, second, { now: later(59) })).toMatchObject({ ok: true, fetched: false });
    expect(second.calls).toBe(0);
    expect(await refreshSeasonRecords(db, SEASON, second, { now: later(59), force: true })).toMatchObject({ fetched: true });
    expect(await refreshSeasonRecords(db, SEASON, second, { now: later(200) })).toMatchObject({ fetched: true });
    expect(second.calls).toBe(2);
  });

  it("lets a late failure leave a newer success untouched", async () => {
    await refreshSeasonRecords(db, SEASON, source({ BOS: { wins: 1, losses: 0 } }), { now: later(10) });
    const outcome = await refreshSeasonRecords(db, SEASON, source(new FeedError("ESPN returned HTTP 503.")), {
      now: T0,
      force: true,
    });
    expect(outcome).toMatchObject({ ok: false, message: "ESPN returned HTTP 503." });
    expect(await loadRefresh(db, SEASON)).toMatchObject({ error: null, succeededAt: later(10), attemptedAt: later(10) });
  });

  it("refuses impossible records at the database", async () => {
    const outcome = await refreshSeasonRecords(db, SEASON, source({ BOS: { wins: 80, losses: 3 } }), { now: T0 });
    expect(outcome.ok).toBe(false);
    expect(await loadSeasonRecords(db, SEASON)).toEqual({});
  });
});

describe("recordStatus", () => {
  it("describes a season's refresh state", () => {
    expect(recordStatus("2026–27", null)).toEqual({ seasonLabel: "2026–27", source: "ESPN", asOf: null, error: null });
    expect(recordStatus("2026–27", { source: "ESPN", succeededAt: T0, attemptedAt: later(9), error: "x." })).toEqual({
      seasonLabel: "2026–27",
      source: "ESPN",
      asOf: T0.toISOString(),
      error: "x.",
    });
  });
});

describe("seasonsInUse", () => {
  it("lists each stored league's season once", async () => {
    expect(await seasonsInUse(db)).toEqual([]);
    const session = await createSession(db, "hash-a");
    await createLeagueFor(db, session, { displayName: "Ana" });
    await createLeagueFor(db, session, { displayName: "Ana" });
    const seasons = await seasonsInUse(db);
    expect(seasons).toHaveLength(1);
    expect(seasons[0]).toMatch(/^\d{4}–\d{2}$/);
  });
});

describe("loadTeamInfo", () => {
  const stored = { isDemo: false, seasonLabel: "2026–27" };
  const rec = (teams: { id: string; wins: number; losses: number }[], id: string) => teams.find((t) => t.id === id)!;

  it("keeps the mock records for the demo league", async () => {
    const teams = await loadTeamInfo(db, { isDemo: true, seasonLabel: "2026–27" });
    expect(teams).toEqual([...TEAM_INFO]);
    expect(rec(teams, "BOS")).toMatchObject({ wins: 22, losses: 26 });
  });

  it("shows every team at 0–0 for a stored league with no stored records", async () => {
    const teams = await loadTeamInfo(db, stored);
    expect(teams).toHaveLength(30);
    expect(teams.every((t) => t.wins === 0 && t.losses === 0)).toBe(true);
  });

  it("uses the stored records for the league's season after a refresh", async () => {
    await refreshSeasonRecords(db, SEASON, source({ BOS: { wins: 3, losses: 1 } }), { now: T0 });
    const teams = await loadTeamInfo(db, stored);
    expect(rec(teams, "BOS")).toMatchObject({ wins: 3, losses: 1 });
    expect(rec(teams, "MIN")).toMatchObject({ wins: 0, losses: 0 });
  });

  it("does not show another season's records", async () => {
    await refreshSeasonRecords(db, SEASON, source({ BOS: { wins: 3, losses: 1 } }), { now: T0 });
    const teams = await loadTeamInfo(db, { isDemo: false, seasonLabel: "2025–26" });
    expect(rec(teams, "BOS")).toMatchObject({ wins: 0, losses: 0 });
  });
});
