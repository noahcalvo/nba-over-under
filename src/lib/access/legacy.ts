/** What the legacy claim does with one seat a pre-sign-in browser session held. */
export type LegacySeatOutcome = "moved" | "already_yours" | "already_joined" | "seat_owned";

/**
 * Decides one legacy seat under its league's lock. `userSeatId` is the account's seat in that league and
 * `seatHolderId` the account holding the legacy seat (both read under the lock). A seat moves only when nobody's
 * account holds it and the account has no seat in the league; conflicts are final.
 */
export function decideLegacySeat(input: {
  userId: string;
  managerId: string;
  userSeatId: string | null;
  seatHolderId: string | null;
}): LegacySeatOutcome {
  if (input.seatHolderId === input.userId) return "already_yours";
  if (input.userSeatId !== null) return "already_joined";
  if (input.seatHolderId !== null) return "seat_owned";
  return "moved";
}

/** The legacy seat this browser holds in a league, if any: a link to that league waits until it moves to the account. */
export function legacySeatIn<T extends { id: string }>(seats: readonly T[] | undefined, leagueId: string): T | undefined {
  return seats?.find((seat) => seat.id === leagueId);
}

/**
 * Whether the 30/30 board holds Save until the legacy entry moves: signed in, no entry on the account this season,
 * and this browser's legacy session saved one. Saving first would leave two entries, the old one uneditable.
 */
export function holdsSaveForLegacyEntry(input: { signedIn: boolean; hasAccountEntry: boolean; hasLegacyEntry: boolean }): boolean {
  return input.signedIn && !input.hasAccountEntry && input.hasLegacyEntry;
}
