import type { TeamId } from "@/lib/types";

export interface TeamRecord {
  wins: number;
  losses: number;
}

/** teamId → regular-season record. */
export type SeasonRecords = Readonly<Record<TeamId, TeamRecord>>;

/** Every team's record for one season, as read from a source. */
export interface RecordSet {
  /** Season end year: 2027 for 2026–27. */
  season: number;
  records: SeasonRecords;
}

/** Where team records come from. `fetch` rejects with a FeedError whose message is safe to show users. */
export interface RecordSource {
  /** Display name, e.g. "ESPN". */
  readonly name: string;
  fetch(season: number): Promise<RecordSet>;
}

/** What a page shows about a league's records. */
export interface RecordStatus {
  seasonLabel: string;
  source: string;
  /** ISO 8601 time of the last successful refresh. Null when records were never loaded. */
  asOf: string | null;
  /** Why the most recent refresh failed. Null when it succeeded or none was tried. */
  error: string | null;
}
