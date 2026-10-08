"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SCORING } from "@/config/scoring";
import { managerLabel } from "@/lib/league/managers";
import type { Basis } from "@/lib/scoring";
import type { StandingRow } from "@/lib/standings";
import type { Manager } from "@/lib/types";
import { ManagerPicker } from "./ManagerPicker";
import { PickCards, PicksTable } from "./PicksList";

const COLLAPSED_COUNT = 5;

export function PicksPanel({
  leagueId,
  managers,
  manager,
  viewerId,
  row,
  onSelectManager,
  basis,
  onBasisChange,
  finalAvailable,
  draftComplete,
}: {
  leagueId: string;
  managers: Manager[];
  manager: Manager;
  viewerId: string | null;
  row: StandingRow;
  onSelectManager: (managerId: string) => void;
  basis: Basis;
  onBasisChange: (basis: Basis) => void;
  finalAvailable: boolean;
  draftComplete: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const calls = expanded ? row.calls : row.calls.slice(0, COLLAPSED_COUNT);
  const title = manager.id === viewerId ? "My picks" : `${managerLabel(manager)}'s picks`;

  return (
    <Panel bodyClassName="flex flex-col @container">
      <div className="flex flex-col gap-4 border-b border-ink-700 p-4 sm:p-5">
        <ManagerPicker managers={managers} selected={manager} viewerId={viewerId} onSelect={onSelectManager} />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="font-display text-2xl font-semibold">{title}</h2>
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <SegmentedControl
              ariaLabel="Scoring basis"
              value={basis}
              onChange={onBasisChange}
              options={[
                { value: "projected", label: "Win pace" },
                { value: "final", label: "Final results", disabled: !finalAvailable },
              ]}
            />
            {!finalAvailable && <p className="text-xs text-fog-400">Available when results are final.</p>}
          </div>
        </div>
      </div>

      {row.calls.length === 0 ? (
        <div className="flex flex-col items-start gap-3 px-4 py-8 sm:px-5">
          <p className="text-fog-300">No picks yet.</p>
          {!draftComplete && (
            <Link href={`/l/${leagueId}/draft`} className={buttonClasses("secondary", "sm")}>
              Go to the draft room
            </Link>
          )}
        </div>
      ) : (
        <>
          <PicksTable calls={calls} basis={basis} />
          <PickCards calls={calls} basis={basis} />
        </>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-700 px-4 py-3 text-sm text-fog-300 sm:px-5">
        <p>
          {basis === "projected"
            ? `Win pace = wins ÷ games played × ${SCORING.seasonGames}. Margin is relative to the pick.`
            : `Picks settle when the team finishes its ${SCORING.seasonGames}-game regular season.`}
        </p>
        {row.calls.length > COLLAPSED_COUNT && (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
            className="inline-flex items-center gap-1 font-semibold text-link hover:text-fog-50"
          >
            {expanded ? "Show fewer" : `View all ${row.calls.length} picks`}
            <ArrowRight aria-hidden className="size-4" />
          </button>
        )}
      </footer>
    </Panel>
  );
}
