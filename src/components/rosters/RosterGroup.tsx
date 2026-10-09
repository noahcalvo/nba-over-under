import { SidePill } from "@/components/ui/SidePill";
import { SignedValue } from "@/components/ui/SignedValue";
import { projectedPoints, type RosterGroup as Group } from "@/lib/rosters";
import type { ScoredCall } from "@/lib/standings";
import type { Side } from "@/lib/types";
import { TeamLineSummary } from "./TeamLineSummary";

const GROUPS: Record<Side, { label: string; box: string; heading: string }> = {
  OVER: {
    label: "Overs",
    box: "border-over/80 bg-over/[0.06] shadow-[0_0_18px_-6px_var(--color-over)]",
    heading: "text-over",
  },
  UNDER: {
    label: "Unders",
    box: "border-under/80 bg-under/[0.08] shadow-[0_0_18px_-6px_var(--color-under)]",
    heading: "text-under",
  },
};

export function RosterGroup({
  id,
  group,
  showProjected,
}: {
  /** Unique per page, for the heading's id. */
  id: string;
  group: Group;
  showProjected: boolean;
}) {
  if (group.side === null) {
    return (
      <section aria-label="Picks by quality" className="-mx-px rounded-xl border-2 border-ink-600 px-3 py-1">
        <PickList calls={group.calls} showProjected={showProjected} showSide />
      </section>
    );
  }
  const style = GROUPS[group.side];
  return (
    <section aria-labelledby={id} className={`relative -mx-px rounded-xl border-2 px-3 pb-1 pt-4 ${style.box}`}>
      <h3
        id={id}
        className={`absolute -top-3.5 left-3 bg-ink-850 px-1.5 font-display text-2xl font-bold uppercase leading-none tracking-wide ${style.heading}`}
      >
        {style.label}
      </h3>
      <PickList calls={group.calls} showProjected={showProjected} showSide={false} />
    </section>
  );
}

function PickList({
  calls,
  showProjected,
  showSide,
}: {
  calls: ScoredCall[];
  showProjected: boolean;
  showSide: boolean;
}) {
  return (
    <ul className="divide-y divide-ink-700/60">
      {calls.map((call) => {
        const { pick } = call;
        return (
          <li key={pick.pickNumber} className="flex items-center gap-3 py-2">
            <TeamLineSummary call={call} showProjected={showProjected} />
            {showSide && <SidePill side={pick.side} size="sm" />}
            {showProjected && (
              <span className="shrink-0 font-display text-xl font-bold">
                <SignedValue value={projectedPoints(call)} digits={2} />
                <span className="sr-only"> points</span>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
