import { describe, expect, it } from "vitest";
import { SCORING } from "@/config/scoring";
import { TUTORIAL_SEASON } from "@/config/tour";
import { tutorialTeams } from "@/data/tutorial-league";
import { buildChartModel } from "@/lib/game-log/chart-model";
import { completedDemo } from "./demo-drafts";
import {
  advanceCheckpointGames,
  checkpointGames,
  draftSeed,
  nextCheckpoint,
  recordAfter,
  seasonGameLog,
  simulateSeason,
  teamsAt,
} from "./season";

const teams = tutorialTeams();
const league = completedDemo("MIN", "OVER");
const seed = draftSeed(league.draft);
const season = simulateSeason(teams, seed);
const MID = TUTORIAL_SEASON.midseasonGames;
const FULL = SCORING.seasonGames;

describe("checkpoints", () => {
  it("are Draft complete (0 games), Midseason and Final results (82), in that order", () => {
    expect(checkpointGames("draft")).toBe(0);
    expect(checkpointGames("midseason")).toBe(MID);
    expect(checkpointGames("final")).toBe(FULL);
    expect(nextCheckpoint("draft")).toBe("midseason");
    expect(nextCheckpoint("midseason")).toBe("final");
    expect(nextCheckpoint("final")).toBeNull();
    expect(advanceCheckpointGames("draft")).toBe(MID);
    expect(advanceCheckpointGames("midseason")).toBe(FULL - MID);
  });
});

describe("simulateSeason", () => {
  it("plays 82 games for each of the 30 teams", () => {
    expect(Object.keys(season)).toHaveLength(30);
    for (const team of teams) expect(season[team.id]).toHaveLength(FULL);
  });

  it("is the same season for the same draft, and another for another draft", () => {
    expect(simulateSeason(teams, draftSeed(completedDemo("MIN", "OVER").draft))).toEqual(season);
    expect(simulateSeason(teams, draftSeed(completedDemo("BOS", "UNDER").draft))).not.toEqual(season);
  });

  it("reads only the seed and each team's id and line: records, history and owners don't matter", () => {
    const altered = teams.map((team) => ({ ...team, wins: 3, losses: 70, prevWins: 0 }));
    expect(simulateSeason(altered, seed)).toEqual(season);
  });

  it("varies: a wide spread of final wins, teams over and under their lines", () => {
    const final = teamsAt(teams, season, FULL);
    const wins = final.map((team) => team.wins);
    expect(Math.max(...wins) - Math.min(...wins)).toBeGreaterThanOrEqual(25);
    expect(final.filter((team) => team.wins > team.line).length).toBeGreaterThanOrEqual(5);
    expect(final.filter((team) => team.wins < team.line).length).toBeGreaterThanOrEqual(5);
  });
});

describe("records at a checkpoint", () => {
  it("counts the first games of the one sequence: Midseason is the first half of the final season", () => {
    for (const team of teams) {
      const mid = recordAfter(season[team.id], MID);
      const full = recordAfter(season[team.id], FULL);
      expect(mid.wins).toBe(season[team.id].slice(0, MID).filter((result) => result === "W").length);
      expect(mid.wins + mid.losses).toBe(MID);
      expect(full.wins + full.losses).toBe(FULL);
      expect(full.wins).toBeGreaterThanOrEqual(mid.wins);
      expect(full.wins - mid.wins).toBeLessThanOrEqual(FULL - MID);
    }
  });

  it("replaces only the records: lines and team details stay", () => {
    for (const games of [0, MID, FULL]) {
      const at = teamsAt(teams, season, games);
      at.forEach((team, index) => {
        const { wins, losses, ...rest } = teams[index];
        expect(team.wins + team.losses).toBe(games);
        expect({ ...team, wins, losses }).toEqual({ ...rest, wins, losses });
      });
    }
    expect(teamsAt(teams, season, 0).every((team) => team.wins === 0 && team.losses === 0)).toBe(true);
  });
});

describe("seasonGameLog", () => {
  it("lists all 82 games, played ones from the sequence and the rest upcoming, with nothing invented", () => {
    const log = seasonGameLog(season, "MIN", MID, 2026);
    expect(log).toMatchObject({ season: 2026, teamId: "MIN" });
    expect(log.games.map((game) => game.number)).toEqual(Array.from({ length: FULL }, (_, index) => index + 1));
    expect(log.games.slice(0, MID).map((game) => game.result)).toEqual(season.MIN.slice(0, MID));
    expect(log.games.slice(MID).every((game) => game.result === null)).toBe(true);
    expect(log.games.every((game) => game.date === null && game.opponentId === null && game.home === null)).toBe(true);
  });

  it("charts as a complete history of the checkpoint's record", () => {
    const record = recordAfter(season.MIN, MID);
    const line = teams.find((team) => team.id === "MIN")!.line;
    const games = seasonGameLog(season, "MIN", MID, 2026).games;
    for (const mode of ["last8", "full"] as const) {
      const model = buildChartModel({ games, record, line, mode, showProjected: true });
      expect(model.history).toBe("complete");
      expect(model.points.filter((point) => point.game > MID).every((point) => point.actual === null)).toBe(true);
      expect(model.points.find((point) => point.game === MID)?.actual).toBe(record.wins);
      expect(model.showsProjected).toBe(true);
    }
  });
});
