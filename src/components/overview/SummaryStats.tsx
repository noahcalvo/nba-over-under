import { ChartColumn, ChartLine, Trophy } from "lucide-react";
import { BallIcon } from "@/components/icons/BallIcon";
import { SignedValue } from "@/components/ui/SignedValue";
import { StatCard } from "@/components/ui/StatCard";
import { formatNumber, formatOrdinal, formatSigned, NOT_AVAILABLE } from "@/lib/format";
import type { StandingRow, Standings } from "@/lib/standings";

export function SummaryStats({ row, standings, isViewer }: { row: StandingRow; standings: Standings; isViewer: boolean }) {
  const projected = standings.basis === "projected";
  // Before any game nothing is scored: no rank, points or gap yet.
  const ranked = standings.anyScored;
  const leading = row.rank === 1;
  return (
    <section aria-label="Summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        icon={<Trophy className="size-8" />}
        label={isViewer ? "Your rank" : "Rank"}
        value={ranked ? `${formatOrdinal(row.rank)} / ${standings.rows.length}` : "—"}
        sub={!ranked ? "No games played yet" : !projected && !standings.complete ? "Partial results" : undefined}
      />
      <StatCard
        icon={<ChartLine className="size-8" />}
        label={projected ? "Projected points" : "Final points"}
        value={<SignedValue value={ranked ? row.totalPoints : null} empty={NOT_AVAILABLE} />}
        sub={ranked ? `Margin ${formatSigned(row.totalMargin)} · Fades ${formatSigned(row.fadePoints)}` : undefined}
      />
      <StatCard
        icon={<ChartColumn className="size-8" />}
        label={projected ? "Picks on pace" : "Correct calls"}
        value={ranked ? `${row.correctCalls} / ${projected ? row.calls.length : row.scoredCalls}` : "—"}
        sub={projected ? undefined : `${row.scoredCalls} of ${row.calls.length} settled`}
      />
      <StatCard
        icon={<BallIcon className="size-8" />}
        label="Gap to first"
        value={!ranked || leading ? "—" : formatNumber(row.gapToFirst)}
        sub={!ranked ? "No games played yet" : leading ? "In first place" : "points behind the leader"}
      />
    </section>
  );
}
