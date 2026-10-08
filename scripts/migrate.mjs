// Applies drizzle/ migrations to Postgres. Runs in `vercel-build` before `next build`, so a deployment without a
// database fails before it goes live. PGlite applies the same migrations itself when the app opens it.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

// Neon's Vercel integration sets DATABASE_URL (pooled) and DATABASE_URL_UNPOOLED; migrate over a direct connection.
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

if (!url) {
  console.error("DATABASE_URL is required in production. Courtline will not start on non-persistent storage.");
  process.exit(1);
}
if (url.startsWith("pglite:")) {
  console.log("DATABASE_URL points at PGlite; the app applies migrations when it opens the database.");
  process.exit(0);
}

const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  await migrate(drizzle({ client: pool }), { migrationsFolder: "drizzle" });
  console.log("Migrations applied.");
} finally {
  await pool.end();
}
