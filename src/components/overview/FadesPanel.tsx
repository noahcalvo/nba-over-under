import { ArrowRight, Crosshair } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Panel";
import { SidePill } from "@/components/ui/SidePill";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { TeamLink } from "@/components/ui/TeamLink";
import { fadeStatus } from "@/lib/fade-status";
import { formatNumber } from "@/lib/format";
import { findManager, managerLabel } from "@/lib/league/managers";
import type { StandingRow } from "@/lib/standings";
import type { Manager } from "@/lib/types";

export function FadesPanel({ row, managers }: { row: StandingRow; managers: Manager[] }) {
  return (
    <Panel title="Fade picks" icon={<Crosshair aria-hidden className="size-5 text-fog-300" />}>
      {row.fades.length === 0 ? (
        <p className="px-4 py-5 text-sm text-fog-400 sm:px-5">No fades for this manager.</p>
      ) : (
        <ul className="divide-y divide-ink-700">
          {row.fades.map(({ fade, target, evaluation }) => {
            const from = findManager(managers, fade.managerId)!;
            const to = findManager(managers, target.pick.managerId)!;
            const status = fadeStatus(evaluation);
            return (
              <li key={fade.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
                <div className="text-xs text-fog-300">
                  <p className="font-semibold text-fog-50">{managerLabel(from)}</p>
                  <p className="flex items-center gap-1">
                    <ArrowRight aria-label="fading" className="size-3" />
                    {managerLabel(to)}
                  </p>
                </div>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <TeamLink teamId={target.team.id} decorative>
                    <TeamLogo team={target.team} size={32} />
                  </TeamLink>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      <TeamLink teamId={target.team.id}>{target.team.name}</TeamLink>
                    </p>
                    <p className="flex items-center gap-1.5 text-xs">
                      <SidePill side={target.pick.side} size="sm" />
                      <span className="tabular-nums">{formatNumber(target.team.line)}</span>
                    </p>
                  </div>
                </div>
                <Badge tone={status.tone}>{status.label}</Badge>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
