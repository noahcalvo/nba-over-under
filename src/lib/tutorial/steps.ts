import { SCORING } from "@/config/scoring";
import { TUTORIAL_VIEWER_ID } from "@/data/tutorial-league";
import { picksForManager } from "@/lib/draft";
import { fadeFor } from "@/lib/fades";
import { formatNumber, formatSigned } from "@/lib/format";
import type { TourStep } from "@/lib/tour/targets";
import type { League } from "@/lib/types";

// The guided draft. The step shown is derived from the demo league itself (a selection, a confirmed pick, a locked
// fade), so it only ever moves on a real state change and going back (clearing a selection) needs no special
// handling. No step waits on a Continue button: the user's own actions and the simulations move it along.

export type TutorialStepId =
  | "over-under"
  | "confirm-pick"
  | "simulate"
  | "fades"
  | "confirm-fade"
  | "fade-sim"
  | "complete";

export const TUTORIAL_STEP_ORDER: readonly TutorialStepId[] = [
  "over-under",
  "confirm-pick",
  "simulate",
  "fades",
  "confirm-fade",
  "fade-sim",
  "complete",
];

/** Steps as the user counts them; the other managers' fades are part of step 5. */
export const TUTORIAL_STEP_COUNT = 6;

export interface TutorialStep extends TourStep {
  number: number;
  /** action: the user's own successful action; automatic: simulation; end: the last step. */
  advance: "action" | "automatic" | "end";
}

export interface TutorialFacts {
  league: League;
  /** The draft room shows an eligible selection. */
  hasSelection: boolean;
  /** The fade panel has a target chosen. */
  hasFadeTarget: boolean;
}

export function tutorialStep(facts: TutorialFacts): TutorialStepId {
  const { draft, fades } = facts.league;
  if (draft.status === "complete") return "complete";
  if (draft.status === "fades") {
    if (fadeFor(fades, TUTORIAL_VIEWER_ID)) return "fade-sim";
    return facts.hasFadeTarget ? "confirm-fade" : "fades";
  }
  if (picksForManager(draft, TUTORIAL_VIEWER_ID).length === 0) return facts.hasSelection ? "confirm-pick" : "over-under";
  return "simulate";
}

const FADE_HIT = formatSigned(SCORING.fadeHit, 0);
const FADE_MISS = formatNumber(SCORING.fadeMiss, 0);

export const TUTORIAL_STEPS: Record<TutorialStepId, TutorialStep> = {
  "over-under": {
    number: 1,
    advance: "action",
    title: "Make your first pick",
    body: "Every NBA team has a line: its projected win total. Choose Over if you think a team will win more games than that, or Under if fewer.",
    details: {
      summary: "How lines work",
      items: [
        "Lines lock when the draft starts.",
        "Over 41.5 needs 42 wins or more. Under 41.5 needs 41 or fewer.",
        "Another manager can take the other side of a team you own.",
        "You can't own both sides of one team.",
      ],
    },
    spotlight: ["available-picks"],
    interactive: ["available-picks"],
    pointAt: "side-button",
  },
  "confirm-pick": {
    number: 2,
    advance: "action",
    title: "Lock it in",
    body: "Check the team, side and line, then confirm. Changed your mind? Choose another side first.",
    spotlight: ["selection-bar", "selection-panel"],
    interactive: ["selection-bar", "selection-panel", "available-picks"],
    pointAt: "confirm-pick",
  },
  simulate: {
    number: 3,
    advance: "automatic",
    title: "A snake draft",
    body: "The pick order reverses every round, so the last pick of one round is the first of the next. We'll make the rest of the picks for everyone, you included.",
    spotlight: ["draft-board", "draft-status"],
    interactive: ["draft-board"],
  },
  fades: {
    number: 4,
    advance: "action",
    title: "Fade a rival's pick",
    body: `A fade is a bet that another manager's pick will miss. If it misses, you earn ${FADE_HIT}; if it hits, ${FADE_MISS}. Choose a pick to fade.`,
    details: {
      summary: "Fade rules",
      items: [
        "Several managers can fade the same pick.",
        `A fade is always ${FADE_HIT} or ${FADE_MISS}, however close the team finishes to its line.`,
        `If the team lands exactly on its line, the fade earns ${FADE_MISS}.`,
      ],
    },
    spotlight: ["fade-targets"],
    interactive: ["fade-targets"],
    pointAt: "fade-target",
  },
  "confirm-fade": {
    number: 5,
    advance: "action",
    title: "Lock in your fade",
    body: "You're betting this pick misses. Confirm to finish your draft.",
    spotlight: ["fade-bar", "fade-confirm"],
    interactive: ["fade-bar", "fade-confirm", "fade-targets"],
    pointAt: "confirm-fade",
  },
  "fade-sim": {
    number: 5,
    advance: "automatic",
    title: "Everyone fades",
    body: "Your fade is locked. Now the other managers choose theirs.",
    spotlight: ["fade-status"],
    interactive: [],
  },
  complete: {
    number: 6,
    advance: "end",
    title: "Draft complete",
    body: "Every pick and fade is locked. Next, play out a simulated season and watch your picks score.",
    spotlight: ["draft-status", "fade-status"],
    interactive: ["draft-status"],
  },
};
