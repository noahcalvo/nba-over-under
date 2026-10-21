import { Suspense } from "react";
import { SchedulePage } from "@/components/nba/SchedulePage";
import { PageFallback } from "@/components/ui/PageFallback";
import { loadSchedulePage } from "@/server/nba-pages";

/** A revisit within this many seconds reuses the last render instead of waiting for the server (see CLAUDE.md). */
export const unstable_dynamicStaleTime = 60;

export default function NbaSchedulePage({ searchParams }: PageProps<"/nba">) {
  return (
    <Suspense fallback={<PageFallback label="Loading the schedule" />}>
      <Schedule searchParams={searchParams} />
    </Suspense>
  );
}

async function Schedule({ searchParams }: { searchParams: PageProps<"/nba">["searchParams"] }) {
  const query = await searchParams;
  const first = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined);
  const data = await loadSchedulePage({ date: first(query.date), view: first(query.view), conf: first(query.conf) });
  return <SchedulePage data={data} />;
}
