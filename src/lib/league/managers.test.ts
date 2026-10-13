import { describe, expect, it } from "vitest";
import { findManager, managerInitials, managerLabel, managerNumber, openSeats } from "@/lib/league/managers";
import type { Manager } from "@/lib/types";

const MANAGERS: Manager[] = [
  { id: "m1", seat: 0, displayName: "Ana" },
  { id: "m2", seat: 1, displayName: "Ben" },
  { id: "m3", seat: 2, displayName: null },
  { id: "m4", seat: 3, displayName: null },
];

describe("managerNumber, managerLabel and managerInitials", () => {
  it("number a manager by their id, wherever they sit in the draft order", () => {
    expect(managerNumber({ id: "m3", seat: 0 })).toBe(3);
    expect(managerNumber({ id: "m12", seat: 4 })).toBe(12);
  });

  it("fall back to the seat for ids that aren't m{n}", () => {
    expect(managerNumber({ id: "guest", seat: 2 })).toBe(3);
  });

  it("use the display name when claimed, else the manager's number", () => {
    expect(managerLabel({ id: "m1", seat: 1, displayName: "Ana" })).toBe("Ana");
    expect(managerLabel({ id: "m3", seat: 0, displayName: null })).toBe("Manager 3");
    expect(managerInitials({ id: "m4", seat: 0 })).toBe("M4");
  });

  it("match the old seat-based names for a league that was never reordered", () => {
    for (const manager of MANAGERS) {
      expect(managerInitials(manager)).toBe(`M${manager.seat + 1}`);
    }
  });
});

describe("findManager and openSeats", () => {
  it("finds a manager by id, or undefined for missing ids", () => {
    expect(findManager(MANAGERS, "m2")?.displayName).toBe("Ben");
    expect(findManager(MANAGERS, "m9")).toBeUndefined();
    expect(findManager(MANAGERS, null)).toBeUndefined();
    expect(findManager(MANAGERS, undefined)).toBeUndefined();
  });

  it("lists only unclaimed seats", () => {
    expect(openSeats(MANAGERS).map((m) => m.id)).toEqual(["m3", "m4"]);
  });
});
