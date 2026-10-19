import { Info } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { formatTimeCT } from "@/lib/format";
import { favorite, formatAmerican, oddsState, winChances, WIN_CHANCE_TOOLTIP } from "@/lib/nba-schedule/odds";
import type { NbaGame } from "@/lib/nba-schedule/types";
import type { TeamInfo } from "@/lib/types";

function InfoTip() {
  return (
    <span title={WIN_CHANCE_TOOLTIP} className="inline-flex cursor-help text-fog-400">
      <Info aria-hidden className="size-4" />
      <span className="sr-only">{WIN_CHANCE_TOOLTIP}</span>
    </span>
  );
}

function Tile({ team, id, price, chance, leading }: { team: TeamInfo | undefined; id: string; price: number; chance: number; leading: boolean }) {
  return (
    <div
      title={WIN_CHANCE_TOOLTIP}
      className={`flex min-w-0 items-center gap-3 rounded-lg border-2 bg-ink-900 px-4 py-3 ${leading ? "border-accent" : "border-ink-700"}`}
    >
      {team && <TeamLogo team={team} size={36} />}
      <div className="min-w-0">
        <p className="truncate text-sm text-fog-300">{team?.name ?? id}</p>
        <p className="text-lg font-semibold text-fog-50 tabular-nums">
          {formatAmerican(price)} <span className="text-fog-300">({chance}%)</span>
        </p>
      </div>
    </div>
  );
}

/** The moneyline as win chances for a scheduled game. Hidden for postponed and canceled games. */
export function OddsPanel({ game, teams, source, readAt }: { game: NbaGame; teams: TeamInfo[]; source: string; readAt: string }) {
  const state = oddsState(game);
  if (state === "none") return null;
  const title = (
    <>
      Moneyline · win chance
      {state === "open" && <InfoTip />}
    </>
  );
  if (state !== "open" || !game.odds) {
    return (
      <Panel title="Moneyline · win chance">
        <p className="px-4 py-4 text-sm text-fog-300 sm:px-5">{state === "closed" ? "Odds closed at tip-off" : "Odds unavailable"}</p>
      </Panel>
    );
  }
  const chances = winChances(game.odds);
  const lead = favorite(chances);
  return (
    <Panel title={title}>
      <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
        <Tile team={teams.find((t) => t.id === game.away.teamId)} id={game.away.teamId} price={game.odds.away} chance={chances.away} leading={lead === "away"} />
        <Tile team={teams.find((t) => t.id === game.home.teamId)} id={game.home.teamId} price={game.odds.home} chance={chances.home} leading={lead === "home"} />
      </div>
      <p className="border-t border-ink-700 px-4 py-3 text-xs text-fog-400 sm:px-5">
        {game.odds.book} via {source} · read {formatTimeCT(readAt)}
      </p>
    </Panel>
  );
}
