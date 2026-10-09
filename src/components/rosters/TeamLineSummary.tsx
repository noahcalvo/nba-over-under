import { TeamLogo } from "@/components/ui/TeamLogo";
import { TeamLink } from "@/components/ui/TeamLink";
import { formatNumber } from "@/lib/format";
import type { ScoredCall } from "@/lib/standings";

/** Logo, team name and "line · Pace" for one pick or fade target. */
export function TeamLineSummary({ call, showProjected }: { call: ScoredCall; showProjected: boolean }) {
  const { team, evaluation } = call;
  return (
    <>
      <TeamLink teamId={team.id} decorative>
        <TeamLogo team={team} size={36} />
      </TeamLink>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-fog-50">
          <TeamLink teamId={team.id}>{team.name}</TeamLink>
        </p>
        <p className="flex min-w-0 items-center gap-1.5 text-sm text-fog-400">
          <span className="font-semibold tabular-nums text-fog-50">
            <span className="sr-only">Line </span>
            {formatNumber(team.line)}
          </span>
          {showProjected && (
            <>
              <span aria-hidden>·</span>
              <span className="truncate tabular-nums">
                Pace {evaluation.wins === null ? "—" : formatNumber(evaluation.wins, 2)}
              </span>
            </>
          )}
        </p>
      </div>
    </>
  );
}
