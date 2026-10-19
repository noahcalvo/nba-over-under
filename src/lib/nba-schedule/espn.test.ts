import { describe, expect, it } from "vitest";
import { teamIdByNickname } from "@/data/teams";
import { FeedError } from "@/lib/feed-error";
import { espnScoreboardUrl, espnSummaryUrl, isGameId, parseScoreboard, parseSummary } from "./espn";
import fixture0315 from "./espn-scoreboard-20260315.fixture.json";
import fixture1012 from "./espn-scoreboard-20261012.fixture.json";
import fixture20 from "./espn-scoreboard-20261020.fixture.json";
import fixture21 from "./espn-scoreboard-20261021.fixture.json";
import summaryFinal from "./espn-summary-401810831.fixture.json";
import summaryPre from "./espn-summary-401909834.fixture.json";

const resolve = teamIdByNickname;
const parse21 = (payload: unknown) => parseScoreboard(payload, 2027, "2026-10-21", resolve);

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** A copy of the Oct 21 scoreboard with `edit` applied to the competition of its first event. */
function withFirstCompetition(edit: (competition: Json, event: Json) => void): unknown {
  const payload = structuredClone(fixture21) as Json;
  edit(payload.events[0].competitions[0], payload.events[0]);
  return payload;
}

const setStatus = (name: string, state: string, completed: boolean, shortDetail: string) =>
  withFirstCompetition((competition) => {
    competition.status.type = { ...competition.status.type, name, state, completed, shortDetail };
  });

describe("urls and ids", () => {
  it("builds the scoreboard and summary urls", () => {
    expect(espnScoreboardUrl("2026-10-21")).toBe(
      "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=20261021",
    );
    expect(espnSummaryUrl("401909834")).toBe(
      "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=401909834",
    );
  });

  it("accepts only 1 to 12 digits as a game id", () => {
    expect(isGameId("401909834")).toBe(true);
    expect(isGameId("abc")).toBe(false);
    expect(isGameId("")).toBe(false);
    expect(isGameId("1".repeat(12))).toBe(true);
    expect(isGameId("1".repeat(13))).toBe(false);
    expect(isGameId("12 3")).toBe(false);
  });
});

