import { describe, expect, it } from "vitest";
import { teamIdByNickname } from "@/data/teams";
import { CHALLENGE } from "@/config/challenge";
import { parseEspnSchedule } from "@/lib/game-log/espn";
import orl2027 from "@/lib/game-log/espn-schedule-orl-2027.fixture.json";
import type { GameLog } from "@/lib/game-log/types";
import { seasonEndYear } from "@/lib/records/season";
import { challengeDeadline, openingGame, scheduleCheck } from "./schedule";
import type { ChallengeSeason, FrozenLines } from "./types";

const log = (teamId: string, games: GameLog["games"]): GameLog => ({ season: 2027, teamId, games });

describe("openingGame", () => {
  const logs = [
    log("BOS", [
      { number: 1, date: null, opponentId: "NYK", home: null, result: null },
      { number: 2, date: "2026-10-23T23:00Z", opponentId: "MIA", home: true, result: null },
    ]),
    log("NYK", [
      { number: 1, date: "2026-10-21T23:30Z", opponentId: "CLE", home: false, result: null },
      { number: 2, date: "2026-10-25T23:00Z", opponentId: "BOS", home: true, result: null },
    ]),
    log("CLE", [{ number: 1, date: "2026-10-21T23:30Z", opponentId: "NYK", home: true, result: null }]),
  ];

  it("returns the earliest dated game with [away, home]", () => {
    expect(openingGame(logs)).toEqual({ tipoff: "2026-10-21T23:30:00.000Z", teams: ["NYK", "CLE"] });
  });
  it("puts our team first when it is away", () => {
    expect(openingGame([logs[1]])?.teams).toEqual(["NYK", "CLE"]);
  });
  it("puts our team second when it is home", () => {
    expect(openingGame([logs[2]])?.teams).toEqual(["NYK", "CLE"]);
  });
  it("is null when no game has a date", () => {
    expect(openingGame([log("BOS", [{ number: 1, date: null, opponentId: null, home: null, result: null }])])).toBeNull();
    expect(openingGame([])).toBeNull();
  });
  it("ignores an unparseable date", () => {
    expect(openingGame([log("BOS", [{ number: 1, date: "soon", opponentId: null, home: null, result: null }])])).toBeNull();
  });
  it("reads the real 2026–27 Orlando fixture", () => {
    const orl = parseEspnSchedule(orl2027, 2027, "ORL", teamIdByNickname);
    expect(openingGame([orl])?.tipoff).toBe("2026-10-21T23:00:00.000Z");
  });
});

describe("challengeDeadline", () => {
  it("is the tip-off minus the lock window", () => {
    expect(challengeDeadline("2026-10-20T19:00:00.000Z")).toBe("2026-10-20T18:30:00.000Z");
    expect(challengeDeadline("2026-10-20T19:00:00.000Z", 60)).toBe("2026-10-20T18:00:00.000Z");
  });
});

describe("CHALLENGE config", () => {
  it("keeps the season label and its end year in step", () => {
    expect(seasonEndYear(CHALLENGE.season)).toBe(CHALLENGE.seasonYear);
  });
});

describe("scheduleCheck", () => {
  const now = new Date("2026-10-15T12:00:00.000Z");
  const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();
  const season = (fields: Partial<ChallengeSeason>): ChallengeSeason => ({
    season: 2027,
    openingGame: null,
    deadline: "2026-10-20T18:30:00.000Z",
    scheduleCheckedAt: minutesAgo(1),
    scheduleError: null,
    frozen: null,
    ...fields,
  });
  const frozen: FrozenLines = { values: {}, observedAt: {}, missing: [], source: "FanDuel", lockedAt: "2026-10-20T18:31:00.000Z" };
  const stale = CHALLENGE.scheduleCheckMinutes + 1;

  it("reads the schedule now when the season has no row yet", () => {
    expect(scheduleCheck(null, now, false)).toBe("now");
  });

  it("never reads once frozen, even when forced", () => {
    expect(scheduleCheck(season({ frozen, scheduleCheckedAt: minutesAgo(stale) }), now, true)).toBe("skip");
  });

  it("never reads once the stored deadline has passed, even when forced", () => {
    expect(scheduleCheck(season({ deadline: minutesAgo(1), scheduleCheckedAt: minutesAgo(stale) }), now, true)).toBe("skip");
    expect(scheduleCheck(season({ deadline: now.toISOString() }), now, false)).toBe("skip");
  });

  it("skips a schedule checked recently, with or without a deadline", () => {
    expect(scheduleCheck(season({ scheduleCheckedAt: minutesAgo(CHALLENGE.scheduleCheckMinutes) }), now, false)).toBe("skip");
    expect(scheduleCheck(season({ deadline: null, scheduleCheckedAt: minutesAgo(1) }), now, false)).toBe("skip");
  });

  it("re-reads a stale schedule after the response when a future deadline is stored", () => {
    expect(scheduleCheck(season({ scheduleCheckedAt: minutesAgo(stale) }), now, false)).toBe("after");
  });

  it("reads a stale schedule now when no deadline is stored yet", () => {
    expect(scheduleCheck(season({ deadline: null, scheduleCheckedAt: minutesAgo(stale) }), now, false)).toBe("now");
    expect(scheduleCheck(season({ deadline: null, scheduleCheckedAt: null }), now, false)).toBe("now");
  });

  it("reads now when forced (the cron), however recent the last check", () => {
    expect(scheduleCheck(season({}), now, true)).toBe("now");
    expect(scheduleCheck(season({ deadline: null }), now, true)).toBe("now");
  });

  it("reads after the response when a deadline is stored but no check time is", () => {
    expect(scheduleCheck(season({ scheduleCheckedAt: null }), now, false)).toBe("after");
  });
});
