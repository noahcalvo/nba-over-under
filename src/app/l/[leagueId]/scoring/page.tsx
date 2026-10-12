import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DemoChapterPlaceholder } from "@/components/tutorial/DemoChapterPlaceholder";
import { DEMO_LEAGUE_ID } from "@/data/demo-league";

/** Where the scoring walkthrough will follow the demo draft (it will read the demo's snapshot). Demo only. */
export default function ScoringWalkthroughPage({ params }: PageProps<"/l/[leagueId]/scoring">) {
  return (
    <Suspense fallback={null}>
      <ScoringWalkthroughContent params={params} />
    </Suspense>
  );
}

async function ScoringWalkthroughContent({ params }: { params: PageProps<"/l/[leagueId]/scoring">["params"] }) {
  const { leagueId } = await params;
  if (leagueId !== DEMO_LEAGUE_ID) notFound();
  return <DemoChapterPlaceholder title="Scoring walkthrough" />;
}
