"use client";

import { Info } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { buttonClasses } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { indexTeams } from "@/lib/lines";
import { rosterColumns, type RosterSort } from "@/lib/rosters";
import { computeStandings } from "@/lib/standings";
import type { League, Team } from "@/lib/types";
import { RosterColumn } from "./RosterColumn";

export function RostersBoard({ league, teams }: { league: League; teams: Team[] }) {
  const [showProjected, setShowProjected] = useState(true);
  const [sort, setSort] = useState<RosterSort>("traditional");

  const teamsById = useMemo(() => indexTeams(teams), [teams]);
  const standings = useMemo(() => computeStandings(league, teamsById, "projected"), [league, teamsById]);
  const columns = useMemo(() => rosterColumns(league.managers, standings), [league.managers, standings]);

  const hasPicks = league.draft.picks.length > 0;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Rosters"
        subtitle={`${league.name} • ${league.seasonLabel}`}
        tag={league.isDemo ? "Demo data" : undefined}
        actions={
          hasPicks ? (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              <Switch checked={showProjected} onChange={setShowProjected} label="Show projected" />
              <Select
                label="Sort picks"
                value={sort}
                onChange={setSort}
                className="w-48"
                options={[
                  { value: "traditional", label: "Sort: Traditional" },
                  { value: "quality", label: "Sort: Pick quality" },
                ]}
              />
              {showProjected && (
                <p className="flex items-center gap-1.5 text-sm text-fog-300">
                  <Info aria-hidden className="size-4" />
                  Points include fades
                </p>
              )}
            </div>
          ) : undefined
        }
      />

      {!hasPicks ? (
        <Panel bodyClassName="flex flex-col items-start gap-3 px-4 py-8 sm:px-5">
          <p className="text-fog-300">No picks yet. Rosters fill in as the draft runs.</p>
          <Link href={`/l/${league.id}/draft`} className={buttonClasses("secondary", "sm")}>
            Go to the draft room
          </Link>
        </Panel>
      ) : (
        <div className="@container">
          <div className="grid gap-4 @2xl:grid-cols-2 @5xl:grid-cols-4">
            {columns.map((column) => (
              <RosterColumn key={column.manager.id} column={column} sort={sort} showProjected={showProjected} />
            ))}
          </div>
        </div>
      )}

      {hasPicks && (
        <p className="text-sm text-fog-400">
          {showProjected
            ? "Turn off Show projected to hide projected scores and pace."
            : "Turn on Show projected to see projected scores and pace."}
        </p>
      )}
    </div>
  );
}
