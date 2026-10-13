import { SCORING } from "@/config/scoring";
import { formatSigned } from "@/lib/format";
import type { TourStep } from "@/lib/tour/targets";
import { advanceCheckpointGames, checkpointGames, type SeasonCheckpoint } from "./season";
import type { SeasonStepId } from "./season-steps";

const BEST = formatSigned(SCORING.bestPickAward, 0);
const WORST = formatSigned(SCORING.worstPickAward, 0);

const awardRules = [
  "Picks are compared on their own scores, before any award points.",
  "Every tied pick earns the full award, and one manager can win both.",
  "Fades don't count toward the awards.",
] as const;

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

export interface SeasonTourStep extends TourStep {
  /** continue: a button; action: the user's own action (a page opening, a checkpoint advance); end: the last step. */
  advance: "continue" | "action" | "end";
}

const scoringRules = [
  `Correct pick: ${formatSigned(SCORING.correctCall, 0)} point.`,
  `Incorrect pick: ${formatSigned(SCORING.missedCall, 0)} point.`,
  `Each win beyond the line: ${formatSigned(SCORING.marginWeight)} on the correct side, ${formatSigned(-SCORING.marginWeight)} on the incorrect side.`,
  `Projected wins = wins ÷ games played × ${SCORING.seasonGames}.`,
] as const;

/** Shown with the final results only when the user's pick or faded pick pushed. */
export const PUSH_RULE = "If a team finishes exactly on its locked line, both the pick and any fades targeting it score 0.";

export const SEASON_STEPS: Record<SeasonStepId, SeasonTourStep> = {
  "draft-roster": {
    advance: "continue",
    title: "Your roster is set",
    body: "Here's your first pick and your fade. They score as their teams play, and the manager with the most points at the end wins the league.",
    spotlight: ["highlight-pick", "fades"],
    interactive: [],
    continueLabel: "Got it",
  },
  "draft-advance": {
    advance: "action",
    title: "Tip off the season",
    body: `Simulate the first ${advanceCheckpointGames("draft")} games for all 30 teams. These are made-up results, not real NBA games.`,
    spotlight: ["season-control"],
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
  "mid-chart": {
    advance: "continue",
    title: "Wins against the line",
    body: "The solid line is the team's actual wins. The dashed line is the pace it needs to beat its line, and the projected line is where it's heading at its current rate.",
    details: {
      summary: "Chart controls",
      items: [
        "Last 8 zooms in on recent games; Full season shows all 82.",
        "Games after the checkpoint haven't been played yet, so they have no result.",
        "The demo's games are simulated: no dates or opponents.",
      ],
    },
    spotlight: ["season-progress"],
    interactive: ["season-progress"],
    continueLabel: "See my points",
  },
  "mid-points": {
    advance: "continue",
    title: "Projected points",
    body: "Your pick scores by comparing the team's projected wins with its locked line. Here's the math:",
    details: { summary: "Scoring rules", items: [...scoringRules, "Projections change every game; only the final 82-game record counts."] },
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
    details: { summary: "Award rules", items: awardRules },
    spotlight: ["season-awards", "standings"],
    interactive: [],
    continueLabel: "Got it",
  },
  "mid-advance": {
    advance: "action",
    title: "Finish the season",
    body: `Simulate the remaining ${advanceCheckpointGames("midseason")} games. Final records replace the projections.`,
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
