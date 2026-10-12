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

/** The guided demo's simulated season: where Midseason stops and how far teams stray from their lines. */
export const TUTORIAL_SEASON = {
  /** Games every team has played at the Midseason checkpoint. */
  midseasonGames: 41,
  /** Standard deviation, in wins over a full season, of a team's hidden strength around its line. */
  strengthSpreadWins: 6,
  /** A team's hidden strength never goes below or above these full-season win totals. */
  minStrengthWins: 12,
  maxStrengthWins: 70,
} as const;
