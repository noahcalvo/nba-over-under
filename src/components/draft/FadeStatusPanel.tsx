import { Crosshair } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { ManagerAvatar } from "@/components/ui/ManagerAvatar";
import { Panel } from "@/components/ui/Panel";
import { SidePill } from "@/components/ui/SidePill";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { fadeFor } from "@/lib/fades";
import { formatNumber } from "@/lib/format";
import { findManager, managerLabel } from "@/lib/league/managers";
import type { TeamLookup } from "@/lib/standings";
import type { League } from "@/lib/types";

/** Every manager's fade: locked with its target, or still waiting. */
export function FadeStatusPanel({
  league,
  teams,
  viewerId,
}: {
  league: League;
  teams: TeamLookup;
  viewerId: string | null;
}) {
  const locked = league.fades.length;
  return (
    <Panel
      title="Fades"
      icon={<Crosshair aria-hidden className="size-5 text-fog-300" />}
      actions={
        <span className="text-sm text-fog-300">
          {locked} of {league.managers.length} locked
        </span>
      }
    >
      <ul className="divide-y divide-ink-700">
        {league.managers.map((manager) => {
          const fade = fadeFor(league.fades, manager.id);
          const target = fade ? league.draft.picks.find((pick) => pick.pickNumber === fade.targetPickNumber) : undefined;
          const team = target ? teams[target.teamId] : undefined;
          const owner = target ? findManager(league.managers, target.managerId) : undefined;
          return (
            <li key={manager.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5">
              <ManagerAvatar manager={manager} size="sm" />
              <p className="min-w-0 flex-1 basis-28 truncate text-sm font-semibold">
                {managerLabel(manager)}
                {manager.id === viewerId && <span className="font-normal text-fog-400"> (you)</span>}
                {manager.displayName === null && <span className="font-normal text-fog-400"> · open seat</span>}
              </p>
              {target && team && owner ? (
                <div className="flex min-w-0 items-center gap-2 text-sm">
                  <TeamLogo team={team} size={26} />
                  <span className="truncate">{team.name}</span>
                  <SidePill side={target.side} size="sm" />
                  <span className="font-semibold tabular-nums">{formatNumber(team.line)}</span>
                  <span className="truncate text-xs text-fog-400">({managerLabel(owner)})</span>
                  <Badge tone="accent">Locked</Badge>
                </div>
              ) : (
                <Badge>Waiting</Badge>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
