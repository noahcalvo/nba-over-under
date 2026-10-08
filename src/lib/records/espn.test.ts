import { describe, expect, it } from "vitest";
import { TEAM_IDS, teamIdByNickname } from "@/data/teams";
import { espnStandingsUrl, parseEspnStandings } from "@/lib/records/espn";
import { FeedError } from "@/lib/feed-error";
import regular from "./espn-standings-2026-regular.fixture.json";
import preseason from "./espn-standings-2027-preseason.fixture.json";

type Payload = typeof regular;
const parse = (payload: unknown, season = 2026) => parseEspnStandings(payload, season, teamIdByNickname, TEAM_IDS);
const copy = (): Payload => structuredClone(regular);

describe("espnStandingsUrl", () => {
  it("always asks for the regular season", () => {
    expect(espnStandingsUrl(2027)).toBe(
      "https://site.api.espn.com/apis/v2/sports/basketball/nba/standings?season=2027&seasontype=2",
    );
  });
});

describe("parseEspnStandings", () => {
  it("reads every team's record, keyed by our ids", () => {
    const set = parse(regular);
    expect(set.season).toBe(2026);
    expect(Object.keys(set.records)).toHaveLength(30);
    expect(set.records.DET).toEqual({ wins: 60, losses: 22 });
    expect(set.records.OKC).toEqual({ wins: 64, losses: 18 });
    expect(set.records.WAS).toEqual({ wins: 17, losses: 65 });
    expect(set.records.NYK).toEqual({ wins: 53, losses: 29 });
    expect(set.records.UTA).toEqual({ wins: 22, losses: 60 });
  });

  it("rejects preseason standings", () => {
    expect(() => parse(preseason, 2027)).toThrow(FeedError);
    expect(() => parse(preseason, 2027)).toThrow("ESPN standings were for a different season than 2026–27.");
  });

  it("rejects another season", () => {
    expect(() => parse(regular, 2027)).toThrow("ESPN standings were for a different season than 2026–27.");
  });

  it("rejects a payload in another shape", () => {
    for (const payload of [null, [], {}, { children: [] }, { children: [{}] }, "x"]) {
      expect(() => parse(payload)).toThrow("ESPN standings weren't in the expected format.");
    }
  });

  it("rejects a missing team", () => {
    const payload = copy();
    payload.children[0].standings.entries.pop();
    expect(() => parse(payload)).toThrow(/^ESPN standings were missing [A-Z]{3}\.$/);
  });

  it("rejects an unknown team", () => {
    const payload = copy();
    payload.children[0].standings.entries[0].team.name = "Sonics";
    expect(() => parse(payload)).toThrow("ESPN standings included a team we don't know (Sonics).");
  });

  it("rejects a duplicated team", () => {
    const payload = copy();
    payload.children[0].standings.entries[1].team.name = payload.children[0].standings.entries[0].team.name;
    expect(() => parse(payload)).toThrow(/^ESPN standings listed [A-Z]{3} twice\.$/);
  });

  it("rejects a record that isn't whole, non-negative numbers", () => {
    for (const bad of [-1, 1.5, "60", null]) {
      const payload = copy();
      const stat = payload.children[0].standings.entries[0].stats.find((s) => s.name === "wins")!;
      (stat as { value: unknown }).value = bad;
      expect(() => parse(payload)).toThrow("ESPN standings had no usable record for DET.");
    }
  });

  it("rejects more than 82 games", () => {
    const payload = copy();
    const stat = payload.children[0].standings.entries[0].stats.find((s) => s.name === "wins")!;
    stat.value = 61;
    expect(() => parse(payload)).toThrow("ESPN standings gave DET more than 82 games.");
  });
});
