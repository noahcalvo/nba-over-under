"use client";

import { CircleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import type { ChartMode } from "@/lib/chart-window";
import { buildChartModel } from "@/lib/game-log/chart-model";
import type { GameLogRead } from "@/lib/game-log/types";
import type { TeamRecord } from "@/lib/records/types";
import { gamesPlayed } from "@/lib/scoring";
import type { TeamId } from "@/lib/types";
import { SeasonProgressChart } from "./SeasonProgressChart";

export function SeasonProgressPanel({
  gameLog,
  record,
  lockedLine,
  showProjected,
  teamNames,
  className = "",
}: {
  gameLog: GameLogRead;
  record: TeamRecord;
  lockedLine: number | null;
  showProjected: boolean;
  teamNames: Readonly<Record<TeamId, string>>;
  className?: string;
}) {
  // Always opens on the latest window; switching back to "Last 8" recomputes it from games played.
  const [mode, setMode] = useState<ChartMode>("last8");
  const model = useMemo(
    () => buildChartModel({ games: gameLog.log?.games ?? null, record, line: lockedLine, mode, showProjected }),
    [gameLog.log, record, lockedLine, mode, showProjected],
  );
  const played = gamesPlayed(record);
  const notes: string[] = [];
  if (gameLog.log && model.history === "partial") notes.push(`Game log covers ${model.historyGames} of ${played} games.`);
  if (gameLog.log && model.history === "mismatch") notes.push("Game log doesn't match the stored record yet.");
  if (played === 0 && model.hasData) notes.push("No games played yet.");
  if (lockedLine === null) notes.push("The locked-line pace appears once the draft starts.");

  return (
    <section
      aria-labelledby="progress-heading"
      className={`flex min-w-0 flex-col rounded-xl border border-ink-700 bg-ink-850/90 p-5 sm:p-6 ${className}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="progress-heading" className="font-display text-3xl font-bold text-accent">
            Season progress
          </h2>
          <p className="mt-1 text-fog-300">{model.subtitle}</p>
        </div>
        <SegmentedControl
          ariaLabel="Chart range"
          value={mode}
          onChange={setMode}
          options={[
            { value: "last8", label: "Last 8" },
            { value: "full", label: "Full season" },
          ]}
        />
      </div>

      {gameLog.log === null ? (
        <div role="status" className="mt-6 flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-ink-700 bg-ink-900/60 px-4 py-12 text-center">
          <CircleAlert aria-hidden className="size-6 text-fog-400" />
          <p className="font-semibold text-fog-50">Game history unavailable</p>
          {gameLog.error && <p className="text-sm text-fog-300">{gameLog.error}</p>}
          <p className="text-sm text-fog-400">The record and scores above still use the stored standings.</p>
        </div>
      ) : model.hasData ? (
        <>
          <SeasonProgressChart model={model} teamNames={teamNames} />
          <Legend pace={lockedLine !== null} projected={model.showsProjected} />
        </>
      ) : (
        <p className="mt-6 py-12 text-center text-fog-300">{played === 0 ? "No games played yet." : "Nothing to chart yet."}</p>
      )}

      {notes.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm text-fog-400">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Legend({ pace, projected }: { pace: boolean; projected: boolean }) {
  return (
    <ul className="mt-2 flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm text-fog-50">
      <LegendItem label="Actual wins" className="stroke-progress" />
      {pace && <LegendItem label="Locked-line pace" className="stroke-fog-300" dash="7 6" />}
      {projected && <LegendItem label="Projected wins" className="stroke-progress" dash="7 6" />}
    </ul>
  );
}

function LegendItem({ label, className, dash }: { label: string; className: string; dash?: string }) {
  return (
    <li className="flex items-center gap-2">
      <svg width="40" height="8" aria-hidden>
        <line x1="0" y1="4" x2="40" y2="4" strokeWidth="3" strokeDasharray={dash} className={className} />
      </svg>
      {label}
    </li>
  );
}
