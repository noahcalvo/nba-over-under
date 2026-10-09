"use client";

import { useCurrentLeague } from "@/components/shell/CurrentLeague";
import { PageHeader, PageHeaderSkeleton } from "@/components/shell/PageHeader";

/**
 * The draft room while its data loads. The header comes from the layout, so a navigation shows it at once; placeholders
 * stand in until the layout knows the league (the prerendered shell of a direct visit).
 */
export function DraftFallback() {
  const league = useCurrentLeague();
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      {league ? (
        <PageHeader
          title="Draft room"
          subtitle={`${league.name} • ${league.seasonLabel}`}
          tag={league.isDemo ? "Demo draft" : undefined}
        />
      ) : (
        <PageHeaderSkeleton title="Draft room" />
      )}
      <div className="h-24 animate-pulse rounded-xl border border-ink-700 bg-ink-850/90" />
      <div className="h-[28rem] animate-pulse rounded-xl border border-ink-700 bg-ink-850/90" />
    </div>
  );
}
