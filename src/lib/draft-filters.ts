import { findPickForSide } from "@/lib/draft";
import type { Conference, DraftState, Side, Team, TeamId } from "@/lib/types";

/** Display order in the draft room: Under, then Over. */
export const SIDES: readonly Side[] = ["UNDER", "OVER"];

export interface SideRef {
  teamId: TeamId;
  side: Side;
}

export interface TeamFilters {
  query: string;
  conference: "all" | Conference;
  availability: "available" | "all";
}

export const DEFAULT_FILTERS: TeamFilters = { query: "", conference: "all", availability: "available" };

export function filterTeams(teams: readonly Team[], draft: DraftState, filters: TeamFilters): Team[] {
  const query = filters.query.trim().toLowerCase();
  return teams
    .filter((team) => {
      if (filters.conference !== "all" && team.conference !== filters.conference) return false;
      if (query && ![team.city, team.name, `${team.city} ${team.name}`, team.id].some((text) => text.toLowerCase().includes(query))) {
        return false;
      }
      if (filters.availability === "available" && SIDES.every((side) => findPickForSide(draft, team.id, side))) {
        return false;
      }
      return true;
    })
    .sort((a, b) => `${a.city} ${a.name}`.localeCompare(`${b.city} ${b.name}`));
}

export function availableSideCount(draft: DraftState, teamCount: number): number {
  return teamCount * SIDES.length - draft.picks.length;
}
