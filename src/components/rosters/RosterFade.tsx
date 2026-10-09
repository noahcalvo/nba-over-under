import { Crosshair } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { fadeStatus } from "@/lib/fade-status";
import { formatNumber, formatSigned } from "@/lib/format";
import { managerLabel } from "@/lib/league/managers";
import type { RosterColumn } from "@/lib/rosters";

export function RosterFade({
  fade,
  fadeTarget,
  showProjected,
}: Pick<RosterColumn, "fade" | "fadeTarget"> & { showProjected: boolean }) {
  return (
    <footer className="mt-auto border-t border-ink-700 px-4 py-3">
      <p className="flex items-center gap-2 text-sm font-medium text-fog-50">
        <Crosshair aria-hidden className="size-4 shrink-0 text-fog-300" />
        {fade && fadeTarget ? `Fading ${managerLabel(fadeTarget)}` : "No fade yet"}
      </p>
      {fade && (
        <div className="mt-2 flex items-center gap-3">
          <TeamLogo team={fade.target.team} size={36} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-fog-50">{fade.target.team.name}</p>
            <p className="flex min-w-0 items-center gap-1.5 text-sm text-fog-400">
              <span className="font-semibold tabular-nums text-fog-50">
                <span className="sr-only">Line </span>
                {formatNumber(fade.target.team.line)}
              </span>
              {showProjected && (
                <>
                  <span aria-hidden>·</span>
                  <span className="truncate tabular-nums">
                    Pace {fade.target.evaluation.wins === null ? "—" : formatNumber(fade.target.evaluation.wins, 2)}
                  </span>
                </>
              )}
            </p>
          </div>
          {showProjected && <FadeProjection evaluation={fade.evaluation} />}
        </div>
      )}
    </footer>
  );
}

/** Before the target's team has played, the fade is projected at 0 points with no status. */
function FadeProjection({ evaluation }: { evaluation: NonNullable<RosterColumn["fade"]>["evaluation"] }) {
  const status = evaluation.status === "scored" ? fadeStatus(evaluation) : null;
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      {status && <Badge tone={status.tone}>{status.label}</Badge>}
      <p className="text-xs tabular-nums text-fog-400">{formatSigned(evaluation.points ?? 0, 0)} projected pts</p>
    </div>
  );
}
