import { describe, expect, it } from "vitest";
import { resolveScheduleParams, scheduleHref } from "@/lib/nba-schedule/params";

const NOW = new Date("2026-10-19T18:00:00Z"); // 1:00 PM CDT on 2026-10-19

describe("resolveScheduleParams", () => {
  it("defaults to today, the games view and the West", () => {
    expect(resolveScheduleParams({}, NOW)).toEqual({ day: "2026-10-19", view: "games", conference: "West" });
  });

  it("keeps a real date, including one far in the past", () => {
    expect(resolveScheduleParams({ date: "2026-10-21" }, NOW).day).toBe("2026-10-21");
    expect(resolveScheduleParams({ date: "1999-01-01" }, NOW).day).toBe("1999-01-01");
  });

  it("falls back to today for an invalid date", () => {
    expect(resolveScheduleParams({ date: "banana" }, NOW).day).toBe("2026-10-19");
    expect(resolveScheduleParams({ date: "2026-02-30" }, NOW).day).toBe("2026-10-19");
  });

  it("reads the Central day, not the UTC one", () => {
    expect(resolveScheduleParams({}, new Date("2026-10-20T03:00:00Z")).day).toBe("2026-10-19");
  });

  it("reads view=standings and conf=east, anything else is the default", () => {
    expect(resolveScheduleParams({ view: "standings", conf: "east" }, NOW)).toMatchObject({ view: "standings", conference: "East" });
    expect(resolveScheduleParams({ view: "x", conf: "EAST" }, NOW)).toMatchObject({ view: "games", conference: "West" });
  });
});

describe("scheduleHref", () => {
  it("omits default values and keeps the rest", () => {
    expect(scheduleHref({ day: "2026-10-21", view: "games", conference: "West" }, { day: "2026-10-22" })).toBe(
      "/nba?date=2026-10-22",
    );
    expect(scheduleHref({ day: "2026-10-21", view: "standings", conference: "East" }, { view: "games" })).toBe(
      "/nba?date=2026-10-21&conf=east",
    );
    expect(scheduleHref({ day: "2026-10-21", view: "standings", conference: "East" }, { conference: "West" })).toBe(
      "/nba?date=2026-10-21&view=standings",
    );
  });
});
