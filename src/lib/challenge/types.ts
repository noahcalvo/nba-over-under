import type { Side, TeamId } from "@/lib/types";

/** One team's saved side, with the FanDuel line the server held when this side was saved. */
export interface ChallengePick {
  teamId: TeamId;
  side: Side;
  /** Null when FanDuel had no line for the team at that moment. */
  lineAtPick: number | null;
  /** ISO 8601: when this side was saved. An unchanged side keeps its time on later saves. */
  pickedAt: string;
}

/** An official entry: always all 30 teams. Never carries the owner's session. */
export interface ChallengeEntry {
  /** Public id, safe in URLs and on the leaderboard. */
  id: string;
  /** Season end year: 2027 for 2026–27. */
  season: number;
  displayName: string;
  createdAt: string;
  savedAt: string;
  /** Sorted by team id. */
  picks: ChallengePick[];
}

/** Working selections: teamId → side. May be incomplete. */
export type PickMap = Readonly<Record<TeamId, Side>>;

/** One stored FanDuel read. */
export interface LineSnapshot {
  /** ISO 8601: when the read that first saw these values happened. */
  observedAt: string;
  source: string;
  lines: Readonly<Record<TeamId, number>>;
}

/** The season's first regular-season game. */
export interface OpeningGame {
  tipoff: string;
  /** [away, home]; null where unknown. Display only. */
  teams: [TeamId | null, TeamId | null];
}

/** The shared scoring lines, stored once at the deadline. */
export interface FrozenLines {
  values: Readonly<Record<TeamId, number>>;
  /** teamId → when that line was observed (always before the deadline). */
  observedAt: Readonly<Record<TeamId, string>>;
  /** Teams with no line observed before the deadline: unscored for everyone. Sorted. */
  missing: readonly TeamId[];
  source: string;
  lockedAt: string;
}

export interface ChallengeSeason {
  season: number;
  openingGame: OpeningGame | null;
  /** ISO 8601: the opening tip-off minus CHALLENGE.lockMinutesBeforeTipoff. Null until the schedule is read. */
  deadline: string | null;
  scheduleCheckedAt: string | null;
  /** Why the last schedule read failed; null when it succeeded or none was tried. */
  scheduleError: string | null;
  frozen: FrozenLines | null;
}

/**
 * schedule_unknown: no deadline yet (saving refused). open: before the deadline. locking: past it, freeze not stored
 * yet. locked: frozen, no games. in_season: frozen, games played. final: every team has played the full season.
 */
export type ChallengePhase = "schedule_unknown" | "open" | "locking" | "locked" | "in_season" | "final";
