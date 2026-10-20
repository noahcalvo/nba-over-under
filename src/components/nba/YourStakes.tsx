import { SidePill } from "@/components/ui/SidePill";
import { formatNumber } from "@/lib/format";
import { managerLabel } from "@/lib/league/managers";
import type { YourStake } from "@/lib/nba-schedule/interest";
import type { TeamInfo } from "@/lib/types";

/** The viewer's own rows in one compact list. Conflicting stakes are all listed; nothing is netted. */
export function YourStakes({ stakes, teams }: { stakes: YourStake[]; teams: TeamInfo[] }) {
  const nameOf = (id: string) => teams.find((t) => t.id === id)?.name ?? id;
  return (
    <section aria-label="Your stakes" className="rounded-lg border border-accent/50 border-l-4 bg-accent/5 px-4 py-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-accent">Your stakes</h3>
      <ul className="flex flex-col gap-2 text-sm text-fog-300">
        {stakes.map((stake, i) => (
          <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {stake.kind === "fade" && stake.targetManager && <span>{`Fading ${managerLabel(stake.targetManager)}'s`}</span>}
            <span className="font-semibold text-fog-50">{nameOf(stake.teamId)}</span>
            <SidePill side={stake.side} size="sm" />
            {stake.line !== null && <span className="tabular-nums">{formatNumber(stake.line)}</span>}
            <span>· {stake.source.kind === "league" ? stake.source.leagueName : "30/30 Challenge"}</span>
            <span className="font-semibold text-fog-50">→ rooting for {nameOf(stake.rootingFor)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
