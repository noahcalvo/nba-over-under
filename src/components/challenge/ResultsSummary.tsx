import { Hash, Lock, Target, TrendingUp, Trophy } from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import { SignedValue } from "@/components/ui/SignedValue";
import { formatDateTimeET, NOT_AVAILABLE } from "@/lib/format";
import type { EntryResultsData } from "@/server/challenge-pages";

/** The locked entry's headline numbers. Never a zero before a game: unscored reads "Not available" / "Pending" / "–". */
export function ResultsSummary({ data }: { data: EntryResultsData }) {
  const { score, season, rank, entrants, phase } = data;
  const settled = phase === "final";
  const frozen = season?.frozen ?? null;
  const scored = score?.projectedScored ?? 0;
  return (
    <section aria-label="Entry summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <StatCard
        icon={<TrendingUp className="size-7" />}
        label="Projected score"
        value={<SignedValue value={score?.projectedTotal ?? null} digits={2} empty={NOT_AVAILABLE} className={score?.projectedTotal == null ? "text-xl sm:text-2xl" : ""} />}
        sub="From each team's win pace"
      />
      <StatCard
        icon={<Trophy className="size-7" />}
        label="Final score"
        value={<SignedValue value={score?.finalTotal ?? null} digits={2} empty="Pending" className={score?.finalTotal == null ? "text-xl sm:text-2xl" : ""} />}
        sub="Once every team has played 82"
      />
      <StatCard
        icon={<Target className="size-7" />}
        label={settled ? "Correct picks" : "Picks on pace"}
        value={scored === 0 ? "–" : `${score?.onPace ?? 0} / ${scored}`}
        sub={scored === 0 ? "No games yet" : settled ? "Of picks with a frozen line" : "Of picks whose team has played"}
      />
      <StatCard
        icon={<Hash className="size-7" />}
        label="Rank"
        value={rank === null ? "–" : `#${rank} of ${entrants}`}
        sub={rank === null ? "Ranks start with the first games" : undefined}
      />
      <StatCard
        icon={<Lock className="size-7" />}
        label="Frozen lines"
        value={frozen ? frozen.source : "Pending"}
        sub={frozen ? `Locked ${formatDateTimeET(frozen.lockedAt)}` : "Freezing at the deadline"}
      />
    </section>
  );
}
