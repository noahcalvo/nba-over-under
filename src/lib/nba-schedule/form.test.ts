import { describe, expect, it } from "vitest";
import type { Game, GameLog, GameResult } from "@/lib/game-log/types";
import { TEAM_INFO } from "@/data/teams";
import type { TeamInfo } from "@/lib/types";
import {
  conferencePosition,
  conferenceTable,
  formatPct,
  heat,
  heatLabel,
  nextGameDay,
  recentResults,
} from "@/lib/nba-schedule/form";

function game(number: number, result: GameResult | null, date: string | null = null): Game {
  return { number, date, opponentId: null, home: null, result };
}

function results(...codes: (GameResult | null)[]): Game[] {
  return codes.map((code, i) => game(i + 1, code));
}

function team(id: string): TeamInfo {
  const found = TEAM_INFO.find((t) => t.id === id);
  if (!found) throw new Error(`no team ${id}`);
  return found;
}

function withRecord(id: string, wins: number, losses: number): TeamInfo {
  return { ...team(id), wins, losses };
}

describe("recentResults", () => {
  it("skips unplayed games and returns the last five played in game order", () => {
    const log: GameLog = {
      season: 2027,
      teamId: "ATL",
      games: [
        game(1, "W"),
        game(2, "L"),
        game(3, "W"),
        game(4, "L"),
        game(5, "W"),
        game(6, null),
        game(7, "L"),
        game(8, "W"),
        game(9, null),
      ],
    };
    const recent = recentResults(log, 5);
    expect(recent.map((g) => g.number)).toEqual([3, 4, 5, 7, 8]);
  });

  it("returns fewer than n when the team has played fewer games", () => {
    const log: GameLog = { season: 2027, teamId: "ATL", games: [game(1, "W"), game(2, null)] };
    expect(recentResults(log, 5).map((g) => g.number)).toEqual([1]);
  });

  it("returns nothing when no game has been played or n is not positive", () => {
    const log: GameLog = { season: 2027, teamId: "ATL", games: [game(1, null)] };
    expect(recentResults(log, 5)).toEqual([]);
    expect(recentResults({ ...log, games: [game(1, "W")] }, 0)).toEqual([]);
  });
});

describe("heat", () => {
  it("is null with fewer than five form games", () => {
    expect(heat(results("W", "W", "W", "W"))).toBeNull();
  });

  it("is hot with four wins in five", () => {
    expect(heat(results("W", "W", "W", "W", "L"))).toBe("hot");
  });

  it("is null with three wins in five", () => {
    expect(heat(results("W", "W", "W", "L", "L"))).toBeNull();
  });

  it("is cold with one win in five", () => {
    expect(heat(results("W", "L", "L", "L", "L"))).toBe("cold");
  });

  it("is cold with no wins in five", () => {
    expect(heat(results("L", "L", "L", "L", "L"))).toBe("cold");
  });
});

describe("heatLabel", () => {
  it("names a hot team's wins in its last five", () => {
    expect(heatLabel(results("W", "W", "W", "W", "L"))).toBe("Hot: 4 wins in last 5");
  });

  it("names a cold team's wins in its last five, singular for one", () => {
    expect(heatLabel(results("W", "L", "L", "L", "L"))).toBe("Cold: 1 win in last 5");
  });

  it("uses the plural for zero wins", () => {
    expect(heatLabel(results("L", "L", "L", "L", "L"))).toBe("Cold: 0 wins in last 5");
  });

  it("is null when the team is neither hot nor cold", () => {
    expect(heatLabel(results("W", "W", "W", "L", "L"))).toBeNull();
    expect(heatLabel(results("W", "W"))).toBeNull();
  });
});

