import { describe, expect, it } from "vitest";
import {
  advanceCheckpoint,
  INITIAL_SEASON_PROGRESS,
  markSeen,
  parseSeasonProgress,
  SEASON_STEP_ORDER,
  seasonStep,
  type SeasonLocation,
  type SeasonProgress,
  type SeasonStepId,
} from "./season-steps";

const OPENING = "MIN";
const overview: SeasonLocation = { page: "overview" };
const rosters: SeasonLocation = { page: "rosters" };
const openingTeam: SeasonLocation = { page: "team", teamId: OPENING };
const otherTeam: SeasonLocation = { page: "team", teamId: "BOS" };

const at = (progress: SeasonProgress, location: SeasonLocation) => seasonStep(progress, location, OPENING);
const id = (progress: SeasonProgress, location: SeasonLocation) => at(progress, location)?.id ?? null;

describe("seasonStep", () => {
  it("walks all three checkpoints, moving only on Continue, a checkpoint advance or a page change", () => {
    let progress = INITIAL_SEASON_PROGRESS;
    const walked: SeasonStepId[] = [];
    const visit = (location: SeasonLocation, expected: SeasonStepId) => {
      const step = at(progress, location);
      expect(step).toMatchObject({ id: expected, onPage: true });
      walked.push(expected);
    };
    const proceed = (location: SeasonLocation, expected: SeasonStepId) => {
      visit(location, expected);
      progress = markSeen(progress, expected);
    };

    proceed(overview, "draft-roster");
    visit(overview, "draft-advance"); // no awards step before any game: they arrive at Midseason
    progress = advanceCheckpoint(progress);

    visit(overview, "mid-pick");
    proceed(openingTeam, "mid-chart"); // the team page opened: the click is recognised by the route
    proceed(openingTeam, "mid-points");
    visit(openingTeam, "mid-back");
    proceed(overview, "mid-standings"); // back on the overview
    proceed(overview, "mid-awards");
    visit(overview, "mid-advance");
    progress = advanceCheckpoint(progress);

    proceed(overview, "final-results");
    proceed(overview, "final-awards");
    proceed(overview, "final-finish"); // the final standings close the tour
    expect(at(progress, overview)).toBeNull();
    expect(at(progress, openingTeam)).toBeNull();

    expect(walked).toEqual([...SEASON_STEP_ORDER.draft, ...SEASON_STEP_ORDER.midseason, ...SEASON_STEP_ORDER.final]);
  });

  it("asks for the opening team's page at Midseason until its points are explained", () => {
    const mid = advanceCheckpoint(INITIAL_SEASON_PROGRESS);
    expect(at(mid, overview)).toMatchObject({ id: "mid-pick", page: { page: "overview" }, onPage: true });
    // Another team's page (the team selector, a typed URL) or Rosters: back to the overview to click the right team.
    expect(at(mid, otherTeam)).toMatchObject({ id: "mid-pick", onPage: false });
    expect(at(mid, rosters)).toMatchObject({ id: "mid-pick", onPage: false });
    // Leaving the team page before the points step starts over at the click.
    const chartSeen = markSeen(mid, "mid-chart");
    expect(id(chartSeen, openingTeam)).toBe("mid-points");
    expect(id(chartSeen, overview)).toBe("mid-pick");
  });

  it("after the points step, any team page asks for the overview and the overview continues", () => {
    const explained = markSeen(markSeen(advanceCheckpoint(INITIAL_SEASON_PROGRESS), "mid-chart"), "mid-points");
    expect(at(explained, openingTeam)).toMatchObject({ id: "mid-back", onPage: true });
    expect(at(explained, otherTeam)).toMatchObject({ id: "mid-back", onPage: true });
    expect(at(explained, overview)).toMatchObject({ id: "mid-standings", onPage: true });
    expect(at(explained, rosters)).toMatchObject({ id: "mid-standings", page: { page: "overview" }, onPage: false });
  });

  it("resumes progress stored with steps that no longer exist at the right place", () => {
    // Draft complete's standings and awards steps were folded away: their ids are dropped and the tour carries on.
    const draft = parseSeasonProgress({ checkpoint: "draft", seen: ["draft-roster", "draft-standings", "draft-awards"] })!;
    expect(draft.seen).toEqual(["draft-roster"]);
    expect(id(draft, overview)).toBe("draft-advance");
    const mid = parseSeasonProgress({
      checkpoint: "midseason",
      seen: ["draft-roster", "draft-standings", "mid-chart", "mid-points", "mid-standings"],
    })!;
    expect(at(mid, overview)).toMatchObject({ id: "mid-awards", onPage: true });
    expect(at(markSeen(mid, "mid-awards"), overview)?.id).toBe("mid-advance");
    // The final standings now close the tour, after the user's results and the awards.
    const final = parseSeasonProgress({ checkpoint: "final", seen: ["final-standings", "final-awards", "final-results"] })!;
    expect(id(final, overview)).toBe("final-finish");
    expect(id(parseSeasonProgress({ checkpoint: "final", seen: ["final-standings"] })!, overview)).toBe("final-results");
  });

  it("keeps the Draft complete and Final results steps on the overview", () => {
    expect(at(INITIAL_SEASON_PROGRESS, openingTeam)).toMatchObject({ id: "draft-roster", onPage: false });
    const final = advanceCheckpoint(advanceCheckpoint(INITIAL_SEASON_PROGRESS));
    expect(at(final, rosters)).toMatchObject({ id: "final-results", onPage: false });
  });

  it("explored results end the tour on every page", () => {
    const done = markSeen(advanceCheckpoint(advanceCheckpoint(INITIAL_SEASON_PROGRESS)), "final-finish");
    for (const location of [overview, rosters, openingTeam, otherTeam]) expect(at(done, location)).toBeNull();
  });
});

describe("advanceCheckpoint / markSeen", () => {
  it("goes Draft complete → Midseason → Final results and stops", () => {
    const once = advanceCheckpoint(INITIAL_SEASON_PROGRESS);
    const twice = advanceCheckpoint(once);
    expect([once.checkpoint, twice.checkpoint]).toEqual(["midseason", "final"]);
    expect(advanceCheckpoint(twice)).toBe(twice);
  });

  it("marks a step once", () => {
    const seen = markSeen(INITIAL_SEASON_PROGRESS, "draft-roster");
    expect(seen.seen).toEqual(["draft-roster"]);
    expect(markSeen(seen, "draft-roster")).toBe(seen);
  });
});

describe("parseSeasonProgress", () => {
  it("reads stored progress and drops unknown step ids", () => {
    expect(parseSeasonProgress({ checkpoint: "midseason", seen: ["draft-roster", "nope", "mid-chart"] })).toEqual({
      checkpoint: "midseason",
      seen: ["draft-roster", "mid-chart"],
    });
  });

  it("rejects anything else", () => {
    for (const raw of [null, 1, {}, { checkpoint: "playoffs", seen: [] }, { checkpoint: "final", seen: "x" }, { checkpoint: "final", seen: [3] }]) {
      expect(parseSeasonProgress(raw)).toBeNull();
    }
  });
});
