import { Suspense } from "react";
import { DraftRoom } from "@/components/draft/DraftRoom";
import { PageFallback } from "@/components/ui/PageFallback";
import { getLeagueAccess } from "@/server/access";
import { getLeagueOrNotFound, toLeagueView } from "@/server/league";

export default function DraftPage({ params }: PageProps<"/l/[leagueId]/draft">) {
  return (
    <Suspense fallback={<PageFallback label="Loading draft room…" />}>
      <DraftContent params={params} />
    </Suspense>
  );
}

async function DraftContent({ params }: { params: PageProps<"/l/[leagueId]/draft">["params"] }) {
  const { leagueId } = await params;
  const view = await toLeagueView(await getLeagueOrNotFound(leagueId));
  return <DraftRoom initial={view} access={await getLeagueAccess(view.league, view.viewerId)} />;
}
