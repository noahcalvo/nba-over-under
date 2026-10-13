"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { DraftRoomDriver } from "@/components/draft/DraftRoomView";
import { buildTutorialLeague, TUTORIAL_VIEWER_ID, tutorialTeams } from "@/data/tutorial-league";
import type { DraftCommand } from "@/lib/fades";
import { ERROR_MESSAGES } from "@/lib/league/errors";
import { INITIAL_SEASON_PROGRESS } from "@/lib/tutorial/season-steps";
import { applyTutorialCommand } from "@/lib/tutorial/session";
import { simulateAll, simulateStep, type SimulationKind } from "@/lib/tutorial/simulation";
import type { RestoredTutorial } from "@/lib/tutorial/snapshot";
import { INITIAL_PROGRESS, type TutorialProgress } from "@/lib/tutorial/steps";
import type { LeagueView } from "@/lib/types";
import { clearTutorial, getServerTutorialStore, getTutorialStore, saveTutorial, subscribeTutorial } from "./tutorial-store";

function freshTutorial(): RestoredTutorial {
  return { league: buildTutorialLeague(), progress: INITIAL_PROGRESS, season: INITIAL_SEASON_PROGRESS };
}

/**
 * The guided demo's league, held in this tab's tutorial store: a DraftRoomDriver whose actions run the real rules and
 * go nowhere. Client only (DraftTour renders this after mount). Until the first action the demo is a fresh league.
 */
export function useTutorialSession() {
  const { tutorial } = useSyncExternalStore(subscribeTutorial, getTutorialStore, getServerTutorialStore);
  const [fresh] = useState(freshTutorial);
  const state = tutorial ?? fresh;
  const [error, setError] = useState<string | null>(null);
  const teams = useMemo(() => tutorialTeams(), []);
  const { league, progress } = state;
  // Set by exit, so a simulated step landing during the navigation away can't save the demo again. Cleared whenever
  // the page shows again (Next keeps left routes mounted but hidden, and re-runs their effects on return).
  const exited = useRef(false);
  useEffect(() => {
    exited.current = false;
  }, []);

  /** Applies a change to the latest stored demo (or a fresh one) and saves it. */
  const update = useCallback(
    (change: (current: RestoredTutorial) => RestoredTutorial) => {
      if (exited.current) return;
      const current = getTutorialStore().tutorial ?? fresh;
      const next = change(current);
      if (next !== current) saveTutorial(next);
    },
    [fresh],
  );

  const view = useMemo<LeagueView>(
    () => ({ league, viewerId: TUTORIAL_VIEWER_ID, teams, lineReview: null, records: null }),
    [league, teams],
  );

  const dispatch = useCallback(
    async (command: DraftCommand) => {
      const result = applyTutorialCommand(league, TUTORIAL_VIEWER_ID, command);
      if (!result.ok) {
        setError(ERROR_MESSAGES[result.error]);
        return false;
      }
      setError(null);
      update((current) => ({ ...current, league: result.value }));
      return true;
    },
    [league, update],
  );

  const driver = useMemo<DraftRoomDriver>(
    () => ({
      view,
      error,
      pending: false,
      dispatch,
      // The demo starts live, so the lobby (lines, league size, draft order) never shows.
      saveLineOverrides: async () => false,
      saveConfig: async () => false,
      saveDraftOrder: async () => false,
      dismissError: () => setError(null),
    }),
    [view, error, dispatch],
  );

  const acknowledge = useCallback(
    (flag: keyof TutorialProgress) =>
      update((current) => ({ ...current, progress: { ...current.progress, [flag]: true } })),
    [update],
  );

  /** One simulated command, or (skip) all that remain. Both reach the same league. */
  const simulate = useCallback(
    (kind: SimulationKind, all: boolean) =>
      update((current) => {
        const next = (all ? simulateAll : simulateStep)(current.league, teams, kind);
        return next === current.league ? current : { ...current, league: next };
      }),
    [teams, update],
  );

  /** Leaving ends the demo: the next visit starts over from step 1. */
  const exit = useCallback(() => {
    exited.current = true;
    clearTutorial();
  }, []);

  return { league, progress, driver, acknowledge, simulate, exit };
}
