"use client";

import { ArrowRight, ChevronRight, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { SCORING } from "@/config/scoring";
import { TUTORIAL_SEASON } from "@/config/tour";
import { tourTarget } from "@/lib/tour/targets";
import { advanceCheckpointGames, SEASON_CHECKPOINTS, type SeasonCheckpoint } from "@/lib/tutorial/season";
import { ADVANCE_LABELS, CHECKPOINT_LABELS, PLAYING_LINES, playingLine } from "@/lib/tutorial/season-copy";

const PLAY_TICK_MS = 40;

/**
 * The demo's only season control: where the simulated season stands and its one next step. Advancing first plays
 * the checkpoint's games for a moment (a progress bar and a ticking games count), then shows the results. Only that
 * animation is local state: the checkpoint itself lives in the tutorial store.
 */
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
  /** The advance being played: its first line and the fraction played. Null when not playing. */
  const [play, setPlay] = useState<{ start: number; fraction: number } | null>(null);
  const playing = play !== null;

  // Restarts from zero if the page is hidden mid-play (the router keeps it mounted and re-runs effects on return).
  useEffect(() => {
    if (!playing) return;
    const started = performance.now();
    const timer = window.setInterval(() => {
      const fraction = Math.min((performance.now() - started) / TUTORIAL_SEASON.advancePlayMs, 1);
      if (fraction < 1) {
        setPlay((current) => current && { ...current, fraction });
        return;
      }
      window.clearInterval(timer);
      setPlay(null);
      onAdvance();
    }, PLAY_TICK_MS);
    return () => window.clearInterval(timer);
  }, [playing, onAdvance]);

  const shownGames = play ? games + Math.floor(advanceCheckpointGames(checkpoint) * play.fraction) : games;
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
          {shownGames} of {SCORING.seasonGames} games played by every team · not real NBA games
        </p>
      </div>
      {play ? (
        <div role="status" className="flex w-full flex-col gap-1.5 sm:w-56">
          <p className="truncate text-sm font-semibold text-fog-50">{playingLine(play.start, play.fraction)}</p>
          <div className="h-2 overflow-hidden rounded-full bg-ink-700">
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(play.fraction * 100)}%` }} />
          </div>
        </div>
      ) : next ? (
        <Button {...tourTarget("season-advance")} onClick={() => setPlay({ start: Math.floor(Math.random() * PLAYING_LINES.length), fraction: 0 })}>
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
