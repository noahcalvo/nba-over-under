import { Suspense } from "react";
import { RostersBoard } from "@/components/rosters/RostersBoard";
import { RostersFallback } from "@/components/rosters/RostersFallback";
import { getLeagueOrNotFound, toLeagueView } from "@/server/league";

/** A revisit within this many seconds reuses the last render instead of waiting for the server (see CLAUDE.md). */
export const unstable_dynamicStaleTime = 60;

export default function RostersPage({ params }: PageProps<"/l/[leagueId]/rosters">) {
  return (
    <Suspense fallback={<RostersFallback />}>
      <Rosters params={params} />
    </Suspense>
  );
}

async function Rosters({ params }: { params: PageProps<"/l/[leagueId]/rosters">["params"] }) {
  const { leagueId } = await params;
  const view = await toLeagueView(await getLeagueOrNotFound(leagueId));
  return <RostersBoard league={view.league} teams={view.teams} />;
}
