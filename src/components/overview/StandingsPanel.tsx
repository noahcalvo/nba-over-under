"use client";

import { ChartColumn } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { ManagerAvatar } from "@/components/ui/ManagerAvatar";
import { Panel } from "@/components/ui/Panel";
import { SignedValue } from "@/components/ui/SignedValue";
import { formatSigned } from "@/lib/format";
import { findManager, managerLabel } from "@/lib/league/managers";
import type { Standings } from "@/lib/standings";
import type { Manager } from "@/lib/types";

export function StandingsPanel({
  standings,
  managers,
  selectedId,
  viewerId,
  onSelect,
}: {
  standings: Standings;
  managers: Manager[];
  selectedId: string;
  viewerId: string | null;
  onSelect: (managerId: string) => void;
}) {
  const projected = standings.basis === "projected";
  const badge = projected ? "Projected" : standings.complete ? "Final" : "Partial results";
  return (
    <Panel
      title="League standings"
      icon={<ChartColumn aria-hidden className="size-5 text-fog-300" />}
      actions={<Badge tone={!projected && standings.complete ? "accent" : "neutral"}>{badge}</Badge>}
    >
      <div className="grid grid-cols-[2rem_minmax(0,1fr)_auto] gap-x-3 px-4 pt-3 text-xs uppercase tracking-wider text-fog-400 sm:px-5">
        <span>#</span>
        <span>Manager</span>
        <span className="text-right">{projected ? "Projected points" : "Final points"}</span>
      </div>
      <ol className="flex flex-col gap-1 p-2 sm:p-3">
        {standings.rows.map((row) => {
          const manager = findManager(managers, row.managerId)!;
          const selected = row.managerId === selectedId;
          return (
            <li key={row.managerId}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => onSelect(row.managerId)}
                className={`grid w-full grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-3 rounded-lg border px-2 py-2 text-left transition-colors sm:px-3 ${
                  selected ? "border-accent/60 bg-accent/10" : "border-transparent hover:bg-ink-800"
                }`}
              >
                <span className="font-display text-lg font-bold text-fog-300">{row.rank}</span>
                <span className="flex min-w-0 items-center gap-3">
                  <ManagerAvatar manager={manager} size="sm" />
                  <span className="truncate font-medium">{managerLabel(manager)}</span>
                  {row.managerId === viewerId && <Badge tone="accent">You</Badge>}
                </span>
                <span className="text-right">
                  <SignedValue value={row.totalPoints} className="block font-display text-xl font-bold" />
                  <span className="block text-xs text-fog-400">Margin {formatSigned(row.totalMargin)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
