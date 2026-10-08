import { Suspense } from "react";
import { LeagueOverview } from "@/components/overview/LeagueOverview";
import { PageFallback } from "@/components/ui/PageFallback";
import { getLeagueOrNotFound } from "@/server/league";
import { toLeagueView } from "@/server/viewer";

export default function OverviewPage({ params }: PageProps<"/l/[leagueId]">) {
  return (
    <Suspense fallback={<PageFallback label="Loading league…" />}>
      <Overview params={params} />
    </Suspense>
  );
}

async function Overview({ params }: { params: PageProps<"/l/[leagueId]">["params"] }) {
  const { leagueId } = await params;
  const view = await toLeagueView(getLeagueOrNotFound(leagueId));
  return <LeagueOverview league={view.league} teams={view.teams} viewerId={view.viewerId} />;
}
