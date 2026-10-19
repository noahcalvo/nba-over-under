import { LINES } from "@/config/lines";

/** The NBA schedule and game detail pages: where games come from, the game-day clock and how long each read is reused. */
export const NBA_SCHEDULE = {
  /** The season whose games are shown. */
  season: LINES.season,
  /** Display name of the schedule source. */
  source: "ESPN",
  /** A schedule or game read gives up after this long. */
  fetchTimeoutMs: 8000,
  /** The time zone a game day is counted in: a game belongs to the Central date it tips off. */
  timeZone: "America/Chicago",
  /** Short label shown after Central times. */
  timeZoneLabel: "CT",
  /** Today's games are reused this long after a successful read. */
  currentDayCacheSeconds: 60,
  /** Any other day's games are reused this long after a successful read. */
  otherDayCacheSeconds: 900,
  /** A game's summary (box score and play data) is reused this long after a successful read. */
  summaryCacheSeconds: 60,
  /** After a failed read, wait this long before asking the source again. */
  retrySeconds: 30,
  /** How many of a team's most recent games form its form line. */
  formGames: 5,
  /** A team with at least this many wins in its form games counts as hot. */
  hotWins: 4,
  /** A team with at most this many wins in its form games counts as cold. */
  coldWins: 1,
  /** How many game days the date strip shows at once. */
  dateStripDays: 5,
} as const;
