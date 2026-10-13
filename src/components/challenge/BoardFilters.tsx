"use client";

import { X } from "lucide-react";
import { Select } from "@/components/ui/Select";
import { FILTER_OPTIONS, SORT_OPTIONS, type TeamFilter, type TeamSort } from "@/lib/challenge/grid";

function filterClass(active: boolean): string {
  return `h-10 shrink-0 rounded-lg border px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
    active ? "border-accent bg-accent/10 text-accent" : "border-ink-600 text-fog-50 hover:border-fog-400"
  }`;
}

export function BoardFilters({
  filter,
  onFilter,
  movedOnly,
  onMovedOnly,
  sort,
  onSort,
  counts,
}: {
  filter: TeamFilter;
  onFilter: (filter: TeamFilter) => void;
  movedOnly: boolean;
  onMovedOnly: (movedOnly: boolean) => void;
  sort: TeamSort;
  onSort: (sort: TeamSort) => void;
  counts: { unpicked: number };
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <div role="group" aria-label="Show teams" className="-m-1 flex min-w-0 max-w-full gap-2 overflow-x-auto p-1">
        {FILTER_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={filter === option.value}
            onClick={() => onFilter(option.value)}
            className={filterClass(filter === option.value)}
          >
            {option.label}
            {option.value === "unpicked" && counts.unpicked > 0 && (
              <span className="ml-1.5 tabular-nums text-fog-400">{counts.unpicked}</span>
            )}
          </button>
        ))}
      </div>
      {movedOnly && (
        <button
          type="button"
          aria-label="Show all lines"
          onClick={() => onMovedOnly(false)}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-ink-600 bg-ink-800 pl-3 pr-2 text-sm font-semibold text-fog-50 hover:border-fog-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Moved lines only
          <X aria-hidden className="size-4 text-fog-400" />
        </button>
      )}
      <div className="flex min-w-0 items-center gap-2 sm:ml-auto">
        <span aria-hidden className="shrink-0 text-sm text-fog-400">
          Sort by
        </span>
        <Select label="Sort by" value={sort} onChange={onSort} options={[...SORT_OPTIONS]} className="w-56 max-w-full" />
      </div>
    </div>
  );
}
