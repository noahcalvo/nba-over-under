import { describe, expect, it } from "vitest";
import { espnAbbr, teamIdByNickname } from "@/data/teams";
import { FeedError } from "@/lib/feed-error";
import { espnScheduleUrl, parseEspnSchedule } from "@/lib/game-log/espn";
import type { GameLog } from "@/lib/game-log/types";
import gs2026 from "./espn-schedule-gs-2026.fixture.json";
import ny2026 from "./espn-schedule-ny-2026.fixture.json";
import orl2026 from "./espn-schedule-orl-2026.fixture.json";
import orl2027 from "./espn-schedule-orl-2027.fixture.json";

const parse = (payload: unknown, season: number, teamId: string) =>
  parseEspnSchedule(payload, season, teamId, teamIdByNickname);
const wins = (log: GameLog) => log.games.filter((game) => game.result === "W").length;

describe("espnScheduleUrl", () => {
  it("uses ESPN's abbreviation and always asks for the regular season", () => {
    expect(espnScheduleUrl(espnAbbr("NYK"), 2027)).toBe(
      "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/ny/schedule?season=2027&seasontype=2",
    );
  });

  it("maps the abbreviations ESPN spells differently", () => {
    expect(espnAbbr("ORL")).toBe("orl");
    expect(espnAbbr("GSW")).toBe("gs");
    expect(espnAbbr("NOP")).toBe("no");
    expect(espnAbbr("SAS")).toBe("sa");
    expect(espnAbbr("UTA")).toBe("utah");
    expect(espnAbbr("WAS")).toBe("wsh");
  });
});

describe("parseEspnSchedule", () => {
  it("reads a finished season in date order, numbered 1 to 82", () => {
    const log = parse(orl2026, 2026, "ORL");
    expect(log.season).toBe(2026);
    expect(log.teamId).toBe("ORL");
    expect(log.games).toHaveLength(82);
    expect(wins(log)).toBe(45);
    expect(log.games[0]).toEqual({ number: 1, date: "2025-10-22T23:00Z", opponentId: "MIA", home: true, result: "W" });
    expect(log.games.slice(0, 10).map((game) => game.result).join("")).toBe("WLLLLWWLWL");
    expect(log.games.map((game) => game.number)).toEqual(Array.from({ length: 82 }, (_, i) => i + 1));
  });

  it("leaves out the NBA Cup Championship, which doesn't count in the standings", () => {
    const log = parse(ny2026, 2026, "NYK");
    expect(log.games).toHaveLength(82);
    expect(wins(log)).toBe(53);
  });

  it("lists a postponed game once, on its make-up date", () => {
    const log = parse(gs2026, 2026, "GSW");
    expect(log.games).toHaveLength(82);
    expect(wins(log)).toBe(37);
    expect(log.games[0]).toMatchObject({ opponentId: "LAL", home: false, result: "W" });
  });

  it("keeps upcoming games with their date and opponent and no result", () => {
    const log = parse(orl2027, 2027, "ORL");
    expect(log.games).toHaveLength(80);
    expect(log.games.every((game) => game.result === null)).toBe(true);
    expect(log.games[0]).toEqual({ number: 1, date: "2026-10-21T23:00Z", opponentId: "ATL", home: true, result: null });
  });

  it("drops preseason and playoff games", () => {
    const payload = structuredClone(orl2026);
    const first = payload.events[0];
    payload.events.push(
      { ...structuredClone(first), id: "pre", date: "2025-10-05T23:00Z", seasonType: { type: 1 } },
      { ...structuredClone(first), id: "post", date: "2026-04-20T23:00Z", seasonType: { type: 3 } },
    );
    const log = parse(payload, 2026, "ORL");
    expect(log.games).toHaveLength(82);
    expect(wins(log)).toBe(45);
  });

  it("rejects another season", () => {
    expect(() => parse(orl2026, 2027, "ORL")).toThrow(FeedError);
    expect(() => parse(orl2026, 2027, "ORL")).toThrow("ESPN schedule was for a different season than 2026–27.");
  });

  it("rejects more than 82 games", () => {
    const payload = structuredClone(orl2026);
    payload.events.push({ ...structuredClone(payload.events[0]), id: "extra", date: "2026-04-13T23:00Z" });
    expect(() => parse(payload, 2026, "ORL")).toThrow("ESPN schedule listed more than 82 games for ORL.");
  });

  it("rejects a finished game without exactly one winner", () => {
    const payload = structuredClone(orl2026);
    for (const competitor of payload.events[0].competitions[0].competitors) competitor.winner = false;
    expect(() => parse(payload, 2026, "ORL")).toThrow("ESPN schedule had a finished game without one winner.");
  });

  it("rejects a game the team isn't in", () => {
    const payload = structuredClone(orl2026);
    for (const competitor of payload.events[0].competitions[0].competitors) {
      if (competitor.team.abbreviation === "ORL") competitor.team.displayName = "Boston Celtics";
    }
    expect(() => parse(payload, 2026, "ORL")).toThrow("ESPN schedule listed a game without ORL.");
  });

  it("rejects a payload without events", () => {
    expect(() => parse({}, 2026, "ORL")).toThrow("ESPN schedule wasn't in the expected format.");
    expect(() => parse(null, 2026, "ORL")).toThrow(FeedError);
  });
});
