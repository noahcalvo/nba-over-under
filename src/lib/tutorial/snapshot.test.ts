import { describe, expect, it } from "vitest";
import { buildTutorialLeague, TUTORIAL_VIEWER_ID, tutorialTeams } from "@/data/tutorial-league";
import type { Result } from "@/lib/league/errors";
import type { League } from "@/lib/types";
import { applyTutorialCommand } from "./session";
import { simulateAll, simulateStep } from "./simulation";
import { restoreTutorial, snapshotOf, tutorialResult, type TutorialSnapshot } from "./snapshot";
import { INITIAL_SEASON_PROGRESS, type SeasonProgress } from "./season-steps";

const teams = tutorialTeams();

function must(result: Result<League>): League {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

const fresh = buildTutorialLeague();
const opened = must(
  applyTutorialCommand(fresh, TUTORIAL_VIEWER_ID, { type: "confirm", teamId: "PHI", side: "OVER", pickNumber: 1 }),
);
let midDraft = opened;
for (let step = 0; step < 9; step++) midDraft = simulateStep(midDraft, teams, "draft");
const drafted = simulateAll(opened, teams, "draft");
const faded = must(
  applyTutorialCommand(drafted, TUTORIAL_VIEWER_ID, { type: "fade", managerId: TUTORIAL_VIEWER_ID, targetPickNumber: 2 }),
);
const complete = simulateAll(faded, teams, "fades");

describe("season progress in the snapshot", () => {
  const midseason: SeasonProgress = { checkpoint: "midseason", seen: ["mid-points"] };
  const roundTrip = (snapshot: unknown) => restoreTutorial(JSON.parse(JSON.stringify(snapshot)));

  it("keeps the season with a completed draft", () => {
    expect(roundTrip(snapshotOf(complete, midseason))?.season).toEqual(midseason);
  });

  it("starts the season over for snapshots without one or with a broken one", () => {
    const older: Partial<TutorialSnapshot> = snapshotOf(complete, midseason);
    delete older.season;
    expect(roundTrip(older)).toEqual({ league: complete, season: INITIAL_SEASON_PROGRESS });
    const broken = { ...snapshotOf(complete), season: { checkpoint: "playoffs", seen: [] } };
    expect(roundTrip(broken)?.season).toEqual(INITIAL_SEASON_PROGRESS);
  });

  it("never carries a season into an unfinished draft", () => {
    expect(roundTrip(snapshotOf(drafted, midseason))?.season).toEqual(INITIAL_SEASON_PROGRESS);
  });
});

describe("snapshotOf / restoreTutorial", () => {
  it("restores the same league at every stage, through JSON", () => {
    for (const league of [fresh, opened, midDraft, drafted, faded, complete]) {
      const stored: unknown = JSON.parse(JSON.stringify(snapshotOf(league)));
      expect(restoreTutorial(stored)).toEqual({ league, season: INITIAL_SEASON_PROGRESS });
    }
  });

  it("still restores snapshots saved with the old draft progress flags", () => {
    const older = { ...snapshotOf(faded), progress: { welcomed: true, snakeExplained: true, fadesWatched: false } };
    expect(restoreTutorial(JSON.parse(JSON.stringify(older)))).toEqual({ league: faded, season: INITIAL_SEASON_PROGRESS });
  });

  it("drops anything that is not a valid tutorial", () => {
    const good = snapshotOf(opened);
    const invalid: unknown[] = [
      null,
      42,
      "tutorial",
      {},
      { ...good, v: 2 },
      { ...good, picks: "PHI" },
      { ...good, picks: [{ teamId: "PHI", side: "SIDEWAYS" }] },
      { ...good, picks: [{ teamId: "PHI", side: "OVER" }, { teamId: "PHI", side: "OVER" }] },
      { ...good, fades: [{ managerId: "m1", targetPickNumber: 1 }] },
    ];
    for (const raw of invalid) expect(restoreTutorial(raw)).toBeNull();
  });
});

describe("tutorialResult", () => {
  it("is null until the draft is complete", () => {
    expect(tutorialResult(drafted)).toBeNull();
    expect(tutorialResult(faded)).toBeNull();
  });

  it("hands the scoring walkthrough the viewer's own pick and fade", () => {
    const result = tutorialResult(complete)!;
    expect(result.viewerId).toBe(TUTORIAL_VIEWER_ID);
    expect(result.openingPick).toEqual({ pickNumber: 1, managerId: TUTORIAL_VIEWER_ID, teamId: "PHI", side: "OVER" });
    expect(result.fade).toMatchObject({ managerId: TUTORIAL_VIEWER_ID, targetPickNumber: 2 });
    expect(result.league).toBe(complete);
    expect(result.teams).toHaveLength(30);
  });
});
