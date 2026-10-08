import { SidePill } from "@/components/ui/SidePill";
import { TeamLogo } from "@/components/ui/TeamLogo";

import { picksForManager } from "@/lib/draft";
import { formatNumber } from "@/lib/format";
import { findManager, managerLabel } from "@/lib/league/managers";
import type { TeamLookup } from "@/lib/standings";
import type { League } from "@/lib/types";

export function ManagerPicks({
  league,
  teams,
  managerId,
  isViewer,
}: {
  league: League;
  teams: TeamLookup;
  managerId: string;
  isViewer: boolean;
}) {
  const manager = findManager(league.managers, managerId)!;
  const picks = picksForManager(league.draft, managerId);
  return (
    <section aria-labelledby="manager-picks-title" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="manager-picks-title" className="font-display text-xl font-semibold">
          {isViewer ? "Your picks" : `${managerLabel(manager)}'s picks`}
        </h3>
        <span className="text-sm text-fog-300">
          {picks.length} / {league.draft.rounds} drafted
        </span>
      </div>
      {picks.length === 0 ? (
        <p className="text-sm text-fog-400">No picks yet.</p>
      ) : (
        <ol className="divide-y divide-ink-700 rounded-lg border border-ink-700">
          {picks.map((pick) => {
            const team = teams[pick.teamId];
            return (
              <li key={pick.pickNumber} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="w-6 tabular-nums text-fog-400">{pick.pickNumber}</span>
                <TeamLogo team={team} size={26} />
                <span className="min-w-0 flex-1 truncate">{team.name}</span>
                <SidePill side={pick.side} size="sm" />
                <span className="w-10 text-right font-semibold tabular-nums">{formatNumber(team.line)}</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
