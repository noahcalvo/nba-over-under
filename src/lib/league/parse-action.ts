import type { DraftAction } from "@/lib/draft";

/** Validates an untrusted request body into a DraftAction. */
export function parseDraftAction(input: unknown): DraftAction | null {
  if (!input || typeof input !== "object") return null;
  const { type, teamId, side, pickNumber } = input as Record<string, unknown>;
  if (type === "start" || type === "pause" || type === "resume") return { type };
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
