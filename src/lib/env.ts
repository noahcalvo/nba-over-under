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

export interface AuthConfig {
  /** The site origin, no trailing slash. */
  baseURL: string;
  secret: string;
  google: { clientId: string; clientSecret: string } | null;
  /** Better Auth's email/password sign-up and sign-in, for local testing without Google. Never in production. */
  devLogin: boolean;
  /** True when BETTER_AUTH_SECRET is unset outside production and the development fallback is in use. */
  usingDevSecret: boolean;
  /** The production origin. Google only knows its callback; previews sign in through it (Better Auth's OAuth proxy). */
  productionURL: string;
  /** Preview host patterns (AUTH_PREVIEW_HOSTS), lowercase. Empty: previews can't sign in. */
  previewHosts: string[];
}

export type AuthConfigResult = { ok: true; config: AuthConfig } | { ok: false; problems: string[] };

const AUTH_SECRET_MIN_LENGTH = 32;
const DEV_AUTH_SECRET = "courtline-development-auth-secret-not-for-production";
const DEV_AUTH_URL = "http://localhost:3000";
/** A host, optionally with one `*` after a fixed prefix in its first label (never `*.vercel.app`: other teams' sites). */
const PREVIEW_HOST_PATTERN = /^[a-z0-9-]+(\*[a-z0-9-]*)?(\.[a-z0-9-]+)+$/;

/** Sign-in settings. Unlike readServerConfig, a failure here only turns sign-in off; the site keeps serving reads. */
export function readAuthConfig(env: Env): AuthConfigResult {
  const production = env.NODE_ENV === "production";
  const problems: string[] = [];

  let secret = env.BETTER_AUTH_SECRET?.trim() ?? "";
  const usingDevSecret = secret === "" && !production;
  if (secret === "") {
    if (production) problems.push("BETTER_AUTH_SECRET is required for sign-in.");
    else secret = DEV_AUTH_SECRET;
  } else if (secret.length < AUTH_SECRET_MIN_LENGTH) {
    problems.push(`BETTER_AUTH_SECRET must be at least ${AUTH_SECRET_MIN_LENGTH} characters.`);
  }

  const clientId = env.GOOGLE_CLIENT_ID?.trim() ?? "";
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim() ?? "";
  const google = clientId && clientSecret ? { clientId, clientSecret } : null;
  const devLogin = !production && env.AUTH_DEV_LOGIN === "1";
  if (Boolean(clientId) !== Boolean(clientSecret)) {
    problems.push("Set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.");
  } else if (!google && !devLogin) {
    problems.push("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (or AUTH_DEV_LOGIN=1 outside production).");
  }

  const vercelHost = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const rawURL = env.BETTER_AUTH_URL?.trim() || (vercelHost ? `https://${vercelHost}` : production ? "" : DEV_AUTH_URL);
  let baseURL = "";
  if (rawURL === "") {
    problems.push("BETTER_AUTH_URL is required for sign-in.");
  } else {
    const url = URL.canParse(rawURL) ? new URL(rawURL) : null;
    if (url && (url.protocol === "http:" || url.protocol === "https:")) baseURL = url.origin;
    else problems.push("BETTER_AUTH_URL must be an http:// or https:// URL.");
  }

  const previewHosts = (env.AUTH_PREVIEW_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter((host) => host !== "");
  if (previewHosts.some((host) => !PREVIEW_HOST_PATTERN.test(host))) {
    problems.push(
      "AUTH_PREVIEW_HOSTS takes host names like app-*-team.vercel.app (no scheme or path; a wildcard needs a fixed prefix).",
    );
  }
  // A preview signs in on its own URL; the OAuth proxy sends Google through productionURL and back.
  const productionURL = baseURL;
  if (env.VERCEL_ENV === "preview" && previewHosts.length > 0) {
    const previewHost = env.VERCEL_URL?.trim();
    if (previewHost) baseURL = `https://${previewHost}`;
    else problems.push("VERCEL_URL is required for sign-in on a preview deployment.");
  }

  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, config: { baseURL, secret, google, devLogin, usingDevSecret, productionURL, previewHosts } };
}
