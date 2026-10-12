import { SCORING } from "@/config/scoring";
import { TUTORIAL_VIEWER_ID } from "@/data/tutorial-league";
import { picksForManager } from "@/lib/draft";
import { fadeFor } from "@/lib/fades";
import type { TourStep } from "@/lib/tour/targets";
import type { League } from "@/lib/types";

// The guided draft. The step shown is derived from the demo league itself (a confirmed pick, a locked fade) plus two
// "seen" flags for the informational steps, so it only ever moves on a real state change, and going back (clearing a
// selection) needs no special handling.

export type TutorialStepId =
  | "welcome"
  | "over-under"
  | "confirm-pick"
  | "snake"
  | "simulate"
  | "fades"
  | "confirm-fade"
  | "fade-sim"
  | "complete";

export const TUTORIAL_STEP_ORDER: readonly TutorialStepId[] = [
  "welcome",
  "over-under",
  "confirm-pick",
  "snake",
  "simulate",
  "fades",
  "confirm-fade",
  "fade-sim",
  "complete",
];

/** Steps as the user counts them; the other managers' fades are part of step 7. */
export const TUTORIAL_STEP_COUNT = 8;

export interface TutorialStep extends TourStep {
  number: number;
  /** continue: a button; action: the user's own successful action; automatic: simulation; end: the last step. */
  advance: "continue" | "action" | "automatic" | "end";
}

export interface TutorialProgress {
  welcomed: boolean;
  snakeExplained: boolean;
}

export const INITIAL_PROGRESS: TutorialProgress = { welcomed: false, snakeExplained: false };

export interface TutorialFacts {
  league: League;
  /** The draft room shows an eligible selection. */
  hasSelection: boolean;
  /** The fade panel has a target chosen. */
  hasFadeTarget: boolean;
}

export function tutorialStep(progress: TutorialProgress, facts: TutorialFacts): TutorialStepId {
  const { draft, fades } = facts.league;
  if (draft.status === "complete") return "complete";
  if (draft.status === "fades") {
    if (fadeFor(fades, TUTORIAL_VIEWER_ID)) return "fade-sim";
    return facts.hasFadeTarget ? "confirm-fade" : "fades";
  }
  if (!progress.welcomed) return "welcome";
  if (picksForManager(draft, TUTORIAL_VIEWER_ID).length === 0) return facts.hasSelection ? "confirm-pick" : "over-under";
  return progress.snakeExplained ? "simulate" : "snake";
}

export const TUTORIAL_STEPS: Record<TutorialStepId, TutorialStep> = {
  welcome: {
    number: 1,
    advance: "continue",
    title: "Welcome to your draft",
    body: "Welcome to your draft! You'll compete with other managers to predict NBA teams' season win totals. Let's make your first pick.",
    spotlight: ["draft-status"],
    interactive: [],
    continueLabel: "Continue",
  },
  "over-under": {
    number: 2,
    advance: "action",
    title: "Over or Under",
    body: "Each NBA team has a projected win total called its line. Draft OVER if you think they'll finish above it, or UNDER if you think they'll finish below it. Choose any team and side!",
    details: {
      summary: "How lines work",
      items: [
        "Lines freeze when the draft starts and stay locked all season.",
        "Over 41.5 needs at least 42 wins. Under 41.5 needs 41 wins or fewer.",
        "Different managers can own opposite sides of the same team.",
        "You can't own both sides of one team.",
      ],
    },
    spotlight: ["available-picks"],
    interactive: ["available-picks"],
    pointAt: "side-button",
  },
  "confirm-pick": {
    number: 3,
    advance: "action",
    title: "Confirm your pick",
    body: "This is your pick! Check the team, direction, and locked win total. When you're ready, confirm it.",
    spotlight: ["selection-bar", "selection-panel"],
    interactive: ["selection-bar", "selection-panel", "available-picks"],
    pointAt: "confirm-pick",
  },
  snake: {
    number: 4,
    advance: "continue",
    title: "A snake draft",
    body: "Courtline uses a snake draft. Everyone picks once per round, but the order reverses each round. Your next pick comes after the other managers take their turns.",
    spotlight: ["draft-board"],
    interactive: ["draft-board"],
    continueLabel: "Watch the draft",
  },
  simulate: {
    number: 5,
    advance: "automatic",
    title: "The rest of the draft",
    body: "Let's fast-forward through the rest of the draft. We'll make the remaining picks for every manager, including you.",
    spotlight: ["draft-board", "draft-status"],
    interactive: ["draft-board"],
  },
  fades: {
    number: 6,
    advance: "action",
    title: "Time to fade",
    body: `Now it's time to fade! A fade is a bet against another manager's pick. If their pick misses, you earn ${SCORING.fadeHit} points. If it hits, you earn ${SCORING.fadeMiss}. Choose any eligible pick to fade.`,
    details: {
      summary: "Fade rules",
      items: [
        "You can't fade your own pick.",
        "Several managers can fade the same pick.",
        `A fade earns a flat +${SCORING.fadeHit} or ${SCORING.fadeMiss}, with no margin bonus.`,
        `If the faded pick pushes (wins land exactly on the line), the fade earns ${SCORING.fadeMiss}.`,
      ],
    },
    spotlight: ["fade-targets"],
    interactive: ["fade-targets"],
    pointAt: "fade-target",
  },
  "confirm-fade": {
    number: 7,
    advance: "action",
    title: "Confirm your fade",
    body: "You're betting that this manager's pick will be wrong. Confirm your fade to finish your draft!",
    spotlight: ["fade-bar", "fade-confirm"],
    interactive: ["fade-bar", "fade-confirm", "fade-targets"],
    pointAt: "confirm-fade",
  },
  "fade-sim": {
    number: 7,
    advance: "automatic",
    title: "The other fades",
    body: "Your fade is locked. The other managers are choosing theirs, in any order.",
    spotlight: ["fade-status"],
    interactive: [],
  },
  complete: {
    number: 8,
    advance: "end",
    title: "Draft complete",
    body: "Your draft is complete! You've built your roster and chosen a fade. Now let's see how those picks earn points throughout an NBA season.",
    spotlight: ["draft-status"],
    interactive: ["draft-status"],
  },
};
