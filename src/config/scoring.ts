export interface ScoringConfig {
  /** Points for a call on the right side of the line. */
  correctCall: number;
  /** Points for a call on the wrong side of the line. */
  missedCall: number;
  /** Multiplier applied to each call's signed margin. */
  marginWeight: number;
  /** Bonus when a faded opponent pick misses. */
  fadeHit: number;
  /** Bonus when a faded opponent pick hits. */
  fadeMiss: number;
  /** Regular-season length, used for win pace and settlement. */
  seasonGames: number;
  /** Season award to the owner of the league's highest-scoring pick (every tied pick gets it). */
  bestPickAward: number;
  /** Season award to the owner of the league's lowest-scoring pick (every tied pick gets it). */
  worstPickAward: number;
}

export const SCORING: ScoringConfig = {
  correctCall: 1,
  missedCall: -1,
  marginWeight: 0.1,
  fadeHit: 2,
  fadeMiss: 0,
  seasonGames: 82,
  bestPickAward: 2,
  worstPickAward: -2,
};
