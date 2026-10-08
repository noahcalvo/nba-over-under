import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { TEAMS_BY_ID } from "@/data/teams";
import type { SideRef } from "@/lib/draft-filters";
import { formatNumber } from "@/lib/format";

export function SelectionBar({
  selection,
  notice,
  canPick,
  pending,
  onConfirm,
  onClear,
}: {
  selection: SideRef | null;
  notice: string | null;
  canPick: boolean;
  pending: boolean;
  onConfirm: () => void;
  onClear: () => void;
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
  const team = TEAMS_BY_ID[selection.teamId];
  return (
    <div className={`${frame} border-ink-600`}>
      <TeamLogo team={team} size={36} />
      <p className="min-w-0 flex-1 truncate text-sm">
        <span className="font-semibold">{team.name}</span>{" "}
        <span className={selection.side === "OVER" ? "text-over" : "text-under"}>{selection.side}</span>{" "}
        {formatNumber(team.line)}
      </p>
      <Button size="sm" variant="ghost" onClick={onClear} aria-label="Clear selection">
        <X aria-hidden className="size-4" />
      </Button>
      <Button size="sm" onClick={onConfirm} disabled={!canPick || pending}>
        Confirm
      </Button>
    </div>
  );
}
