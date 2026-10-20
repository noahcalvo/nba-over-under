import { describe, expect, it } from "vitest";
import {
  favorite,
  formatAmerican,
  oddsState,
  parseAmerican,
  rawProbability,
  winChances,
} from "@/lib/nba-schedule/odds";

describe("winChances", () => {
  it("splits an even market evenly", () => {
    expect(winChances({ away: 110, home: 110 })).toEqual({ away: 50, home: 50 });
    expect(winChances({ away: 100, home: 100 })).toEqual({ away: 50, home: 50 });
  });

  it("removes the margin and rounds to whole percentages", () => {
    expect(winChances({ away: 130, home: -155 })).toEqual({ away: 42, home: 58 });
  });

  it("always sums to 100", () => {
    for (let a = -1000; a <= 1000; a += 7) {
      for (const h of [-450, -110, 105, 300]) {
        if (Math.abs(a) < 100) continue;
        const c = winChances({ away: a, home: h });
        expect(c.away + c.home).toBe(100);
      }
    }
  });
});

describe("rawProbability", () => {
  it("converts American odds to an implied probability", () => {
    expect(rawProbability(-150)).toBeCloseTo(0.6);
    expect(rawProbability(150)).toBeCloseTo(0.4);
  });

  it("rejects invalid moneylines", () => {
    expect(() => rawProbability(0)).toThrow("Invalid moneyline");
    expect(() => rawProbability(-99)).toThrow("Invalid moneyline");
    expect(() => rawProbability(Number.NaN)).toThrow();
  });
});

describe("parseAmerican", () => {
  it("reads ESPN's American strings and integers", () => {
    expect(parseAmerican("+120")).toBe(120);
    expect(parseAmerican("-142")).toBe(-142);
    expect(parseAmerican("EVEN")).toBe(100);
    expect(parseAmerican(-110)).toBe(-110);
  });

  it("returns null for anything that is not a valid moneyline", () => {
    for (const bad of ["-99", "", "OFF", "1.5", 5.5, 0, null, undefined]) {
      expect(parseAmerican(bad)).toBeNull();
    }
  });
});

describe("oddsState", () => {
  const odds = { book: "DraftKings", away: 130, home: -155 };

  it("is open for a scheduled game with odds and unavailable without", () => {
    expect(oddsState({ status: "scheduled", odds })).toBe("open");
    expect(oddsState({ status: "scheduled", odds: null })).toBe("unavailable");
  });

  it("is closed once a game is live or final", () => {
    expect(oddsState({ status: "live", odds })).toBe("closed");
    expect(oddsState({ status: "final", odds })).toBe("closed");
  });

  it("is none for postponed or canceled games", () => {
    expect(oddsState({ status: "postponed", odds })).toBe("none");
    expect(oddsState({ status: "canceled", odds: null })).toBe("none");
  });
});

describe("favorite", () => {
  it("is the side with the higher win chance, or null when level", () => {
    expect(favorite({ away: 42, home: 58 })).toBe("home");
    expect(favorite({ away: 61, home: 39 })).toBe("away");
    expect(favorite({ away: 50, home: 50 })).toBeNull();
  });
});

describe("formatAmerican", () => {
  it("signs positive prices with + and negative ones with a true minus", () => {
    expect(formatAmerican(130)).toBe("+130");
    expect(formatAmerican(-155)).toBe("−155");
  });
});
