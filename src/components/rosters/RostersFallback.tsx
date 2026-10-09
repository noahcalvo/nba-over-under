"use client";

import { PageHeader, PageHeaderSkeleton } from "@/components/shell/PageHeader";
import { useCurrentLeague } from "@/components/shell/CurrentLeague";

/**
 * Rosters while their data loads. The header comes from the layout, so a navigation shows it at once; placeholders
 * stand in until the layout knows the league (the prerendered shell of a direct visit).
 */
export function RostersFallback() {
  const league = useCurrentLeague();
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      {league ? (
        <PageHeader
          title="Rosters"
          subtitle={`${league.name} • ${league.seasonLabel}`}
          tag={league.isDemo ? "Demo data" : undefined}
        />
      ) : (
        <PageHeaderSkeleton title="Rosters" />
      )}
      <div className="@container">
        <div className="grid gap-4 @2xl:grid-cols-2 @5xl:grid-cols-4">
          {[0, 1, 2, 3].map((column) => (
            <div key={column} className="h-[26rem] animate-pulse rounded-xl border border-ink-700 bg-ink-850/90" />
          ))}
        </div>
      </div>
    </div>
  );
}
