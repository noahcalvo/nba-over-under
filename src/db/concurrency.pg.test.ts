import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { STATIC_LINES } from "@/data/static-lines";
import { claimLink, createLeagueFor, resetSeat, runDraftAction } from "@/db/actions";
import { MIGRATIONS_FOLDER, type Db } from "@/db/client";
import { listActiveLinks } from "@/db/links";
import * as schema from "@/db/schema";
import { createSession } from "@/db/sessions";
import { randomLeagueId } from "@/lib/league/commands";

// PGlite has a single connection, so it can't prove the row lock. Run this file against a real Postgres:
//   TEST_DATABASE_URL=postgres://… npm run test:pg
// It migrates that database and creates uniquely named leagues; it never deletes anything.
const url = process.env.TEST_DATABASE_URL;
const PARALLEL = 8;

describe.skipIf(!url)("row lock on real Postgres", () => {
  let pool: Pool;
  let db: Db;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url, max: PARALLEL + 2 });
    const pgDb = drizzle({ client: pool, schema });
    await migrate(pgDb, { migrationsFolder: MIGRATIONS_FOLDER });
    db = pgDb;
  });

  afterAll(async () => {
    await pool?.end();
  });

  async function newLeague() {
    const commissioner = await createSession(db, crypto.randomUUID());
    const leagueId = randomLeagueId();
    const created = await createLeagueFor(db, commissioner, { displayName: "Ana" }, () => leagueId);
    if (!created.ok) throw new Error(created.error);
    return { leagueId, commissioner };
  }

  it("lets exactly one of many parallel confirms take the pick", async () => {
    const { leagueId, commissioner } = await newLeague();
    await runDraftAction(db, leagueId, commissioner, { type: "start" }, STATIC_LINES);
    const results = await Promise.all(
      Array.from({ length: PARALLEL }, () =>
        runDraftAction(db, leagueId, commissioner, { type: "confirm", teamId: "MIN", side: "OVER", pickNumber: 1 }, null),
      ),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(new Set(results.flatMap((result) => (result.ok ? [] : [result.error])))).toEqual(new Set(["stale_pick"]));
  });

  it("lets exactly one of many parallel claims use a seat invite", async () => {
    const { leagueId, commissioner } = await newLeague();
    const invite = (await listActiveLinks(db, leagueId)).find((link) => link.kind === "league_invite")!;
    await claimLink(db, invite.id, await createSession(db, crypto.randomUUID()), { managerId: "m2", displayName: "Ben" });
    await resetSeat(db, leagueId, commissioner, "m2");
    const seatInvite = (await listActiveLinks(db, leagueId)).find((link) => link.kind === "seat_invite")!;
    const sessions = await Promise.all(Array.from({ length: PARALLEL }, () => createSession(db, crypto.randomUUID())));
    const results = await Promise.all(
      sessions.map((sessionId) => claimLink(db, seatInvite.id, sessionId, { displayName: "Ben" })),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(new Set(results.flatMap((result) => (result.ok ? [] : [result.error])))).toEqual(new Set(["invalid_link"]));
  });
});
