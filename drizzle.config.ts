import { defineConfig } from "drizzle-kit";

// Only `drizzle-kit generate` uses this file. Migrations are applied by scripts/migrate.mjs (Postgres) or by the app
// on startup (PGlite).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
