"use client";

import { PageHeader, PageHeaderSkeleton } from "@/components/shell/PageHeader";
import { useCurrentLeague } from "@/components/shell/CurrentLeague";

/**
 * The overview while its data loads. The header comes from the layout, so a navigation shows it at once; placeholders
 * stand in until the layout knows the league (the prerendered shell of a direct visit).
 */
export function OverviewFallback() {
  const league = useCurrentLeague();
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      {league ? (
        <PageHeader
          title={league.name}
          subtitle={`${league.seasonLabel} • League overview`}
          tag={league.isDemo ? "Demo data" : undefined}
        />
      ) : (
        <PageHeaderSkeleton />
      )}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]">
        <div className="h-[28rem] animate-pulse rounded-xl border border-ink-700 bg-ink-850/90" />
        <div className="hidden h-[28rem] animate-pulse rounded-xl border border-ink-700 bg-ink-850/90 xl:block" />
      </div>
    </div>
  );
}
