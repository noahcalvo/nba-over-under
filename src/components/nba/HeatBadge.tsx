import { heat, heatLabel } from "@/lib/nba-schedule/form";
import type { Game } from "@/lib/game-log/types";

/** A flame or snowflake for a hot or cold team. The words are for screen readers and the tooltip; nothing for others. */
export function HeatBadge({ results }: { results: readonly Game[] }) {
  const state = heat(results);
  const label = heatLabel(results);
  if (!state || !label) return null;
  return (
    <span title={label} className="shrink-0 text-sm leading-none">
      <span aria-hidden>{state === "hot" ? "🔥" : "❄️"}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
