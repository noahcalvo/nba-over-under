import { notFound } from "next/navigation";
import { Suspense } from "react";
import { TeamDetail } from "@/components/team/TeamDetail";
import { PageFallback } from "@/components/ui/PageFallback";
import { getLeagueOrNotFound } from "@/server/league";
import { loadTeamPage } from "@/server/team-page";

export default function TeamPage({ params }: PageProps<"/l/[leagueId]/teams/[teamId]">) {
  return (
    <Suspense fallback={<PageFallback label="Loading team…" />}>
      <Team params={params} />
    </Suspense>
  );
}

async function Team({ params }: { params: PageProps<"/l/[leagueId]/teams/[teamId]">["params"] }) {
  const { leagueId, teamId } = await params;
  const data = await loadTeamPage(await getLeagueOrNotFound(leagueId), teamId);
  if (!data) notFound();
  return <TeamDetail {...data} />;
}
