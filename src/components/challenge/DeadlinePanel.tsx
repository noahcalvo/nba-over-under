"use client";

import { Clock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { CHALLENGE } from "@/config/challenge";
import { TEAM_INFO } from "@/data/teams";
import { countdownParts } from "@/lib/challenge/board";
import type { OpeningGame } from "@/lib/challenge/types";
import { formatDateTimeET } from "@/lib/format";
import { RAIL_PANEL } from "./rail-panel";

const teamName = (teamId: string | null) => TEAM_INFO.find((team) => team.id === teamId)?.name ?? null;
const twoDigits = (value: number) => String(value).padStart(2, "0");

function openingText(game: OpeningGame): string {
  const [away, home] = game.teams.map(teamName);
  const matchup = away && home ? `${away} at ${home}, ` : "";
  return `Opening tip: ${matchup}${formatDateTimeET(game.tipoff)}`;
}

function Countdown({ ms }: { ms: number }) {
  const parts = countdownParts(ms);
  const units: Array<[string, number]> = [
    ["Days", parts.days],
    ["Hours", parts.hours],
    ["Minutes", parts.minutes],
    ["Seconds", parts.seconds],
  ];
  return (
    <div role="timer" aria-label="Time until picks lock" className="mt-4 flex items-start justify-between gap-1">
      {units.map(([label, value], index) => (
        <div key={label} className="contents">
          {index > 0 && (
            <span aria-hidden className="font-display text-3xl font-bold leading-[2.5rem] text-fog-400">
              :
            </span>
          )}
          <div className="flex min-w-0 flex-col items-center">
            <span className="font-display text-4xl font-bold leading-10 tabular-nums text-fog-50">{twoDigits(value)}</span>
            <span className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-fog-400">{label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function DeadlinePanel({
  deadline,
  openingGame,
  scheduleCheckedAt,
  scheduleError,
  lockedAt,
  clock,
  locked,
}: {
  deadline: string | null;
  openingGame: OpeningGame | null;
  scheduleCheckedAt: string | null;
  scheduleError: string | null;
  /** When the freeze was stored. */
  lockedAt: string | null;
  clock: number;
  locked: boolean;
}) {
  const router = useRouter();
  const remaining = deadline ? Date.parse(deadline) - clock : null;
  const reachedZero = !locked && remaining !== null && remaining <= 0;
  const refreshed = useRef(false);

  useEffect(() => {
    // The deadline passed while the page was open: the server freezes the lines on the next render.
    if (reachedZero && !refreshed.current) {
      refreshed.current = true;
      router.refresh();
    }
  }, [reachedZero, router]);

  const showLocked = locked || reachedZero;
  return (
    <section aria-labelledby="deadline-heading" className={RAIL_PANEL}>
      <h2 id="deadline-heading" className="flex items-center gap-2 font-display text-lg font-bold uppercase tracking-wider text-fog-50">
        <Clock aria-hidden className="size-5 text-accent" />
        {showLocked ? "Picks locked" : "Picks lock in"}
      </h2>
      {deadline === null ? (
        <p className="mt-3 text-sm text-fog-300">
          Deadline not known yet — the NBA schedule couldn&apos;t be read
          {scheduleError ? ` (${scheduleError})` : ""}.
        </p>
      ) : showLocked ? (
        <p className="mt-3 font-display text-3xl font-bold text-fog-50">
          {locked && lockedAt ? `Locked ${formatDateTimeET(lockedAt)}` : "Locked"}
        </p>
      ) : (
        <Countdown ms={remaining ?? 0} />
      )}
      <div className="mt-4 flex flex-col gap-1 text-sm text-fog-400">
        <p>
          {CHALLENGE.deadlineOverride
            ? "This season's deadline was moved past the opening game."
            : `Picks lock ${CHALLENGE.lockMinutesBeforeTipoff} minutes before the first regular-season game.`}
        </p>
        {deadline && (
          <p>
            Deadline: <span className="text-fog-300">{formatDateTimeET(deadline)}</span>
            {openingGame && <> · {openingText(openingGame)}</>}
          </p>
        )}
        {deadline && scheduleError && !showLocked && (
          <p>
            The schedule couldn&apos;t be re-checked
            {scheduleCheckedAt ? ` at ${formatDateTimeET(scheduleCheckedAt)}` : ""} ({scheduleError}); this deadline is
            from the last good read.
          </p>
        )}
      </div>
    </section>
  );
}
