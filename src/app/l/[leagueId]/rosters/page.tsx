import { Suspense } from "react";
import { RostersBoard } from "@/components/rosters/RostersBoard";
import { PageFallback } from "@/components/ui/PageFallback";
import { getLeagueOrNotFound, toLeagueView } from "@/server/league";

export default function RostersPage({ params }: PageProps<"/l/[leagueId]/rosters">) {
  return (
    <Suspense fallback={<PageFallback label="Loading rosters…" />}>
      <Rosters params={params} />
    </Suspense>
  );
}

async function Rosters({ params }: { params: PageProps<"/l/[leagueId]/rosters">["params"] }) {
  const { leagueId } = await params;
  const view = await toLeagueView(await getLeagueOrNotFound(leagueId));
  return <RostersBoard league={view.league} teams={view.teams} />;
}
