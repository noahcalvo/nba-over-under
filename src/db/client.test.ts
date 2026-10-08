import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openDatabase } from "@/db/client";
import { accessLinks, leagues, managers, picks, sessions, sessionSeats } from "@/db/schema";
import { createTestDb } from "@/db/test-db";

const LEAGUE = { name: "L", seasonLabel: "2025–26", commissionerId: "m1", rounds: 11, draftStatus: "not_started" } as const;

describe("database", () => {
  it("migrates every table", async () => {
    const db = await createTestDb();
    for (const table of [leagues, managers, picks, accessLinks, sessions, sessionSeats]) {
      expect(await db.select().from(table)).toEqual([]);
    }
  });

  it("opens a file-backed PGlite even when its parent directories don't exist yet", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "courtline-"));
    const db = await openDatabase({ kind: "pglite", dataDir: path.join(root, "nested", "pglite") });
    expect(await db.select().from(leagues)).toEqual([]);
  });

  it("reserves the demo id and allows one working league invite per league", async () => {
    const db = await createTestDb();
    await expect(db.insert(leagues).values({ id: "demo", ...LEAGUE })).rejects.toThrow();
    await db.insert(leagues).values({ id: "lg0001", ...LEAGUE });
    await db.insert(accessLinks).values({ id: "first", leagueId: "lg0001", kind: "league_invite" });
    await expect(
      db.insert(accessLinks).values({ id: "second", leagueId: "lg0001", kind: "league_invite" }),
    ).rejects.toThrow();
  });
});
