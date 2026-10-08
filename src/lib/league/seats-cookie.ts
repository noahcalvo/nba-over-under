export const SEATS_COOKIE = "courtline_seats";

/** leagueId → managerId for every league this browser holds a seat in. */
export type SeatMap = Readonly<Record<string, string>>;

const ENTRY = /^([a-z0-9]{1,32}):(m\d{1,2})$/;

export function parseSeats(raw: string | undefined): SeatMap {
  if (!raw) return {};
  const seats: Record<string, string> = {};
  for (const entry of raw.split("|")) {
    const match = ENTRY.exec(entry);
    if (match) seats[match[1]] = match[2];
  }
  return seats;
}

export function serializeSeats(seats: SeatMap): string {
  return Object.entries(seats)
    .map(([leagueId, managerId]) => `${leagueId}:${managerId}`)
    .join("|");
}

export function withSeat(seats: SeatMap, leagueId: string, managerId: string): SeatMap {
  return { ...seats, [leagueId]: managerId };
}
