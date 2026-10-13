import type { CallEvaluation } from "@/lib/scoring";

export type PickStatusTone = "good" | "bad" | "neutral";

export interface PickStatus {
  label: "On pace" | "Off pace" | "Push pace" | "Hit" | "Missed" | "Push" | "No games yet" | "Unavailable";
  tone: PickStatusTone;
}

/**
 * Where one pick stands against the frozen line. `frozen` is false until the deadline's freeze is stored (nothing is
 * unavailable yet). A settled team reads Hit / Missed / Push; otherwise the pace reads On / Off / Push pace; a team
 * that has not played has "No games yet"; a team with no frozen line is "Unavailable" for everyone.
 */
export function pickStatus(input: {
  frozen: boolean;
  line: number | null;
  projected: CallEvaluation | null;
  final: CallEvaluation | null;
}): PickStatus {
  const { frozen, line, projected, final } = input;
  if (frozen && line === null) return { label: "Unavailable", tone: "neutral" };
  if (final?.status === "scored") {
    if (final.push) return { label: "Push", tone: "neutral" };
    return final.correct ? { label: "Hit", tone: "good" } : { label: "Missed", tone: "bad" };
  }
  if (projected?.status === "scored") {
    if (projected.push) return { label: "Push pace", tone: "neutral" };
    return projected.correct ? { label: "On pace", tone: "good" } : { label: "Off pace", tone: "bad" };
  }
  return { label: "No games yet", tone: "neutral" };
}

export type MovementState = "moved" | "unchanged" | "unknown";

/** Whether a saved pick's line moved: unknown when either line is missing. */
export function movementState(lineAtPick: number | null, currentLine: number | null, move: number | null): MovementState {
  if (lineAtPick === null || currentLine === null) return "unknown";
  return move === null ? "unchanged" : "moved";
}
