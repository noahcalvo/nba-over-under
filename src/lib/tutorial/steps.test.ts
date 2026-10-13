import { describe, expect, it } from "vitest";
import { SCORING } from "@/config/scoring";
import { buildTutorialLeague, TUTORIAL_VIEWER_ID, tutorialTeams } from "@/data/tutorial-league";
import type { Result } from "@/lib/league/errors";
import type { League } from "@/lib/types";
import { applyTutorialCommand } from "./session";
import { simulateAll, simulateStep } from "./simulation";
import { TUTORIAL_STEP_COUNT, TUTORIAL_STEP_ORDER, TUTORIAL_STEPS, tutorialStep, type TutorialFacts } from "./steps";

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
  it("walks the whole tutorial, advancing only on the user's actions and the simulations", () => {
    let league = buildTutorialLeague();
    const walked: string[] = [];
    const expectStep = (expected: string, extra: Partial<TutorialFacts> = {}) => {
      expect(tutorialStep(facts(league, extra))).toBe(expected);
      if (walked.at(-1) !== expected) walked.push(expected);
    };

    // No welcome to click through: the first step is the first pick.
    expectStep("over-under");
    expectStep("confirm-pick", { hasSelection: true });

    league = must(
      applyTutorialCommand(league, TUTORIAL_VIEWER_ID, { type: "confirm", teamId: "DET", side: "UNDER", pickNumber: 1 }),
    );
    // Confirming starts the simulated draft straight away; the step itself explains the snake order.
    expectStep("simulate");
    league = simulateStep(league, teams, "draft");
    expectStep("simulate");

    league = simulateAll(league, teams, "draft");
    expectStep("fades");
    expectStep("confirm-fade", { hasFadeTarget: true });

    league = must(
      applyTutorialCommand(league, TUTORIAL_VIEWER_ID, { type: "fade", managerId: TUTORIAL_VIEWER_ID, targetPickNumber: 2 }),
    );
    expectStep("fade-sim");
    league = simulateStep(league, teams, "fades");
    expectStep("fade-sim");

    // The last simulated fade completes the draft and with it the tutorial, with no Continue in between.
    league = simulateAll(league, teams, "fades");
    expect(league.draft.status).toBe("complete");
    expectStep("complete");

    expect(walked).toEqual(TUTORIAL_STEP_ORDER);
  });

  it("goes back a step when the selection or fade target is cleared", () => {
    const fresh = buildTutorialLeague();
    expect(tutorialStep(facts(fresh, { hasSelection: true }))).toBe("confirm-pick");
    expect(tutorialStep(facts(fresh))).toBe("over-under");
    const opened = must(
      applyTutorialCommand(fresh, TUTORIAL_VIEWER_ID, { type: "confirm", teamId: "DET", side: "UNDER", pickNumber: 1 }),
    );
    const drafted = simulateAll(opened, teams, "draft");
    expect(tutorialStep(facts(drafted, { hasFadeTarget: true }))).toBe("confirm-fade");
    expect(tutorialStep(facts(drafted))).toBe("fades");
  });
});

describe("TUTORIAL_STEPS", () => {
  it("numbers the steps 1 to 6 in tutorial order", () => {
    expect(TUTORIAL_STEP_ORDER.map((id) => TUTORIAL_STEPS[id].number)).toEqual([1, 2, 3, 4, 5, 5, 6]);
    expect(TUTORIAL_STEP_COUNT).toBe(6);
  });

  it("never asks for a Continue: every step is an action, a simulation or the end", () => {
    for (const id of TUTORIAL_STEP_ORDER) {
      const step = TUTORIAL_STEPS[id];
      expect(step.spotlight.length).toBeGreaterThan(0);
      expect(step.continueLabel).toBeUndefined();
      if (step.advance === "action") expect(step.interactive.length).toBeGreaterThan(0);
    }
  });

  it("explains the snake order while the rest of the draft plays", () => {
    expect(TUTORIAL_STEPS.simulate.title).toMatch(/snake/i);
    expect(TUTORIAL_STEPS.simulate.body).toMatch(/reverses every round/);
  });

  it("takes fade points from the scoring config", () => {
    expect(TUTORIAL_STEPS.fades.body).toContain(`you earn +${SCORING.fadeHit}`);
    expect(TUTORIAL_STEPS.fades.body).toContain(`if it hits, ${SCORING.fadeMiss}.`);
  });
});
