import { Check, Crosshair, Pause, Play } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonClasses } from "@/components/ui/Button";
import { ManagerAvatar } from "@/components/ui/ManagerAvatar";
import { completedRounds, currentPickNumber, draftTotalPicks, managerUpNext, roundOf } from "@/lib/draft";
import { findManager, managerLabel, openSeats } from "@/lib/league/managers";
import type { TurnSummary } from "@/lib/league/turn";
import { tourTarget } from "@/lib/tour/targets";
import type { League, Manager } from "@/lib/types";
import { CopyLink } from "@/components/access/CopyLink";

export function DraftStatusBar({
  league,
  invitePath,
  turn,
  canControl,
  pending,
  onPause,
  onResume,
  completeAction,
}: {
  league: League;
  /** Commissioner only. */
  invitePath: string | null;
  turn: TurnSummary;
  canControl: boolean;
  pending: boolean;
  onPause: () => void;
  onResume: () => void;
  /** Replaces the "League overview" link once the draft is complete. */
  completeAction?: ReactNode;
}) {
  const { draft, managers } = league;
  const total = draftTotalPicks(draft);
  const pickNumber = currentPickNumber(draft);
  const manager = findManager(managers, turn.managerId);
  const upNext = findManager(managers, managerUpNext(draft));
  const paused = draft.status === "paused";
  const archived = league.archivedAt !== null;
  const picksIn =
    draft.blockedPick === null
      ? `All ${total} picks are in`
      : `Draft ended early after round ${completedRounds(draft)} of ${draft.rounds} · ${draft.picks.length} picks kept`;

  return (
    <section
      {...tourTarget("draft-status")}
      aria-live="polite"
      className="flex flex-wrap items-center gap-4 rounded-xl border border-ink-700 bg-ink-850/90 px-4 py-4 sm:px-6"
    >
      <div className="flex min-w-0 flex-1 basis-64 items-center gap-4">
        {manager ? (
          <ManagerAvatar
            manager={manager}
            size="lg"
            className={turn.kind === "your_turn" || turn.kind === "picking_for_open_seat" ? "ring-2 ring-accent" : ""}
          />
        ) : (
          <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-ink-800 text-accent">
            {turn.kind === "fades" ? <Crosshair aria-hidden className="size-6" /> : <Check aria-hidden className="size-6" />}
          </span>
        )}
        <div className="min-w-0">
          <p className="font-display text-xl font-semibold sm:text-2xl">
            <TurnHeadline turn={turn} manager={manager} />
          </p>
          <p className="text-sm text-fog-300">
            {turn.kind === "fades"
              ? `${picksIn} · ${league.fades.length} of ${managers.length} fades locked`
              : pickNumber === null
                ? `${picksIn}${league.fades.length > 0 ? ` · ${league.fades.length} fades locked` : ""}.`
                : `Round ${roundOf(pickNumber, draft.seatOrder.length)} of ${draft.rounds} · Pick ${pickNumber} of ${total}`}
          </p>
        </div>
      </div>
      {upNext && (
        <p className="text-sm text-fog-300 sm:border-l sm:border-ink-700 sm:pl-4">
          Up next: <span className="font-semibold text-fog-50">{managerLabel(upNext)}</span>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {invitePath && turn.kind !== "complete" && openSeats(managers).length > 0 && (
          <CopyLink path={invitePath} label="Invite link" compact />
        )}
        {turn.kind === "complete" ? (
          (completeAction ?? (
            <Link href={`/l/${league.id}`} className={buttonClasses("secondary")}>
              League overview
            </Link>
          ))
        ) : turn.kind === "fades" ? (
          <Badge tone="accent">Fades</Badge>
        ) : canControl ? (
          paused ? (
            <Button onClick={onResume} disabled={pending}>
              <Play aria-hidden className="size-4" />
              Resume draft
            </Button>
          ) : (
            <Button variant="secondary" onClick={onPause} disabled={pending}>
              <Pause aria-hidden className="size-4" />
              Pause draft
            </Button>
          )
        ) : (
          <Badge tone={archived ? "neutral" : paused ? "danger" : "accent"}>{archived ? "Archived" : paused ? "Paused" : "Live"}</Badge>
        )}
      </div>
    </section>
  );
}

function TurnHeadline({ turn, manager }: { turn: TurnSummary; manager: Manager | undefined }) {
  const name = manager ? managerLabel(manager) : "";
  switch (turn.kind) {
    case "your_turn":
      return (
        <>
          <span className="text-accent">Your turn</span> · {name}
        </>
      );
    case "picking_for_open_seat":
      return (
        <>
          <span className="text-accent">Picking for {name}</span> · open seat
        </>
      );
    case "on_the_clock":
      return <>On the clock · {name}</>;
    case "paused":
      return (
        <>
          <span className="text-negative">Draft paused</span> · {name} is up
        </>
      );
    case "archived":
      return <>Draft stopped · read-only</>;
    case "fades":
      return (
        <>
          <span className="text-accent">Fade picks</span> · one per manager
        </>
      );
    case "complete":
      return <>Draft complete</>;
    case "not_started":
      return <>Draft not started</>;
  }
}
