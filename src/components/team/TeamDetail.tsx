"use client";

import { useMemo } from "react";
import { teamOwnership, type TeamPageData } from "@/lib/team-detail";
import type { Side, Team } from "@/lib/types";
import { OwnershipCard } from "./OwnershipCard";
import { SeasonProgressPanel } from "./SeasonProgressPanel";
import { useShowProjected } from "./ShowProjected";
import { SportsbookPanel } from "./SportsbookPanel";
import { TeamHeader } from "./TeamHeader";
import { TeamStatStrip } from "./TeamStatStrip";

export function TeamDetail({
  league,
  info,
  lockedLine,
  teamOptions,
  market,
  gameLog,
  historyNote,
  highlightSide,
}: TeamPageData & {
  /** A note under the chart about where the game history comes from. */
  historyNote?: string;
  /** A side to name for a guided tour (its ownership card). */
  highlightSide?: Side;
}) {
  const [showProjected, setShowProjected] = useShowProjected();
  const team = useMemo<Team | null>(() => (lockedLine === null ? null : { ...info, line: lockedLine }), [info, lockedLine]);
  const [over, under] = useMemo(() => teamOwnership(league, info.id, team), [league, info.id, team]);
  const teamNames = useMemo(
    () => Object.fromEntries(teamOptions.map((option) => [option.id, option.label])),
    [teamOptions],
  );
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
        <SeasonProgressPanel
          gameLog={gameLog}
          record={info}
          lockedLine={lockedLine}
          showProjected={showProjected}
          teamNames={teamNames}
          note={historyNote}
          className={market ? "xl:col-span-2" : "xl:col-span-3"}
        />
        {market && <SportsbookPanel market={market} lockedLine={lockedLine} />}
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        {[over, under].map((ownership) => (
          <OwnershipCard
            key={ownership.side}
            ownership={ownership}
            record={info}
            showProjected={showProjected}
            tour={ownership.side === highlightSide ? "my-side" : undefined}
          />
        ))}
      </div>
    </div>
  );
}
