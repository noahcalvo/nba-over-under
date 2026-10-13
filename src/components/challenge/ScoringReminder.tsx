import { FileText } from "lucide-react";
import { SCORING } from "@/config/scoring";
import { formatNumber, formatSigned } from "@/lib/format";
import { RAIL_PANEL } from "./rail-panel";

export function ScoringReminder() {
  const plural = (points: number) => (Math.abs(points) === 1 ? "point" : "points");
  const items = [
    `${formatSigned(SCORING.correctCall, 0)} ${plural(SCORING.correctCall)} for a correct pick`,
    `${formatSigned(SCORING.missedCall, 0)} ${plural(SCORING.missedCall)} for an incorrect pick`,
    `±${formatNumber(SCORING.marginWeight)} per win of margin`,
    "0 points for a push",
    "All entries use the same frozen lines at the deadline",
  ];
  return (
    <section aria-labelledby="scoring-heading" className={RAIL_PANEL}>
      <h2 id="scoring-heading" className="flex items-center gap-2 font-display text-xl font-bold text-fog-50">
        <FileText aria-hidden className="size-5 text-accent" />
        Scoring Reminder
      </h2>
      <ul className="mt-3 flex flex-col gap-2 text-sm text-fog-300">
        {items.map((item) => (
          <li key={item} className="flex gap-2.5">
            <span aria-hidden className="mt-[0.45rem] size-1.5 shrink-0 rounded-full bg-accent" />
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
