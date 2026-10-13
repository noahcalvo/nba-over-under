import { CHALLENGE } from "@/config/challenge";

/** The board's title and season pill: the same in the fallback and the loaded page. */
export function BoardTitle({ seasonLabel }: { seasonLabel: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <h1 className="font-display text-4xl font-bold leading-tight text-fog-50 sm:text-5xl">30/30 Challenge</h1>
      <span className="rounded-full border border-ink-600 bg-ink-850 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-fog-300">
        {seasonLabel} NBA season
      </span>
    </div>
  );
}

/** The board while its data loads: the title, then placeholders shaped like the rail and the grid. */
export function ChallengeFallback() {
  const box = "animate-pulse rounded-xl border border-ink-700 bg-ink-850/90";
  return (
    <div aria-busy="true" className="flex flex-col gap-6 pb-24 xl:pb-0">
      <header className="flex flex-col gap-2">
        <BoardTitle seasonLabel={CHALLENGE.season} />
        <div aria-hidden className="h-6 w-full max-w-2xl animate-pulse rounded bg-ink-800" />
      </header>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <div aria-hidden className="h-10 w-full max-w-xl animate-pulse rounded-lg bg-ink-800" />
          <div aria-hidden className={`h-[32rem] ${box}`} />
        </div>
        <div aria-hidden className="hidden flex-col gap-4 xl:flex">
          <div className={`h-48 ${box}`} />
          <div className={`h-56 ${box}`} />
          <div className={`h-40 ${box}`} />
        </div>
      </div>
      <p role="status" className="sr-only">
        Loading the challenge…
      </p>
    </div>
  );
}
