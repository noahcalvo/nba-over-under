import { readAuthConfig, readServerConfig } from "@/lib/env";

/**
 * Next calls this once per server instance, before it handles any request. A production server without a database
 * or link secret stops here instead of serving requests on storage that doesn't persist. Missing sign-in settings only
 * turn sign-in off (logged here), never the site.
 */
export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const result = readServerConfig(process.env);
  if (!result.ok) throw new Error(`Courtline can't start. ${result.problems.join(" ")}`);
  if (result.config.usingDevLinkSecret) console.warn("LINK_SECRET is not set; using the development secret.");
  const auth = readAuthConfig(process.env);
  if (!auth.ok) console.warn(`Sign-in is off: ${auth.problems.join(" ")}`);
  else if (auth.config.usingDevSecret) console.warn("BETTER_AUTH_SECRET is not set; using the development secret.");
}
