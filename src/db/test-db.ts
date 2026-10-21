import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { onTestFinished } from "vitest";
import { MIGRATIONS_FOLDER, type Db } from "./client";
import * as schema from "./schema";
import { users } from "./schema";

// Migrate one in-memory database per test file, then hand each test a clone of it: same schema, no shared rows.
let template: Promise<PGlite> | null = null;

async function migratedTemplate(): Promise<PGlite> {
  const client = new PGlite();
  await migrate(drizzle({ client, schema }), { migrationsFolder: MIGRATIONS_FOLDER });
  return client;
}

/** A fresh, migrated, in-memory database, closed when the test that asked for it finishes. */
export async function createTestDb(): Promise<Db> {
  template ??= migratedTemplate();
  // clone() is typed as the PGlite interface but returns a PGlite instance.
  const client = (await (await template).clone()) as PGlite;
  // An open PGlite holds its WebAssembly memory for the life of the worker, which adds up across a file's tests.
  onTestFinished(() => client.close());
  return drizzle({ client, schema });
}

/** Inserts an account with a random id and a unique email, and returns its id. */
export async function createTestUser(db: Db, name = "Test User"): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(users).values({ id, name, email: `${id}@test.local` });
  return id;
}
