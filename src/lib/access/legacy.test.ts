import { describe, expect, it } from "vitest";
import { decideLegacySeat } from "@/lib/access/legacy";

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
