import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { MIGRATIONS_FOLDER, type Db } from "./client";
import * as schema from "./schema";

// Migrate one in-memory database per test file, then hand each test a clone of it: same schema, no shared rows.
let template: Promise<PGlite> | null = null;

async function migratedTemplate(): Promise<PGlite> {
  const client = new PGlite();
  await migrate(drizzle({ client, schema }), { migrationsFolder: MIGRATIONS_FOLDER });
  return client;
}

/** A fresh, migrated, in-memory database. */
export async function createTestDb(): Promise<Db> {
  template ??= migratedTemplate();
  // clone() is typed as the PGlite interface but returns a PGlite instance.
  const client = (await (await template).clone()) as PGlite;
  return drizzle({ client, schema });
}
