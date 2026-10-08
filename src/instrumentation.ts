import { readServerConfig } from "@/lib/env";

/**
 * Next calls this once per server instance, before it handles any request. A production server without a database
 * or link secret stops here instead of serving requests on storage that doesn't persist.
 */
export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const result = readServerConfig(process.env);
  if (!result.ok) throw new Error(`Courtline can't start. ${result.problems.join(" ")}`);
  if (result.config.usingDevLinkSecret) console.warn("LINK_SECRET is not set; using the development secret.");
}
