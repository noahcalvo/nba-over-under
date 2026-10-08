import { describe, expect, it } from "vitest";
import { findManager, managerInitials, managerLabel, openSeats } from "@/lib/league/managers";
import type { Manager } from "@/lib/types";

const MANAGERS: Manager[] = [
  { id: "m1", seat: 0, displayName: "Ana" },
  { id: "m2", seat: 1, displayName: "Ben" },
  { id: "m3", seat: 2, displayName: null },
  { id: "m4", seat: 3, displayName: null },
];

describe("managerLabel and managerInitials", () => {
  it("uses the display name when claimed, else a seat label", () => {
    expect(managerLabel({ seat: 0, displayName: "Ana" })).toBe("Ana");
    expect(managerLabel({ seat: 2, displayName: null })).toBe("Manager 3");
  });

  it("derives initials from the seat", () => {
    expect(managerInitials({ seat: 0 })).toBe("M1");
    expect(managerInitials({ seat: 3 })).toBe("M4");
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
