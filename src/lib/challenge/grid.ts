import type { Division } from "@/data/teams";
import type { Side, TeamInfo } from "@/lib/types";

export type TeamFilter = "all" | "unpicked" | "East" | "West";
export type TeamSort = "conference" | "team" | "line_desc" | "line_asc" | "movement";

export interface GridTeam {
  info: TeamInfo;
  division: Division;
  /** FanDuel's current line before the lock, the frozen line after; null when there is none. */
  line: number | null;
  /** Movement since the saved pick (see lineMove); null when none. */
  move: number | null;
  /** The working side; null while unpicked. */
  side: Side | null;
}

export const FILTER_OPTIONS: ReadonlyArray<{ value: TeamFilter; label: string }> = [
  { value: "all", label: "All Teams" },
  { value: "unpicked", label: "Unpicked" },
  { value: "East", label: "Eastern Conference" },
  { value: "West", label: "Western Conference" },
];

export const SORT_OPTIONS: ReadonlyArray<{ value: TeamSort; label: string }> = [
  { value: "conference", label: "Conference (A → Z)" },
  { value: "team", label: "Team (A → Z)" },
  { value: "line_desc", label: "Line (high → low)" },
  { value: "line_asc", label: "Line (low → high)" },
  { value: "movement", label: "Line movement (largest)" },
];

/** One of the filters, and with `movedOnly` only teams whose saved pick's line moved. */
export function filterTeams(teams: readonly GridTeam[], filter: TeamFilter, movedOnly: boolean): GridTeam[] {
  return teams.filter(
    (team) =>
      (filter === "all" || (filter === "unpicked" ? team.side === null : team.info.conference === filter)) &&
      (!movedOnly || team.move !== null),
  );
}

const fullName = (team: GridTeam) => `${team.info.city} ${team.info.name}`;
const byConference = (a: GridTeam, b: GridTeam) =>
  a.info.conference.localeCompare(b.info.conference) || fullName(a).localeCompare(fullName(b));
/** Nulls last; descending when `desc`. */
function compareNumbers(a: number | null, b: number | null, desc: boolean): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  return desc ? b - a : a - b;
}
const size = (move: number | null) => (move === null ? null : Math.abs(move));

export function sortTeams(teams: readonly GridTeam[], sort: TeamSort): GridTeam[] {
  const copy = [...teams];
  switch (sort) {
    case "team":
      return copy.sort((a, b) => fullName(a).localeCompare(fullName(b)));
    case "line_desc":
      return copy.sort((a, b) => compareNumbers(a.line, b.line, true) || byConference(a, b));
    case "line_asc":
      return copy.sort((a, b) => compareNumbers(a.line, b.line, false) || byConference(a, b));
    case "movement":
      return copy.sort((a, b) => compareNumbers(size(a.move), size(b.move), true) || byConference(a, b));
    default:
      return copy.sort(byConference);
  }
}
