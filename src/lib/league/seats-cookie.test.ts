import { describe, expect, it } from "vitest";
import { parseSeats, SEATS_COOKIE, serializeSeats, withSeat } from "@/lib/league/seats-cookie";

describe("seats cookie", () => {
  it("is named courtline_seats", () => {
    expect(SEATS_COOKIE).toBe("courtline_seats");
  });

  it("parses leagueId:managerId pairs", () => {
    expect(parseSeats("abc123:m1|demo:m2")).toEqual({ abc123: "m1", demo: "m2" });
  });

  it("returns an empty map for missing or malformed input", () => {
    expect(parseSeats(undefined)).toEqual({});
    expect(parseSeats("")).toEqual({});
    expect(parseSeats("bad|x:y:z|ok1:m3|UPPER:m1|abc:mx")).toEqual({ ok1: "m3" });
  });

  it("round-trips through serialize", () => {
    const seats = { abc123: "m1", zz9: "m4" };
    expect(parseSeats(serializeSeats(seats))).toEqual(seats);
  });

  it("adds or replaces one league's seat without touching the others", () => {
    expect(withSeat({ a1: "m1", b2: "m2" }, "b2", "m3")).toEqual({ a1: "m1", b2: "m3" });
  });
});