describe("parseScoreboard", () => {
  it("reads a scheduled game day with odds, venue and broadcasts", () => {
    const day = parse21(fixture21);
    expect(day).toMatchObject({ season: 2027, day: "2026-10-21" });
    expect(day.games).toHaveLength(11);
    expect(day.games[0]).toMatchObject({
      id: "401909834",
      season: 2027,
      tipoff: "2026-10-21T23:00Z",
      gameDay: "2026-10-21",
      status: "scheduled",
      statusDetail: "10/21 - 7:00 PM EDT",
      away: { teamId: "ATL", score: null, winner: false },
      home: { teamId: "ORL", score: null, winner: false },
      venue: "Kia Center",
      broadcasts: ["NBA League Pass"],
      odds: { book: "DraftKings", away: 120, home: -142 },
    });
  });

  it("sorts games by tip-off then id", () => {
    const games = parse21(fixture21).games;
    const keys = games.map((game) => `${game.tipoff}|${game.id}`);
    expect(keys).toEqual([...keys].sort());
    const payload = structuredClone(fixture21) as Json;
    payload.events.reverse();
    expect(parse21(payload).games.map((game) => game.id)).toEqual(games.map((game) => game.id));
  });

  it("counts a late game on the Central day it starts, not the UTC day", () => {
    const day = parseScoreboard(fixture20, 2027, "2026-10-20", resolve);
    expect(day.games.map((game) => [game.id, game.gameDay])).toContainEqual(["401909090", "2026-10-20"]); // 01:30Z = 8:30 PM CT
  });

  it("reads a finished game with scores, a winner and no odds", () => {
    const march = parseScoreboard(fixture0315, 2026, "2026-03-15", resolve);
    expect(march.games.find((game) => game.id === "401810831")).toMatchObject({
      status: "final",
      statusDetail: "Final",
      away: { teamId: "MIN", score: 103, winner: false },
      home: { teamId: "OKC", score: 116, winner: true },
      odds: null,
    });
  });

  it("drops events from another season or season type", () => {
    expect(parseScoreboard(fixture0315, 2027, "2026-03-15", resolve).games).toEqual([]);
    expect(parseScoreboard(fixture1012, 2027, "2026-10-12", resolve).games).toEqual([]); // preseason
  });

  it("reads a live game with scores and the short status", () => {
    const payload = withFirstCompetition((competition) => {
      competition.status.type = {
        ...competition.status.type,
        name: "STATUS_IN_PROGRESS",
        state: "in",
        completed: false,
        shortDetail: "Q3 4:12",
      };
      competition.competitors.find((c: Json) => c.homeAway === "home").score = "71";
      competition.competitors.find((c: Json) => c.homeAway === "away").score = "64";
    });
    expect(parse21(payload).games[0]).toMatchObject({
      status: "live",
      statusDetail: "Q3 4:12",
      away: { score: 64, winner: false },
      home: { score: 71, winner: false },
    });
  });

  it("treats halftime as live", () => {
    expect(parse21(setStatus("STATUS_HALFTIME", "in", false, "Halftime")).games[0]).toMatchObject({
      status: "live",
      statusDetail: "Halftime",
    });
  });

  it("marks a postponed game with no scores", () => {
    const payload = withFirstCompetition((competition) => {
      competition.status.type = {
        ...competition.status.type,
        name: "STATUS_POSTPONED",
        state: "post",
        completed: false,
        shortDetail: "Postponed",
      };
      for (const competitor of competition.competitors) competitor.score = "0";
    });
    expect(parse21(payload).games[0]).toMatchObject({
      status: "postponed",
      away: { score: null, winner: false },
      home: { score: null, winner: false },
    });
  });

  it("marks a canceled game", () => {
    expect(parse21(setStatus("STATUS_CANCELED", "post", false, "Canceled")).games[0]).toMatchObject({
      status: "canceled",
      away: { score: null },
    });
  });

  it("drops the NBA Cup championship", () => {
    const payload = withFirstCompetition((competition) => {
      competition.type = { id: "4", abbreviation: "CC" };
    });
    const games = parse21(payload).games;
    expect(games).toHaveLength(10);
    expect(games.map((game) => game.id)).not.toContain("401909834");
  });

  it("skips an event whose team is not one of the 30, and keeps the rest", () => {
    const payload = withFirstCompetition((competition) => {
      competition.competitors[0].team.displayName = "Team Stephen";
    });
    const games = parse21(payload).games;
    expect(games).toHaveLength(10);
    expect(games.map((game) => game.id)).not.toContain("401909834");
  });

  it("keeps the game but not the odds when a close price is missing or malformed", () => {
    const missing = withFirstCompetition((competition) => {
      delete competition.odds[0].moneyline.home.close;
    });
    expect(parse21(missing).games[0]).toMatchObject({ id: "401909834", odds: null });
    const malformed = withFirstCompetition((competition) => {
      competition.odds[0].moneyline.away.close.odds = "n/a";
    });
    expect(parse21(malformed).games[0]).toMatchObject({ id: "401909834", odds: null });
    const noProvider = withFirstCompetition((competition) => {
      delete competition.odds[0].provider;
    });
    expect(parse21(noProvider).games[0]).toMatchObject({ odds: null });
    const noOdds = withFirstCompetition((competition) => {
      delete competition.odds;
    });
    expect(parse21(noOdds).games[0]).toMatchObject({ odds: null });
  });

  it("de-duplicates broadcasts", () => {
    const payload = withFirstCompetition((competition) => {
      competition.broadcasts = [
        { market: "away", names: ["ESPN", "NBA League Pass"] },
        { market: "home", names: ["ESPN"] },
      ];
    });
    expect(parse21(payload).games[0].broadcasts).toEqual(["ESPN", "NBA League Pass"]);
  });

  it("rejects a final game without exactly one winner", () => {
    const payload = withFirstCompetition((competition) => {
      competition.status.type = {
        ...competition.status.type,
        name: "STATUS_FINAL",
        state: "post",
        completed: true,
        shortDetail: "Final",
      };
      for (const competitor of competition.competitors) {
        competitor.score = "100";
        competitor.winner = true;
      }
    });
    expect(() => parse21(payload)).toThrow(FeedError);
  });

  it("rejects a payload without an events array", () => {
    expect(() => parse21({ events: "nope" })).toThrow(FeedError);
    expect(() => parse21({})).toThrow(FeedError);
    expect(() => parse21(null)).toThrow(FeedError);
  });

  it("rejects an unknown status state", () => {
    expect(() => parse21(setStatus("STATUS_SUSPENDED", "mystery", false, "?"))).toThrow(FeedError);
  });

  it("rejects an event without a competition or a usable date", () => {
    expect(() =>
      parse21(
        withFirstCompetition((_competition, event) => {
          event.competitions = [];
        }),
      ),
    ).toThrow(FeedError);
    expect(() =>
      parse21(
        withFirstCompetition((competition, event) => {
          delete competition.date;
          event.date = "soon";
        }),
      ),
    ).toThrow(FeedError);
  });
});

