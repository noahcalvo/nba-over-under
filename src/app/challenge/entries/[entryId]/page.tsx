import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EntryResults } from "@/components/challenge/EntryResults";
import { ResultsFallback } from "@/components/challenge/ResultsFallback";
import { loadEntryResults } from "@/server/challenge-pages";

export const metadata: Metadata = { title: "Entry · 30/30 Challenge" };

export default function EntryPage({ params }: PageProps<"/challenge/entries/[entryId]">) {
  return (
    <Suspense fallback={<ResultsFallback />}>
      <Entry params={params} />
    </Suspense>
  );
}

async function Entry({ params }: { params: PageProps<"/challenge/entries/[entryId]">["params"] }) {
  const { entryId } = await params;
  const data = await loadEntryResults(entryId);
  if (!data) notFound();
  return <EntryResults data={data} />;
}
