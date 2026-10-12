import { describe, expect, it } from "vitest";
import { buildTutorialLeague, TUTORIAL_VIEWER_ID, tutorialTeams } from "@/data/tutorial-league";
import type { Result } from "@/lib/league/errors";
import type { League } from "@/lib/types";
import { applyTutorialCommand } from "./session";
import { simulateAll, simulateStep } from "./simulation";
import { restoreTutorial, snapshotOf, tutorialResult, type TutorialSnapshot } from "./snapshot";
import { INITIAL_SEASON_PROGRESS, type SeasonProgress } from "./season-steps";
import { INITIAL_PROGRESS, type TutorialProgress } from "./steps";

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
const seen: TutorialProgress = { welcomed: true, snakeExplained: true, fadesWatched: false };

describe("season progress in the snapshot", () => {
  const midseason: SeasonProgress = { checkpoint: "midseason", seen: ["draft-roster", "draft-standings", "draft-awards", "mid-chart"] };
  const watched = { ...seen, fadesWatched: true };
  const roundTrip = (snapshot: unknown) => restoreTutorial(JSON.parse(JSON.stringify(snapshot)));

  it("keeps the season with a completed draft", () => {
    expect(roundTrip(snapshotOf(complete, watched, midseason))?.season).toEqual(midseason);
  });

  it("starts the season over for snapshots without one or with a broken one", () => {
    const older: Partial<TutorialSnapshot> = snapshotOf(complete, watched, midseason);
    delete older.season;
    expect(roundTrip(older)).toEqual({ league: complete, progress: watched, season: INITIAL_SEASON_PROGRESS });
    const broken = { ...snapshotOf(complete, watched), season: { checkpoint: "playoffs", seen: [] } };
    expect(roundTrip(broken)?.season).toEqual(INITIAL_SEASON_PROGRESS);
  });

  it("never carries a season into an unfinished draft", () => {
    expect(roundTrip(snapshotOf(drafted, seen, midseason))?.season).toEqual(INITIAL_SEASON_PROGRESS);
  });
});

describe("snapshotOf / restoreTutorial", () => {
  it("restores the same league and progress at every stage, through JSON", () => {
    const stages: Array<[League, TutorialProgress]> = [
      [fresh, INITIAL_PROGRESS],
      [opened, { welcomed: true, snakeExplained: false, fadesWatched: false }],
      [midDraft, seen],
      [drafted, seen],
      [faded, seen],
      [complete, { ...seen, fadesWatched: true }],
    ];
    for (const [league, progress] of stages) {
      const stored: unknown = JSON.parse(JSON.stringify(snapshotOf(league, progress)));
      expect(restoreTutorial(stored)).toEqual({ league, progress, season: INITIAL_SEASON_PROGRESS });
    }
  });

  it("drops anything that is not a valid tutorial", () => {
    const good = snapshotOf(opened, seen);
    const invalid: unknown[] = [
      null,
      42,
      "tutorial",
      {},
      { ...good, v: 2 },
      { ...good, progress: { welcomed: "yes", snakeExplained: false, fadesWatched: false } },
      { ...good, progress: { welcomed: true, snakeExplained: true } },
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
