import { describe, expect, it } from "vitest";
import { DEFAULT_PGLITE_DIR, MISSING_DATABASE_MESSAGE, MISSING_LINK_SECRET_MESSAGE, readServerConfig } from "@/lib/env";

const SECRET = "x".repeat(32);

describe("readServerConfig", () => {
  it("refuses to start production without a database or link secret", () => {
    expect(readServerConfig({ NODE_ENV: "production" })).toEqual({
      ok: false,
      problems: [MISSING_DATABASE_MESSAGE, MISSING_LINK_SECRET_MESSAGE],
    });
    expect(readServerConfig({ NODE_ENV: "production", LINK_SECRET: SECRET })).toEqual({
      ok: false,
      problems: [MISSING_DATABASE_MESSAGE],
    });
  });

  it("uses Postgres when DATABASE_URL is a postgres URL", () => {
    for (const url of ["postgres://u:p@host/db", "postgresql://u:p@host/db?sslmode=require"]) {
      expect(readServerConfig({ NODE_ENV: "production", DATABASE_URL: url, LINK_SECRET: SECRET })).toEqual({
        ok: true,
        config: { database: { kind: "postgres", url }, linkSecret: SECRET, usingDevLinkSecret: false },
      });
    }
  });

  it("allows PGlite in production only through the explicit pglite: opt-in", () => {
    const result = readServerConfig({ NODE_ENV: "production", DATABASE_URL: "pglite:.data/prod", LINK_SECRET: SECRET });
    expect(result.ok && result.config.database).toEqual({ kind: "pglite", dataDir: ".data/prod" });
  });

  it("falls back to PGlite and a development secret outside production", () => {
    const dev = readServerConfig({ NODE_ENV: "development" });
    expect(dev.ok && dev.config.database).toEqual({ kind: "pglite", dataDir: DEFAULT_PGLITE_DIR });
    expect(dev.ok && dev.config.usingDevLinkSecret).toBe(true);
    const test = readServerConfig({ NODE_ENV: "test" });
    expect(test.ok && test.config.database).toEqual({ kind: "pglite", dataDir: null });
  });

  it("rejects unknown database URLs and short secrets", () => {
    expect(readServerConfig({ NODE_ENV: "development", DATABASE_URL: "mysql://x" })).toEqual({
      ok: false,
      problems: ["DATABASE_URL must be a postgres:// URL or pglite:<directory>."],
    });
    expect(readServerConfig({ NODE_ENV: "development", DATABASE_URL: "pglite:" }).ok).toBe(false);
    expect(readServerConfig({ NODE_ENV: "development", LINK_SECRET: "short" })).toEqual({
      ok: false,
      problems: ["LINK_SECRET must be at least 32 characters."],
    });
  });
});
