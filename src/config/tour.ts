/** The guided draft demo: the fixture league's size (the default league size) and how fast simulated actions play. */
export const TUTORIAL = {
  managerCount: 4,
  rounds: 11,
  /** Delay between simulated picks while the user watches the rest of the draft. */
  pickIntervalMs: 160,
  /** Delay between the other managers' simulated fades. */
  fadeIntervalMs: 700,
} as const;

/** Guided-tour overlay layout, in CSS pixels. */
export const TOUR = {
  /** Space between a spotlight and its callout. */
  calloutGap: 14,
  /** The callout never comes closer than this to the viewport edge. */
  viewportMargin: 16,
  /** How far a spotlight extends past its element. */
  spotlightPadding: 8,
  pointerSize: 28,
  /** Space between the pointer arrow and the element it points at. */
  pointerGap: 6,
} as const;
