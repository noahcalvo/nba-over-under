"use client";

import { useMemo, useState } from "react";
import { teamOwnership, type TeamPageData } from "@/lib/team-detail";
import type { Team } from "@/lib/types";
import { OwnershipCard } from "./OwnershipCard";
import { SportsbookPanel } from "./SportsbookPanel";
import { TeamHeader } from "./TeamHeader";
import { TeamStatStrip } from "./TeamStatStrip";

export function TeamDetail({ league, info, lockedLine, teamOptions, market }: TeamPageData) {
  const [showProjected, setShowProjected] = useState(true);
  const team = useMemo<Team | null>(() => (lockedLine === null ? null : { ...info, line: lockedLine }), [info, lockedLine]);
  const [over, under] = useMemo(() => teamOwnership(league, info.id, team), [league, info.id, team]);
  return (
    <div className="flex flex-col gap-6">
      <TeamHeader
        league={league}
        info={info}
        teamOptions={teamOptions}
        showProjected={showProjected}
        onShowProjectedChange={setShowProjected}
      />
      <TeamStatStrip record={info} lockedLine={lockedLine} showProjected={showProjected} />
      <div className="grid gap-6 xl:grid-cols-3">
        <SportsbookPanel market={market} lockedLine={lockedLine} />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <OwnershipCard ownership={over} record={info} showProjected={showProjected} />
        <OwnershipCard ownership={under} record={info} showProjected={showProjected} />
      </div>
    </div>
  );
}
