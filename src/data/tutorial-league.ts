import { SEASON } from "@/config/league";
import { TUTORIAL } from "@/config/tour";
import { STATIC_LINES } from "@/data/static-lines";
import { TEAM_IDS, TEAM_INFO } from "@/data/teams";
import { applyDraftAction, createDraftState } from "@/lib/draft";
import { withLines } from "@/lib/lines";
import type { League, Team } from "@/lib/types";

/** The guided demo's league lives in browser memory only. Stored league ids are 6 characters, so this never matches one. */
export const TUTORIAL_LEAGUE_ID = "tutorial";

/** The person taking the demo: seat 1, first on the clock. */
export const TUTORIAL_VIEWER_ID = "m1";

/** One name per seat. Every seat is claimed so nobody picks or fades for an open seat. */
export const TUTORIAL_MANAGER_NAMES: readonly string[] = ["You", "Kobe Bryant", "Michael Jordan", "Larry Bird"];

/** A live 4 × 11 draft on the mock lines with an empty board. Writable (isDemo false) so the real rules run in memory. */
export function buildTutorialLeague(): League {
  const seatOrder = Array.from({ length: TUTORIAL.managerCount }, (_, seat) => `m${seat + 1}`);
  const started = applyDraftAction(createDraftState(seatOrder, TUTORIAL.rounds), { type: "start" }, TEAM_IDS);
  if (!started.ok) throw new Error(started.error);
  return {
    id: TUTORIAL_LEAGUE_ID,
    name: "National Balla Association",
    seasonLabel: SEASON.label,
    isDemo: false,
    commissionerId: TUTORIAL_VIEWER_ID,
    version: 1,
    managers: seatOrder.map((id, seat) => ({ id, seat, displayName: TUTORIAL_MANAGER_NAMES[seat] })),
    draft: started.state,
    fades: [],
    lineOverrides: {},
    lines: STATIC_LINES,
  };
}

/** The teams the demo drafts and scores: mock records with the mock lines. */
export function tutorialTeams(): Team[] {
  return withLines(TEAM_INFO, STATIC_LINES);
}
