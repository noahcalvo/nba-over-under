import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { InterestAvatars } from "@/components/nba/InterestAvatars";
import { OddsPair } from "@/components/nba/OddsPair";
import { formatRecord, formatTimeCT } from "@/lib/format";
import type { InterestSummary } from "@/lib/nba-schedule/interest";
import { oddsState } from "@/lib/nba-schedule/odds";
import type { NbaGame, NbaGameSide } from "@/lib/nba-schedule/types";
import type { TeamInfo } from "@/lib/types";

/** The time cell. A scheduled game never shows ESPN's status text (it is Eastern); live games and finals show it ("Final", "Final/OT"). */
function StatusCell({ game }: { game: NbaGame }) {
  switch (game.status) {
    case "scheduled":
      return <span className="font-semibold text-fog-50">{formatTimeCT(game.tipoff)}</span>;
    case "live":
      return <span className="font-semibold text-accent">Live · {game.statusDetail}</span>;
    case "final":
      return <span className="font-semibold text-fog-300">{game.statusDetail || "Final"}</span>;
    case "postponed":
      return <Badge tone="danger">Postponed</Badge>;
    case "canceled":
      return <Badge tone="danger">Canceled</Badge>;
  }
}

function TeamLine({ side, team, showScore }: { side: NbaGameSide; team: TeamInfo | undefined; showScore: boolean }) {
  return (
    <div className="flex h-8 min-w-0 items-center gap-2.5">
      {team ? <TeamLogo team={team} size={28} /> : <span className="size-7 shrink-0" />}
      <span className={`truncate ${side.winner ? "font-bold text-fog-50" : "text-fog-50"}`}>{team?.name ?? side.teamId}</span>
      {team && <span className="shrink-0 text-xs text-fog-400 tabular-nums">{formatRecord(team.wins, team.losses)}</span>}
      {showScore && side.score !== null && (
        <span className={`ml-auto shrink-0 pl-2 tabular-nums ${side.winner ? "font-bold text-fog-50" : "text-fog-300"}`}>
          {side.score}
          {side.winner && <span className="sr-only"> (winner)</span>}
        </span>
      )}
    </div>
  );
}

/** One game: a single link to its page. The viewer's games get an accent edge and a "You" badge. */
export function GameRow({
  game,
  teams,
  summary,
  hasStakes,
  day,
}: {
  game: NbaGame;
  teams: TeamInfo[];
  summary: InterestSummary | undefined;
  hasStakes: boolean;
  day: string;
}) {
  const away = teams.find((t) => t.id === game.away.teamId);
  const home = teams.find((t) => t.id === game.home.teamId);
  const odds = oddsState(game);
  const you = hasStakes && summary?.viewerInvolved === true;
  return (
    <Link
      href={`/nba/games/${game.id}?date=${day}`}
      className={`@container block border-l-2 px-4 py-3.5 transition-colors hover:bg-ink-800/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent sm:px-5 ${
        you ? "border-accent" : "border-transparent"
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="order-1 flex min-w-0 flex-1 items-center gap-2 text-sm @lg:w-28 @lg:flex-none @lg:flex-col @lg:items-start @lg:gap-1.5">
          <StatusCell game={game} />
          {you && <Badge tone="accent">You</Badge>}
        </div>
        <div className="order-3 grid w-full min-w-0 grid-flow-col grid-cols-[minmax(0,1fr)_auto] grid-rows-2 gap-x-4 gap-y-1.5 @lg:order-2 @lg:w-auto @lg:flex-1">
          <TeamLine side={game.away} team={away} showScore={game.status !== "scheduled"} />
          <TeamLine side={game.home} team={home} showScore={game.status !== "scheduled"} />
          {odds === "open" && game.odds && <OddsPair game={game} odds={game.odds} />}
          {odds === "unavailable" && <span className="row-span-2 self-center text-xs text-fog-400">Odds unavailable</span>}
        </div>
        {hasStakes && summary && <InterestAvatars summary={summary} className="order-2 @lg:order-3" />}
      </div>
    </Link>
  );
}
