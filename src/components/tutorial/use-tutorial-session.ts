"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  /** Bumped by a restart so the room's own state (selection, filters) starts over too. */
  generation: number;
}

function freshState(generation: number): SessionState {
  return { league: buildTutorialLeague(), progress: INITIAL_PROGRESS, generation };
}

/** Client only (DraftTour renders this after mount): resumes this tab's demo when its snapshot replays cleanly. */
function initialState(): SessionState {
  const restored = typeof window === "undefined" ? null : restoreTutorial(readTutorialSnapshot());
  return restored ? { ...restored, generation: 0 } : freshState(0);
}

/** The guided demo's league, held in memory: a DraftRoomDriver whose actions run the real rules and go nowhere. */
export function useTutorialSession() {
  const [state, setState] = useState(initialState);
  const [error, setError] = useState<string | null>(null);
  const teams = useMemo(() => tutorialTeams(), []);
  const { league, progress, generation } = state;

  useEffect(() => writeTutorialSnapshot(snapshotOf(league, progress)), [league, progress]);

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

  const restart = useCallback(() => {
    clearTutorialSnapshot();
    setError(null);
    setState((current) => freshState(current.generation + 1));
  }, []);

  return { league, progress, generation, driver, acknowledge, simulate, restart };
}
