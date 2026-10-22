import { describe, expect, it } from "vitest";
import { decideLegacySeat, holdsSaveForLegacyEntry, legacySeatIn } from "@/lib/access/legacy";

const BASE = { userId: "u1", managerId: "m2", userSeatId: null, seatHolderId: null };

describe("decideLegacySeat", () => {
  it("moves a seat nobody holds into an account with no seat in the league", () => {
    expect(decideLegacySeat(BASE)).toBe("moved");
  });

  it("is already yours when the account holds that seat", () => {
    expect(decideLegacySeat({ ...BASE, userSeatId: "m2", seatHolderId: "u1" })).toBe("already_yours");
  });

  it("is already joined when the account holds another seat in the league", () => {
    expect(decideLegacySeat({ ...BASE, userSeatId: "m3" })).toBe("already_joined");
  });

  it("is owned when another account holds the seat", () => {
    expect(decideLegacySeat({ ...BASE, seatHolderId: "u2" })).toBe("seat_owned");
  });

  it("already_yours wins over already_joined", () => {
    expect(decideLegacySeat({ ...BASE, userSeatId: "m3", seatHolderId: "u1" })).toBe("already_yours");
  });

  it("already_joined wins over seat_owned", () => {
    expect(decideLegacySeat({ ...BASE, userSeatId: "m3", seatHolderId: "u2" })).toBe("already_joined");
  });
});

describe("legacySeatIn", () => {
  const seats = [
    { id: "abc", manager: "m1" },
    { id: "def", manager: "m3" },
  ];

  it("finds the legacy seat in the link's league", () => {
    expect(legacySeatIn(seats, "def")).toEqual({ id: "def", manager: "m3" });
  });

  it("is undefined for another league or without legacy items", () => {
    expect(legacySeatIn(seats, "xyz")).toBeUndefined();
    expect(legacySeatIn(undefined, "abc")).toBeUndefined();
  });
});

describe("holdsSaveForLegacyEntry", () => {
  const HELD = { signedIn: true, hasAccountEntry: false, hasLegacyEntry: true };

  it("holds Save for a signed-in account with no entry while the legacy entry waits", () => {
    expect(holdsSaveForLegacyEntry(HELD)).toBe(true);
  });

  it("does not hold once the account has an entry", () => {
    expect(holdsSaveForLegacyEntry({ ...HELD, hasAccountEntry: true })).toBe(false);
  });

  it("does not hold without a legacy entry or when signed out", () => {
    expect(holdsSaveForLegacyEntry({ ...HELD, hasLegacyEntry: false })).toBe(false);
    expect(holdsSaveForLegacyEntry({ ...HELD, signedIn: false })).toBe(false);
  });
});
