import { notFound } from "next/navigation";
import { Suspense } from "react";
import { TeamDetail } from "@/components/team/TeamDetail";
import { TeamFallback } from "@/components/team/TeamFallback";
import { DemoSeason } from "@/components/tutorial/DemoSeason";
import { DEMO_LEAGUE_ID } from "@/data/demo-league";
import { TEAM_IDS } from "@/data/teams";
import { getLeagueOrNotFound } from "@/server/league";
import { loadTeamPage } from "@/server/team-page";

/** A revisit within this many seconds reuses the last render instead of waiting for the server (see CLAUDE.md). */
export const unstable_dynamicStaleTime = 60;

export default function TeamPage({ params }: PageProps<"/l/[leagueId]/teams/[teamId]">) {
  return (
    <Suspense fallback={<TeamFallback />}>
      <Team params={params} />
    </Suspense>
  );
}

async function Team({ params }: { params: PageProps<"/l/[leagueId]/teams/[teamId]">["params"] }) {
  const { leagueId, teamId } = await params;
  if (leagueId === DEMO_LEAGUE_ID) {
    const id = teamId.toUpperCase();
    if (!TEAM_IDS.has(id)) notFound();
    return <DemoSeason location={{ page: "team", teamId: id }} />;
  }
  const data = await loadTeamPage(await getLeagueOrNotFound(leagueId), teamId);
  if (!data) notFound();
  return <TeamDetail {...data} />;
}
