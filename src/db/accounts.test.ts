import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { buildDemoLeague } from "@/data/demo-league";
import {
  bindUserSeat,
  listUserLeagues,
  loadUserSeats,
  seatHolder,
  unbindSeatHolder,
  userSeatInLeague,
} from "@/db/accounts";
import type { Db } from "@/db/client";
import { insertLeague } from "@/db/leagues";
import { challengeEntries, challengeSeasons, leagues, managers, userSeats } from "@/db/schema";
import { createTestDb, createTestUser } from "@/db/test-db";

let db: Db;
let u1: string;
let u2: string;

async function createLeague(id: string, name: string) {
  await db.transaction((tx) => insertLeague(tx, { ...buildDemoLeague(), id, name }));
}

beforeEach(async () => {
  db = await createTestDb();
  u1 = await createTestUser(db, "Ana");
  u2 = await createTestUser(db, "Ben");
  await createLeague("lg0001", "Hoops");
});

describe("user seats", () => {
  it("binds one seat per user per league", async () => {
    await bindUserSeat(db, u1, "lg0001", "m1");
    await expect(bindUserSeat(db, u1, "lg0001", "m2")).rejects.toThrow();
    expect(await userSeatInLeague(db, u1, "lg0001")).toBe("m1");
  });

  it("binds one user per seat", async () => {
    await bindUserSeat(db, u1, "lg0001", "m2");
    await expect(bindUserSeat(db, u2, "lg0001", "m2")).rejects.toThrow();
    expect(await seatHolder(db, "lg0001", "m2")).toBe(u1);
  });

  it("reads null where nobody holds a seat", async () => {
    expect(await userSeatInLeague(db, u1, "lg0001")).toBeNull();
    expect(await seatHolder(db, "lg0001", "m3")).toBeNull();
  });

  it("unbinds a seat's holder", async () => {
    await bindUserSeat(db, u1, "lg0001", "m2");
    await unbindSeatHolder(db, "lg0001", "m2");
    expect(await seatHolder(db, "lg0001", "m2")).toBeNull();
  });

  it("drops the binding when the seat is removed", async () => {
    await bindUserSeat(db, u1, "lg0001", "m2");
    await db.delete(managers).where(and(eq(managers.leagueId, "lg0001"), eq(managers.id, "m2")));
    expect(await seatHolder(db, "lg0001", "m2")).toBeNull();
  });

  it("lists a user's leagues, most recently joined first", async () => {
    await createLeague("lg0002", "Second");
    await bindUserSeat(db, u1, "lg0001", "m1");
    await bindUserSeat(db, u1, "lg0002", "m3");
    await bindUserSeat(db, u2, "lg0002", "m1");
    // Rows inserted in the same millisecond tie on created_at, so give the first seat an earlier time.
    await db
      .update(userSeats)
      .set({ createdAt: new Date(Date.now() - 60_000) })
      .where(and(eq(userSeats.userId, u1), eq(userSeats.leagueId, "lg0001")));
    const listed = await listUserLeagues(db, u1);
    expect(listed.map((league) => [league.id, league.name, league.manager.id])).toEqual([
      ["lg0002", "Second", "m3"],
      ["lg0001", "Hoops", "m1"],
    ]);
    expect(await loadUserSeats(db, u1)).toEqual({ lg0001: "m1", lg0002: "m3" });
    expect(await loadUserSeats(db, await createTestUser(db))).toEqual({});
  });

  it("leaves archived leagues out of a user's leagues", async () => {
    await createLeague("lg0002", "Second");
    await bindUserSeat(db, u1, "lg0001", "m1");
    await bindUserSeat(db, u1, "lg0002", "m3");
    await db.update(leagues).set({ archivedAt: new Date() }).where(eq(leagues.id, "lg0001"));
    const listed = await listUserLeagues(db, u1);
    expect(listed.map((league) => league.id)).toEqual(["lg0002"]);
  });
});

describe("challenge entries", () => {
  it("allows one challenge entry per user per season", async () => {
    await db.insert(challengeSeasons).values({ season: 2027 });
    const entry = (id: string, ownerUserId: string | null) => ({
      id,
      season: 2027,
      ownerUserId,
      displayName: "Entry",
      savedAt: new Date(),
    });
    await db.insert(challengeEntries).values(entry("e1", u1));
    await expect(db.insert(challengeEntries).values(entry("e2", u1))).rejects.toThrow();
    await db.insert(challengeEntries).values([entry("e3", null), entry("e4", null)]);
    expect(await db.select().from(challengeEntries)).toHaveLength(3);
  });
});
