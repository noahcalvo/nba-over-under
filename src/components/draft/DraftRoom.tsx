"use client";

import { Info } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Panel } from "@/components/ui/Panel";
import type { LeagueAccess } from "@/lib/access/links";
import { currentPickNumber, findPickForSide, holdsTeam, managerOnTheClock, type DraftAction } from "@/lib/draft";
import { DEFAULT_FILTERS, type SideRef, type TeamFilters } from "@/lib/draft-filters";
import { openFadeSeats } from "@/lib/fades";
import { findManager, managerLabel } from "@/lib/league/managers";
import { canControlDraft, canPickNow } from "@/lib/league/permissions";
import { describeTurn } from "@/lib/league/turn";
import { describeLineSet, indexTeams } from "@/lib/lines";
import type { LeagueView } from "@/lib/types";
import { AvailablePicks } from "./AvailablePicks";
import { DraftBoard } from "./DraftBoard";
import { DraftLobby } from "./DraftLobby";
import { DraftStatusBar } from "./DraftStatusBar";
import { FadeConfirm, FadeTargets } from "./FadePicker";
import { FadeStatusPanel } from "./FadeStatusPanel";
import { LineReviewPanel } from "./LineReviewPanel";
import { ManagerPicks } from "./ManagerPicks";
import { SelectionBar } from "./SelectionBar";
import { SelectionPreview } from "./SelectionPreview";
import { useLeagueDraft } from "./use-league-draft";

