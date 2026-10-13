"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { TeamLogo } from "@/components/ui/TeamLogo";
import type { BoardCard } from "@/lib/challenge/board";
import { formatNumber } from "@/lib/format";
import type { Side } from "@/lib/types";

const SIDES: ReadonlyArray<{ side: Side; label: string }> = [
  { side: "OVER", label: "Over" },
  { side: "UNDER", label: "Under" },
];

const SIDE_BASE = "h-10 rounded-lg font-display font-bold uppercase tracking-wide";
const SELECTED: Record<Side, string> = { OVER: "bg-over text-accent-ink", UNDER: "bg-under text-white" };

function sideClass(side: Side, selected: Side | null): string {
  const base = `${SIDE_BASE} transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`;
  if (selected === side) return `${base} ${SELECTED[side]}`;
  if (selected === null) return `${base} border border-dashed border-ink-600 text-fog-400 hover:border-fog-400`;
  return `${base} border border-ink-600 bg-ink-900 text-fog-300 hover:border-fog-400`;
}

/** After the lock: the selected side only, not a control. */
function LockedPick({ side }: { side: Side | null }) {
  if (side === null) {
    return (
      <p className={`mt-3 flex items-center justify-center border border-dashed border-ink-600 text-fog-400 ${SIDE_BASE}`}>
        No pick
      </p>
    );
  }
  const label = SIDES.find((option) => option.side === side)?.label ?? side;
  return (
    <p className={`mt-3 flex items-center justify-center ${SIDE_BASE} ${SELECTED[side]}`}>
      <span className="sr-only">Your pick: </span>
      {label}
    </p>
  );
}

/** The size of a line move, neutral in colour: a move is neither good nor bad news for the pick. */
function MoveBadge({ move }: { move: number }) {
  const size = formatNumber(Math.abs(move));
  const Arrow = move > 0 ? ArrowUp : ArrowDown;
  return (
    <span
      role="img"
      aria-label={`Line moved ${move > 0 ? "up" : "down"} ${size} wins since you saved`}
      className="inline-flex items-center gap-0.5 rounded-md border border-ink-600 bg-ink-800 px-1.5 text-xs font-semibold text-fog-50"
    >
      <Arrow aria-hidden className="size-3" />
      {size}
    </span>
  );
}

function LineRow({ team, frozen }: { team: BoardCard; frozen: boolean }) {
  if (team.line === null) {
    return <p className="mt-2 text-fog-400">{frozen ? "No frozen line" : "No line posted"}</p>;
  }
  const line = formatNumber(team.line);
  if (frozen) {
    return (
      <div className="mt-2">
        <p className="text-xs uppercase tracking-wider text-fog-400">Frozen line</p>
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span>
            <strong className="text-2xl text-fog-50">{line}</strong> <span className="text-fog-300">wins</span>
          </span>
        </p>
        {team.move !== null && team.reference !== null && (
          <p className="text-sm text-fog-400">Picked at {formatNumber(team.reference)}</p>
        )}
      </div>
    );
  }
  if (team.move !== null && team.reference !== null) {
    return (
      <p className="mt-2 flex flex-wrap items-baseline gap-x-2">
        <span className="text-fog-300">
          <s className="text-fog-400">{formatNumber(team.reference)}</s>
          <span aria-hidden> → </span>
          <span className="sr-only"> now </span>
          <strong className="text-2xl text-fog-50">{line}</strong> wins
        </span>
        <MoveBadge move={team.move} />
      </p>
    );
  }
  return (
    <p className="mt-2 flex flex-wrap items-baseline gap-x-2 text-fog-300">
      <span>
        <strong className="text-2xl text-fog-50">{line}</strong> wins
      </span>
    </p>
  );
}

export function TeamPickCard({
  team,
  locked,
  frozen,
  hasSaved,
  onPick,
}: {
  team: BoardCard;
  locked: boolean;
  frozen: boolean;
  /** An entry was saved: only then does a card flag its change from it. */
  hasSaved: boolean;
  onPick: (side: Side) => void;
}) {
  const fullName = `${team.info.city} ${team.info.name}`;
  const unsaved = !locked && hasSaved && team.side !== team.savedSide;
  return (
    <li className="min-w-0 rounded-xl border border-ink-700 bg-ink-850/90 p-3">
      <div className="flex items-start gap-3">
        <TeamLogo team={team.info} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="font-display text-lg font-bold leading-tight text-fog-50">{team.info.name}</h3>
            {unsaved && <Badge tone="accent">Unsaved</Badge>}
          </div>
          <p className="text-sm text-fog-400">
            {team.info.conference} • {team.division}
          </p>
        </div>
      </div>
      <LineRow team={team} frozen={frozen} />
      {locked ? (
        <LockedPick side={team.side} />
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {SIDES.map(({ side, label }) => (
            <button
              key={side}
              type="button"
              aria-pressed={team.side === side}
              aria-label={`${label}${team.line === null ? "" : ` ${formatNumber(team.line)}`} for the ${fullName}`}
              onClick={() => onPick(side)}
              className={sideClass(side, team.side)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}
