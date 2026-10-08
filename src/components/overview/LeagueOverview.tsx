"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { canRefreshRecords } from "@/lib/league/permissions";
import { findManager } from "@/lib/league/managers";
import { indexTeams } from "@/lib/lines";
import type { Basis } from "@/lib/scoring";
import { closestCalls, computeStandings } from "@/lib/standings";
import type { RecordStatus } from "@/lib/records/types";
import type { League, Team } from "@/lib/types";
import { ClosestCalls } from "./ClosestCalls";
import { FadesPanel } from "./FadesPanel";
import { PicksPanel } from "./PicksPanel";
import { RecordsStatus } from "./RecordsStatus";
import { StandingsPanel } from "./StandingsPanel";
import { SummaryStats } from "./SummaryStats";

export function LeagueOverview({
  league,
  teams,
  viewerId,
  records,
}: {
  league: League;
  teams: Team[];
  viewerId: string | null;
  records: RecordStatus | null;
}) {
  const [selectedId, setSelectedId] = useState(viewerId ?? league.managers[0].id);
  const [basis, setBasis] = useState<Basis>("projected");

  const teamsById = useMemo(() => indexTeams(teams), [teams]);
  const projected = useMemo(() => computeStandings(league, teamsById, "projected"), [league, teamsById]);
  const final = useMemo(() => computeStandings(league, teamsById, "final"), [league, teamsById]);
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
      {records && (
        <RecordsStatus leagueId={league.id} status={records} canRefresh={canRefreshRecords(league, viewerId)} />
      )}
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