export function DraftRoom({ initial, access }: { initial: LeagueView; access: LeagueAccess }) {
  const { view, error, pending, dispatch, saveLineOverrides, dismissError } = useLeagueDraft(initial);
  const { league, viewerId } = view;
  const { draft } = league;
  const teamsById = useMemo(() => indexTeams(view.teams), [view.teams]);
  const [selection, setSelection] = useState<SideRef | null>(null);
  const [filters, setFilters] = useState<TeamFilters>(DEFAULT_FILTERS);
  const [linesDirty, setLinesDirty] = useState(false);
  const [fadeChoice, setFadeChoice] = useState<{ managerId: string | null; target: number | null }>({
    managerId: null,
    target: null,
  });
  const review = view.lineReview;
  // The "checked" tick belongs to one set of lines; any change to them clears it.
  const linesKey = review ? JSON.stringify(review.lines) : "";
  const [reviewedKey, setReviewedKey] = useState<string | null>(null);
  const reviewed = reviewedKey === linesKey;
  const startBlocker = !review
    ? null
    : review.missing.length > 0
      ? `Enter lines for the ${review.missing.length} team${review.missing.length === 1 ? "" : "s"} still missing one.`
      : linesDirty
        ? "Save or discard your line changes first."
        : !reviewed
          ? "Check the lines below, then tick the box."
          : null;

  // A selection stops being active, and says why, when someone else drafts that side (seen via polling) or when the
  // manager now on the clock holds the team's other side (the list disables it for them too).
  const takenBy = selection ? findPickForSide(draft, selection.teamId, selection.side) : undefined;
  const onClock = findManager(league.managers, managerOnTheClock(draft));
  const heldByOnClock =
    draft.status === "live" && selection !== null && onClock !== undefined && holdsTeam(draft, onClock.id, selection.teamId);
  const activeSelection = selection && !takenBy && !heldByOnClock && draft.status === "live" ? selection : null;
  let notice: string | null = null;
  if (selection && takenBy) {
    notice = `${teamsById[selection.teamId].name} ${selection.side} was drafted by ${managerLabel(
      findManager(league.managers, takenBy.managerId)!,
    )}. Pick another side.`;
  } else if (selection && heldByOnClock) {
    notice = `${teamsById[selection.teamId].name} ${selection.side}: ${managerLabel(onClock)} has the other side. Pick another side.`;
  }

  const turn = describeTurn(league, viewerId);
  const canPick = canPickNow(league, viewerId);
  const canControl = canControlDraft(league, viewerId);
  const focusManagerId = viewerId ?? managerOnTheClock(draft) ?? league.managers[0].id;

  // Fade stage: the seat this viewer is fading for (their own first, then open seats for the commissioner) and the
  // opponent pick they chose. Both fall back when polling shows the seat locked or the choice no longer fits.
  const fadeSeats = openFadeSeats(league, viewerId);
  const fadingFor = fadeChoice.managerId !== null && fadeSeats.includes(fadeChoice.managerId) ? fadeChoice.managerId : fadeSeats[0] ?? null;
  const fadeTarget =
    fadingFor === null
      ? null
      : (draft.picks.find((pick) => pick.pickNumber === fadeChoice.target && pick.managerId !== fadingFor) ?? null);

  async function confirmFade() {
    if (fadingFor === null || fadeTarget === null) return;
    const choice = fadeChoice;
    setFadeChoice({ managerId: null, target: null });
    const ok = await dispatch({ type: "fade", managerId: fadingFor, targetPickNumber: fadeTarget.pickNumber });
    if (!ok) setFadeChoice(choice);
  }

  const clearFade = () => setFadeChoice((current) => ({ ...current, target: null }));

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
        <>
          <DraftLobby
            league={league}
            access={access}
            viewerId={viewerId}
            canControl={canControl}
            pending={pending}
            onStart={() => run({ type: "start", lines: review?.lines })}
            startBlocker={startBlocker}
            reviewed={reviewed}
            onReviewedChange={(checked) => setReviewedKey(checked ? linesKey : null)}
            teamCount={review?.rows.length ?? view.teams.length}
          />
          {review && (
            <LineReviewPanel
              key={JSON.stringify(review.overrides)}
              review={review}
              canEdit={canControl}
              pending={pending}
              onSave={saveLineOverrides}
              onDirtyChange={setLinesDirty}
            />
          )}
        </>
      ) : (
        <DraftStatusBar
          league={league}
          invitePath={access.invitePath}
          turn={turn}
          canControl={canControl}
          pending={pending}
          onPause={() => run({ type: "pause" })}
          onResume={() => run({ type: "resume" })}
        />
      )}
      <DraftBoard league={league} teams={teamsById} />
      {draft.status === "fades" ? (
        fadingFor === null ? (
          <FadeStatusPanel league={league} teams={teamsById} viewerId={viewerId} />
        ) : (
          <>
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
              <FadeTargets
                league={league}
                teams={teamsById}
                seats={fadeSeats}
                fadingFor={fadingFor}
                onFadingForChange={(managerId) => setFadeChoice({ managerId, target: null })}
                selected={fadeTarget?.pickNumber ?? null}
                onSelect={(target) => setFadeChoice({ managerId: fadingFor, target })}
              />
              <div className="flex min-w-0 flex-col gap-6 xl:sticky xl:top-8 xl:self-start">
                <Panel
                  title={fadingFor === viewerId ? "Your fade" : "Fade"}
                  bodyClassName="flex flex-col gap-5 p-4 sm:p-5"
                >
                  <FadeConfirm
                    league={league}
                    teams={teamsById}
                    fadingFor={fadingFor}
                    target={fadeTarget}
                    pending={pending}
                    onConfirm={confirmFade}
                    onClear={clearFade}
                  />
                </Panel>
                <FadeStatusPanel league={league} teams={teamsById} viewerId={viewerId} />
              </div>
            </div>
            <SelectionBar
              teams={teamsById}
              selection={fadeTarget}
              notice={null}
              canPick
              confirmLabel="Lock fade"
              pending={pending}
              onConfirm={confirmFade}
              onClear={clearFade}
            />
            {fadeTarget && <div aria-hidden className="h-20 xl:hidden" />}
          </>
        )
      ) : (
        <>
          {draft.status === "complete" && league.fades.length > 0 && (
            <FadeStatusPanel league={league} teams={teamsById} viewerId={viewerId} />
          )}
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
                  notice={notice}
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
                  {draft.status === "not_started"
                    ? "Lines lock when the draft starts."
                    : league.lines
                      ? `Lines locked when the draft started: ${describeLineSet(league.lines)}.`
                      : "Lines locked when the draft started."}
                </p>
              </Panel>
            </div>
          </div>
          <SelectionBar
            teams={teamsById}
            selection={activeSelection}
            notice={notice}
            canPick={canPick}
            pending={pending}
            onConfirm={confirm}
            onClear={clear}
          />
          {(activeSelection || notice) && <div aria-hidden className="h-20 xl:hidden" />}
        </>
      )}
    </div>
  );
}
