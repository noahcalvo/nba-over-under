import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { expect, it } from "vitest";
import { buildDemoLeague } from "@/data/demo-league";
import { runDraftAction } from "@/db/actions";
import { MIGRATIONS_FOLDER } from "@/db/client";
import { loadLeague } from "@/db/leagues";
import * as schema from "@/db/schema";
import { seatInLeague } from "@/db/sessions";

// Applies the migration files by hand so a league can be stored in the shape the app wrote before 0004.
const files = readdirSync(MIGRATIONS_FOLDER)
  .filter((file) => file.endsWith(".sql"))
  .sort();

async function apply(client: PGlite, file: string) {
  const text = readFileSync(path.join(MIGRATIONS_FOLDER, file), "utf8");
  for (const statement of text.split("--> statement-breakpoint")) {
    if (statement.trim()) await client.exec(statement);
  }
}

it("keeps a league stored before league sizes existed: picks, seats and sessions", async () => {
  const client = new PGlite();
  for (const file of files.filter((name) => name < "0004")) await apply(client, file);

  // A 4 × 11 league in the fade stage, as the old code stored it.
  await client.query(
    `insert into leagues (id, name, season_label, commissioner_id, rounds, draft_status) values ('old001', 'Old', '2026–27', 'm1', 11, 'fades')`,
  );
  for (const [seat, name] of ["Ana", "Ben", null, null].entries()) {
    await client.query(`insert into managers (league_id, id, seat, display_name) values ('old001', $1, $2, $3)`, [
      `m${seat + 1}`,
      seat,
      name,
    ]);
  }
  for (const pick of buildDemoLeague().draft.picks) {
    await client.query(
      `insert into picks (league_id, pick_number, manager_id, team_id, side) values ('old001', $1, $2, $3, $4)`,
      [pick.pickNumber, pick.managerId, pick.teamId, pick.side],
    );
  }
  const session = await client.query<{ id: string }>(
    `insert into sessions (token_hash, expires_at) values ('hash-old', now() + interval '30 days') returning id`,
  );
  const sessionId = session.rows[0].id;
  await client.query(`insert into session_seats (session_id, league_id, manager_id) values ($1, 'old001', 'm1')`, [sessionId]);

  for (const file of files.filter((name) => name >= "0004")) await apply(client, file);
  const db = drizzle({ client, schema });

  const league = (await loadLeague(db, "old001"))!;
  expect(league.draft).toMatchObject({ status: "fades", rounds: 11, voidedPicks: [], blockedPick: null });
  expect(league.draft.picks).toHaveLength(44);
  expect(league.managers.map((m) => m.displayName)).toEqual(["Ana", "Ben", null, null]);
  expect(await seatInLeague(db, sessionId, "old001")).toBe("m1");

  const faded = await runDraftAction(db, "old001", sessionId, { type: "fade", managerId: "m1", targetPickNumber: 2 }, null);
  expect(faded.ok).toBe(true);
});

it("keeps leagues, seats and entries stored before accounts", async () => {
  const client = new PGlite();
  for (const file of files.filter((name) => name < "0006")) await apply(client, file);

  await client.query(
    `insert into leagues (id, name, season_label, commissioner_id, rounds, draft_status) values ('old002', 'Old', '2026–27', 'm1', 11, 'not_started')`,
  );
  for (const [seat, name] of ["Ana", "Ben", null, null].entries()) {
    await client.query(`insert into managers (league_id, id, seat, display_name) values ('old002', $1, $2, $3)`, [
      `m${seat + 1}`,
      seat,
      name,
    ]);
  }
  const session = await client.query<{ id: string }>(
    `insert into sessions (token_hash, expires_at) values ('hash-old2', now() + interval '30 days') returning id`,
  );
  const sessionId = session.rows[0].id;
  await client.query(`insert into session_seats (session_id, league_id, manager_id) values ($1, 'old002', 'm1')`, [sessionId]);
  await client.query(`insert into challenge_seasons (season) values (2027)`);
  await client.query(
    `insert into challenge_entries (id, season, owner_session_id, display_name, saved_at) values ('entry1', 2027, $1, 'Ana', now())`,
    [sessionId],
  );

  for (const file of files.filter((name) => name >= "0006")) await apply(client, file);
  const db = drizzle({ client, schema });

  const league = (await loadLeague(db, "old002"))!;
  expect(league).toMatchObject({ id: "old002", name: "Old", draft: { status: "not_started", rounds: 11 } });
  expect(league.managers.map((m) => m.displayName)).toEqual(["Ana", "Ben", null, null]);
  expect(await seatInLeague(db, sessionId, "old002")).toBe("m1");
  const [entry] = await db.select().from(schema.challengeEntries);
  expect(entry).toMatchObject({ id: "entry1", ownerSessionId: sessionId, ownerUserId: null });
  expect(await db.select().from(schema.userSeats)).toEqual([]);
});
