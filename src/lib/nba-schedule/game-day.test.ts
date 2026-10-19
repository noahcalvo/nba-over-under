import { describe, expect, it } from "vitest";
import {
  dateStrip,
  daysBetween,
  espnDate,
  gameDayOf,
  isGameDay,
  isScheduleDay,
  scoreboardTtlSeconds,
  shiftGameDay,
  todayGameDay,
} from "@/lib/nba-schedule/game-day";

describe("gameDayOf", () => {
  it("uses the Central date of the tip-off", () => {
    expect(gameDayOf("2026-10-21T01:30Z")).toBe("2026-10-20"); // 8:30 PM CDT
    expect(gameDayOf("2026-10-20T04:59Z")).toBe("2026-10-19"); // 11:59 PM CDT
  });

  it("follows the clock change when daylight time ends", () => {
    expect(gameDayOf("2026-11-02T05:30Z")).toBe("2026-11-01"); // 11:30 PM CST
  });
});

describe("todayGameDay", () => {
  it("is the Central game day of the given instant", () => {
    expect(todayGameDay(new Date("2026-10-20T03:00Z"))).toBe("2026-10-19");
  });
});

describe("shiftGameDay", () => {
  it("moves forward across a month boundary", () => {
    expect(shiftGameDay("2026-10-31", 1)).toBe("2026-11-01");
  });

  it("moves backward across a month boundary", () => {
    expect(shiftGameDay("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("daysBetween", () => {
  it("counts days from the first to the second", () => {
    expect(daysBetween("2026-10-19", "2026-10-21")).toBe(2);
    expect(daysBetween("2026-10-21", "2026-10-19")).toBe(-2);
    expect(daysBetween("2026-10-21", "2026-10-21")).toBe(0);
  });
});

describe("isGameDay", () => {
  it("accepts real YYYY-MM-DD dates", () => {
    expect(isGameDay("2026-10-21")).toBe(true);
  });

  it("rejects anything else", () => {
    for (const bad of ["2026-02-30", "2026-10-1", "banana", "", null, 20261021, "2026-13-01", "2026-10-32", "2026-00-10", "2026-10-00"]) {
      expect(isGameDay(bad)).toBe(false);
    }
  });
});

describe("isScheduleDay", () => {
  const today = "2026-10-21";

  it("accepts the window's edges: 1947-01-01 through December 31 of next year", () => {
    expect(isScheduleDay("1947-01-01", today)).toBe(true);
    expect(isScheduleDay("2027-12-31", today)).toBe(true);
    expect(isScheduleDay("2026-10-21", today)).toBe(true);
  });

  it("rejects days outside the window", () => {
    expect(isScheduleDay("1946-12-31", today)).toBe(false);
    expect(isScheduleDay("2028-01-01", today)).toBe(false);
    expect(isScheduleDay("9999-12-31", today)).toBe(false);
    expect(isScheduleDay("0001-01-01", today)).toBe(false);
  });

  it("rejects what is not a real date", () => {
    expect(isScheduleDay("2026-02-30", today)).toBe(false);
    expect(isScheduleDay(undefined, today)).toBe(false);
  });
});

describe("espnDate", () => {
  it("drops the dashes for ESPN's scoreboard parameter", () => {
    expect(espnDate("2026-10-21")).toBe("20261021");
  });
});

describe("dateStrip", () => {
  it("puts the extra day before the given day when n is even", () => {
    expect(dateStrip("2026-10-21", 4)).toEqual(["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22"]);
  });

  it("centres n days on the given day", () => {
    expect(dateStrip("2026-10-21", 5)).toEqual([
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
    ]);
  });
});

describe("scoreboardTtlSeconds", () => {
  it("is the short time for today and the days next to it", () => {
    expect(scoreboardTtlSeconds("2026-10-21", "2026-10-21")).toBe(60);
    expect(scoreboardTtlSeconds("2026-10-21", "2026-10-20")).toBe(60);
    expect(scoreboardTtlSeconds("2026-10-21", "2026-10-22")).toBe(60);
  });

  it("is the long time for any other day", () => {
    expect(scoreboardTtlSeconds("2026-10-21", "2026-10-19")).toBe(900);
    expect(scoreboardTtlSeconds("2026-10-21", "2026-10-23")).toBe(900);
  });
});
