import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { oAuthProxy } from "better-auth/plugins";
import { ACCESS } from "@/config/access";
import type { Db } from "@/db/client";
import { authAccounts, authSessions, authVerifications, users } from "@/db/schema";
import { readAuthConfig, type AuthConfig } from "@/lib/env";
import { getDb } from "@/server/db";

// The one place sign-in providers are configured. Every value comes from AuthConfig, so Better Auth never reads
// BETTER_AUTH_SECRET or BETTER_AUTH_URL from the environment itself.
function buildAuth(db: Db, config: AuthConfig) {
  const previews = config.previewHosts.length > 0;
  return betterAuth({
    appName: "Courtline",
    // A preview answers on its deployment and branch URLs: each request's host, when it matches AUTH_PREVIEW_HOSTS.
    baseURL:
      previews && config.baseURL !== config.productionURL
        ? { allowedHosts: config.previewHosts, fallback: config.baseURL, protocol: "https" }
        : config.baseURL,
    secret: config.secret,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { users, authSessions, authAccounts, authVerifications },
    }),
    user: { modelName: "users" },
    session: {
      modelName: "authSessions",
      expiresIn: ACCESS.sessionIdleDays * 24 * 60 * 60,
      updateAge: ACCESS.sessionRenewHours * 60 * 60,
    },
    account: { modelName: "authAccounts" },
    verification: { modelName: "authVerifications" },
    socialProviders: config.google
      ? {
          google: {
            clientId: config.google.clientId,
            clientSecret: config.google.clientSecret,
            prompt: "select_account",
          },
        }
      : {},
    emailAndPassword: { enabled: config.devLogin },
    advanced: { cookiePrefix: "courtline" },
    telemetry: { enabled: false },
    trustedOrigins: [...new Set([config.baseURL, config.productionURL])].concat(
      config.previewHosts.map((host) => `https://${host}`),
    ),
    // Google only knows the production callback: a preview's sign-in goes through production, which hands the
    // encrypted profile back to the preview (only to a trusted origin above).
    plugins: previews ? [oAuthProxy({ productionURL: config.productionURL })] : [],
  });
}

export type CourtlineAuth = ReturnType<typeof buildAuth>;

// Built once per server process, on first use. globalThis survives dev hot reloads, like the database in db.ts.
const globalForAuth = globalThis as unknown as { __courtlineAuth?: Promise<CourtlineAuth> };

/** Better Auth, or null when the sign-in environment is incomplete (register() logs what is missing). */
export async function getAuth(): Promise<CourtlineAuth | null> {
  const result = readAuthConfig(process.env);
  if (!result.ok) return null;
  globalForAuth.__courtlineAuth ??= getDb()
    .then((db) => buildAuth(db, result.config))
    .catch((error: unknown) => {
      globalForAuth.__courtlineAuth = undefined;
      throw error;
    });
  return globalForAuth.__courtlineAuth;
}

/** Whether sign-in can work and whether the development form is on. Reads only the environment. */
export function authAvailability(): { available: boolean; devLogin: boolean } {
  const result = readAuthConfig(process.env);
  return result.ok ? { available: true, devLogin: result.config.devLogin } : { available: false, devLogin: false };
}
