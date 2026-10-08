import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createLeagueFor } from "@/db/actions";
import type { Db } from "@/db/client";
import { sessions } from "@/db/schema";
import { bindSeat, createSession, findSession, seatInLeague, unbindSeat } from "@/db/sessions";
import { createTestDb } from "@/db/test-db";

let db: Db;

beforeEach(async () => {
  db = await createTestDb();
});

describe("sessions", () => {
  it("finds a session by token hash with its seats", async () => {
    const id = await createSession(db, "hash-a");
    expect(await findSession(db, "hash-a")).toEqual({ id, seats: {} });
    await createLeagueFor(db, id, { displayName: "Ana" }, () => "lg0001");
    expect(await findSession(db, "hash-a")).toEqual({ id, seats: { lg0001: "m1" } });
    expect(await findSession(db, "unknown")).toBeNull();
  });

  it("deletes an expired session instead of returning it", async () => {
    const id = await createSession(db, "hash-a");
    await db.update(sessions).set({ expiresAt: sql`now() - interval '1 minute'` }).where(eq(sessions.id, id));
    expect(await findSession(db, "hash-a")).toBeNull();
    expect(await db.select().from(sessions)).toEqual([]);
  });

  it("pushes back the expiry at most once a day", async () => {
    const id = await createSession(db, "hash-a");
    const read = async () => (await db.select().from(sessions).where(eq(sessions.id, id)))[0];
    const fresh = await read();
    await findSession(db, "hash-a");
    expect((await read()).lastSeenAt).toEqual(fresh.lastSeenAt); // used within the day: no write

    await db
      .update(sessions)
      .set({ lastSeenAt: sql`now() - interval '2 days'`, expiresAt: sql`now() + interval '88 days'` })
      .where(eq(sessions.id, id));
    const idle = await read();
    await findSession(db, "hash-a");
    const renewed = await read();
    expect(renewed.lastSeenAt.getTime()).toBeGreaterThan(idle.lastSeenAt.getTime());
    expect(renewed.expiresAt.getTime()).toBeGreaterThan(idle.expiresAt.getTime());
  });

  it("binds one seat per league, replacing the previous one, and signs seats out", async () => {
    const a = await createSession(db, "hash-a");
    const b = await createSession(db, "hash-b");
    await createLeagueFor(db, a, { displayName: "Ana" }, () => "lg0001");
    await bindSeat(db, b, "lg0001", "m2");
    await bindSeat(db, b, "lg0001", "m3");
    expect(await seatInLeague(db, b, "lg0001")).toBe("m3");

    await bindSeat(db, b, "lg0001", "m1"); // a second browser on the commissioner seat
    await unbindSeat(db, "lg0001", "m1", a); // everyone but a
    expect(await seatInLeague(db, a, "lg0001")).toBe("m1");
    expect(await seatInLeague(db, b, "lg0001")).toBeNull();
    await unbindSeat(db, "lg0001", "m1");
    expect(await seatInLeague(db, a, "lg0001")).toBeNull();
  });

  it("ignores the seat of an expired session", async () => {
    const a = await createSession(db, "hash-a");
    await createLeagueFor(db, a, { displayName: "Ana" }, () => "lg0001");
    await db.update(sessions).set({ expiresAt: sql`now() - interval '1 minute'` }).where(eq(sessions.id, a));
    expect(await seatInLeague(db, a, "lg0001")).toBeNull();
  });
});
