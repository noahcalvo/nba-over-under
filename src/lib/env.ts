// Reads and checks the server's environment. Production must never fall back to storage that doesn't persist.

export type DatabaseConfig =
  | { kind: "postgres"; url: string }
  /** dataDir null means in-memory (tests). */
  | { kind: "pglite"; dataDir: string | null };

export interface ServerConfig {
  database: DatabaseConfig;
  linkSecret: string;
  /** True when LINK_SECRET is unset outside production and the development fallback is in use. */
  usingDevLinkSecret: boolean;
}

export type ServerConfigResult = { ok: true; config: ServerConfig } | { ok: false; problems: string[] };

export const MISSING_DATABASE_MESSAGE =
  "DATABASE_URL is required in production. Courtline will not start on non-persistent storage.";
export const MISSING_LINK_SECRET_MESSAGE = "LINK_SECRET is required in production.";
export const DEFAULT_PGLITE_DIR = ".data/pglite";
export const LINK_SECRET_MIN_LENGTH = 32;
const DEV_LINK_SECRET = "courtline-development-link-secret-not-for-production";
const PGLITE_PREFIX = "pglite:";

type Env = Readonly<Record<string, string | undefined>>;

export function readServerConfig(env: Env): ServerConfigResult {
  const production = env.NODE_ENV === "production";
  const problems: string[] = [];

  let database: DatabaseConfig | null = null;
  const url = env.DATABASE_URL?.trim();
  if (!url) {
    if (production) problems.push(MISSING_DATABASE_MESSAGE);
    else database = { kind: "pglite", dataDir: env.NODE_ENV === "test" ? null : DEFAULT_PGLITE_DIR };
  } else if (url.startsWith("postgres://") || url.startsWith("postgresql://")) {
    database = { kind: "postgres", url };
  } else if (url.startsWith(PGLITE_PREFIX) && url.length > PGLITE_PREFIX.length) {
    // Explicit opt-in, e.g. to try a production build locally with `DATABASE_URL=pglite:.data/pglite npm start`.
    database = { kind: "pglite", dataDir: url.slice(PGLITE_PREFIX.length) };
  } else {
    problems.push("DATABASE_URL must be a postgres:// URL or pglite:<directory>.");
  }

  let linkSecret = env.LINK_SECRET ?? "";
  const usingDevLinkSecret = linkSecret === "" && !production;
  if (linkSecret === "") {
    if (production) problems.push(MISSING_LINK_SECRET_MESSAGE);
    else linkSecret = DEV_LINK_SECRET;
  } else if (linkSecret.length < LINK_SECRET_MIN_LENGTH) {
    problems.push(`LINK_SECRET must be at least ${LINK_SECRET_MIN_LENGTH} characters.`);
  }

  if (problems.length > 0 || !database) return { ok: false, problems };
  return { ok: true, config: { database, linkSecret, usingDevLinkSecret } };
}
