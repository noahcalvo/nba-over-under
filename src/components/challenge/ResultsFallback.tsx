import { PageHeaderSkeleton } from "@/components/shell/PageHeader";

/** An entry or leaderboard page while its data loads: the header, then a placeholder shaped like the table. */
export function ResultsFallback({ title }: { title?: string }) {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <PageHeaderSkeleton title={title} />
      <div aria-hidden className="h-96 animate-pulse rounded-xl border border-ink-700 bg-ink-850/90" />
      <p role="status" className="sr-only">
        Loading…
      </p>
    </div>
  );
}
