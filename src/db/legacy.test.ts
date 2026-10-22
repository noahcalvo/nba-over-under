import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { seatHolder, userSeatInLeague } from "@/db/accounts";
import { createLeagueFor } from "@/db/actions";
import { freezeChallenge, loadEntry, loadEntryForUser, saveChallengeEntry, syncChallengeSchedule } from "@/db/challenge";
import type { Db } from "@/db/client";
import { claimLegacy, listLegacyItems } from "@/db/legacy";
import { challengeEntries, challengePicks, sessionSeats } from "@/db/schema";
import { bindSeat, createSession, findSession } from "@/db/sessions";
import { createTestDb, createTestUser } from "@/db/test-db";
import { TEAM_INFO } from "@/data/teams";

const SEASON = 2027;
const at = (iso: string) => new Date(iso);
const opening = { ok: true as const, game: { tipoff: "2026-10-20T23:30:00.000Z", teams: ["BOS", "NYK"] as [string, string] } };
const DEADLINE = "2026-10-20T23:00:00.000Z";
const SAVED_AT = at("2026-10-15T12:00:00Z");

let db: Db;
let commissioner: string;
beforeEach(async () => {
  db = await createTestDb();
  commissioner = await createTestUser(db, "Commissioner");
  await createLeagueFor(db, commissioner, { leagueName: "Hoops", displayName: "Ana" }, () => "lg0001");
  await createLeagueFor(db, commissioner, { leagueName: "Bricks", displayName: "Ana" }, () => "lg0002");
  await syncChallengeSchedule(db, SEASON, opening, at("2026-10-13T12:00:00Z"));
});

/** A legacy entry: saved by a browser session before accounts, with one pick per team. */
async function insertLegacyEntry(sessionId: string, id = "legacy01", displayName = "Old") {
  await db.insert(challengeEntries).values({ id, season: SEASON, ownerSessionId: sessionId, displayName, createdAt: SAVED_AT, savedAt: SAVED_AT });
  await db.insert(challengePicks).values(
    TEAM_INFO.map((team, index) => ({ entryId: id, teamId: team.id, side: index % 2 ? ("OVER" as const) : ("UNDER" as const), lineAtPick: 40.5, pickedAt: SAVED_AT })),
  );
}

const sessionRows = (sessionId: string) => db.select().from(sessionSeats).where(eq(sessionSeats.sessionId, sessionId));

describe("listLegacyItems", () => {
  it("lists the session's seats and this season's unclaimed entry", async () => {
    const session = await createSession(db, "hash-s1");
    await bindSeat(db, session, "lg0001", "m2");
    await insertLegacyEntry(session);
    const items = await listLegacyItems(db, session, SEASON);
    expect(items.seats.map((seat) => [seat.id, seat.manager.id])).toEqual([["lg0001", "m2"]]);
    expect(items.entry).toEqual({ id: "legacy01", displayName: "Old" });
    expect(await listLegacyItems(db, session, 2026)).toMatchObject({ entry: null });
  });

  it("is empty for a session with nothing", async () => {
    const session = await createSession(db, "hash-s1");
    expect(await listLegacyItems(db, session, SEASON)).toEqual({ seats: [], entry: null });
  });
});

