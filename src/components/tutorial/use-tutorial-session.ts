"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DraftRoomDriver } from "@/components/draft/DraftRoomView";
import { buildTutorialLeague, TUTORIAL_VIEWER_ID, tutorialTeams } from "@/data/tutorial-league";
import type { DraftCommand } from "@/lib/fades";
import { ERROR_MESSAGES } from "@/lib/league/errors";
import { applyTutorialCommand } from "@/lib/tutorial/session";
import { simulateAll, simulateStep, type SimulationKind } from "@/lib/tutorial/simulation";
import { restoreTutorial, snapshotOf } from "@/lib/tutorial/snapshot";
import { INITIAL_PROGRESS, type TutorialProgress } from "@/lib/tutorial/steps";
import type { League, LeagueView } from "@/lib/types";
import { clearTutorialSnapshot, readTutorialSnapshot, writeTutorialSnapshot } from "./storage";

interface SessionState {
  league: League;
  progress: TutorialProgress;
}

/** Client only (DraftTour renders this after mount): resumes this tab's demo when its snapshot replays cleanly. */
function initialState(): SessionState {
  const restored = typeof window === "undefined" ? null : restoreTutorial(readTutorialSnapshot());
  return restored ?? { league: buildTutorialLeague(), progress: INITIAL_PROGRESS };
}

/** The guided demo's league, held in memory: a DraftRoomDriver whose actions run the real rules and go nowhere. */
export function useTutorialSession() {
  const [state, setState] = useState(initialState);
  const [error, setError] = useState<string | null>(null);
  const teams = useMemo(() => tutorialTeams(), []);
  const { league, progress } = state;
  // Set by exit, so a simulated step landing during the navigation away can't save the demo again.
  const exited = useRef(false);

  useEffect(() => {
    if (!exited.current) writeTutorialSnapshot(snapshotOf(league, progress));
  }, [league, progress]);

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
      setState((current) => ({ ...current, league: result.value }));
      return true;
    },
    [league],
  );

  const driver = useMemo<DraftRoomDriver>(
    () => ({
      view,
      error,
      pending: false,
      dispatch,
      // The demo starts live, so the lobby (lines, league size) never shows.
      saveLineOverrides: async () => false,
      saveConfig: async () => false,
      dismissError: () => setError(null),
    }),
    [view, error, dispatch],
  );

  const acknowledge = useCallback(
    (flag: keyof TutorialProgress) =>
      setState((current) => ({ ...current, progress: { ...current.progress, [flag]: true } })),
    [],
  );

  /** One simulated command, or (skip) all that remain. Both reach the same league. */
  const simulate = useCallback(
    (kind: SimulationKind, all: boolean) =>
      setState((current) => {
        const next = (all ? simulateAll : simulateStep)(current.league, teams, kind);
        return next === current.league ? current : { ...current, league: next };
      }),
    [teams],
  );

  /** Leaving ends the demo: the next visit starts over from step 1. */
  const exit = useCallback(() => {
    exited.current = true;
    clearTutorialSnapshot();
  }, []);

  return { league, progress, driver, acknowledge, simulate, exit };
}
