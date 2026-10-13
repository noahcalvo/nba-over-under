import { Circle, CircleCheck, Target } from "lucide-react";
import { TEAM_INFO } from "@/data/teams";
import { RAIL_PANEL } from "./rail-panel";

function Item({ done, children }: { done: boolean; children: React.ReactNode }) {
  const Icon = done ? CircleCheck : Circle;
  return (
    <li className="flex items-center gap-2.5">
      <Icon aria-hidden className={`size-5 shrink-0 ${done ? "text-accent" : "text-fog-400"}`} />
      <span className={done ? "text-fog-50" : "text-fog-300"}>
        {children}
        {done && <span className="sr-only"> (done)</span>}
      </span>
    </li>
  );
}

export function ProgressPanel({ selected, saved, dirty }: { selected: number; saved: boolean; dirty: boolean }) {
  const total = TEAM_INFO.length;
  const percent = Math.round((selected / total) * 100);
  const remaining = total - selected;
  return (
    <section aria-labelledby="progress-heading" className={RAIL_PANEL}>
      <h2 id="progress-heading" className="flex items-center gap-2 font-display text-xl font-bold text-fog-50">
        <Target aria-hidden className="size-5 text-accent" />
        Your Progress
      </h2>
      <p className="mt-3 font-display text-4xl font-bold tabular-nums text-fog-50">
        {selected} / {total}
      </p>
      <div className="mt-3 flex items-center gap-3">
        <div
          role="progressbar"
          aria-label="Teams picked"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={selected}
          className="h-2.5 flex-1 overflow-hidden rounded-full bg-ink-700"
        >
          <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${percent}%` }} />
        </div>
        <span className="w-10 text-right text-sm tabular-nums text-fog-300">{percent}%</span>
      </div>
      <ul className="mt-4 flex flex-col gap-2.5 text-sm">
        <Item done={selected > 0}>
          {selected} {selected === 1 ? "team" : "teams"} selected
        </Item>
        <Item done={remaining === 0}>
          {remaining} {remaining === 1 ? "team" : "teams"} remaining
        </Item>
        <Item done={saved && !dirty}>Save completed challenge before the deadline</Item>
      </ul>
    </section>
  );
}
