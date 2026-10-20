import Link from "next/link";
import { Suspense } from "react";
import { GameRow } from "@/components/nba/GameRow";
import { Alert } from "@/components/ui/Alert";
import { Panel } from "@/components/ui/Panel";
import { formatGameDayLong, formatGameDayShort, formatTimeCT } from "@/lib/format";
import { nextGameDay } from "@/lib/nba-schedule/form";
import { scheduleHref, type ScheduleParams } from "@/lib/nba-schedule/params";
import type { TeamInfo } from "@/lib/types";
import type { ScheduleGames } from "@/server/nba-pages";
import type { TeamForms } from "@/server/nba-schedule";

/** The link to the next day with games, from the teams' schedules. Nothing until they are read, or when none is found. */
async function NextGameDayLink({ params, forms }: { params: ScheduleParams; forms: Promise<TeamForms> }) {
  const next = nextGameDay(Object.values((await forms).logs).filter((log) => log !== undefined), params.day);
  if (!next) return null;
  return (
    <Link
      href={scheduleHref(params, { day: next })}
      className="font-semibold text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      Next game day: {formatGameDayShort(next)} →
    </Link>
  );
}

function EmptyDay({ params, forms }: { params: ScheduleParams; forms: Promise<TeamForms> }) {
  return (
    <div className="flex flex-col items-start gap-2 px-4 py-8 text-sm text-fog-300 sm:px-5">
      <p>No regular-season games on {formatGameDayShort(params.day)}.</p>
      <Suspense fallback={null}>
        <NextGameDayLink params={params} forms={forms} />
      </Suspense>
    </div>
  );
}

/** The day's games. Waits for the schedule read and the viewer's stakes; the page around it is already on screen. */
export async function GamesPanel({
  params,
  teams,
  games,
  forms,
}: {
  params: ScheduleParams;
  teams: TeamInfo[];
  games: Promise<ScheduleGames>;
  forms: Promise<TeamForms>;
}) {
  const { read, summaries, hasStakes } = await games;
  const list = read.day?.games ?? [];
  const book = list.find((g) => g.status === "scheduled" && g.odds)?.odds?.book;
  return (
    <Panel title={formatGameDayLong(params.day)} bodyClassName="flex flex-col">
      {read.error ? (
        <div className="p-4 sm:p-5">
          <Alert>{read.error}</Alert>
        </div>
      ) : list.length === 0 ? (
        <EmptyDay params={params} forms={forms} />
      ) : (
        <ul className="divide-y divide-ink-700">
          {list.map((game) => (
            <li key={game.id}>
              <GameRow game={game} teams={teams} summary={summaries[game.id]} hasStakes={hasStakes} day={params.day} />
            </li>
          ))}
        </ul>
      )}
      {book && read.readAt && (
        <p className="border-t border-ink-700 px-4 py-3 text-xs text-fog-400 sm:px-5">
          {book} via {read.source} · read {formatTimeCT(read.readAt)}
        </p>
      )}
    </Panel>
  );
}
