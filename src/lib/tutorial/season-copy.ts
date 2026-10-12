import { SCORING } from "@/config/scoring";
import { formatNumber, formatSigned } from "@/lib/format";
import type { TourStep } from "@/lib/tour/targets";
import { advanceCheckpointGames, type SeasonCheckpoint } from "./season";
import type { SeasonStepId } from "./season-steps";

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
    title: "Your draft is complete",
    body: "Here's your first pick and your fade. Your picks gain or lose points as their teams play, and your fade can earn bonus points.",
    spotlight: ["highlight-pick", "fades"],
    interactive: [],
    continueLabel: "Continue",
  },
  "draft-standings": {
    advance: "continue",
    title: "The standings",
    body: "Managers compete to earn the most total points: every pick on their roster plus their fade. No games have been played yet, so nobody has points and there's no ranking.",
    spotlight: ["standings"],
    interactive: [],
    continueLabel: "Continue",
  },
  "draft-advance": {
    advance: "action",
    title: "Tip off the season",
    body: `We'll simulate the first ${advanceCheckpointGames("draft")} games for all 30 NBA teams. These are made-up demo results, not real NBA games.`,
    spotlight: ["season-control"],
    interactive: ["season-control"],
    pointAt: "season-advance",
  },
  "mid-pick": {
    advance: "action",
    title: "Midseason",
    body: "We're halfway through the season! Your picks are earning projected points based on how their teams are performing. Let's take a closer look at one of your teams: open your first pick's team.",
    spotlight: ["highlight-pick"],
    interactive: ["highlight-pick-team"],
    pointAt: "highlight-pick-team",
  },
  "mid-chart": {
    advance: "continue",
    title: "Season trajectory",
    body: "This chart shows your team's journey so far. The solid line tracks actual wins, the dashed line shows the pace needed to reach the betting line, and the projected line shows where the team is heading if it maintains its current winning rate.",
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
    continueLabel: "Continue",
  },
  "mid-points": {
    advance: "continue",
    title: "Projected points",
    body: "Your pick earns points by comparing the team's projected wins with the locked line. Here's your pick in numbers:",
    details: { summary: "Scoring rules", items: [...scoringRules, "Projections change every game; only the final 82-game record counts."] },
    spotlight: ["team-stats", "my-side"],
    interactive: [],
    continueLabel: "Continue",
  },
  "mid-back": {
    advance: "action",
    title: "Back to the league",
    body: "Now let's see how your whole roster adds up. Go back to the League overview.",
    spotlight: ["nav-overview"],
    interactive: ["nav-overview"],
    pointAt: "nav-overview",
  },
  "mid-standings": {
    advance: "continue",
    title: "Projected standings",
    body: `Standings add up the projected points of every pick on a roster plus that manager's projected fade. A fade earns ${formatSigned(SCORING.fadeHit, 0)} if the pick it targets misses and ${formatNumber(SCORING.fadeMiss, 0)} if it hits, with no margin points. These results can still change before the season ends.`,
    spotlight: ["standings", "fades"],
    interactive: [],
    continueLabel: "Continue",
  },
  "mid-advance": {
    advance: "action",
    title: "Finish the season",
    body: `We'll simulate the remaining ${advanceCheckpointGames("midseason")} games for every team. Final records replace the projections.`,
    spotlight: ["season-control"],
    interactive: ["season-control"],
    pointAt: "season-advance",
  },
  "final-standings": {
    advance: "continue",
    title: "Final standings",
    body: "The season is over! All 82 games have been played, and your picks have received their final scores. The manager with the most points wins the league!",
    spotlight: ["standings"],
    interactive: [],
    continueLabel: "Continue",
  },
  "final-results": {
    advance: "continue",
    title: "Your results",
    body: "Here's how your first pick and your fade finished:",
    spotlight: ["highlight-pick", "fades"],
    interactive: [],
    continueLabel: "Continue",
  },
  "final-finish": {
    advance: "end",
    title: "That's a Courtline season",
    body: "You drafted, faded, and followed your picks from projections to final scores. Explore this league, replay the demo, or start a real league with friends.",
    spotlight: [],
    interactive: [],
  },
};

/** The callout's eyebrow: the checkpoint, without a step count. */
export function seasonStepLabel(checkpoint: SeasonCheckpoint): string {
  return CHECKPOINT_LABELS[checkpoint];
}
