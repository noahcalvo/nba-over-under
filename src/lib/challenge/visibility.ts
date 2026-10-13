import type { ChallengeEntry } from "./types";

/** The entry as a viewer may see it: other entrants' picks stay out until the challenge locks (`revealed`). */
export function visibleEntry(entry: ChallengeEntry, revealed: boolean): ChallengeEntry {
  return revealed ? entry : { ...entry, picks: [] };
}