describe("conferenceTable", () => {
  it("lists the fifteen teams of one conference", () => {
    const rows = conferenceTable(TEAM_INFO, "West");
    expect(rows).toHaveLength(15);
    expect(rows.every((row) => row.team.conference === "West")).toBe(true);
    expect(rows.map((row) => row.rank)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
  });

  it("orders by win percentage, then wins, then name", () => {
    const teams: TeamInfo[] = [
      withRecord("DAL", 3, 1), // .750, 3 wins
      withRecord("DEN", 6, 2), // .750, 6 wins
      withRecord("GSW", 5, 5), // .500
      withRecord("HOU", 5, 5), // .500, same wins as GSW, name breaks the tie
      withRecord("LAC", 1, 9), // .100
    ];
    const rows = conferenceTable(teams, "West");
    expect(rows.map((row) => row.team.id)).toEqual(["DEN", "DAL", "GSW", "HOU", "LAC"]);
    expect(rows[0].pct).toBe(0.75);
  });

  it("puts a team with no games last with a null percentage", () => {
    const teams: TeamInfo[] = [withRecord("DAL", 0, 0), withRecord("DEN", 1, 1), withRecord("GSW", 0, 2)];
    const rows = conferenceTable(teams, "West");
    expect(rows.map((row) => row.team.id)).toEqual(["DEN", "GSW", "DAL"]);
    expect(rows[2].pct).toBeNull();
    expect(rows[2].wins).toBe(0);
    expect(rows[2].losses).toBe(0);
  });

  it("sorts alphabetically with every percentage null when no team has played", () => {
    const teams: TeamInfo[] = [withRecord("UTA", 0, 0), withRecord("DAL", 0, 0), withRecord("DEN", 0, 0)];
    const rows = conferenceTable(teams, "West");
    expect(rows.map((row) => row.team.id)).toEqual(["DAL", "DEN", "UTA"]);
    expect(rows.every((row) => row.pct === null)).toBe(true);
  });
});

describe("conferencePosition", () => {
  it("gives the team's rank in its own conference", () => {
    expect(conferencePosition(TEAM_INFO, "OKC")).toEqual({ rank: 1, conference: "West" });
    expect(conferencePosition(TEAM_INFO, "DEN")).toEqual({ rank: 2, conference: "West" });
  });

  it("is null for a team that has not played yet", () => {
    const teams = TEAM_INFO.map((t) => (t.id === "DAL" ? withRecord("DAL", 0, 0) : t));
    expect(conferencePosition(teams, "DAL")).toBeNull();
  });

  it("is null for an unknown team", () => {
    expect(conferencePosition(TEAM_INFO, "XXX")).toBeNull();
  });
});

describe("formatPct", () => {
  it("drops the leading zero", () => {
    expect(formatPct(0.75)).toBe(".750");
  });

  it("keeps a whole percentage as one point zero", () => {
    expect(formatPct(1)).toBe("1.000");
  });

  it("shows an em dash without a percentage", () => {
    expect(formatPct(null)).toBe("—");
  });
});

describe("nextGameDay", () => {
  const log = (teamId: string, dates: (string | null)[]): GameLog => ({
    season: 2027,
    teamId,
    games: dates.map((date, i) => game(i + 1, null, date)),
  });

  it("returns the earliest Central game day strictly after the given day", () => {
    const logs = [
      log("ATL", ["2026-10-22T00:30Z"]), // Oct 21 in Central time
      log("BOS", ["2026-10-21T23:30Z", "2026-10-25T00:30Z"]), // Oct 21 CT
    ];
    expect(nextGameDay(logs, "2026-10-20")).toBe("2026-10-21");
    expect(nextGameDay(logs, "2026-10-21")).toBe("2026-10-24");
  });

  it("counts a game by its Central day, not its UTC day", () => {
    // 2026-10-21T01:30Z is 8:30 PM CDT on Oct 20.
    const logs = [log("ATL", ["2026-10-21T01:30Z"])];
    expect(nextGameDay(logs, "2026-10-19")).toBe("2026-10-20");
  });

  it("ignores undated games", () => {
    const logs = [log("ATL", [null, "2026-10-23T23:00Z"])];
    expect(nextGameDay(logs, "2026-10-20")).toBe("2026-10-23");
  });

  it("returns null after the last game day", () => {
    const logs = [log("ATL", ["2026-10-21T23:00Z"])];
    expect(nextGameDay(logs, "2026-10-21")).toBeNull();
    expect(nextGameDay([], "2026-10-21")).toBeNull();
  });
});
