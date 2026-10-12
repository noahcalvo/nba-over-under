"use client";

import { ArrowRight, ChevronRight, RotateCcw } from "lucide-react";
import Link from "next/link";
import { Button, buttonClasses } from "@/components/ui/Button";
import { SCORING } from "@/config/scoring";
import { tourTarget } from "@/lib/tour/targets";
import { SEASON_CHECKPOINTS, type SeasonCheckpoint } from "@/lib/tutorial/season";
import { ADVANCE_LABELS, CHECKPOINT_LABELS } from "@/lib/tutorial/season-copy";

/** The demo's only season control: where the simulated season stands and its one next step. */
export function SeasonControl({
  checkpoint,
  games,
  onAdvance,
  onReplay,
}: {
  checkpoint: SeasonCheckpoint;
  games: number;
  onAdvance: () => void;
  onReplay: () => void;
}) {
  const next = ADVANCE_LABELS[checkpoint];
  return (
    <section
      aria-label="Demo season"
      {...tourTarget("season-control")}
      className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-xl border border-accent/40 bg-ink-850/90 px-4 py-3 sm:px-5"
    >
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-link">Demo season · simulated results</p>
        <ol className="mt-1 flex flex-wrap items-center gap-x-1.5 text-sm">
          {SEASON_CHECKPOINTS.map((stage, index) => (
            <li
              key={stage}
              aria-current={stage === checkpoint ? "step" : undefined}
              className={`flex items-center gap-1.5 ${stage === checkpoint ? "font-semibold text-accent" : "text-fog-400"}`}
            >
              {index > 0 && <ChevronRight aria-hidden className="size-4 text-fog-400" />}
              {CHECKPOINT_LABELS[stage]}
            </li>
          ))}
        </ol>
        <p className="mt-0.5 text-xs text-fog-400">
          {games} of {SCORING.seasonGames} games played by every team · not real NBA games
        </p>
      </div>
      {next ? (
        <Button {...tourTarget("season-advance")} onClick={onAdvance}>
          {next}
          <ArrowRight aria-hidden className="size-4" />
        </Button>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={onReplay}>
            <RotateCcw aria-hidden className="size-4" />
            Replay demo
          </Button>
          <Link href="/" className={buttonClasses("secondary", "sm")}>
            Create league
          </Link>
        </div>
      )}
    </section>
  );
}
