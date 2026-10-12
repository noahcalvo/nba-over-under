import { describe, expect, it } from "vitest";
import { SCORING } from "@/config/scoring";
import { buildTutorialLeague, TUTORIAL_VIEWER_ID, tutorialTeams } from "@/data/tutorial-league";
import type { Result } from "@/lib/league/errors";
import type { League } from "@/lib/types";
import { applyTutorialCommand } from "./session";
import { simulateAll } from "./simulation";
import {
  INITIAL_PROGRESS,
  TUTORIAL_STEP_COUNT,
  TUTORIAL_STEP_ORDER,
  TUTORIAL_STEPS,
  tutorialStep,
  type TutorialFacts,
} from "./steps";

const teams = tutorialTeams();

function must(result: Result<League>): League {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

const facts = (league: League, extra: Partial<TutorialFacts> = {}): TutorialFacts => ({
  league,
  hasSelection: false,
  hasFadeTarget: false,
  ...extra,
});

describe("tutorialStep", () => {
  it("walks the whole tutorial, advancing only on real state changes", () => {
    let league = buildTutorialLeague();
    let progress = INITIAL_PROGRESS;
    expect(tutorialStep(progress, facts(league))).toBe("welcome");
    expect(tutorialStep(progress, facts(league, { hasSelection: true }))).toBe("welcome");

    progress = { ...progress, welcomed: true };
    expect(tutorialStep(progress, facts(league))).toBe("over-under");
    expect(tutorialStep(progress, facts(league, { hasSelection: true }))).toBe("confirm-pick");

    league = must(
      applyTutorialCommand(league, TUTORIAL_VIEWER_ID, { type: "confirm", teamId: "DET", side: "UNDER", pickNumber: 1 }),
    );
    expect(tutorialStep(progress, facts(league))).toBe("snake");

    progress = { ...progress, snakeExplained: true };
    expect(tutorialStep(progress, facts(league))).toBe("simulate");

    league = simulateAll(league, teams, "draft");
    expect(tutorialStep(progress, facts(league))).toBe("fades");
    expect(tutorialStep(progress, facts(league, { hasFadeTarget: true }))).toBe("confirm-fade");

    league = must(
      applyTutorialCommand(league, TUTORIAL_VIEWER_ID, { type: "fade", managerId: TUTORIAL_VIEWER_ID, targetPickNumber: 2 }),
    );
    expect(tutorialStep(progress, facts(league))).toBe("fade-sim");

    league = simulateAll(league, teams, "fades");
    expect(tutorialStep(progress, facts(league))).toBe("complete");
  });
});

describe("TUTORIAL_STEPS", () => {
  it("numbers the steps 1 to 8 in tutorial order", () => {
    expect(TUTORIAL_STEP_ORDER.map((id) => TUTORIAL_STEPS[id].number)).toEqual([1, 2, 3, 4, 5, 6, 7, 7, 8]);
    expect(TUTORIAL_STEP_COUNT).toBe(8);
  });

  it("gives every step a spotlight, a Continue to informational steps and an area to act in to action steps", () => {
    for (const id of TUTORIAL_STEP_ORDER) {
      const step = TUTORIAL_STEPS[id];
      expect(step.spotlight.length).toBeGreaterThan(0);
      expect(step.continueLabel !== undefined).toBe(step.advance === "continue");
      if (step.advance === "action") expect(step.interactive.length).toBeGreaterThan(0);
    }
  });

  it("takes fade points from the scoring config", () => {
    expect(TUTORIAL_STEPS.fades.body).toContain(`you earn ${SCORING.fadeHit} points`);
    expect(TUTORIAL_STEPS.fades.body).toContain(`you earn ${SCORING.fadeMiss}.`);
  });
});
