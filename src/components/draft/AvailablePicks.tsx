"use client";

import { Search } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { Select } from "@/components/ui/Select";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { TOTAL_SIDES } from "@/data/teams";
import { findPickForSide } from "@/lib/draft";
import { availableSideCount, filterTeams, SIDES, type SideRef, type TeamFilters } from "@/lib/draft-filters";
import { formatNumber } from "@/lib/format";
import type { DraftState, Manager, Side, Team } from "@/lib/types";
import { SideButton } from "./SideButton";

export function AvailablePicks({
  teams: allTeams,
  draft,
  managers,
  filters,
  onFiltersChange,
  selection,
  onSelect,
  selectable,
}: {
  teams: Team[];
  draft: DraftState;
  managers: Manager[];
  filters: TeamFilters;
  onFiltersChange: (filters: TeamFilters) => void;
  selection: SideRef | null;
  onSelect: (ref: SideRef) => void;
  selectable: boolean;
}) {
  const teams = filterTeams(allTeams, draft, filters);
  const button = (team: Team, side: Side) => (
    <SideButton
      team={team}
      side={side}
      pick={findPickForSide(draft, team.id, side)}
      selected={selection?.teamId === team.id && selection.side === side}
      managers={managers}
      disabled={!selectable}
      onSelect={onSelect}
    />
  );

  return (
    <Panel
      title="Available picks"
      bodyClassName="@container"
      actions={
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <label className="relative min-w-0 flex-1 basis-40 sm:w-56 sm:flex-none">
            <span className="sr-only">Search teams</span>
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fog-400" />
            <input
              type="search"
              value={filters.query}
              onChange={(event) => onFiltersChange({ ...filters, query: event.target.value })}
              placeholder="Search teams"
              className="h-10 w-full rounded-lg border border-ink-600 bg-ink-900 pl-9 pr-3 text-sm text-fog-50 placeholder:text-fog-400 focus:border-accent focus:outline-none"
            />
          </label>
          <Select
            label="Conference"
            value={filters.conference}
            onChange={(conference) => onFiltersChange({ ...filters, conference })}
            options={[
              { value: "all", label: "All conferences" },
              { value: "East", label: "East" },
              { value: "West", label: "West" },
            ]}
          />
          <Select
            label="Availability"
            value={filters.availability}
            onChange={(availability) => onFiltersChange({ ...filters, availability })}
            options={[
              { value: "available", label: "Available" },
              { value: "all", label: "All teams" },
            ]}
          />
        </div>
      }
    >
      <table className="hidden w-full text-sm @xl:table">
        <thead className="text-left text-xs uppercase tracking-wider text-fog-400">
          <tr className="border-b border-ink-700">
            <th scope="col" className="px-5 py-3 font-semibold">Team</th>
            <th scope="col" className="px-3 py-3 text-right font-semibold">Line</th>
            <th scope="col" className="w-36 px-3 py-3 text-center font-semibold">Under</th>
            <th scope="col" className="w-36 px-3 py-3 text-center font-semibold">Over</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((team) => (
            <tr key={team.id} className="border-b border-ink-700/70">
              <td className="px-5 py-2.5">
                <div className="flex items-center gap-3">
                  <TeamLogo team={team} size={32} />
                  <span className="font-medium">
                    {team.city} {team.name}
                  </span>
                </div>
              </td>
              <td className="px-3 py-2.5 text-right text-base font-semibold tabular-nums">{formatNumber(team.line)}</td>
              {SIDES.map((side) => (
                <td key={side} className="px-3 py-2.5">
                  {button(team, side)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="divide-y divide-ink-700 @xl:hidden">
        {teams.map((team) => (
          <li key={team.id} className="px-4 py-3">
            <div className="flex items-center gap-3">
              <TeamLogo team={team} size={32} />
              <span className="min-w-0 flex-1 truncate font-medium">
                {team.city} {team.name}
              </span>
              <span className="font-semibold tabular-nums">{formatNumber(team.line)}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {SIDES.map((side) => (
                <div key={side}>{button(team, side)}</div>
              ))}
            </div>
          </li>
        ))}
      </ul>

      {teams.length === 0 && <p className="px-5 py-6 text-sm text-fog-400">No teams match these filters.</p>}
      <p className="border-t border-ink-700 px-5 py-3 text-sm text-fog-300">
        {availableSideCount(draft, allTeams.length)} of {TOTAL_SIDES} sides available
      </p>
    </Panel>
  );
}
