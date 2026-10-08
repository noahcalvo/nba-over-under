import { Suspense } from "react";
import { DraftRoom } from "@/components/draft/DraftRoom";
import { PageFallback } from "@/components/ui/PageFallback";
import { getLeagueOrNotFound } from "@/server/league";
import { toLeagueView } from "@/server/viewer";

export default function DraftPage({ params }: PageProps<"/l/[leagueId]/draft">) {
  return (
    <Suspense fallback={<PageFallback label="Loading draft room…" />}>
      <DraftContent params={params} />
    </Suspense>
  );
}

async function DraftContent({ params }: { params: PageProps<"/l/[leagueId]/draft">["params"] }) {
  const { leagueId } = await params;
  const league = getLeagueOrNotFound(leagueId);
  return <DraftRoom initial={await toLeagueView(league)} />;
}
