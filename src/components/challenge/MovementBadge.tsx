import { ArrowDown, ArrowUp } from "lucide-react";
import { formatNumber } from "@/lib/format";

/** The size of a line move, neutral in colour: a move is neither good nor bad news for the pick. */
export function MovementBadge({ move }: { move: number }) {
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
