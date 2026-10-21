import { LINES } from "./lines";

/** The 30/30 Challenge: one entry per Google account per season, every team picked, locked before the season's first game. */
export const CHALLENGE = {
  /** The season the challenge runs for: the season FanDuel's lines are for. */
  season: LINES.season,
  /** The same season as its end year (the key of team_records and challenge tables). */
  seasonYear: 2027,
  /** Entries lock this many minutes before the season's first regular-season tip-off. */
  lockMinutesBeforeTipoff: 30,
  /**
   * A fixed deadline (ISO 8601) that replaces the schedule-derived one, or null. While it is in the future it reopens a
   * season that locked earlier (its freeze is dropped and taken again at this time). 2026–27: extended to midnight
   * Central at the start of Sunday, Oct 25, 2026 (CDT, UTC−5).
   */
  deadlineOverride: "2026-10-25T05:00:00.000Z" as string | null,
  /** Until the challenge locks, a page or save re-reads the schedule when the last check is older than this. */
  scheduleCheckMinutes: 10,
  /** Longest entry name (the league display-name rule). */
  nameMaxLength: 24,
  /** Totals closer than this are tied (float noise from 0.1 margins). */
  tieTolerance: 1e-9,
} as const;
