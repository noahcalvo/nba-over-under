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
