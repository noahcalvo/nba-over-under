import { ManagerAvatar } from "@/components/ui/ManagerAvatar";
import type { InterestSummary } from "@/lib/nba-schedule/interest";

const SHOWN = 3;

/** Up to three of the managers with picks or fades on a game, then "+n". Nothing when no one has a stake. */
export function InterestAvatars({ summary, className = "" }: { summary: InterestSummary; className?: string }) {
  if (summary.count === 0) return null;
  const extra = summary.managers.length - SHOWN;
  return (
    <div role="img" aria-label={`${summary.count} picks and fades in your leagues`} className={`flex shrink-0 items-center ${className}`}>
      {summary.managers.slice(0, SHOWN).map(({ leagueId, manager }) => (
        <ManagerAvatar key={`${leagueId}:${manager.id}`} manager={manager} size="sm" className="-ml-1.5 ring-2 ring-ink-850 first:ml-0" />
      ))}
      {extra > 0 && <span className="ml-1.5 text-xs font-semibold text-fog-300">+{extra}</span>}
      {summary.managers.length === 0 && <span className="rounded-full bg-ink-800 px-2 py-0.5 text-xs font-semibold text-fog-300">{summary.count}</span>}
    </div>
  );
}
