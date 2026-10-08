"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { TEAMS_BY_ID } from "@/data/teams";
import { findManager } from "@/lib/league/managers";
import type { Basis } from "@/lib/scoring";
import { closestCalls, computeStandings } from "@/lib/standings";
import type { League } from "@/lib/types";
import { ClosestCalls } from "./ClosestCalls";
import { FadesPanel } from "./FadesPanel";
import { PicksPanel } from "./PicksPanel";
import { StandingsPanel } from "./StandingsPanel";
import { SummaryStats } from "./SummaryStats";

export function LeagueOverview({ league, viewerId }: { league: League; viewerId: string | null }) {
  const [selectedId, setSelectedId] = useState(viewerId ?? league.managers[0].id);
  const [basis, setBasis] = useState<Basis>("projected");

  const projected = useMemo(() => computeStandings(league, TEAMS_BY_ID, "projected"), [league]);
  const final = useMemo(() => computeStandings(league, TEAMS_BY_ID, "final"), [league]);
  const standings = basis === "final" && final.anyScored ? final : projected;
  const row = standings.rows.find((candidate) => candidate.managerId === selectedId) ?? standings.rows[0];
  const manager = findManager(league.managers, row.managerId)!;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={league.name}
        subtitle={`${league.seasonLabel} • League overview`}
        tag={league.isDemo ? "Demo data" : undefined}
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]">
        <PicksPanel
          leagueId={league.id}
          managers={league.managers}
          manager={manager}
          viewerId={viewerId}
          row={row}
          onSelectManager={setSelectedId}
          basis={standings.basis}
          onBasisChange={setBasis}
          finalAvailable={final.anyScored}
          draftComplete={league.draft.status === "complete"}
        />
        <div className="flex min-w-0 flex-col gap-6">
          <StandingsPanel
            standings={standings}
            managers={league.managers}
            selectedId={row.managerId}
            viewerId={viewerId}
            onSelect={setSelectedId}
          />
          <FadesPanel row={row} managers={league.managers} />
        </div>
      </div>
      <SummaryStats row={row} standings={standings} isViewer={row.managerId === viewerId} />
      {standings.basis === "projected" && <ClosestCalls calls={closestCalls(row)} />}
    </div>
  );
}
