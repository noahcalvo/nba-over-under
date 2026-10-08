import "server-only";
import { notFound } from "next/navigation";
import type { SeatMap } from "@/lib/league/seats-cookie";
import type { League } from "@/lib/types";
import { leagueStore } from "@/server/store";

export function getLeagueOrNotFound(leagueId: string): League {
  const league = leagueStore.get(leagueId);
  if (!league) notFound();
  return league;
}

export interface SeatLeague {
  league: League;
  managerId: string;
}

/** Leagues from the viewer's cookie that still exist on this server. */
export function listSeatLeagues(seats: SeatMap): SeatLeague[] {
  return Object.entries(seats).flatMap(([leagueId, managerId]) => {
    const league = leagueStore.get(leagueId);
    return league ? [{ league, managerId }] : [];
  });
}
