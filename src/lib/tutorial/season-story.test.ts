import { describe, expect, it } from "vitest";
import { SCORING } from "@/config/scoring";
import { TUTORIAL_VIEWER_ID, tutorialTeams } from "@/data/tutorial-league";
import { formatSigned } from "@/lib/format";
import { indexTeams } from "@/lib/lines";
import { evaluateCall } from "@/lib/scoring";
import { computeStandings } from "@/lib/standings";
import type { Team } from "@/lib/types";
import { completedDemo } from "./demo-drafts";
import { draftSeed, simulateSeason, teamsAt } from "./season";
import { fadeStory, pickStory, standingsStory } from "./season-story";

const base = tutorialTeams().find((team) => team.id === "MIN")!;
const at = (wins: number, losses: number, line = 46.5): Team => ({ ...base, line, wins, losses });

describe("pickStory", () => {
  it("explains a projected hit with the team's numbers, matching evaluateCall exactly", () => {
    const team = at(26, 15); // pace 52.0 against 46.5
    const story = pickStory({ side: "OVER" }, team, "projected");
    expect(story.evaluation).toEqual(evaluateCall("OVER", team, "projected"));
    expect(story.summary).toBe("On pace for 52.0 wins against your Over 46.5: projected to hit by 5.5 wins.");
    expect(story.rows).toEqual([
      { label: "Record", value: "26–15 after 41 games" },
      { label: "Projected wins", value: "26 ÷ 41 × 82 = 52.0" },
      { label: "Your pick", value: "Over 46.5" },
      { label: "Base", value: "+1 · on track to hit" },
      { label: "Margin", value: "+5.5 × 0.1 = +0.55" },
      { label: "Projected points", value: "+1.55" },
    ]);
  });

  it("explains a projected miss as a negative score, for either side", () => {
    const team = at(26, 15);
    const under = pickStory({ side: "UNDER" }, team, "projected");
    expect(under.summary).toBe("On pace for 52.0 wins against your Under 46.5: projected to miss by 5.5 wins.");
    expect(under.rows.slice(3)).toEqual([
      { label: "Base", value: "−1 · on track to miss" },
      { label: "Margin", value: "−5.5 × 0.1 = −0.55" },
      { label: "Projected points", value: "−1.55" },
    ]);
    const over = pickStory({ side: "OVER" }, at(18, 23), "projected"); // pace 36.0
    expect(over.evaluation.points).toBeCloseTo(SCORING.missedCall - 1.05);
    expect(over.summary).toContain("projected to miss by 10.5 wins");
  });

  it("scores the final record once all 82 games are played", () => {
    const story = pickStory({ side: "UNDER" }, at(40, 42), "final");
    expect(story.summary).toBe("Finished with 40 wins against your Under 46.5: correct by 6.5 wins.");
    expect(story.rows[1]).toEqual({ label: "Final wins", value: "40" });
    expect(story.rows[5]).toEqual({ label: "Final points", value: "+1.65" });
  });

  it("scores a push as 0", () => {
    const story = pickStory({ side: "OVER" }, at(46, 36, 46), "final");
    expect(story.evaluation.push).toBe(true);
    expect(story.summary).toBe("Finished with exactly 46 wins, right on your Over 46.0: a push scores 0.");
    expect(story.rows.slice(3)).toEqual([
      { label: "Base", value: "0 · push" },
      { label: "Margin", value: "0.0 × 0.1 = 0.00" },
      { label: "Final points", value: "0.00" },
    ]);
  });

  it("says Not available, not zero, before any game", () => {
    const story = pickStory({ side: "OVER" }, at(0, 0), "projected");
    expect(story.evaluation.status).toBe("not_available");
    expect(story.rows).toEqual([]);
    expect(story.summary).toBe("No games played yet, so there's nothing to score.");
  });
});

describe("fadeStory and standingsStory on a demo season", () => {
  const league = completedDemo("MIN", "OVER", 2);
  const teams = tutorialTeams();
  const season = simulateSeason(teams, draftSeed(league.draft));
  const standingsAt = (games: number, basis: "projected" | "final") =>
    computeStandings(league, indexTeams(teamsAt(teams, season, games)), basis);
  const viewerRow = (games: number, basis: "projected" | "final") =>
    standingsAt(games, basis).rows.find((row) => row.managerId === TUTORIAL_VIEWER_ID)!;

  it("tells the user's own fade, with the points the rules give it", () => {
    for (const [games, basis] of [[41, "projected"], [82, "final"]] as const) {
      const row = viewerRow(games, basis);
      const story = fadeStory(row, league.managers)!;
      expect(story.evaluation).toBe(row.fades[0].evaluation);
      expect(story.targetLabel).toMatch(/^Kobe Bryant's /);
      const points = story.evaluation.points;
      expect(points === SCORING.fadeHit || points === SCORING.fadeMiss).toBe(true);
      expect(story.summary).toContain(points === SCORING.fadeHit ? "+2" : "your fade");
    }
    expect(fadeStory(viewerRow(0, "projected"), league.managers)?.summary).toContain("No games played yet");
  });

  it("names the leader by the computed ranking and the user's place", () => {
    const final = standingsAt(82, "final");
    const story = standingsStory(final, league.managers, TUTORIAL_VIEWER_ID);
    expect(story.leader).toBe(final.rows[0]);
    expect(story.viewer.managerId).toBe(TUTORIAL_VIEWER_ID);
    expect(story.summary).toMatch(story.viewer === story.leader ? /^You win the league/ : /wins the league with .* You finished/);
    expect(story.rows[2]).toEqual({ label: "Final total", value: formatSigned(story.viewer.totalPoints, 2) });
    expect(story.viewer.totalPoints).toBeCloseTo(story.viewer.callPoints + story.viewer.fadePoints);
    const before = standingsStory(standingsAt(0, "projected"), league.managers, TUTORIAL_VIEWER_ID);
    expect(before.summary).toContain("no ranking");
    expect(before.rows).toEqual([]);
  });
});

describe("standingsStory wording", () => {
  const league = completedDemo("MIN", "OVER", 2);
  const teams = indexTeams(teamsAt(tutorialTeams(), simulateSeason(tutorialTeams(), "fixed"), 82));
  it("says 'wins the league' on the final basis and 'leads' on the projected one", () => {
    const final = standingsStory(computeStandings(league, teams, "final"), league.managers, "m2");
    const projected = standingsStory(computeStandings(league, teams, "projected"), league.managers, "m2");
    expect(final.summary).toMatch(/win the league|wins the league/);
    expect(projected.summary).toMatch(/lead with|leads with/);
    expect(projected.summary).toContain("projected points");
  });
});
