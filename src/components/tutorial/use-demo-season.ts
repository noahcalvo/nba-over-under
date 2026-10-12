"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { DEMO_LEAGUE_ID } from "@/data/demo-league";
import { tutorialTeams } from "@/data/tutorial-league";
import { seasonEndYear } from "@/lib/records/season";
import { checkpointGames, draftSeed, simulateSeason, teamsAt } from "@/lib/tutorial/season";
import { advanceCheckpoint, markSeen, type SeasonProgress, type SeasonStepId } from "@/lib/tutorial/season-steps";
import { tutorialResult } from "@/lib/tutorial/snapshot";
import type { League } from "@/lib/types";
import { clearTutorial, getServerTutorialStore, getTutorialStore, saveTutorial, subscribeTutorial } from "./tutorial-store";

export const DEMO_DRAFT_HREF = `/l/${DEMO_LEAGUE_ID}/draft`;

/** Changes the stored season's progress (nothing to change without a completed demo). */
function updateSeason(change: (season: SeasonProgress) => SeasonProgress): void {
  const current = getTutorialStore().tutorial;
  if (!current || !tutorialResult(current.league)) return;
  const season = change(current.season);
  if (season !== current.season) saveTutorial({ ...current, season });
}

/**
 * The guided season over this tab's completed demo draft, or null without one. The season is derived from the draft
 * (same draft, same season), so only the checkpoint and the steps seen are state, saved with the draft in the shared
 * tutorial store: every demo page, shown or kept hidden by the router, sees the same place.
 */
export function useDemoSeason() {
  const router = useRouter();
  const { tutorial, generation } = useSyncExternalStore(subscribeTutorial, getTutorialStore, getServerTutorialStore);
  const league = tutorial?.league ?? null;
  const result = league ? tutorialResult(league) : null;
  const checkpoint = tutorial?.season.checkpoint ?? "draft";
  const seed = league ? draftSeed(league.draft) : null;

  const teams = useMemo(() => tutorialTeams(), []);
  const season = useMemo(() => (seed === null ? null : simulateSeason(teams, seed)), [teams, seed]);
  const games = checkpointGames(checkpoint);
  const teamsNow = useMemo(() => (season ? teamsAt(teams, season, games) : teams), [teams, season, games]);
  // Shown under the demo's own id, so its links stay in /l/demo, and labelled as demo data with demo permissions.
  const displayLeague = useMemo<League | null>(
    () => (league ? { ...league, id: DEMO_LEAGUE_ID, isDemo: true } : null),
    [league],
  );

  const seen = useCallback((id: SeasonStepId) => updateSeason((current) => markSeen(current, id)), []);
  const advance = useCallback(() => updateSeason(advanceCheckpoint), []);
  /** Leaving ends the demo: the next visit starts over. */
  const exit = useCallback(() => clearTutorial(), []);
  /** Back to step 1 of the guided draft with nothing kept. */
  const replay = useCallback(() => {
    clearTutorial();
    router.push(DEMO_DRAFT_HREF);
  }, [router]);

  if (!tutorial || !result || !displayLeague || !season) return null;
  return {
    league: displayLeague,
    /** Counts demo restarts: a page kept hidden by the router remounts its demo UI after a replay. */
    generation,
    viewerId: result.viewerId,
    openingPick: result.openingPick,
    progress: tutorial.season,
    checkpoint,
    games,
    season,
    teams: teamsNow,
    seasonYear: seasonEndYear(league!.seasonLabel) ?? 0,
    seen,
    advance,
    exit,
    replay,
  };
}

export type DemoSeasonSession = NonNullable<ReturnType<typeof useDemoSeason>>;
