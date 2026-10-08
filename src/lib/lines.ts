import type { TeamLookup } from "@/lib/standings";
import type { LineSet, Team, TeamId, TeamInfo } from "@/lib/types";

/** Where current lines come from. Spec 1 ships only the static source; a live feed implements the same interface. */
export interface LineSource {
  /** The latest lines. May reject, or return a set missing teams; callers check with isCompleteLineSet. */
  current(): Promise<LineSet>;
}

export function staticLineSource(lines: LineSet): LineSource {
  return { current: async () => lines };
}

/** True when every team has a finite line. */
export function isCompleteLineSet(lines: LineSet, teamIds: ReadonlySet<TeamId>): boolean {
  return [...teamIds].every((teamId) => Number.isFinite(lines.values[teamId]));
}

/** Joins team metadata with lines. Throws when a team has no line, so check isCompleteLineSet first. */
export function withLines(teams: readonly TeamInfo[], lines: LineSet): Team[] {
  return teams.map((team) => {
    const line = lines.values[team.id];
    if (!Number.isFinite(line)) throw new Error(`No line for ${team.id}`);
    return { ...team, line };
  });
}

export function indexTeams(teams: readonly Team[]): TeamLookup {
  return Object.fromEntries(teams.map((team) => [team.id, team]));
}
