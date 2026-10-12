import { Suspense } from "react";
import { LeagueOverview } from "@/components/overview/LeagueOverview";
import { OverviewFallback } from "@/components/overview/OverviewFallback";
import { DemoSeason } from "@/components/tutorial/DemoSeason";
import { DEMO_LEAGUE_ID } from "@/data/demo-league";
import { getLeagueOrNotFound, toLeagueView } from "@/server/league";

/** A revisit within this many seconds reuses the last render instead of waiting for the server (see CLAUDE.md). */
export const unstable_dynamicStaleTime = 60;

export default function OverviewPage({ params }: PageProps<"/l/[leagueId]">) {
  return (
    <Suspense fallback={<OverviewFallback />}>
      <Overview params={params} />
    </Suspense>
  );
}

async function Overview({ params }: { params: PageProps<"/l/[leagueId]">["params"] }) {
  const { leagueId } = await params;
  // The demo's overview follows this tab's guided demo draft through its simulated season (browser only).
  if (leagueId === DEMO_LEAGUE_ID) return <DemoSeason location={{ page: "overview" }} />;
  const view = await toLeagueView(await getLeagueOrNotFound(leagueId));
  return <LeagueOverview league={view.league} teams={view.teams} viewerId={view.viewerId} records={view.records} />;
}
