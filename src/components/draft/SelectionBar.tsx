import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { SEASON } from "@/config/league";
import type { SideRef } from "@/lib/draft-filters";
import { formatNumber } from "@/lib/format";
import type { TeamLookup } from "@/lib/standings";
import type { TourTargetId } from "@/lib/tour/targets";

export function SelectionBar({
  teams,
  selection,
  notice,
  canPick,
  confirmLabel = "Confirm",
  pending,
  onConfirm,
  onClear,
  tourBar,
  tourConfirm,
}: {
  teams: TeamLookup;
  selection: SideRef | null;
  notice: string | null;
  canPick: boolean;
  confirmLabel?: string;
  pending: boolean;
  onConfirm: () => void;
  onClear: () => void;
  /** Names the selection bar for a guided tour (data-tour). */
  tourBar?: TourTargetId;
  /** Names the confirm button for a guided tour (data-tour). */
  tourConfirm?: TourTargetId;
}) {
  if (!selection && !notice) return null;
  const frame =
    "fixed inset-x-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 flex items-center gap-3 rounded-xl border bg-ink-900/95 p-3 shadow-2xl backdrop-blur lg:bottom-4 lg:left-[17rem] xl:hidden";
  if (!selection) {
    return (
      <div className={`${frame} border-negative/50`}>
        <p className="min-w-0 flex-1 text-sm">{notice}</p>
        <Button size="sm" variant="ghost" onClick={onClear} aria-label="Dismiss">
          <X aria-hidden className="size-4" />
        </Button>
      </div>
    );
  }
  const team = teams[selection.teamId];
  return (
    <div data-tour={tourBar} className={`${frame} border-ink-600`}>
      <TeamLogo team={team} size={36} />
      <div className="min-w-0 flex-1 text-sm">
        <p className="truncate">
          <span className="font-semibold">{team.name}</span>{" "}
          <span className={selection.side === "OVER" ? "text-over" : "text-under"}>{selection.side}</span>{" "}
          {formatNumber(team.line)}
        </p>
        <p className="truncate text-xs text-fog-300">
          {SEASON.previousLabel}: {team.prevWins} wins
        </p>
      </div>
      <Button size="sm" variant="ghost" onClick={onClear} aria-label="Clear selection">
        <X aria-hidden className="size-4" />
      </Button>
      <Button data-tour={tourConfirm} size="sm" onClick={onConfirm} disabled={!canPick || pending}>
        {confirmLabel}
      </Button>
    </div>
  );
}
