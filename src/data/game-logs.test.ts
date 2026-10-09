import { describe, expect, it } from "vitest";
import { mockGameLog } from "@/data/game-logs";
import { TEAM_INFO } from "@/data/teams";

describe("mockGameLog", () => {
  it("adds up to every team's mock record", () => {
    for (const team of TEAM_INFO) {
      const log = mockGameLog(team, 2026);
      expect(log.teamId).toBe(team.id);
      expect(log.games).toHaveLength(team.wins + team.losses);
      expect(log.games.filter((game) => game.result === "W")).toHaveLength(team.wins);
    }
  });

  it("is the same on every run and invents no dates, opponents or venues", () => {
    const team = TEAM_INFO.find((candidate) => candidate.id === "ORL")!;
    expect(mockGameLog(team, 2026)).toEqual(mockGameLog(team, 2026));
    expect(mockGameLog(team, 2026).games[0]).toMatchObject({ number: 1, date: null, opponentId: null, home: null });
  });

  it("mixes wins and losses rather than listing all wins first", () => {
    const team = TEAM_INFO.find((candidate) => candidate.id === "ORL")!;
    const results = mockGameLog(team, 2026).games.map((game) => game.result).join("");
    expect(results).not.toBe("W".repeat(team.wins) + "L".repeat(team.losses));
  });
});
