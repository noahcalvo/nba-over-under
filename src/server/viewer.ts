import "server-only";
import { cookies } from "next/headers";
import { STATIC_LINES } from "@/data/static-lines";
import { TEAM_INFO } from "@/data/teams";
import { parseSeats, SEATS_COOKIE, serializeSeats, type SeatMap } from "@/lib/league/seats-cookie";
import { withLines } from "@/lib/lines";
import type { League, LeagueView } from "@/lib/types";

const SEATS_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export async function readSeats(): Promise<SeatMap> {
  const store = await cookies();
  return parseSeats(store.get(SEATS_COOKIE)?.value);
}

/** Only callable from route handlers (cookies can't be set while rendering). */
export async function writeSeats(seats: SeatMap): Promise<void> {
  const store = await cookies();
  store.set(SEATS_COOKIE, serializeSeats(seats), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SEATS_COOKIE_MAX_AGE,
  });
}

/** The viewer's manager id in this league, if their cookie points at a claimed seat. */
export async function getViewerId(league: League): Promise<string | null> {
  const managerId = (await readSeats())[league.id];
  const manager = league.managers.find((m) => m.id === managerId);
  return manager && manager.displayName !== null ? manager.id : null;
}

/** Interim until Task 5: the league's frozen lines, else the static lines. */
export async function toLeagueView(league: League): Promise<LeagueView> {
  return { league, viewerId: await getViewerId(league), teams: withLines(TEAM_INFO, league.lines ?? STATIC_LINES) };
}
