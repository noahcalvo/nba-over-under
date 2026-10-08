import { SCORING } from "@/config/scoring";
import { formatNumber } from "@/lib/format";
import type { Side } from "@/lib/types";

/** Fill = projected wins, tick = the line, both on a 0–season-length scale. */
export function PaceBar({
  value,
  line,
  side,
  max = SCORING.seasonGames,
  className = "",
}: {
  value: number | null;
  line: number;
  side: Side;
  max?: number;
  className?: string;
}) {
  const percent = (n: number) => `${Math.min(100, Math.max(0, (n / max) * 100))}%`;
  const label =
    value === null
      ? `Win pace not available; line ${formatNumber(line)}`
      : `Win pace ${formatNumber(value)} against a line of ${formatNumber(line)}`;
  return (
    <div role="img" aria-label={label} className={`relative h-2 w-full min-w-16 rounded-full bg-ink-700 ${className}`}>
      {value !== null && (
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${side === "OVER" ? "bg-over" : "bg-under"}`}
          style={{ width: percent(value) }}
        />
      )}
      <div
        aria-hidden
        className="absolute -top-1 h-4 w-0.5 -translate-x-1/2 rounded bg-fog-50"
        style={{ left: percent(line) }}
      />
    </div>
  );
}
