import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createLeagueFor, runDraftAction } from "@/db/actions";
import type { Db } from "@/db/client";
import { listSessionLeagues, loadLeague, withLockedLeague } from "@/db/leagues";
import { accessLinks, leagues, managers, picks, sessions, sessionSeats } from "@/db/schema";
import { createSession } from "@/db/sessions";
import { createTestDb } from "@/db/test-db";
import { succeed } from "@/lib/league/errors";
import type { LineSet } from "@/lib/types";
import { STATIC_LINES } from "@/data/static-lines";

let db: Db;
let ana: string;

beforeEach(async () => {
  db = await createTestDb();
  ana = await createSession(db, "hash-ana");
  await createLeagueFor(db, ana, { leagueName: "Hoops", displayName: "Ana" }, () => "lg0001");
});

describe("loadLeague", () => {
  it("assembles a stored league", async () => {
    const league = await loadLeague(db, "lg0001");
    expect(league).toMatchObject({
      id: "lg0001",
      name: "Hoops",
      isDemo: false,
      commissionerId: "m1",
      version: 1,
      fades: [],
      lineOverrides: {},
      lines: null,
      draft: { status: "not_started", rounds: 11, seatOrder: ["m1", "m2", "m3", "m4"], picks: [] },
    });
    expect(league!.managers.map((m) => m.displayName)).toEqual(["Ana", null, null, null]);
    expect(await loadLeague(db, "nope")).toBeNull();
  });

  it("round-trips frozen lines", async () => {
    await runDraftAction(db, "lg0001", ana, { type: "start" }, STATIC_LINES);
    const lines = (await loadLeague(db, "lg0001"))!.lines as LineSet;
    expect(lines).toEqual(STATIC_LINES);
  });
});

describe("createLeagueFor", () => {
  it("retries when a generated id is taken", async () => {
    const ids = ["lg0001", "lg0002"];
    const result = await createLeagueFor(db, ana, { displayName: "Ana" }, () => ids.shift()!);
    expect(result).toEqual({ ok: true, value: { leagueId: "lg0002" } });
  });

  it("validates names without writing anything", async () => {
    expect(await createLeagueFor(db, ana, { displayName: " " }, () => "lg0009")).toEqual({
      ok: false,
      error: "invalid_name",
    });
    expect(await loadLeague(db, "lg0009")).toBeNull();
  });
});

describe("withLockedLeague", () => {
  it("returns not_found and demo_league without running the work", async () => {
    const work = async () => succeed("ran");
    expect(await withLockedLeague(db, "nope", ana, work)).toEqual({ ok: false, error: "not_found" });
    expect(await withLockedLeague(db, "demo", ana, work)).toEqual({ ok: false, error: "demo_league" });
  });

  it("reads the actor under the lock", async () => {
    const seen = await withLockedLeague(db, "lg0001", ana, async ({ actorId }) => succeed(actorId));
    expect(seen).toEqual({ ok: true, value: "m1" });
    expect(await withLockedLeague(db, "lg0001", null, async ({ actorId }) => succeed(actorId))).toEqual({
      ok: true,
      value: null,
    });
  });

  it("rolls back everything the work wrote when it returns an error", async () => {
    const result = await withLockedLeague(db, "lg0001", ana, async ({ tx }) => {
      await tx.update(leagues).set({ name: "Changed" }).where(eq(leagues.id, "lg0001"));
      return { ok: false, error: "forbidden" } as const;
    });
    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect((await loadLeague(db, "lg0001"))!.name).toBe("Hoops");
  });

  it("maps unique-constraint backstops to domain errors and rolls back", async () => {
    await runDraftAction(db, "lg0001", ana, { type: "start" }, STATIC_LINES);
    await runDraftAction(db, "lg0001", ana, { type: "confirm", teamId: "MIN", side: "OVER", pickNumber: 1 }, null);
    const insertPick = (values: { pickNumber: number; managerId: string; teamId: string; side: "OVER" | "UNDER" }) =>
      withLockedLeague(db, "lg0001", ana, async ({ tx }) => {
        await tx.update(leagues).set({ name: "Changed" }).where(eq(leagues.id, "lg0001"));
        await tx.insert(picks).values({ leagueId: "lg0001", ...values });
        return succeed(null);
      });
    expect(await insertPick({ pickNumber: 2, managerId: "m2", teamId: "MIN", side: "OVER" })).toEqual({
      ok: false,
      error: "side_taken",
    });
    expect(await insertPick({ pickNumber: 2, managerId: "m1", teamId: "MIN", side: "UNDER" })).toEqual({
      ok: false,
      error: "team_already_held",
    });
    expect(await insertPick({ pickNumber: 1, managerId: "m2", teamId: "OKC", side: "OVER" })).toEqual({
      ok: false,
      error: "stale_pick",
    });
    const league = (await loadLeague(db, "lg0001"))!;
    expect(league.name).toBe("Hoops");
    expect(league.draft.picks).toHaveLength(1);
  });
});

describe("listSessionLeagues", () => {
  it("lists the session's seats, newest first", async () => {
    await createLeagueFor(db, ana, { leagueName: "Second", displayName: "Ana" }, () => "lg0002");
    const listed = await listSessionLeagues(db, ana);
    expect(listed.map((league) => [league.id, league.name, league.manager.displayName])).toEqual([
      ["lg0002", "Second", "Ana"],
      ["lg0001", "Hoops", "Ana"],
    ]);
  });
});

describe("cascades", () => {
  it("deleting a league removes its managers, picks, links and seats but not sessions", async () => {
    await runDraftAction(db, "lg0001", ana, { type: "start" }, STATIC_LINES);
    await runDraftAction(db, "lg0001", ana, { type: "confirm", teamId: "MIN", side: "OVER", pickNumber: 1 }, null);
    await db.delete(leagues).where(eq(leagues.id, "lg0001"));
    for (const table of [managers, picks, accessLinks, sessionSeats]) {
      expect(await db.select().from(table)).toEqual([]);
    }
    expect(await db.select().from(sessions)).toHaveLength(1);
  });
});