describe("claimLegacy", () => {
  it("moves seats and the entry into the account", async () => {
    const user = await createTestUser(db, "Ben");
    const session = await createSession(db, "hash-s1");
    await bindSeat(db, session, "lg0001", "m2");
    await bindSeat(db, session, "lg0002", "m3");
    await insertLegacyEntry(session);
    const before = await loadEntry(db, "legacy01");

    const result = await claimLegacy(db, session, user, SEASON);

    expect(result.seats).toEqual(
      expect.arrayContaining([
        { leagueId: "lg0001", leagueName: "Hoops", managerId: "m2", outcome: "moved" },
        { leagueId: "lg0002", leagueName: "Bricks", managerId: "m3", outcome: "moved" },
      ]),
    );
    expect(result.seats).toHaveLength(2);
    expect(result.entry).toEqual({ id: "legacy01", displayName: "Old", outcome: "moved" });
    expect(result.sessionCleared).toBe(true);
    expect(await seatHolder(db, "lg0001", "m2")).toBe(user);
    expect(await seatHolder(db, "lg0002", "m3")).toBe(user);
    const entry = await loadEntryForUser(db, SEASON, user);
    expect(entry).toEqual(before);
    expect(entry?.picks).toHaveLength(30);
    expect(await findSession(db, "hash-s1")).toBeNull();
  });

  it("two browsers, one account", async () => {
    const user = await createTestUser(db, "Ben");
    const s1 = await createSession(db, "hash-s1");
    const s2 = await createSession(db, "hash-s2");
    await bindSeat(db, s1, "lg0001", "m2");
    await bindSeat(db, s2, "lg0001", "m2");

    expect((await claimLegacy(db, s1, user, SEASON)).seats).toMatchObject([{ managerId: "m2", outcome: "moved" }]);
    const second = await claimLegacy(db, s2, user, SEASON);
    expect(second.seats).toMatchObject([{ managerId: "m2", outcome: "already_yours" }]);
    expect(second.sessionCleared).toBe(true);
    expect(await sessionRows(s1)).toEqual([]);
    expect(await sessionRows(s2)).toEqual([]);
    expect(await seatHolder(db, "lg0001", "m2")).toBe(user);
  });

  it("two browsers, two accounts", async () => {
    const u1 = await createTestUser(db, "Ben");
    const u2 = await createTestUser(db, "Cal");
    const s1 = await createSession(db, "hash-s1");
    const s2 = await createSession(db, "hash-s2");
    await bindSeat(db, s1, "lg0001", "m2");
    await bindSeat(db, s2, "lg0001", "m2");

    expect((await claimLegacy(db, s1, u1, SEASON)).seats).toMatchObject([{ outcome: "moved" }]);
    const second = await claimLegacy(db, s2, u2, SEASON);
    expect(second.seats).toMatchObject([{ managerId: "m2", outcome: "seat_owned" }]);
    expect(second.sessionCleared).toBe(true);
    expect(await sessionRows(s2)).toEqual([]);
    expect(await findSession(db, "hash-s2")).toBeNull();
    expect(await seatHolder(db, "lg0001", "m2")).toBe(u1);
  });

  it("keeps the seat when the account already holds another seat in the league", async () => {
    const session = await createSession(db, "hash-s1");
    await bindSeat(db, session, "lg0001", "m2");

    const result = await claimLegacy(db, session, commissioner, SEASON);
    expect(result.seats).toMatchObject([{ managerId: "m2", outcome: "already_joined" }]);
    expect(result.sessionCleared).toBe(true);
    expect(await seatHolder(db, "lg0001", "m2")).toBeNull();
    expect(await userSeatInLeague(db, commissioner, "lg0001")).toBe("m1");
    expect(await sessionRows(session)).toEqual([]);
  });

  it("keeps a conflicting entry", async () => {
    const user = await createTestUser(db, "Ben");
    const session = await createSession(db, "hash-s1");
    await insertLegacyEntry(session);
    const own = await saveChallengeEntry(
      db,
      { season: SEASON, userId: user, displayName: "Ben", picks: Object.fromEntries(TEAM_INFO.map((team) => [team.id, "OVER"])), currentLines: {} },
      { now: SAVED_AT },
    );
    if (!own.ok) throw new Error("save failed");

    const before = await loadEntry(db, "legacy01");

    const result = await claimLegacy(db, session, user, SEASON);
    expect(result.entry).toEqual({ id: "legacy01", displayName: "Old", outcome: "entry_exists" });
    expect(result.sessionCleared).toBe(true);
    const [legacy] = await db.select().from(challengeEntries).where(eq(challengeEntries.id, "legacy01"));
    expect(legacy).toMatchObject({ ownerSessionId: null, ownerUserId: null });
    expect(await loadEntry(db, "legacy01")).toEqual(before);
    expect((await loadEntryForUser(db, SEASON, user))?.id).toBe(own.value.id);
  });

  it("moves a locked entry's owner only", async () => {
    const user = await createTestUser(db, "Ben");
    const session = await createSession(db, "hash-s1");
    await insertLegacyEntry(session);
    const frozen = await freezeChallenge(db, SEASON, { now: at(DEADLINE) });
    expect(frozen?.frozen).not.toBeNull();
    const before = await loadEntry(db, "legacy01");

    const result = await claimLegacy(db, session, user, SEASON);
    expect(result.entry).toMatchObject({ outcome: "moved" });
    const after = await loadEntryForUser(db, SEASON, user);
    expect(after).toEqual(before);
    expect(after?.savedAt).toBe(SAVED_AT.toISOString());
    const [row] = await db.select().from(challengeEntries).where(eq(challengeEntries.id, "legacy01"));
    expect(row).toMatchObject({ ownerUserId: user, ownerSessionId: null });
  });

  it("leaves another season's entry and keeps the session for it", async () => {
    const user = await createTestUser(db, "Ben");
    const session = await createSession(db, "hash-s1");
    await insertLegacyEntry(session);
    const result = await claimLegacy(db, session, user, 2026);
    expect(result).toEqual({ seats: [], entry: null, sessionCleared: false });
    expect((await listLegacyItems(db, session, SEASON)).entry).not.toBeNull();
  });

  it("keeps a session that owns another season's entry while moving this season's items", async () => {
    const user = await createTestUser(db, "Ben");
    const session = await createSession(db, "hash-s1");
    await bindSeat(db, session, "lg0001", "m2");
    await insertLegacyEntry(session);
    const past = { ok: true as const, game: { tipoff: "2025-10-20T23:30:00.000Z", teams: ["BOS", "NYK"] as [string, string] } };
    await syncChallengeSchedule(db, 2026, past, at("2025-10-01T00:00:00Z"));
    await db.insert(challengeEntries).values({ id: "legacy00", season: 2026, ownerSessionId: session, displayName: "Older", createdAt: SAVED_AT, savedAt: SAVED_AT });

    const result = await claimLegacy(db, session, user, SEASON);
    expect(result.seats).toMatchObject([{ managerId: "m2", outcome: "moved" }]);
    expect(result.entry).toMatchObject({ id: "legacy01", outcome: "moved" });
    expect(result.sessionCleared).toBe(false);
    expect(await findSession(db, "hash-s1")).not.toBeNull();
    expect(await sessionRows(session)).toEqual([]);
    expect((await listLegacyItems(db, session, 2026)).entry?.id).toBe("legacy00");
  });

  it("concurrent claims of one seat by two accounts", async () => {
    const u1 = await createTestUser(db, "Ben");
    const u2 = await createTestUser(db, "Cal");
    const s1 = await createSession(db, "hash-s1");
    const s2 = await createSession(db, "hash-s2");
    await bindSeat(db, s1, "lg0001", "m2");
    await bindSeat(db, s2, "lg0001", "m2");

    const results = await Promise.all([claimLegacy(db, s1, u1, SEASON), claimLegacy(db, s2, u2, SEASON)]);
    const outcomes = results.map((result) => result.seats[0]?.outcome).sort();
    expect(outcomes).toEqual(["moved", "seat_owned"]);
    const winner = results[0].seats[0]?.outcome === "moved" ? u1 : u2;
    expect(await seatHolder(db, "lg0001", "m2")).toBe(winner);
  });
});
