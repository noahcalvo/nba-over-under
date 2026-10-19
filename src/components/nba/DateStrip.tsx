import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatGameDayShort } from "@/lib/format";
import { scheduleHref, type ScheduleParams } from "@/lib/nba-schedule/params";
import { shiftGameDay } from "@/lib/nba-schedule/game-day";

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const ARROW = `flex size-9 shrink-0 items-center justify-center rounded-lg border border-ink-700 bg-ink-900 text-fog-300 hover:text-fog-50 ${FOCUS}`;

/** Previous / next day arrows, the days around the selected one and a Today link. Every link keeps the other parameters. */
export function DateStrip({ params, strip, today }: { params: ScheduleParams; strip: string[]; today: string }) {
  return (
    <nav aria-label="Game day" className="flex flex-wrap items-center gap-2">
      <div className="flex w-full min-w-0 items-center gap-1.5 sm:w-auto">
        <Link href={scheduleHref(params, { day: shiftGameDay(params.day, -1) })} aria-label="Previous day" className={ARROW}>
          <ChevronLeft className="size-4" aria-hidden />
        </Link>
        <ul className="flex min-w-0 flex-1 gap-1.5 sm:flex-none">
          {strip.map((day) => {
            const [weekday, date] = formatGameDayShort(day).split(", ");
            const selected = day === params.day;
            return (
              <li key={day} className="min-w-0 flex-1 sm:flex-none">
                <Link
                  href={scheduleHref(params, { day })}
                  aria-current={selected ? "date" : undefined}
                  className={`flex flex-col items-center rounded-lg border px-2 py-1.5 text-xs leading-tight sm:px-3.5 sm:text-sm ${FOCUS} ${
                    selected
                      ? "border-accent bg-accent text-accent-ink"
                      : "border-ink-700 bg-ink-900 text-fog-300 hover:text-fog-50"
                  }`}
                >
                  <span className="font-semibold">{weekday}</span>
                  <span className="whitespace-nowrap">{date}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        <Link href={scheduleHref(params, { day: shiftGameDay(params.day, 1) })} aria-label="Next day" className={ARROW}>
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      </div>
      {params.day !== today && (
        <Link
          href={scheduleHref(params, { day: null })}
          className={`rounded-lg border border-ink-700 bg-ink-900 px-3.5 py-2 text-sm font-semibold text-fog-300 hover:text-fog-50 ${FOCUS}`}
        >
          Today
        </Link>
      )}
    </nav>
  );
}
