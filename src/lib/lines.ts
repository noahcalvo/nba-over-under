import { SCORING } from "@/config/scoring";
import { formatDateTimeET } from "@/lib/format";
import type { TeamLookup } from "@/lib/standings";
import type { LineReview, LineReviewRow, LineSet, Team, TeamId, TeamInfo } from "@/lib/types";

/** Where current lines come from. A live feed and the static mock lines implement it. */
export interface LineSource {
  /** The latest lines. May reject, or return a set missing teams; callers check with isCompleteLineSet. */
  current(): Promise<LineSet>;
}

/** The latest read of a source: the lines (possibly from an earlier read) and, when the latest read failed, why. */
export interface FeedRead {
  lines: LineSet | null;
  error: string | null;
}

/** `source` of a frozen set whose every line the commissioner entered. */
export const MANUAL_SOURCE = "Commissioner";

export function staticLineSource(lines: LineSet): LineSource {
  return { current: async () => lines };
}

/**
 * Reuses a successful read for `ttlMs` and a failure for `retryMs`, so polling clients don't hit the book every few
 * seconds. Concurrent callers share one in-flight read.
 */
export function cachedLineSource(
  source: LineSource,
  ttlMs: number,
  retryMs: number,
  now: () => number = Date.now,
): LineSource {
  let success: { lines: LineSet; at: number } | null = null;
  let failure: { error: unknown; at: number } | null = null;
  let inflight: Promise<LineSet> | null = null;
  return {
    current() {
      if (success && now() - success.at < ttlMs) return Promise.resolve(success.lines);
      if (failure && now() - failure.at < retryMs) return Promise.reject(failure.error);
      inflight ??= source.current().then(
        (lines) => {
          success = { lines, at: now() };
          failure = null;
          inflight = null;
          return lines;
        },
        (error: unknown) => {
          failure = { error, at: now() };
          inflight = null;
          throw error;
        },
      );
      return inflight;
    },
  };
}

/** A message for a failed read, safe to show the commissioner. */
export function describeFeedError(error: unknown): string {
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return "The sportsbook didn't answer in time.";
  }
  return error instanceof Error && error.message ? error.message : "The sportsbook's lines couldn't be read.";
}

/** Reads a source and remembers its last good set: a failed refresh reports the error alongside the older lines. */
export function lineReader(source: LineSource): () => Promise<FeedRead> {
  let lastGood: LineSet | null = null;
  return async () => {
    try {
      lastGood = await source.current();
      return { lines: lastGood, error: null };
    } catch (error) {
      return { lines: lastGood, error: describeFeedError(error) };
    }
  };
}

/** True when every team has a finite line. */
export function isCompleteLineSet(lines: LineSet, teamIds: ReadonlySet<TeamId>): boolean {
  return [...teamIds].every((teamId) => Number.isFinite(lines.values[teamId]));
}

/** A win-total line: a multiple of 0.5 strictly between 0 and the season length. */
export function isValidLine(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    value < SCORING.seasonGames &&
    Number.isInteger(value * 2)
  );
}

/** Validates an untrusted teamId → line map. Null when it isn't an object, names an unknown team or has a bad line. */
export function parseLineValues(input: unknown, teamIds: ReadonlySet<TeamId>): Record<TeamId, number> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const values: Record<TeamId, number> = {};
  for (const [teamId, value] of Object.entries(input)) {
    if (!teamIds.has(teamId) || !isValidLine(value)) return null;
    values[teamId] = value;
  }
  return values;
}

/** True when both maps hold the same teams with the same lines. */
export function sameLineValues(a: Readonly<Record<TeamId, number>>, b: Readonly<Record<TeamId, number>>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((teamId) => b[teamId] === a[teamId]);
}

/**
 * The pre-draft review: the source's lines with the commissioner's overrides on top. `fallback` names the book and
 * season when the source has never been read.
 */
export function buildLineReview(
  teams: readonly TeamInfo[],
  read: FeedRead,
  overrides: Readonly<Record<TeamId, number>>,
  fallback: { book: string; season: string },
): LineReview {
  const fromFeed = read.lines?.values ?? {};
  const rows: LineReviewRow[] = [];
  const lines: Record<TeamId, number> = {};
  const missing: TeamId[] = [];
  for (const team of teams) {
    const feed = Number.isFinite(fromFeed[team.id]) ? fromFeed[team.id] : null;
    const override = Number.isFinite(overrides[team.id]) ? overrides[team.id] : null;
    const line = override ?? feed;
    rows.push({ team, feed, override, line });
    if (line === null) missing.push(team.id);
    else lines[team.id] = line;
  }
  return {
    book: read.lines?.source ?? fallback.book,
    season: read.lines?.season ?? fallback.season,
    asOf: read.lines?.asOf ?? null,
    feedError: read.error,
    rows,
    lines,
    overrides,
    missing,
  };
}

/** The set a draft start freezes, crediting the book and listing the commissioner's lines. Null while any team is missing. */
export function freezeLines(review: LineReview, now: Date): LineSet | null {
  if (review.missing.length > 0) return null;
  const manual = review.rows.filter((row) => row.override !== null).map((row) => row.team.id).sort();
  const allManual = manual.length === review.rows.length;
  return {
    values: review.lines,
    source: allManual ? MANUAL_SOURCE : review.book,
    season: review.season,
    asOf: !allManual && review.asOf ? review.asOf : now.toISOString(),
    manual,
  };
}

/** "FanDuel · 2026–27 · as of Oct 8, 3:42 PM ET", plus how many lines the commissioner entered. */
export function describeLineSet(lines: LineSet): string {
  const parts = [lines.source, lines.season, `as of ${formatDateTimeET(lines.asOf)}`];
  if (lines.manual.length > 0 && lines.source !== MANUAL_SOURCE) {
    parts.push(`${lines.manual.length} entered by the commissioner`);
  }
  return parts.join(" · ");
}

/** Joins team metadata with lines. Throws when a team has no line, so check isCompleteLineSet first. */
export function withLines(teams: readonly TeamInfo[], lines: LineSet): Team[] {
  return teams.map((team) => {
    const line = lines.values[team.id];
    if (!Number.isFinite(line)) throw new Error(`No line for ${team.id}`);
    return { ...team, line };
  });
}

/** Joins team metadata with whatever lines exist, leaving out teams without one (before the draft). */
export function withAvailableLines(teams: readonly TeamInfo[], values: Readonly<Record<TeamId, number>>): Team[] {
  return teams.flatMap((team) => (Number.isFinite(values[team.id]) ? [{ ...team, line: values[team.id] }] : []));
}

export function indexTeams(teams: readonly Team[]): TeamLookup {
  return Object.fromEntries(teams.map((team) => [team.id, team]));
}
