import { Suspense } from "react";
import { LeagueOverview } from "@/components/overview/LeagueOverview";
import { PageFallback } from "@/components/ui/PageFallback";
import { getLeagueOrNotFound } from "@/server/league";
import { getViewerId } from "@/server/viewer";

export default function OverviewPage({ params }: PageProps<"/l/[leagueId]">) {
  return (
    <Suspense fallback={<PageFallback label="Loading league…" />}>
      <Overview params={params} />
    </Suspense>
  );
}

async function Overview({ params }: { params: PageProps<"/l/[leagueId]">["params"] }) {
  const { leagueId } = await params;
  const league = getLeagueOrNotFound(leagueId);
  const viewerId = await getViewerId(league);
  return <LeagueOverview league={league} viewerId={viewerId} />;
}
