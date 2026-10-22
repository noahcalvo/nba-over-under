import { describe, expect, it } from "vitest";
import {
  DEFAULT_PGLITE_DIR,
  MISSING_DATABASE_MESSAGE,
  MISSING_LINK_SECRET_MESSAGE,
  readAuthConfig,
  readServerConfig,
} from "@/lib/env";

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

describe("readAuthConfig", () => {
  const GOOGLE = { GOOGLE_CLIENT_ID: "client-id", GOOGLE_CLIENT_SECRET: "client-secret" };

  it("production needs a secret, Google and a URL", () => {
    expect(readAuthConfig({ NODE_ENV: "production" })).toEqual({
      ok: false,
      problems: [
        "BETTER_AUTH_SECRET is required for sign-in.",
        "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (or AUTH_DEV_LOGIN=1 outside production).",
        "BETTER_AUTH_URL is required for sign-in.",
      ],
    });
  });

  it("production falls back to the Vercel production URL", () => {
    expect(
      readAuthConfig({
        NODE_ENV: "production",
        BETTER_AUTH_SECRET: SECRET,
        VERCEL_PROJECT_PRODUCTION_URL: "nba-over-under-iota.vercel.app",
        ...GOOGLE,
      }),
    ).toEqual({
      ok: true,
      config: {
        baseURL: "https://nba-over-under-iota.vercel.app",
        secret: SECRET,
        google: { clientId: "client-id", clientSecret: "client-secret" },
        devLogin: false,
        usingDevSecret: false,
        productionURL: "https://nba-over-under-iota.vercel.app",
        previewHosts: [],
      },
    });
  });

  it("never enables dev login in production", () => {
    const result = readAuthConfig({
      NODE_ENV: "production",
      AUTH_DEV_LOGIN: "1",
      BETTER_AUTH_SECRET: SECRET,
      BETTER_AUTH_URL: "https://example.com",
      ...GOOGLE,
    });
    expect(result).toMatchObject({ ok: true, config: { devLogin: false } });
    expect(readAuthConfig({ NODE_ENV: "production", AUTH_DEV_LOGIN: "1", BETTER_AUTH_SECRET: SECRET }).ok).toBe(false);
  });

  it("development uses the dev secret and localhost", () => {
    const result = readAuthConfig({ NODE_ENV: "development", AUTH_DEV_LOGIN: "1" });
    expect(result).toEqual({
      ok: true,
      config: {
        baseURL: "http://localhost:3000",
        secret: "courtline-development-auth-secret-not-for-production",
        google: null,
        devLogin: true,
        usingDevSecret: true,
        productionURL: "http://localhost:3000",
        previewHosts: [],
      },
    });
  });

  it("rejects half a Google config", () => {
    expect(readAuthConfig({ NODE_ENV: "development", AUTH_DEV_LOGIN: "1", GOOGLE_CLIENT_ID: "client-id" })).toEqual({
      ok: false,
      problems: ["Set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET."],
    });
  });

  it("rejects a short secret", () => {
    const result = readAuthConfig({ NODE_ENV: "development", BETTER_AUTH_SECRET: "short", ...GOOGLE });
    expect(result).toEqual({ ok: false, problems: ["BETTER_AUTH_SECRET must be at least 32 characters."] });
  });

  it("normalizes BETTER_AUTH_URL to its origin", () => {
    const result = readAuthConfig({ NODE_ENV: "development", BETTER_AUTH_URL: "https://example.com/path/", ...GOOGLE });
    expect(result.ok && result.config.baseURL).toBe("https://example.com");
  });

  it("rejects a non-http URL", () => {
    const result = readAuthConfig({ NODE_ENV: "development", BETTER_AUTH_URL: "ftp://example.com", ...GOOGLE });
    expect(result).toEqual({ ok: false, problems: ["BETTER_AUTH_URL must be an http:// or https:// URL."] });
  });

  describe("preview deployments", () => {
    const PRODUCTION = {
      NODE_ENV: "production",
      BETTER_AUTH_SECRET: SECRET,
      BETTER_AUTH_URL: "https://nba-over-under-iota.vercel.app",
      ...GOOGLE,
    };
    const PREVIEW_HOSTS = { AUTH_PREVIEW_HOSTS: " Nba-Over-Under-*-Team.vercel.app , other-*.example.com " };
    const PREVIEW = { ...PRODUCTION, VERCEL_ENV: "preview", VERCEL_URL: "nba-over-under-abc123-team.vercel.app" };

    it("production trusts the preview hosts", () => {
      expect(readAuthConfig({ ...PRODUCTION, VERCEL_ENV: "production", ...PREVIEW_HOSTS })).toMatchObject({
        ok: true,
        config: {
          baseURL: "https://nba-over-under-iota.vercel.app",
          productionURL: "https://nba-over-under-iota.vercel.app",
          previewHosts: ["nba-over-under-*-team.vercel.app", "other-*.example.com"],
        },
      });
    });

    it("a preview signs in on its own URL through production", () => {
      expect(readAuthConfig({ ...PREVIEW, ...PREVIEW_HOSTS })).toMatchObject({
        ok: true,
        config: {
          baseURL: "https://nba-over-under-abc123-team.vercel.app",
          productionURL: "https://nba-over-under-iota.vercel.app",
          previewHosts: ["nba-over-under-*-team.vercel.app", "other-*.example.com"],
        },
      });
    });

    it("a preview without preview hosts keeps the production URL", () => {
      expect(readAuthConfig(PREVIEW)).toMatchObject({
        ok: true,
        config: { baseURL: "https://nba-over-under-iota.vercel.app", previewHosts: [] },
      });
    });

    it("a preview with preview hosts needs its own URL", () => {
      expect(readAuthConfig({ ...PREVIEW, ...PREVIEW_HOSTS, VERCEL_URL: "" })).toEqual({
        ok: false,
        problems: ["VERCEL_URL is required for sign-in on a preview deployment."],
      });
    });

    it("rejects preview hosts that aren't narrow host patterns", () => {
      for (const hosts of ["*.vercel.app", "https://app-*.vercel.app", "app-*.vercel.app/path", "*", "app .vercel.app"]) {
        expect(readAuthConfig({ ...PRODUCTION, AUTH_PREVIEW_HOSTS: hosts })).toEqual({
          ok: false,
          problems: [
            "AUTH_PREVIEW_HOSTS takes host names like app-*-team.vercel.app (no scheme or path; a wildcard needs a fixed prefix).",
          ],
        });
      }
    });
  });
});
