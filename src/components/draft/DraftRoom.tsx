"use client";

import { Info } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Panel } from "@/components/ui/Panel";

import { currentPickNumber, findPickForSide, managerOnTheClock, type DraftAction } from "@/lib/draft";
import { DEFAULT_FILTERS, type SideRef, type TeamFilters } from "@/lib/draft-filters";
import { findManager, managerLabel } from "@/lib/league/managers";
import { canControlDraft, canPickNow } from "@/lib/league/permissions";
import { describeTurn } from "@/lib/league/turn";
import { indexTeams } from "@/lib/lines";
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
  const teamsById = useMemo(() => indexTeams(view.teams), [view.teams]);
  const [selection, setSelection] = useState<SideRef | null>(null);
  const [filters, setFilters] = useState<TeamFilters>(DEFAULT_FILTERS);

  // A selection someone else drafts (seen via polling) stops being active and explains why.
  const takenBy = selection ? findPickForSide(draft, selection.teamId, selection.side) : undefined;
  const activeSelection = selection && !takenBy && draft.status === "live" ? selection : null;
  const takenNotice =
    selection && takenBy
      ? `${teamsById[selection.teamId].name} ${selection.side} was drafted by ${managerLabel(
          findManager(league.managers, takenBy.managerId)!,
        )}. Pick another side.`
      : null;

  const turn = describeTurn(league, viewerId);
  const canPick = canPickNow(league, viewerId);
  const canControl = canControlDraft(league, viewerId);
  const focusManagerId = viewerId ?? managerOnTheClock(draft) ?? league.managers[0].id;

  function run(action: DraftAction) {
    void dispatch(action);
  }

  async function confirm() {
    const pickNumber = currentPickNumber(draft);
    if (!activeSelection || pickNumber === null) return;
    const choice = activeSelection;
    setSelection(null);
    const ok = await dispatch({ type: "confirm", teamId: choice.teamId, side: choice.side, pickNumber });
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
      <DraftBoard league={league} teams={teamsById} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
        <AvailablePicks
          teams={view.teams}
          draft={draft}
          managers={league.managers}
          filters={filters}
          onFiltersChange={setFilters}
          selection={activeSelection}
          onSelect={setSelection}
          selectable={draft.status === "live"}
        />
        <div className="min-w-0 xl:sticky xl:top-8 xl:self-start">
          <Panel title={viewerId ? "Your selection" : "Selection"} bodyClassName="flex flex-col gap-5 p-4 sm:p-5">
            <SelectionPreview
              league={league}
              teams={teamsById}
              selection={activeSelection}
              notice={takenNotice}
              turn={turn}
              canPick={canPick}
              pending={pending}
              onConfirm={confirm}
              onClear={clear}
            />
            <ManagerPicks
              league={league}
              teams={teamsById}
              managerId={focusManagerId}
              isViewer={focusManagerId === viewerId}
            />
            <p className="flex items-center gap-2 text-sm text-fog-400">
              <Info aria-hidden className="size-4 shrink-0" />
              {draft.status === "not_started" ? "Lines lock when the draft starts." : "Lines locked when the draft started."}
            </p>
          </Panel>
        </div>
      </div>
      <SelectionBar
        teams={teamsById}
        selection={activeSelection}
        notice={takenNotice}
        canPick={canPick}
        pending={pending}
        onConfirm={confirm}
        onClear={clear}
      />
      {(activeSelection || takenNotice) && <div aria-hidden className="h-20 xl:hidden" />}
    </div>
  );
}
