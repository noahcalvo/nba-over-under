"use client";

import { Info } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Panel } from "@/components/ui/Panel";
import { TEAMS_BY_ID } from "@/data/teams";
import { findPickForSide, managerOnTheClock, picksForManager, type DraftAction } from "@/lib/draft";
import { DEFAULT_FILTERS, type SideRef, type TeamFilters } from "@/lib/draft-filters";
import { findManager, managerLabel } from "@/lib/league/managers";
import { canControlDraft, canPickNow } from "@/lib/league/permissions";
import { describeTurn, pickingManagerId } from "@/lib/league/turn";
import type { LeagueView } from "@/lib/types";
import { AvailablePicks } from "./AvailablePicks";
import { DraftBoard } from "./DraftBoard";
import { DraftLobby } from "./DraftLobby";
import { DraftStatusBar } from "./DraftStatusBar";
import { ManagerPicks } from "./ManagerPicks";
import { SelectionBar } from "./SelectionBar";
import { SelectionPreview } from "./SelectionPreview";
import { useLeagueDraft } from "./use-league-draft";

export function DraftRoom({ initial }: { initial: LeagueView }) {
  const { view, error, pending, dispatch, dismissError } = useLeagueDraft(initial);
  const { league, viewerId } = view;
  const { draft } = league;
  const [selection, setSelection] = useState<SideRef | null>(null);
  const [filters, setFilters] = useState<TeamFilters>(DEFAULT_FILTERS);

  // A manager drafts at most one side of a team, so the other side is off-limits to whoever is picking.
  const pickingId = pickingManagerId(league, viewerId);
  const ownedTeamIds = new Set(pickingId ? picksForManager(draft, pickingId).map((pick) => pick.teamId) : []);
  const ownedNotice =
    pickingId === viewerId
      ? "You already drafted this team."
      : `${managerLabel(findManager(league.managers, pickingId)!)} already drafted this team.`;

  // A selection someone else drafts (seen via polling), or one the picking manager can no longer take,
  // stops being active and explains why.
  const takenBy = selection ? findPickForSide(draft, selection.teamId, selection.side) : undefined;
  const selectionOwned = selection !== null && ownedTeamIds.has(selection.teamId);
  const activeSelection = selection && !takenBy && !selectionOwned && draft.status === "live" ? selection : null;
  let notice: string | null = null;
  if (selection && takenBy) {
    notice = `${TEAMS_BY_ID[selection.teamId].name} ${selection.side} was drafted by ${managerLabel(
      findManager(league.managers, takenBy.managerId)!,
    )}. Pick another side.`;
  } else if (selection && selectionOwned) {
    notice = `${TEAMS_BY_ID[selection.teamId].name} ${selection.side}: ${ownedNotice}`;
  }

  const turn = describeTurn(league, viewerId);
  const canPick = canPickNow(league, viewerId);
  const canControl = canControlDraft(league, viewerId);
  const focusManagerId = viewerId ?? managerOnTheClock(draft) ?? league.managers[0].id;

  function run(action: DraftAction) {
    void dispatch(action);
  }

  async function confirm() {
    if (!activeSelection) return;
    const choice = activeSelection;
    setSelection(null);
    const ok = await dispatch({ type: "confirm", teamId: choice.teamId, side: choice.side });
    if (!ok) setSelection(choice);
  }

  const clear = () => setSelection(null);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Draft room"
        subtitle={`${league.name} • ${league.seasonLabel}`}
        tag={league.isDemo ? "Demo draft" : undefined}
      />
      {error && <Alert onDismiss={dismissError}>{error}</Alert>}
      {draft.status === "not_started" ? (
        <DraftLobby
          league={league}
          viewerId={viewerId}
          canControl={canControl}
          pending={pending}
          onStart={() => run({ type: "start" })}
        />
      ) : (
        <DraftStatusBar
          league={league}
          turn={turn}
          canControl={canControl}
          pending={pending}
          onPause={() => run({ type: "pause" })}
          onResume={() => run({ type: "resume" })}
        />
      )}
      <DraftBoard league={league} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
        <AvailablePicks
          draft={draft}
          managers={league.managers}
          filters={filters}
          onFiltersChange={setFilters}
          selection={activeSelection}
          onSelect={setSelection}
          selectable={draft.status === "live"}
          ownedTeamIds={ownedTeamIds}
          ownedNotice={ownedNotice}
        />
        <div className="min-w-0 xl:sticky xl:top-8 xl:self-start">
          <Panel title={viewerId ? "Your selection" : "Selection"} bodyClassName="flex flex-col gap-5 p-4 sm:p-5">
            <SelectionPreview
              league={league}
              selection={activeSelection}
              notice={notice}
              turn={turn}
              canPick={canPick}
              pending={pending}
              onConfirm={confirm}
              onClear={clear}
            />
            <ManagerPicks league={league} managerId={focusManagerId} isViewer={focusManagerId === viewerId} />
            <p className="flex items-center gap-2 text-sm text-fog-400">
              <Info aria-hidden className="size-4 shrink-0" />
              Lines lock when drafted.
            </p>
          </Panel>
        </div>
      </div>
      <SelectionBar
        selection={activeSelection}
        notice={notice}
        canPick={canPick}
        pending={pending}
        onConfirm={confirm}
        onClear={clear}
      />
      {(activeSelection || notice) && <div aria-hidden className="h-20 xl:hidden" />}
    </div>
  );
}
