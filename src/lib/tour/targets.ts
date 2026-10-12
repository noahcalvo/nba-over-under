// Stable names for the parts of the app a guided tour can spotlight. Components tag their root element with
// tourTarget(id); the overlay finds them by that attribute. Ids name what the area is, never how it is styled.

export const TOUR_TARGET_IDS = [
  "draft-status",
  "available-picks",
  "side-button",
  "selection-panel",
  "selection-bar",
  "confirm-pick",
  "draft-board",
  "fade-targets",
  "fade-target",
  "fade-confirm",
  "fade-bar",
  "confirm-fade",
  "fade-status",
] as const;

export type TourTargetId = (typeof TOUR_TARGET_IDS)[number];

export function tourTarget(id: TourTargetId): { "data-tour": TourTargetId } {
  return { "data-tour": id };
}

/** One step of a guided tour. */
export interface TourStep {
  title: string;
  /** The short explanation. */
  body: string;
  /** More rules, folded away so they never block the step. */
  details?: { summary: string; items: readonly string[] };
  /** Areas lit up, in priority order: the first one on screen anchors the callout. */
  spotlight: readonly TourTargetId[];
  /** Areas the user may use. Everything else ignores pointer and keyboard input while the step is shown. */
  interactive: readonly TourTargetId[];
  /** Where the animated arrow points: the first matching element on screen. */
  pointAt?: TourTargetId;
  /** Informational steps advance with this button; action steps have none. */
  continueLabel?: string;
}
