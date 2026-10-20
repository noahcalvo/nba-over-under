import type { GameOdds, NbaGame } from "@/lib/nba-schedule/types";

const MINUS = "−";

/** The explanation shown wherever a win chance appears. */
export const WIN_CHANCE_TOOLTIP = "Estimated win chance from both moneylines, with sportsbook margin removed.";
const AMERICAN_PATTERN = /^[+-]?\d+$/;

function isAmerican(value: number): boolean {
  return Number.isInteger(value) && Math.abs(value) >= 100;
}

/** An American moneyline from ESPN ("+120", "-142", "EVEN" as +100) or an integer; anything else is null. */
export function parseAmerican(value: unknown): number | null {
  if (value === "EVEN") return 100;
  if (typeof value === "string") {
    if (!AMERICAN_PATTERN.test(value)) return null;
    const n = Number(value);
    return isAmerican(n) ? n : null;
  }
  if (typeof value === "number" && isAmerican(value)) return value;
  return null;
}

/** The implied probability of an American moneyline, margin included (0–1). */
export function rawProbability(american: number): number {
  if (!Number.isFinite(american) || Math.abs(american) < 100) throw new Error("Invalid moneyline");
  const size = Math.abs(american);
  return american > 0 ? 100 / (size + 100) : size / (size + 100);
}

/**
 * Each side's win chance in whole percentages, with the sportsbook margin removed. The two sides are normalised
 * to sum to 100, then rounded by largest remainder; an equal remainder goes to the home side.
 */
export function winChances(odds: Pick<GameOdds, "away" | "home">): { away: number; home: number } {
  const qa = rawProbability(odds.away);
  const qh = rawProbability(odds.home);
  const total = qa + qh;
  const awayShare = (qa / total) * 100;
  const homeShare = (qh / total) * 100;
  const awayFloor = Math.floor(awayShare);
  const homeFloor = Math.floor(homeShare);
  const spare = 100 - awayFloor - homeFloor;
  const awayGetsSpare = awayShare - awayFloor > homeShare - homeFloor;
  return {
    away: awayFloor + (awayGetsSpare ? spare : 0),
    home: homeFloor + (awayGetsSpare ? 0 : spare),
  };
}

/** The side with the higher win chance, or null when the chances are level. */
export function favorite(chances: { away: number; home: number }): "away" | "home" | null {
  if (chances.away === chances.home) return null;
  return chances.away > chances.home ? "away" : "home";
}

/**
 * Whether a game's moneyline can be shown: "open" (scheduled with odds), "unavailable" (scheduled, no odds),
 * "closed" (live or final, odds shown as closed at tip-off) or "none" (postponed or canceled).
 */
export function oddsState(game: Pick<NbaGame, "status" | "odds">): "open" | "unavailable" | "closed" | "none" {
  switch (game.status) {
    case "scheduled":
      return game.odds ? "open" : "unavailable";
    case "live":
    case "final":
      return "closed";
    case "postponed":
    case "canceled":
      return "none";
  }
}

/** "+130" or "−155" (U+2212 minus, as elsewhere in the app). */
export function formatAmerican(n: number): string {
  return n > 0 ? `+${n}` : `${MINUS}${Math.abs(n)}`;
}
