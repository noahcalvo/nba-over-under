import "server-only";
import { STATIC_LINES } from "@/data/static-lines";
import { staticLineSource, type LineSource } from "@/lib/lines";
import type { LineSet } from "@/lib/types";

/** Spec 1 ships only the static source. A live feed replaces it here. */
export const lineSource: LineSource = staticLineSource(STATIC_LINES);

/** Current lines, or null when the source fails (starting a draft then fails with lines_unavailable). */
export async function currentLinesOrNull(): Promise<LineSet | null> {
  try {
    return await lineSource.current();
  } catch {
    return null;
  }
}
