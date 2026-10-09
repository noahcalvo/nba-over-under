"use client";

import { useParams } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { useCurrentLeague } from "@/components/shell/CurrentLeague";
import { PageHeaderSkeleton } from "@/components/shell/PageHeader";
import { TEAM_INFO } from "@/data/teams";
import { teamOptions } from "@/lib/team-detail";
import { ProgressSkeleton } from "./SeasonProgressPanel";
import { SportsbookSkeleton } from "./SportsbookPanel";
import { TeamHeader } from "./TeamHeader";

const OPTIONS = teamOptions(TEAM_INFO);
const noop = () => {};

/**
 * The team page while its data loads. The team comes from the URL and the league from the layout, so on a client
 * navigation the header draws at once and only the record, panels and ownership wait for the server. In the
 * prerendered shell the URL isn't known yet, so the header is a placeholder there.
 */
export function TeamFallback() {
  return (
    <Suspense fallback={<TeamSkeleton header={<PageHeaderSkeleton />} />}>
      <TeamSkeleton header={<KnownTeamHeader />} />
    </Suspense>
  );
}

function KnownTeamHeader() {
  const league = useCurrentLeague();
  const { teamId } = useParams<{ teamId: string }>();
  const info = TEAM_INFO.find((team) => team.id === teamId?.toUpperCase());
  if (!league || !info) return <PageHeaderSkeleton />;
  return <TeamHeader league={league} info={info} teamOptions={OPTIONS} showProjected onShowProjectedChange={noop} />;
}

function TeamSkeleton({ header }: { header: ReactNode }) {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      {header}
      <section aria-label="Season summary" className="rounded-xl border border-ink-700 bg-ink-850/90">
        <div className="grid grid-cols-2 gap-y-5 py-5 sm:grid-cols-4">
          {[0, 1, 2, 3].map((column) => (
            <div
              key={column}
              className="flex flex-col items-center gap-2 px-3 sm:border-l sm:border-ink-700 sm:first:border-l-0"
            >
              <div className="h-5 w-24 animate-pulse rounded bg-ink-800" />
              <div className="h-10 w-20 animate-pulse rounded bg-ink-800 sm:h-12" />
              <div className="h-4 w-28 animate-pulse rounded bg-ink-800" />
            </div>
          ))}
        </div>
      </section>
      <div className="grid gap-6 xl:grid-cols-3">
        <ProgressSkeleton className="xl:col-span-2" />
        <SportsbookSkeleton className="" />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        {[0, 1].map((card) => (
          <div key={card} className="h-36 animate-pulse rounded-xl border-2 border-ink-700 bg-ink-850/60" />
        ))}
      </div>
    </div>
  );
}
