import { ManagerAvatar } from "@/components/ui/ManagerAvatar";
import { SignedValue } from "@/components/ui/SignedValue";
import { managerLabel } from "@/lib/league/managers";
import { rosterGroups, type RosterColumn as Column, type RosterSort } from "@/lib/rosters";
import { RosterFade } from "./RosterFade";
import { RosterGroup } from "./RosterGroup";

export function RosterColumn({
  column,
  sort,
  showProjected,
}: {
  column: Column;
  sort: RosterSort;
  showProjected: boolean;
}) {
  const { manager, standing, fade, fadeTarget } = column;
  const label = managerLabel(manager);
  const count = standing.calls.length;
  const groups = rosterGroups(standing.calls, sort);
  return (
    <article
      aria-label={`${label}'s roster`}
      className="flex min-w-0 flex-col rounded-xl border border-ink-700 bg-ink-850"
    >
      <header className="flex items-center gap-3 px-4 py-3">
        <ManagerAvatar manager={manager} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold text-fog-50">{label}</h2>
          <p className="text-sm text-fog-300">
            {count} {count === 1 ? "pick" : "picks"}
          </p>
        </div>
        {showProjected && (
          <div className="shrink-0 text-right">
            <p className="text-sm text-fog-50">Rank {standing.rank}</p>
            <p className="text-xs text-fog-400">Projected</p>
            <SignedValue
              value={standing.totalPoints}
              digits={2}
              suffix="pts"
              className="block font-display text-2xl font-bold leading-tight"
            />
          </div>
        )}
      </header>
      <div className="flex flex-col gap-6 pb-3 pt-4">
        {groups.length === 0 ? (
          <p className="px-4 text-sm text-fog-400">No picks yet.</p>
        ) : (
          groups.map((group) => (
            <RosterGroup
              key={group.side ?? "all"}
              id={`roster-${manager.id}-${group.side ?? "all"}`}
              group={group}
              showProjected={showProjected}
            />
          ))
        )}
      </div>
      <RosterFade fade={fade} fadeTarget={fadeTarget} showProjected={showProjected} />
    </article>
  );
}
