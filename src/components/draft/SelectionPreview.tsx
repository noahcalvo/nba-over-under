import { Button } from "@/components/ui/Button";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { SEASON } from "@/config/league";
import { currentPickNumber } from "@/lib/draft";
import type { SideRef } from "@/lib/draft-filters";
import { formatNumber } from "@/lib/format";
import { findManager, managerLabel } from "@/lib/league/managers";
import type { TurnSummary } from "@/lib/league/turn";
import type { TeamLookup } from "@/lib/standings";
import type { DraftStatus, League } from "@/lib/types";

const EMPTY_MESSAGE: Record<DraftStatus, string> = {
  live: "Choose an Over or Under from Available picks to preview it here.",
  paused: "The draft is paused.",
  not_started: "The draft hasn't started yet.",
  complete: "The draft is complete.",
};

export function SelectionPreview({
  league,
  teams,
  selection,
  notice,
  turn,
  canPick,
  pending,
  onConfirm,
  onClear,
}: {
  league: League;
  teams: TeamLookup;
  selection: SideRef | null;
  notice: string | null;
  turn: TurnSummary;
  canPick: boolean;
  pending: boolean;
  onConfirm: () => void;
  onClear: () => void;
}) {
  if (!selection) {
    return (
      <div className="rounded-lg border border-dashed border-ink-600 px-4 py-6 text-center text-sm text-fog-300">
        {notice && (
          <p role="status" className="mb-2 font-semibold text-negative">
            {notice}
          </p>
        )}
        <p>{EMPTY_MESSAGE[league.draft.status]}</p>
      </div>
    );
  }

  const team = teams[selection.teamId];
  const onClock = findManager(league.managers, turn.managerId);
  const pickNumber = currentPickNumber(league.draft);
  const waiting = league.draft.status === "paused" ? "The draft is paused." : onClock ? `Waiting on ${managerLabel(onClock)}.` : "";

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-ink-700 bg-ink-900/70 p-4">
      <div className="flex items-center gap-4">
        <TeamLogo team={team} size={72} />
        <div className="min-w-0">
          <p className="truncate font-display text-xl font-semibold">
            {team.city} {team.name}
          </p>
          <p className="font-display text-2xl font-bold">
            <span className={selection.side === "OVER" ? "text-over" : "text-under"}>{selection.side}</span>{" "}
            {formatNumber(team.line)} <span className="text-base font-semibold text-fog-300">wins</span>
          </p>
          {onClock && pickNumber !== null && (
            <p className="text-sm text-fog-300">
              {managerLabel(onClock)} · Pick {pickNumber}
            </p>
          )}
        </div>
      </div>
      <dl className="flex items-center justify-between border-t border-ink-700 pt-3 text-sm">
        <dt className="text-fog-300">{SEASON.previousLabel} wins</dt>
        <dd className="font-display text-xl font-bold">{team.prevWins}</dd>
      </dl>
      <Button size="lg" onClick={onConfirm} disabled={!canPick || pending}>
        Confirm pick
      </Button>
      {!canPick && waiting && <p className="-mt-2 text-center text-xs text-fog-400">{waiting}</p>}
      <Button variant="secondary" onClick={onClear}>
        Clear selection
      </Button>
    </div>
  );
}
