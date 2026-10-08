import { Suspense } from "react";
import { JoinForm } from "@/components/join/JoinForm";
import { PageHeader } from "@/components/shell/PageHeader";
import { PageFallback } from "@/components/ui/PageFallback";
import { Panel } from "@/components/ui/Panel";
import { getLeagueOrNotFound } from "@/server/league";
import { getViewerId } from "@/server/viewer";

export default function JoinPage({ params }: PageProps<"/l/[leagueId]/join">) {
  return (
    <Suspense fallback={<PageFallback label="Loading league…" />}>
      <JoinContent params={params} />
    </Suspense>
  );
}

async function JoinContent({ params }: { params: PageProps<"/l/[leagueId]/join">["params"] }) {
  const { leagueId } = await params;
  const league = getLeagueOrNotFound(leagueId);
  const viewerId = await getViewerId(league);
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <PageHeader title="Join league" subtitle={`${league.name} • ${league.seasonLabel}`} />
      <Panel bodyClassName="p-4 sm:p-5">
        <JoinForm league={league} viewerId={viewerId} />
      </Panel>
    </div>
  );
}
