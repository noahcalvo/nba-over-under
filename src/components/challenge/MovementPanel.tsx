import { ArrowRight, TrendingUp } from "lucide-react";

/** How many saved picks' lines moved since they were saved. Neutral: a move changes nothing about a pick. */
export function MovementPanel({
  movedCount,
  hasSaved,
  onShowMoved,
}: {
  movedCount: number;
  hasSaved: boolean;
  onShowMoved: () => void;
}) {
  const heading = !hasSaved ? "Lines move" : movedCount > 0 ? "Some lines have moved" : "No line moves";
  return (
    <section aria-labelledby="movement-heading" className="min-w-0 rounded-xl border border-under/50 bg-under-deep/40 p-5">
      <h2 id="movement-heading" className="flex items-center gap-2 font-display text-xl font-bold text-fog-50">
        <TrendingUp aria-hidden className="size-5 text-under" />
        {heading}
      </h2>
      <p className="mt-2 text-sm text-fog-300">
        {!hasSaved
          ? "Lines move until the deadline. Your picks keep their direction; every entry scores against the same frozen lines."
          : movedCount > 0
            ? `${movedCount === 1 ? "1 team has" : `${movedCount} teams have`} a different line than when you saved your pick. Your selections are unchanged.`
            : "Every saved pick's line is where it was when you saved it."}
      </p>
      {hasSaved && movedCount > 0 && (
        <button
          type="button"
          onClick={onShowMoved}
          className="mt-4 flex h-11 w-full items-center justify-between rounded-lg border border-under/60 bg-ink-900/60 px-4 text-sm font-semibold text-fog-50 transition-colors hover:border-under focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Show moved lines only
          <ArrowRight aria-hidden className="size-4" />
        </button>
      )}
    </section>
  );
}
