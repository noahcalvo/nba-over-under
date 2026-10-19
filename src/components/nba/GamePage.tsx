import Link from "next/link";
import { Suspense } from "react";
import { GameHeader } from "@/components/nba/GameHeader";
import { OddsPanel } from "@/components/nba/OddsPanel";
import { RecentGames } from "@/components/nba/RecentGames";
import { TeamContext } from "@/components/nba/TeamContext";
import { WhoIsOnPanel } from "@/components/nba/WhoIsOnPanel";
import { Alert } from "@/components/ui/Alert";
import { PageFallback } from "@/components/ui/PageFallback";
import type { GamePageData } from "@/server/nba-pages";

function BackLink({ day }: { day: string }) {
  return (
    <Link
      href={`/nba?date=${day}`}
      className="w-fit text-sm font-semibold text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      ← Back to schedule
    </Link>
  );
}

/** A game that could not be read (not an unknown game: that is a 404). */
export function GameError({ message, backDay }: { message: string; backDay: string }) {
  return (
    <div className="flex flex-col gap-4">
      <BackLink day={backDay} />
      <h1 className="font-display text-3xl font-bold text-fog-50">Couldn&apos;t load this game</h1>
      <Alert>{message}</Alert>
    </div>
  );
}

/** The game: matchup, moneyline, who is on it, then each team's context. The viewer's stakes and the forms stream in. */
export function GamePage({ data }: { data: GamePageData }) {
  const { game, teams, forms, stakes } = data;
  const awayId = game.away.teamId;
  const homeId = game.home.teamId;
  return (
    <div className="flex flex-col gap-5">
      <BackLink day={data.backDay} />
      <h1 className="sr-only">
        {awayId} at {homeId}
      </h1>
      <GameHeader game={game} teams={teams} />
      <OddsPanel game={game} teams={teams} source={data.source} readAt={data.readAt} />
      <div className="grid items-start gap-5 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <Suspense fallback={<PageFallback label="Loading who's on this game" />}>
            <WhoIsOnPanel teams={teams} stakes={stakes} />
          </Suspense>
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <TeamContext awayId={awayId} homeId={homeId} teams={teams} forms={forms} stakes={stakes} />
          <RecentGames awayId={awayId} homeId={homeId} teams={teams} forms={forms} />
        </div>
      </div>
    </div>
  );
}
