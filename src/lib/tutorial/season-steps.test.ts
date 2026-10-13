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

    visit(overview, "draft-advance"); // one step before any game: awards and standings arrive at Midseason
    progress = advanceCheckpoint(progress);

    visit(overview, "mid-pick");
    proceed(openingTeam, "mid-points"); // the team page opened: the click is recognised by the route
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
    expect(id(mid, openingTeam)).toBe("mid-points");
  });

  it("after the points step, any team page asks for the overview and the overview continues", () => {
    const explained = markSeen(advanceCheckpoint(INITIAL_SEASON_PROGRESS), "mid-points");
    expect(at(explained, openingTeam)).toMatchObject({ id: "mid-back", onPage: true });
    expect(at(explained, otherTeam)).toMatchObject({ id: "mid-back", onPage: true });
    expect(at(explained, overview)).toMatchObject({ id: "mid-standings", onPage: true });
    expect(at(explained, rosters)).toMatchObject({ id: "mid-standings", page: { page: "overview" }, onPage: false });
  });

  it("resumes progress stored with steps that no longer exist at the right place", () => {
    // Draft complete's roster, standings and awards steps were folded away: their ids are dropped.
    const draft = parseSeasonProgress({ checkpoint: "draft", seen: ["draft-roster", "draft-standings", "draft-awards"] })!;
    expect(draft.seen).toEqual([]);
    expect(id(draft, overview)).toBe("draft-advance");
    // So was the chart step: a stored chart step leaves the points step on the team page.
    const chart = parseSeasonProgress({ checkpoint: "midseason", seen: ["mid-chart"] })!;
    expect(id(chart, openingTeam)).toBe("mid-points");
    const mid = parseSeasonProgress({
      checkpoint: "midseason",
      seen: ["draft-roster", "mid-chart", "mid-points", "mid-standings"],
    })!;
    expect(at(mid, overview)).toMatchObject({ id: "mid-awards", onPage: true });
    expect(at(markSeen(mid, "mid-awards"), overview)?.id).toBe("mid-advance");
    // The final standings now close the tour, after the user's results and the awards.
    const final = parseSeasonProgress({ checkpoint: "final", seen: ["final-standings", "final-awards", "final-results"] })!;
    expect(id(final, overview)).toBe("final-finish");
    expect(id(parseSeasonProgress({ checkpoint: "final", seen: ["final-standings"] })!, overview)).toBe("final-results");
  });

  it("keeps the Draft complete and Final results steps on the overview", () => {
    expect(at(INITIAL_SEASON_PROGRESS, openingTeam)).toMatchObject({ id: "draft-advance", onPage: false });
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
    const seen = markSeen(INITIAL_SEASON_PROGRESS, "mid-points");
    expect(seen.seen).toEqual(["mid-points"]);
    expect(markSeen(seen, "mid-points")).toBe(seen);
  });
});

describe("parseSeasonProgress", () => {
  it("reads stored progress and drops unknown step ids", () => {
    expect(parseSeasonProgress({ checkpoint: "midseason", seen: ["mid-points", "nope", "mid-awards"] })).toEqual({
      checkpoint: "midseason",
      seen: ["mid-points", "mid-awards"],
    });
  });

  it("rejects anything else", () => {
    for (const raw of [null, 1, {}, { checkpoint: "playoffs", seen: [] }, { checkpoint: "final", seen: "x" }, { checkpoint: "final", seen: [3] }]) {
      expect(parseSeasonProgress(raw)).toBeNull();
    }
  });
});
