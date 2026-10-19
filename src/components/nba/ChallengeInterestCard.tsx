import { Target } from "lucide-react";
import { TeamChip } from "@/components/nba/TeamChip";
import { Badge } from "@/components/ui/Badge";
import { SidePill } from "@/components/ui/SidePill";
import { formatNumber } from "@/lib/format";
import type { ChallengeInterest, ChallengeRow } from "@/lib/nba-schedule/interest";
import type { TeamInfo } from "@/lib/types";

const LINE_LABEL: Record<ChallengeRow["lineKind"], string> = {
  frozen: "Frozen line",
  at_pick: "Line when picked",
  unavailable: "Line unavailable",
};

/** Your own 30/30 Challenge sides on the game's two teams. Always yours, so every row carries the accent edge and "You". */
export function ChallengeInterestCard({ interest, teams }: { interest: ChallengeInterest; teams: TeamInfo[] }) {
  return (
    <section className="overflow-hidden rounded-lg border border-ink-700 bg-ink-900/60">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-ink-700 px-4 py-3">
        <h3 className="flex min-w-0 items-center gap-2 font-semibold text-fog-50">
          <Target aria-hidden className="size-4 shrink-0 text-accent" />
          <span className="truncate">30/30 Challenge</span>
        </h3>
        <p className="min-w-0 truncate text-sm text-fog-400">{interest.entryName}</p>
      </header>
      {interest.rows.length === 0 ? (
        <p className="px-4 py-4 text-sm text-fog-300">Your entry has no side on either team.</p>
      ) : (
        <ul className="divide-y divide-ink-700/60">
          {interest.rows.map((row) => {
            const team = teams.find((t) => t.id === row.teamId);
            const rooting = teams.find((t) => t.id === row.rootingFor);
            return (
              <li key={row.teamId} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-l-2 border-accent bg-accent/5 px-3 py-3 sm:px-4">
                <Badge tone="accent">You</Badge>
                <div className="flex min-w-0 flex-1 basis-48 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fog-300">
                  <TeamChip team={team} id={row.teamId} href={`/challenge/teams/${row.teamId}`} />
                  <SidePill side={row.side} size="sm" />
                  <span>
                    {LINE_LABEL[row.lineKind]}
                    {row.line !== null && <span className="tabular-nums"> {formatNumber(row.line)}</span>}
                  </span>
                </div>
                <p className="text-sm text-fog-300">Rooting for {rooting?.name ?? row.rootingFor}</p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
