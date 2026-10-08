import { describe, expect, it } from "vitest";
import { LEAGUE_DEFAULTS } from "@/config/league";
import { buildDemoLeague, DEMO_LEAGUE_ID } from "@/data/demo-league";
import { TEAM_IDS, TEAMS, TEAMS_BY_ID, TOTAL_SIDES } from "@/data/teams";
import { seatForPick, totalPicks } from "@/lib/draft";
import { computeStandings } from "@/lib/standings";

describe("TEAMS", () => {
  it("has 30 unique teams, 15 per conference, and 60 sides", () => {
    expect(TEAMS).toHaveLength(30);
    expect(TEAM_IDS.size).toBe(30);
    expect(new Set(TEAMS.map((team) => team.nbaId)).size).toBe(30);
    expect(TEAMS.filter((team) => team.conference === "East")).toHaveLength(15);
    expect(TOTAL_SIDES).toBe(60);
  });

  it("uses half-point lines and valid mid-season records", () => {
    for (const team of TEAMS) {
      expect(team.line % 1).toBe(0.5);
      expect(team.wins + team.losses).toBeGreaterThan(0);
      expect(team.wins + team.losses).toBeLessThan(82);
      expect(team.color).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
});

describe("buildDemoLeague", () => {
  const league = buildDemoLeague();

  it("is a completed 4-manager, 11-round draft", () => {
    expect(league.id).toBe(DEMO_LEAGUE_ID);
    expect(league.isDemo).toBe(true);
    expect(league.managers).toHaveLength(LEAGUE_DEFAULTS.managerCount);
    expect(league.draft.rounds).toBe(LEAGUE_DEFAULTS.rounds);
    expect(league.draft.status).toBe("complete");
    expect(league.draft.picks).toHaveLength(totalPicks(4, 11));
  });

  it("follows snake order with unique, real sides", () => {
    const sides = new Set<string>();
    league.draft.picks.forEach((pick, index) => {
      expect(pick.pickNumber).toBe(index + 1);
      expect(pick.managerId).toBe(league.draft.seatOrder[seatForPick(pick.pickNumber, 4)]);
      expect(TEAMS_BY_ID[pick.teamId]).toBeDefined();
      sides.add(`${pick.teamId}:${pick.side}`);
    });
    expect(sides.size).toBe(44);
  });

  it("never gives a manager both sides of a team", () => {
    const owned = new Set(league.draft.picks.map((pick) => `${pick.managerId}:${pick.teamId}`));
    expect(owned.size).toBe(league.draft.picks.length);
  });

  it("opens with the same eight picks as the draft room mockup", () => {
    expect(league.draft.picks.slice(0, 8).map((p) => `${p.managerId} ${p.teamId} ${p.side}`)).toEqual([
      "m1 MIN OVER",
      "m2 OKC OVER",
      "m3 BOS UNDER",
      "m4 CLE OVER",
      "m4 BKN UNDER",
      "m3 LAL OVER",
      "m2 DEN OVER",
      "m1 CHI UNDER",
    ]);
  });

  it("gives each manager one fade on an opponent's pick", () => {
    expect(league.fades).toHaveLength(4);
    for (const fade of league.fades) {
      const target = league.draft.picks.find((pick) => pick.pickNumber === fade.targetPickNumber);
      expect(target).toBeDefined();
      expect(target!.managerId).not.toBe(fade.managerId);
    }
    expect(new Set(league.fades.map((fade) => fade.managerId)).size).toBe(4);
  });

  it("derives a projected order where points, not margin, decide the ranking", () => {
    const standings = computeStandings(league, TEAMS_BY_ID, "projected");
    expect(standings.rows.map((row) => row.managerId)).toEqual(["m3", "m1", "m4", "m2"]);
    const m2 = standings.rows.find((row) => row.managerId === "m2")!;
    const m4 = standings.rows.find((row) => row.managerId === "m4")!;
    expect(m2.totalMargin).toBeGreaterThan(m4.totalMargin);
    const fadeStatus = Object.fromEntries(
      standings.rows.flatMap((row) => row.fades.map((fade) => [row.managerId, fade.evaluation.targetMissed])),
    );
    expect(fadeStatus).toEqual({ m1: true, m2: false, m3: false, m4: true });
  });

  it("has no settled picks yet, so final results are unavailable", () => {
    expect(computeStandings(league, TEAMS_BY_ID, "final").anyScored).toBe(false);
  });
});
