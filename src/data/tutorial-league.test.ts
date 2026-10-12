import { describe, expect, it } from "vitest";
import { SEASON } from "@/config/league";
import { TUTORIAL } from "@/config/tour";
import { STATIC_LINES } from "@/data/static-lines";
import { currentPickNumber, managerOnTheClock } from "@/lib/draft";
import {
  buildTutorialLeague,
  TUTORIAL_LEAGUE_ID,
  TUTORIAL_MANAGER_NAMES,
  TUTORIAL_VIEWER_ID,
  tutorialTeams,
} from "./tutorial-league";

describe("buildTutorialLeague", () => {
  it("is a live 4 × 11 draft with an empty board and the viewer on the clock", () => {
    const league = buildTutorialLeague();
    expect(league.draft.status).toBe("live");
    expect(league.draft.seatOrder).toEqual(["m1", "m2", "m3", "m4"]);
    expect(league.draft.rounds).toBe(TUTORIAL.rounds);
    expect(league.draft.picks).toEqual([]);
    expect(league.draft.voidedPicks).toEqual([]);
    expect(league.draft.blockedPick).toBeNull();
    expect(currentPickNumber(league.draft)).toBe(1);
    expect(managerOnTheClock(league.draft)).toBe(TUTORIAL_VIEWER_ID);
    expect(league.fades).toEqual([]);
  });

  it("names every seat, so nobody picks or fades for an open seat", () => {
    const league = buildTutorialLeague();
    expect(TUTORIAL_MANAGER_NAMES).toHaveLength(TUTORIAL.managerCount);
    expect(league.managers.map((manager) => manager.displayName)).toEqual([...TUTORIAL_MANAGER_NAMES]);
    expect(league.commissionerId).toBe(TUTORIAL_VIEWER_ID);
  });

  it("is writable in memory but can never be a stored league or the demo", () => {
    const league = buildTutorialLeague();
    expect(league.isDemo).toBe(false);
    expect(league.id).toBe(TUTORIAL_LEAGUE_ID);
    // Stored league ids are exactly 6 characters (randomLeagueId).
    expect(TUTORIAL_LEAGUE_ID).not.toHaveLength(6);
  });

  it("scores against the mock lines, frozen", () => {
    const league = buildTutorialLeague();
    expect(league.lines).toBe(STATIC_LINES);
    expect(league.seasonLabel).toBe(SEASON.label);
  });

  it("builds a fresh league every time", () => {
    const a = buildTutorialLeague();
    const b = buildTutorialLeague();
    expect(a).toEqual(b);
    expect(a.draft).not.toBe(b.draft);
  });
});

describe("tutorialTeams", () => {
  it("gives all 30 teams their mock line", () => {
    const teams = tutorialTeams();
    expect(teams).toHaveLength(30);
    for (const team of teams) expect(team.line).toBe(STATIC_LINES.values[team.id]);
  });
});
