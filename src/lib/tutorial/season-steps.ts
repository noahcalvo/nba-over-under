import type { TeamId } from "@/lib/types";
import { nextCheckpoint, SEASON_CHECKPOINTS, type SeasonCheckpoint } from "./season";

// The guided season. Like the guided draft, the step is derived, never scripted: from the checkpoint, the
// informational steps already continued past, and the page the user is on. So the required team-name click is
// recognised by the team page it opens, the way back by the overview opening, and a reload or browser navigation
// lands on the right step (or on a "continue on …" callout when the user is elsewhere).

export type SeasonStepId =
  | "draft-roster"
  | "draft-standings"
  | "draft-awards"
  | "draft-advance"
  | "mid-pick"
  | "mid-chart"
  | "mid-points"
  | "mid-back"
  | "mid-standings"
  | "mid-awards"
  | "mid-advance"
  | "final-standings"
  | "final-awards"
  | "final-results"
  | "final-finish";

export const SEASON_STEP_ORDER: Readonly<Record<SeasonCheckpoint, readonly SeasonStepId[]>> = {
  draft: ["draft-roster", "draft-standings", "draft-awards", "draft-advance"],
  midseason: ["mid-pick", "mid-chart", "mid-points", "mid-back", "mid-standings", "mid-awards", "mid-advance"],
  final: ["final-standings", "final-awards", "final-results", "final-finish"],
};

const STEP_IDS: ReadonlySet<string> = new Set(Object.values(SEASON_STEP_ORDER).flat());

export interface SeasonProgress {
  checkpoint: SeasonCheckpoint;
  /** Steps continued past (informational steps, and "final-finish" once the user explores the results). */
  seen: readonly SeasonStepId[];
}

export const INITIAL_SEASON_PROGRESS: SeasonProgress = { checkpoint: "draft", seen: [] };

/** Where the user is in the demo league. */
export type SeasonLocation = { page: "overview" } | { page: "rosters" } | { page: "team"; teamId: TeamId };

export interface SeasonStepState {
  id: SeasonStepId;
  /** Where the step happens. */
  page: SeasonLocation;
  /** False when the user is somewhere else: the tour then offers a way to the step's page. */
  onPage: boolean;
}

const OVERVIEW: SeasonLocation = { page: "overview" };

function samePlace(a: SeasonLocation, b: SeasonLocation): boolean {
  return a.page === b.page && (a.page !== "team" || (b.page === "team" && a.teamId === b.teamId));
}

/** The step to show, or null once the user chose to explore the final results. */
export function seasonStep(
  progress: SeasonProgress,
  location: SeasonLocation,
  openingTeamId: TeamId,
): SeasonStepState | null {
  const seen = new Set(progress.seen);
  const firstUnseen = (ids: readonly SeasonStepId[]) => ids.find((step) => !seen.has(step)) ?? ids[ids.length - 1];
  const step = (id: SeasonStepId, page: SeasonLocation): SeasonStepState => ({
    id,
    page,
    onPage: samePlace(page, location),
  });

  switch (progress.checkpoint) {
    case "draft":
      return step(firstUnseen(SEASON_STEP_ORDER.draft), OVERVIEW);
    case "midseason": {
      if (!seen.has("mid-points")) {
        const team: SeasonLocation = { page: "team", teamId: openingTeamId };
        return samePlace(team, location)
          ? step(seen.has("mid-chart") ? "mid-points" : "mid-chart", team)
          : step("mid-pick", OVERVIEW);
      }
      if (location.page === "team") return step("mid-back", location);
      return step(firstUnseen(["mid-standings", "mid-awards", "mid-advance"]), OVERVIEW);
    }
    case "final":
      return seen.has("final-finish") ? null : step(firstUnseen(SEASON_STEP_ORDER.final), OVERVIEW);
  }
}

export function markSeen(progress: SeasonProgress, id: SeasonStepId): SeasonProgress {
  return progress.seen.includes(id) ? progress : { ...progress, seen: [...progress.seen, id] };
}

/** The next checkpoint; the same progress at the last one. */
export function advanceCheckpoint(progress: SeasonProgress): SeasonProgress {
  const next = nextCheckpoint(progress.checkpoint);
  return next ? { ...progress, checkpoint: next } : progress;
}

/** Stored progress, or null when it isn't any. Unknown step ids are dropped. */
export function parseSeasonProgress(raw: unknown): SeasonProgress | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { checkpoint, seen } = raw as Record<string, unknown>;
  if (!SEASON_CHECKPOINTS.includes(checkpoint as SeasonCheckpoint)) return null;
  if (!Array.isArray(seen) || !seen.every((id) => typeof id === "string")) return null;
  return {
    checkpoint: checkpoint as SeasonCheckpoint,
    seen: seen.filter((id): id is SeasonStepId => STEP_IDS.has(id)),
  };
}
