import { describe, expect, it } from "vitest";
import { TEAM_IDS, TEAM_INFO } from "@/data/teams";
import { fanDuelLineSource, parseFanDuelWinTotals } from "@/lib/fanduel";
import fixture from "./fanduel-win-totals.fixture.json";

type Payload = { attachments: { markets: Record<string, { marketName: string; marketStatus: string; runners: Array<{ runnerName: string; runnerStatus: string }> }> } };

function copy(): Payload {
  return structuredClone(fixture) as unknown as Payload;
}

function marketFor(payload: Payload, teamName: string) {
  return Object.values(payload.attachments.markets).find((m) => m.marketName === `26-27 NBA ${teamName} Regular Season Wins`)!;
}

describe("parseFanDuelWinTotals", () => {
  it("reads all 30 teams from the real payload and ignores other markets", () => {
    const values = parseFanDuelWinTotals(fixture, TEAM_INFO, "26-27");
    expect(Object.keys(values).sort()).toEqual([...TEAM_IDS].sort());
    expect(values).toMatchObject({ BOS: 50.5, OKC: 61.5, LAC: 27.5, LAL: 45.5, POR: 41.5, PHI: 49.5, SAC: 20.5 });
  });

  it("leaves out a team whose market is suspended, whose runners disagree, or that is from another season", () => {
    const payload = copy();
    marketFor(payload, "Boston Celtics").marketStatus = "SUSPENDED";
    marketFor(payload, "Utah Jazz").runners[1].runnerName = "Utah Jazz Under 38.5 Wins";
    marketFor(payload, "Miami Heat").runners[0].runnerStatus = "REMOVED";
    const values = parseFanDuelWinTotals(payload, TEAM_INFO, "26-27");
    expect(Object.keys(values)).toHaveLength(27);
    expect(values).not.toHaveProperty("BOS");
    expect(values).not.toHaveProperty("UTA");
    expect(values).not.toHaveProperty("MIA");
    expect(parseFanDuelWinTotals(fixture, TEAM_INFO, "27-28")).toEqual({});
  });

  it("throws on a payload without markets", () => {
    expect(() => parseFanDuelWinTotals({}, TEAM_INFO, "26-27")).toThrow("no markets");
    expect(() => parseFanDuelWinTotals(null, TEAM_INFO, "26-27")).toThrow("no markets");
  });
});

describe("fanDuelLineSource", () => {
  const options = { teams: TEAM_INFO, book: "FanDuel", season: "2026–27", marketSeason: "26-27", now: () => new Date("2026-10-08T19:42:00.000Z") };

  it("returns a FanDuel line set", async () => {
    const lines = await fanDuelLineSource({ ...options, fetchJson: async () => fixture }).current();
    expect(lines).toMatchObject({ source: "FanDuel", season: "2026–27", asOf: "2026-10-08T19:42:00.000Z", manual: [] });
    expect(Object.keys(lines.values)).toHaveLength(30);
  });

  it("rejects when nothing is posted or the fetch fails", async () => {
    await expect(fanDuelLineSource({ ...options, fetchJson: async () => ({ attachments: { markets: {} } }) }).current()).rejects.toThrow(
      "FanDuel has no 2026–27 win totals posted.",
    );
    await expect(
      fanDuelLineSource({ ...options, fetchJson: async () => Promise.reject(new Error("FanDuel answered 403")) }).current(),
    ).rejects.toThrow("FanDuel answered 403");
  });
});
