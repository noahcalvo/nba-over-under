import type { Metadata } from "next";
import { Suspense } from "react";
import { PageFallback } from "@/components/ui/PageFallback";

export const metadata: Metadata = { title: "NBA schedule" };

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
  // date, view and conf are read by the schedule page itself (Task 9).
  await searchParams;
  return <h1 className="text-2xl font-bold">NBA schedule</h1>;
}
