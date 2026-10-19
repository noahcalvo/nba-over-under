import { formatAmerican, favorite, winChances } from "@/lib/nba-schedule/odds";
import type { GameOdds, NbaGame } from "@/lib/nba-schedule/types";

const TOOLTIP = "Estimated win chance from both moneylines, with sportsbook margin removed.";

/**
 * Both moneylines, one pill per team in the order the teams are listed (away, home): "ORL −142 (57%)". Returns the two
 * pills without a wrapper, so they sit in the row grid beside the team lines.
 */
export function OddsPair({ game, odds }: { game: Pick<NbaGame, "away" | "home">; odds: GameOdds }) {
  const chances = winChances(odds);
  const lead = favorite(chances);
  const lines = [
    { side: "away" as const, id: game.away.teamId, price: odds.away, chance: chances.away },
    { side: "home" as const, id: game.home.teamId, price: odds.home, chance: chances.home },
  ];
  return (
    <>
      {lines.map((line) => (
        <span
          key={line.side}
          title={TOOLTIP}
          className={`flex h-8 items-center whitespace-nowrap rounded-md bg-ink-800 px-2.5 text-sm tabular-nums ${
            lead === line.side ? "font-semibold text-fog-50" : "text-fog-300"
          }`}
        >
          {line.id} {formatAmerican(line.price)} ({line.chance}%)
        </span>
      ))}
    </>
  );
}
