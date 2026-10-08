import { Check } from "lucide-react";
import type { SideRef } from "@/lib/draft-filters";
import { formatNumber } from "@/lib/format";
import { findManager, managerLabel } from "@/lib/league/managers";
import type { DraftPick, Manager, Side, Team } from "@/lib/types";

const STYLES: Record<Side, { idle: string; selected: string }> = {
  OVER: { idle: "border-over/70 bg-over-deep text-over hover:bg-over/20", selected: "border-over bg-over text-accent-ink" },
  UNDER: {
    idle: "border-under/70 bg-under-deep text-under-ink hover:bg-under/30",
    selected: "border-under bg-under text-white",
  },
};

const BASE = "flex h-10 w-full min-w-0 items-center justify-center gap-1.5 rounded-lg border px-3 text-sm";

export function SideButton({
  team,
  side,
  pick,
  selected,
  managers,
  disabled,
  blockedNote,
  onSelect,
}: {
  team: Team;
  side: Side;
  pick: DraftPick | undefined;
  selected: boolean;
  managers: Manager[];
  disabled: boolean;
  /** Why the manager on the clock can't take this side (they hold the team's other side). */
  blockedNote?: string;
  onSelect: (ref: SideRef) => void;
}) {
  if (pick) {
    const owner = findManager(managers, pick.managerId);
    const label = owner ? managerLabel(owner) : "Drafted";
    return (
      <span
        className={`${BASE} border-ink-600 bg-ink-800 text-fog-400`}
        title={`${side} drafted by ${label} at pick ${pick.pickNumber}`}
      >
        <span className="sr-only">{side} drafted by </span>
        <span className="truncate">{label}</span>
      </span>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`${side} ${formatNumber(team.line)}, ${team.city} ${team.name}${blockedNote ? ` (${blockedNote})` : ""}`}
      title={blockedNote}
      disabled={disabled || blockedNote !== undefined}
      onClick={() => onSelect({ teamId: team.id, side })}
      className={`${BASE} font-display font-bold tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        selected ? STYLES[side].selected : STYLES[side].idle
      }`}
    >
      {selected && <Check aria-hidden className="size-4" />}
      {side}
    </button>
  );
}
