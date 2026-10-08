import "server-only";
import { connection } from "next/server";
import { openDatabase, type Db } from "@/db/client";
import { readServerConfig, type ServerConfig } from "@/lib/env";

/** The validated environment. src/instrumentation.ts runs the same check at startup. */
export function serverConfig(): ServerConfig {
  const result = readServerConfig(process.env);
  if (!result.ok) throw new Error(result.problems.join(" "));
  return result.config;
}

// One database per server process, opened on first use (never at import, so `next build` needs no database).
// globalThis survives dev hot reloads, which matters for PGlite: two instances on one directory would corrupt it.
const globalForDb = globalThis as unknown as { __courtlineDb?: Promise<Db> };

export async function getDb(): Promise<Db> {
  // Database rows are request-time data. With Cache Components, prerendering must stop before a query: the drivers
  // read the clock, which Next rejects during a prerender.
  await connection();
  globalForDb.__courtlineDb ??= openDatabase(serverConfig().database).catch((error: unknown) => {
    globalForDb.__courtlineDb = undefined;
    throw error;
  });
  return globalForDb.__courtlineDb;
}
