import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChallengeTeamDetail } from "@/components/challenge/ChallengeTeamDetail";
import { ResultsFallback } from "@/components/challenge/ResultsFallback";
import { loadChallengeTeam } from "@/server/challenge-pages";

export default function ChallengeTeamPage({ params }: PageProps<"/challenge/teams/[teamId]">) {
  return (
    <Suspense fallback={<ResultsFallback />}>
      <Team params={params} />
    </Suspense>
  );
}

async function Team({ params }: { params: PageProps<"/challenge/teams/[teamId]">["params"] }) {
  const { teamId } = await params;
  const data = await loadChallengeTeam(teamId);
  if (!data) notFound();
  return <ChallengeTeamDetail data={data} />;
}
