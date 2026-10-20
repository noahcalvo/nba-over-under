import { Suspense } from "react";
import { Panel } from "@/components/ui/Panel";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { NBA_SCHEDULE } from "@/config/schedule";
import { formatGameDayShort } from "@/lib/format";
import type { Game } from "@/lib/game-log/types";
import { gameDayOf } from "@/lib/nba-schedule/game-day";
import { teamForm, type TeamForm } from "@/lib/nba-schedule/form";
import type { TeamId, TeamInfo } from "@/lib/types";
import type { TeamForms } from "@/server/nba-schedule";

function Result({ game, teams }: { game: Game; teams: TeamInfo[] }) {
  const opponent = teams.find((t) => t.id === game.opponentId);
  const date = game.date && !Number.isNaN(Date.parse(game.date)) ? formatGameDayShort(gameDayOf(game.date)) : "—";
  return (
    <li className="flex items-center gap-3 px-4 py-2 text-sm sm:px-5">
      <span className="w-24 shrink-0 text-fog-300">{date}</span>
      <span className="flex min-w-0 flex-1 items-center gap-2 text-fog-50">
        <span className="w-4 shrink-0 text-fog-400">{game.home === null ? "" : game.home ? "vs" : "@"}</span>
        {opponent && <TeamLogo team={opponent} size={22} />}
        <span className="truncate font-semibold">{opponent?.id ?? game.opponentId ?? "—"}</span>
      </span>
      <span
        aria-label={game.result === "W" ? "Win" : "Loss"}
        className={`flex size-[18px] shrink-0 items-center justify-center rounded text-[10px] font-bold ${
          game.result === "W" ? "bg-positive/15 text-positive" : "bg-negative/15 text-negative"
        }`}
      >
        {game.result}
      </span>
    </li>
  );
}

function TeamList({ team, teams, form }: { team: TeamInfo | undefined; teams: TeamInfo[]; form: TeamForm }) {
  return (
    <div>
      <h3 className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-[0.2em] text-fog-400 sm:px-5">{team?.name}</h3>
      {form.kind !== "results" ? (
        <p className="px-4 py-2 text-sm text-fog-400 sm:px-5">{form.kind === "missing" ? "Recent games unavailable" : "No games yet"}</p>
      ) : (
        <ul>
          {[...form.results].reverse().map((game) => (
            <Result key={game.number} game={game} teams={teams} />
          ))}
        </ul>
      )}
    </div>
  );
}

async function Lists({ awayId, homeId, teams, forms }: { awayId: TeamId; homeId: TeamId; teams: TeamInfo[]; forms: Promise<TeamForms> }) {
  const { logs } = await forms;
  const last = (id: TeamId) => teamForm(logs[id], NBA_SCHEDULE.formGames);
  return (
    <div className="divide-y divide-ink-700 pb-2">
      <TeamList team={teams.find((t) => t.id === awayId)} teams={teams} form={last(awayId)} />
      <TeamList team={teams.find((t) => t.id === homeId)} teams={teams} form={last(homeId)} />
    </div>
  );
}

/** Each team's last five completed games, newest first. Waits for the game logs; a failed log only empties its own list. */
export function RecentGames(props: { awayId: TeamId; homeId: TeamId; teams: TeamInfo[]; forms: Promise<TeamForms> }) {
  return (
    <Panel title="Recent games">
      <Suspense fallback={<p className="px-4 py-4 text-sm text-fog-400 sm:px-5">Loading recent games…</p>}>
        <Lists {...props} />
      </Suspense>
    </Panel>
  );
}