describe("parseSummary", () => {
  it("reads a scheduled game with venue, broadcasts and odds", () => {
    expect(parseSummary(summaryPre, 2027, resolve)).toMatchObject({
      id: "401909834",
      season: 2027,
      tipoff: "2026-10-21T23:00Z",
      gameDay: "2026-10-21",
      status: "scheduled",
      away: { teamId: "ATL", score: null },
      home: { teamId: "ORL", score: null },
      venue: "Kia Center",
      broadcasts: ["NBA League Pass"],
      odds: { book: "DraftKings", away: 120, home: -142 },
    });
  });

  it("returns null for another season (the page 404s)", () => {
    expect(parseSummary(summaryFinal, 2027, resolve)).toBeNull();
  });

  it("reads a finished game of its own season", () => {
    expect(parseSummary(summaryFinal, 2026, resolve)).toMatchObject({
      status: "final",
      statusDetail: "Final",
      away: { teamId: "MIN", score: 103, winner: false },
      home: { teamId: "OKC", score: 116, winner: true },
      venue: "Paycom Center",
      broadcasts: ["ABC"],
    });
  });

  it("returns null for the NBA Cup championship and for other season types", () => {
    const cup = structuredClone(summaryPre) as Json;
    cup.header.competitions[0].type = { id: "4", abbreviation: "CC" };
    expect(parseSummary(cup, 2027, resolve)).toBeNull();
    const preseason = structuredClone(summaryPre) as Json;
    preseason.header.season.type = 1;
    expect(parseSummary(preseason, 2027, resolve)).toBeNull();
  });

  it("returns null when a team is not one of the 30", () => {
    const odd = structuredClone(summaryPre) as Json;
    odd.header.competitions[0].competitors[0].team.displayName = "Team Stephen";
    expect(parseSummary(odd, 2027, resolve)).toBeNull();
  });

  it("rejects a payload without a header", () => {
    expect(() => parseSummary({}, 2027, resolve)).toThrow(FeedError);
    expect(() => parseSummary("nope", 2027, resolve)).toThrow(FeedError);
  });

  it("works without a venue or odds", () => {
    const bare = structuredClone(summaryPre) as Json;
    delete bare.gameInfo;
    delete bare.pickcenter;
    expect(parseSummary(bare, 2027, resolve)).toMatchObject({ venue: null, odds: null });
  });
});
