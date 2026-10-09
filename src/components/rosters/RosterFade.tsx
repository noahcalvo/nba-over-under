import { Crosshair } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { SignedValue } from "@/components/ui/SignedValue";
import { fadeStatus } from "@/lib/fade-status";
import { managerLabel } from "@/lib/league/managers";
import type { RosterColumn } from "@/lib/rosters";
import { TeamLineSummary } from "./TeamLineSummary";

export function RosterFade({
  fade,
  fadeTarget,
  showProjected,
}: Pick<RosterColumn, "fade" | "fadeTarget"> & { showProjected: boolean }) {
  // Before the target's team has played, the fade is projected at 0 points with no status.
  const status = fade && showProjected && fade.evaluation.status === "scored" ? fadeStatus(fade.evaluation) : null;
  return (
    <footer className="mt-auto border-t border-ink-700 px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-2 text-sm font-medium text-fog-50">
          <Crosshair aria-hidden className="size-4 shrink-0 text-fog-300" />
          <span className="truncate">{fade && fadeTarget ? `Fading ${managerLabel(fadeTarget)}` : "No fade yet"}</span>
        </p>
        {status && <Badge tone={status.tone}>{status.label}</Badge>}
      </div>
      {fade && (
        <div className="mt-2 flex items-center gap-3">
          <TeamLineSummary call={fade.target} showProjected={showProjected} />
          {showProjected && (
            <span className="shrink-0 font-display text-xl font-bold">
              <SignedValue value={fade.evaluation.points ?? 0} digits={0} suffix="pts" />
            </span>
          )}
        </div>
      )}
    </footer>
  );
}
