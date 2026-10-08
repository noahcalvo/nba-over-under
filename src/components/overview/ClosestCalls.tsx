import { Crosshair } from "lucide-react";
import { PaceBar } from "@/components/ui/PaceBar";
import { Panel } from "@/components/ui/Panel";
import { SidePill } from "@/components/ui/SidePill";
import { SignedValue } from "@/components/ui/SignedValue";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { formatNumber } from "@/lib/format";
import type { ScoredCall } from "@/lib/standings";

export function ClosestCalls({ calls }: { calls: ScoredCall[] }) {
  if (calls.length === 0) return null;
  return (
    <Panel
      title={
        <>
          Closest calls
          <span className="ml-2 font-sans text-sm font-normal text-fog-400">Picks that could swing the competition</span>
        </>
      }
      icon={<Crosshair aria-hidden className="size-5 text-fog-300" />}
      bodyClassName="@container"
    >
      <div className="grid gap-4 p-4 sm:p-5 @3xl:grid-cols-3">
        {calls.map(({ pick, team, evaluation }) => (
          <article
            key={pick.pickNumber}
            className="flex min-w-0 flex-col gap-4 rounded-lg border border-ink-700 bg-ink-900/70 p-4"
          >
            <div className="flex items-center gap-3">
              <TeamLogo team={team} size={44} />
              <div className="min-w-0">
                <h3 className="truncate font-semibold">
                  {team.city} {team.name}
                </h3>
                <p className="mt-1 flex items-center gap-2">
                  <SidePill side={pick.side} size="sm" />
                  <span className="font-semibold tabular-nums">{formatNumber(team.line)}</span>
                </p>
              </div>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 border-t border-ink-700 pt-3">
              <div className="min-w-0">
                <p className="text-xs text-fog-400">Pace</p>
                <div className="flex items-center gap-3">
                  <span className="font-display text-xl font-bold tabular-nums">{formatNumber(evaluation.wins ?? 0)}</span>
                  <PaceBar value={evaluation.wins} line={team.line} side={pick.side} />
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-fog-400">Proj. margin</p>
                <SignedValue value={evaluation.margin} className="font-display text-xl font-bold" />
              </div>
            </div>
          </article>
        ))}
      </div>
    </Panel>
  );
}
