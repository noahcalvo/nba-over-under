import type { DraftAction } from "@/lib/draft";

/** Validates an untrusted request body into a DraftAction. */
export function parseDraftAction(input: unknown): DraftAction | null {
  if (!input || typeof input !== "object") return null;
  const { type, teamId, side, pickNumber } = input as Record<string, unknown>;
  if (type === "pause" || type === "resume") return { type };
  if (type === "start") {
    const { lines } = input as Record<string, unknown>;
    if (lines === undefined) return { type };
    if (!lines || typeof lines !== "object" || Array.isArray(lines)) return null;
    if (!Object.values(lines).every((value) => typeof value === "number" && Number.isFinite(value))) return null;
    return { type, lines: lines as Record<string, number> };
  }
  if (
    type === "confirm" &&
    typeof teamId === "string" &&
    (side === "OVER" || side === "UNDER") &&
    typeof pickNumber === "number" &&
    Number.isInteger(pickNumber) &&
    pickNumber > 0
  ) {
    return { type, teamId, side, pickNumber };
  }
  return null;
}
