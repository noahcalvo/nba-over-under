import { Badge } from "@/components/ui/Badge";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { formatGameDayLong, formatRecord, formatTimeCT } from "@/lib/format";
import type { NbaGame, NbaGameSide } from "@/lib/nba-schedule/types";
import type { TeamInfo } from "@/lib/types";

/** The status line. A scheduled game never shows ESPN's status text (it is Eastern); live games and finals show it ("Final", "Final/OT"). */
function Status({ game }: { game: NbaGame }) {
  switch (game.status) {
    case "scheduled":
      return <p className="text-lg font-semibold text-fog-50">{formatTimeCT(game.tipoff)}</p>;
    case "live":
      return <p className="text-lg font-semibold text-accent">Live · {game.statusDetail}</p>;
    case "final":
      return <p className="text-lg font-semibold text-fog-300">{game.statusDetail || "Final"}</p>;
    case "postponed":
      return <Badge tone="danger">Postponed</Badge>;
    case "canceled":
      return <Badge tone="danger">Canceled</Badge>;
  }
}

function GameInfo({ game }: { game: NbaGame }) {
  const details = [game.venue, game.broadcasts.length > 0 ? game.broadcasts.join(" · ") : null].filter(Boolean);
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <p className="text-sm text-fog-300">{formatGameDayLong(game.gameDay)}</p>
      <Status game={game} />
      {details.map((detail) => (
        <p key={detail} className="text-xs text-fog-400">
          {detail}
        </p>
      ))}
    </div>
  );
}

function TeamBlock({ side, team, showScore }: { side: NbaGameSide; team: TeamInfo | undefined; showScore: boolean }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
      {team ? <TeamLogo team={team} size={64} /> : <span className="size-16" />}
      <div className="min-w-0">
        {team && <p className="truncate text-sm text-fog-300">{team.city}</p>}
        <p className="truncate font-display text-xl font-bold text-fog-50 sm:text-2xl">
          {team?.name ?? side.teamId}
        </p>
        {team && <p className="text-sm text-fog-400 tabular-nums">{formatRecord(team.wins, team.losses)}</p>}
      </div>
      {showScore && side.score !== null && (
        <p className={`font-display text-4xl tabular-nums ${side.winner ? "font-bold text-fog-50" : "text-fog-300"}`}>{side.score}</p>
      )}
    </div>
  );
}

/** Away team left, "at", home team right. The date, time, status, venue and broadcasts sit between from `sm`, below the teams on a phone. */
export function GameHeader({ game, teams }: { game: NbaGame; teams: TeamInfo[] }) {
  const away = teams.find((t) => t.id === game.away.teamId);
  const home = teams.find((t) => t.id === game.home.teamId);
  const showScore = game.status === "live" || game.status === "final";
  return (
    <section aria-label="Matchup" className="rounded-xl border border-ink-700 bg-ink-850/90 px-4 py-6 sm:px-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 sm:gap-6">
        <TeamBlock side={game.away} team={away} showScore={showScore} />
        <div className="flex flex-col items-center gap-3">
          <span className="text-sm font-semibold uppercase tracking-[0.2em] text-fog-400">at</span>
          <div className="hidden sm:block">
            <GameInfo game={game} />
          </div>
        </div>
        <TeamBlock side={game.home} team={home} showScore={showScore} />
      </div>
      <div className="mt-5 border-t border-ink-700 pt-4 sm:hidden">
        <GameInfo game={game} />
      </div>
    </section>
  );
}
