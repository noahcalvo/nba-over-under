import { SCORING } from "@/config/scoring";
import { formatSigned } from "@/lib/format";
import type { TourStep } from "@/lib/tour/targets";
import { advanceCheckpointGames, checkpointGames, type SeasonCheckpoint } from "./season";
import type { SeasonStepId } from "./season-steps";

const BEST = formatSigned(SCORING.bestPickAward, 0);
const WORST = formatSigned(SCORING.worstPickAward, 0);

// The guided season's words and spotlights. The user's own numbers (breakdowns, fade, standings) are added under the
// text by the overlay from season-story.ts; this copy stays the same for every draft.

export const CHECKPOINT_LABELS: Record<SeasonCheckpoint, string> = {
  draft: "Draft complete",
  midseason: "Midseason",
  final: "Final results",
};

/** The demo control's one action at each checkpoint (none at the last). */
export const ADVANCE_LABELS: Record<SeasonCheckpoint, string | null> = {
  draft: "Advance to Midseason",
  midseason: "Finish the Season",
  final: null,
};

/** Shown, a few in turn, while an advance plays its games. */
export const PLAYING_LINES = [
  "Playing basketball…",
  "Behind-the-back hesis…",
  "Punch step-backs…",
  "Chase-down blocks…",
  "Lobs off the backboard…",
  "Arguing with the refs…",
  "Crashing the offensive glass…",
  "Bricking free throws…",
] as const;

/** Lines shown during one advance; each gets an equal share of it. */
export const PLAYING_LINES_PER_ADVANCE = 3;

/** The line to show `fraction` of the way through an advance that started on line `start`. */
export function playingLine(start: number, fraction: number): string {
  const step = Math.min(Math.floor(fraction * PLAYING_LINES_PER_ADVANCE), PLAYING_LINES_PER_ADVANCE - 1);
  return PLAYING_LINES[(start + step) % PLAYING_LINES.length];
}

export interface SeasonTourStep extends TourStep {
  /** continue: a button; action: the user's own action (a page opening, a checkpoint advance); end: the last step. */
  advance: "continue" | "action" | "end";
}

const scoringRules = [
  `Correct pick: ${formatSigned(SCORING.correctCall, 0)} point.`,
  `Incorrect pick: ${formatSigned(SCORING.missedCall, 0)} point.`,
  `Each win beyond the line: ${formatSigned(SCORING.marginWeight)} on the correct side, ${formatSigned(-SCORING.marginWeight)} on the incorrect side.`,
  `Only the final ${SCORING.seasonGames}-game record counts; projections move every game.`,
] as const;

/** Shown with the final results only when the user's pick or faded pick pushed. */
export const PUSH_RULE = "If a team finishes exactly on its locked line, both the pick and any fades targeting it score 0.";

export const SEASON_STEPS: Record<SeasonStepId, SeasonTourStep> = {
  "draft-advance": {
    advance: "action",
    title: "Tip off the season",
    body: `Your picks and fade score as their teams play, and the most points wins. Play the first ${advanceCheckpointGames("draft")} games to see how you're doing.`,
    spotlight: ["season-control", "highlight-pick"],
    interactive: ["season-control"],
    pointAt: "season-advance",
  },
  "mid-pick": {
    advance: "action",
    title: "Check on your pick",
    body: `${checkpointGames("midseason")} games in, every pick has projected points. Open your first pick's team to see how it's doing.`,
    spotlight: ["highlight-pick"],
    interactive: ["highlight-pick-team"],
    pointAt: "highlight-pick-team",
  },
  "mid-points": {
    advance: "continue",
    title: "Projected points",
    body: "Your pick scores by comparing the team's projected wins with its locked line. Here's the math:",
    details: { summary: "Scoring rules", items: scoringRules },
    spotlight: ["team-stats", "my-side"],
    interactive: [],
    continueLabel: "Got it",
  },
  "mid-back": {
    advance: "action",
    title: "Back to the league",
    body: "Now see how your whole roster adds up. Open the League overview.",
    spotlight: ["nav-overview"],
    interactive: ["nav-overview"],
    pointAt: "nav-overview",
  },
  "mid-standings": {
    advance: "continue",
    title: "Projected standings",
    body: "Your total adds up every pick's projected points, your fade and any season awards. It moves with every game until the season ends.",
    spotlight: ["standings", "fades"],
    interactive: [],
    continueLabel: "See the awards",
  },
  "mid-awards": {
    advance: "continue",
    title: "Season awards",
    body: `The league's best single pick earns its owner ${BEST} (Best Pick) and the worst costs its owner ${WORST} (Worst Pick). These are the leaders so far, and they can still change.`,
    spotlight: ["season-awards", "standings"],
    interactive: [],
    continueLabel: "Got it",
  },
  "mid-advance": {
    advance: "action",
    title: "Finish the season",
    body: `Play the remaining ${advanceCheckpointGames("midseason")} games. Final records replace the projections.`,
    spotlight: ["season-control"],
    interactive: ["season-control"],
    pointAt: "season-advance",
  },
  "final-results": {
    advance: "continue",
    title: "Your results",
    body: `All ${SCORING.seasonGames} games are in. Here's how your first pick and your fade finished:`,
    spotlight: ["highlight-pick", "fades"],
    interactive: [],
    continueLabel: "See the awards",
  },
  "final-awards": {
    advance: "continue",
    title: "Award winners",
    body: "Final records decide the awards. Here's who won them and what they did to the standings:",
    spotlight: ["season-awards", "standings"],
    interactive: [],
    continueLabel: "See who won",
  },
  "final-finish": {
    advance: "end",
    title: "Final standings",
    body: "That's a Courtline season. Here's who won:",
    spotlight: ["standings"],
    interactive: [],
  },
};

/** The callout's eyebrow: the checkpoint, without a step count. */
export function seasonStepLabel(checkpoint: SeasonCheckpoint): string {
  return CHECKPOINT_LABELS[checkpoint];
}
