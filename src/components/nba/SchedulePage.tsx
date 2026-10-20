import { Suspense } from "react";
import { DateStrip } from "@/components/nba/DateStrip";
import { GamesPanel } from "@/components/nba/GamesPanel";
import { LinkTabs } from "@/components/nba/LinkTabs";
import { StandingsPanel } from "@/components/nba/StandingsPanel";
import { PageHeader } from "@/components/shell/PageHeader";
import { PageFallback } from "@/components/ui/PageFallback";
import { NBA_SCHEDULE } from "@/config/schedule";
import { scheduleHref } from "@/lib/nba-schedule/params";
import type { SchedulePageData } from "@/server/nba-pages";

/** The NBA schedule: a day's games beside the conference table from `xl`, one of the two below it. */
export function SchedulePage({ data }: { data: SchedulePageData }) {
  const { day, view, conference, teams, games, forms } = data;
  const params = { day, view, conference };
  const tabs = (["games", "standings"] as const).map((option) => ({
    label: option === "games" ? "Games" : "Standings",
    href: scheduleHref(params, { view: option }),
    active: view === option,
  }));
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="NBA Schedule"
        subtitle={
          <>
            Games, standings, and who your leagues are rooting for.
            <span className="mt-1 block text-xs text-fog-400 sm:text-sm">
              {NBA_SCHEDULE.season} regular season · times in {NBA_SCHEDULE.timeZoneLabel}
            </span>
          </>
        }
      />
      <DateStrip params={params} strip={data.strip} today={data.today} />
      <div className="xl:hidden">
        <LinkTabs ariaLabel="Schedule view" options={tabs} />
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className={`min-w-0 ${view === "games" ? "" : "hidden xl:block"}`}>
          <Suspense fallback={<PageFallback label="Loading games" />}>
            <GamesPanel params={params} teams={teams} games={games} forms={forms} />
          </Suspense>
        </div>
        <div className={`min-w-0 ${view === "standings" ? "" : "hidden xl:block"}`}>
          <StandingsPanel params={params} teams={teams} forms={forms} />
        </div>
      </div>
    </div>
  );
}
