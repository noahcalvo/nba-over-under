import { Suspense } from "react";
import { DraftFallback } from "@/components/draft/DraftFallback";
import { DraftRoom } from "@/components/draft/DraftRoom";
import { DraftTour } from "@/components/tutorial/DraftTour";
import { DEMO_LEAGUE_ID } from "@/data/demo-league";
import { getLeagueAccess } from "@/server/access";
import { getLeagueOrNotFound, toLeagueView } from "@/server/league";

export default function DraftPage({ params }: PageProps<"/l/[leagueId]/draft">) {
  return (
    <Suspense fallback={<DraftFallback />}>
      <DraftContent params={params} />
    </Suspense>
  );
}

async function DraftContent({ params }: { params: PageProps<"/l/[leagueId]/draft">["params"] }) {
  const { leagueId } = await params;
  // The demo's draft room is the guided draft: an in-memory league in the browser, never the code-built demo league.
  if (leagueId === DEMO_LEAGUE_ID) return <DraftTour />;
  const view = await toLeagueView(await getLeagueOrNotFound(leagueId));
  return <DraftRoom initial={view} access={await getLeagueAccess(view.league, view.viewerId)} />;
}
