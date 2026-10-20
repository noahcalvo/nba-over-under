import { NBA_SCHEDULE } from "@/config/schedule";
import type { Game } from "@/lib/game-log/types";
import { recentResults } from "@/lib/nba-schedule/form";
import type { TeamId } from "@/lib/types";
import type { TeamForms } from "@/server/nba-schedule";
import { HeatBadge } from "./HeatBadge";

/** The last five results, oldest first, as W / L chips (the letter carries the meaning, the tint only backs it up). */
export function FormChips({ results }: { results: readonly Game[] }) {
  return (
    <span className="flex gap-0.5" role="img" aria-label={`Last ${results.length}: ${results.map((g) => g.result).join(" ")}`}>
      {results.map((game) => (
        <span
          key={game.number}
          aria-hidden
          className={`flex size-[18px] items-center justify-center rounded text-[10px] font-bold ${
            game.result === "W" ? "bg-positive/15 text-positive" : "bg-negative/15 text-negative"
          }`}
        >
          {game.result}
        </span>
      ))}
    </span>
  );
}

/** One team's form cell. Waits for the game logs; "—" when this team has none. */
export async function TeamFormCell({ forms, teamId }: { forms: Promise<TeamForms>; teamId: TeamId }) {
  const log = (await forms).logs[teamId];
  const results = log ? recentResults(log, NBA_SCHEDULE.formGames) : [];
  if (results.length === 0) return <span className="text-fog-400">—</span>;
  return (
    <span className="flex items-center gap-1">
      <FormChips results={results} />
      <HeatBadge results={results} />
    </span>
  );
}

/** One note under the table when the game logs could not all be read. */
export async function FormsNote({ forms }: { forms: Promise<TeamForms> }) {
  if (!(await forms).error) return null;
  return <p className="px-4 py-3 text-sm text-fog-400 sm:px-5">Form unavailable</p>;
}
