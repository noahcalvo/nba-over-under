"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/Badge";
import { ManagerAvatar } from "@/components/ui/ManagerAvatar";
import { Panel } from "@/components/ui/Panel";
import { SidePill } from "@/components/ui/SidePill";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { completedRounds, currentPickNumber, draftTotalPicks, pickNumberFor } from "@/lib/draft";
import { formatNumber } from "@/lib/format";
import { findManager, managerLabel } from "@/lib/league/managers";
import type { TeamLookup } from "@/lib/standings";
import type { DraftPick, DraftStatus, League, Team } from "@/lib/types";

export function DraftBoard({ league, teams }: { league: League; teams: TeamLookup }) {
  const { draft, managers } = league;
  const seatCount = draft.seatOrder.length;
  const current = currentPickNumber(draft);
  const total = draftTotalPicks(draft);
  const upNext = current !== null && current < total ? current + 1 : null;
  const picksByNumber = new Map(draft.picks.map((pick) => [pick.pickNumber, pick]));
  const voidedByNumber = new Map(draft.voidedPicks.map((pick) => [pick.pickNumber, pick]));
  const seats = draft.seatOrder.map((id) => findManager(managers, id)!);
  const rounds = Array.from({ length: draft.rounds }, (_, index) => index + 1);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Keep the current pick in view by scrolling the board's own container, never the page.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || current === null) return;
    const cell = scroller.querySelector<HTMLElement>(`[data-pick="${current}"]`);
    if (!cell) return;
    scroller.scrollTo({
      top: Math.max(0, cell.offsetTop - scroller.clientHeight / 2 + cell.offsetHeight / 2),
      left: Math.max(0, cell.offsetLeft - scroller.clientWidth / 2 + cell.offsetWidth / 2),
      behavior: "smooth",
    });
  }, [current]);

  return (
    <Panel
      title={
        <>
          Draft board
          <span className="ml-2 font-sans text-sm font-normal text-fog-400">
            Snake draft ·{" "}
            {draft.blockedPick === null
              ? `${draft.rounds} rounds`
              : `${completedRounds(draft)} of ${draft.rounds} rounds completed`}
          </span>
        </>
      }
    >
      <div
        ref={scrollerRef}
        tabIndex={0}
        aria-label="Draft board (scrollable)"
        className="relative isolate @container max-h-72 overflow-auto rounded-b-xl focus-visible:outline-2 focus-visible:outline-accent"
      >
        <div
          role="table"
          aria-label="Draft board"
          className="grid min-w-[56rem]"
          style={{ gridTemplateColumns: `4rem repeat(${seatCount}, minmax(13rem, 1fr))` }}
        >
          <div role="row" className="contents">
            <div role="columnheader" className="sticky left-0 top-0 z-20 border-b border-ink-700 bg-ink-850">
              <span className="sr-only">Round</span>
            </div>
            {seats.map((manager) => (
              <div
                role="columnheader"
                key={manager.id}
                className="sticky top-0 z-10 flex items-center gap-2 border-b border-l border-ink-700 bg-ink-850 px-3 py-2"
              >
                <ManagerAvatar manager={manager} size="sm" />
                <span className="truncate text-sm font-semibold">{managerLabel(manager)}</span>
              </div>
            ))}
          </div>
          {rounds.map((round) => (
            <div role="row" key={round} className="contents">
              <div
                role="rowheader"
                className="sticky left-0 z-10 flex items-center gap-1 border-b border-ink-700 bg-ink-850 px-3 text-sm font-semibold text-fog-300"
              >
                R{round}
                {round % 2 === 1 ? (
                  <ArrowRight aria-hidden className="size-4" />
                ) : (
                  <ArrowLeft aria-hidden className="size-4" />
                )}
                <span className="sr-only">{round % 2 === 1 ? "picks left to right" : "picks right to left"}</span>
              </div>
              {seats.map((manager, seat) => {
                const pickNumber = pickNumberFor(round, seat, seatCount);
                const pick = picksByNumber.get(pickNumber) ?? voidedByNumber.get(pickNumber);
                return (
                  <BoardCell
                    key={manager.id}
                    pickNumber={pickNumber}
                    pick={pick}
                    voided={voidedByNumber.has(pickNumber)}
                    team={pick ? teams[pick.teamId] : undefined}
                    state={
                      pickNumber === draft.blockedPick
                        ? "blocked"
                        : pickNumber === current
                          ? "current"
                          : pickNumber === upNext
                            ? "next"
                            : "open"
                    }
                    status={draft.status}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function BoardCell({
  pickNumber,
  pick,
  voided,
  team,
  state,
  status,
}: {
  pickNumber: number;
  pick: DraftPick | undefined;
  voided: boolean;
  team: Team | undefined;
  state: "current" | "next" | "open" | "blocked";
  status: DraftStatus;
}) {
  const base = "flex min-h-14 items-center gap-2 border-b border-l border-ink-700 px-3 py-2 text-sm";
  if (pick && team) {
    return (
      <div role="cell" data-pick={pickNumber} className={`${base} ${voided ? "bg-ink-900/60" : ""}`}>
        <span className="w-5 shrink-0 text-xs tabular-nums text-fog-400">{pickNumber}</span>
        <span className={`flex shrink-0 ${voided ? "opacity-50" : ""}`}>
          <TeamLogo team={team} size={26} />
        </span>
        <span
          className={`min-w-0 flex-1 truncate ${voided ? "text-fog-400 line-through" : ""}`}
          title={`${team.city} ${team.name}${voided ? " (voided)" : ""}`}
        >
          <span className="@5xl:hidden">{team.id}</span>
          <span className="hidden @5xl:inline">{team.name}</span>
        </span>
        <SidePill side={pick.side} size="sm" />
        {voided ? (
          <Badge tone="danger">Voided</Badge>
        ) : (
          <span className="shrink-0 font-semibold tabular-nums">{formatNumber(team.line)}</span>
        )}
      </div>
    );
  }
  const currentLabel = status === "live" ? "On the clock" : status === "paused" ? "Paused" : "First pick";
  const label =
    state === "blocked" ? "No eligible pick" : state === "current" ? currentLabel : state === "next" ? "Up next" : "—";
  return (
    <div
      role="cell"
      data-pick={pickNumber}
      className={`${base} ${state === "current" ? "rounded-md border-2 border-accent bg-accent/5" : ""}`}
    >
      <span className="w-5 shrink-0 text-xs tabular-nums text-fog-400">{pickNumber}</span>
      <span
        className={`flex-1 text-center ${
          state === "current" ? "font-semibold text-accent" : state === "blocked" ? "font-semibold text-negative" : "text-fog-300"
        }`}
      >
        {label}
      </span>
    </div>
  );
}
