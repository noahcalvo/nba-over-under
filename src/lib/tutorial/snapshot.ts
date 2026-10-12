import { buildTutorialLeague, TUTORIAL_VIEWER_ID, tutorialTeams } from "@/data/tutorial-league";
import { currentPickNumber, managerOnTheClock } from "@/lib/draft";
import { fadeFor } from "@/lib/fades";
import type { DraftPick, Fade, League, Side, Team, TeamId } from "@/lib/types";
import { applyTutorialCommand } from "./session";
import type { TutorialProgress } from "./steps";

/** Where the browser keeps this tab's demo (sessionStorage). The scoring walkthrough reads the same key. */
export const TUTORIAL_STORAGE_KEY = "courtline.tutorial.v1";

/** The demo as the commands that made it. Restoring replays them through the rules, so a bad snapshot is dropped. */
export interface TutorialSnapshot {
  v: 1;
  progress: TutorialProgress;
  /** Every pick in pick order. Each was made by the manager on the clock. */
  picks: Array<{ teamId: TeamId; side: Side }>;
  /** Every fade in the order it was locked. */
  fades: Array<{ managerId: string; targetPickNumber: number }>;
}

export function snapshotOf(league: League, progress: TutorialProgress): TutorialSnapshot {
  return {
    v: 1,
    progress,
    picks: league.draft.picks.map(({ teamId, side }) => ({ teamId, side })),
    fades: league.fades.map(({ managerId, targetPickNumber }) => ({ managerId, targetPickNumber })),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** The demo a snapshot describes, or null when it isn't one or any command breaks a rule. */
export function restoreTutorial(raw: unknown): { league: League; progress: TutorialProgress } | null {
  if (!isRecord(raw) || raw.v !== 1 || !Array.isArray(raw.picks) || !Array.isArray(raw.fades)) return null;
  const progress = raw.progress;
  if (!isRecord(progress) || typeof progress.welcomed !== "boolean" || typeof progress.snakeExplained !== "boolean") {
    return null;
  }
  let league = buildTutorialLeague();
  for (const pick of raw.picks) {
    if (!isRecord(pick) || typeof pick.teamId !== "string" || (pick.side !== "OVER" && pick.side !== "UNDER")) return null;
    const pickNumber = currentPickNumber(league.draft);
    const actorId = managerOnTheClock(league.draft);
    if (pickNumber === null || actorId === null) return null;
    const result = applyTutorialCommand(league, actorId, { type: "confirm", teamId: pick.teamId, side: pick.side, pickNumber });
    if (!result.ok) return null;
    league = result.value;
  }
  for (const fade of raw.fades) {
    if (!isRecord(fade) || typeof fade.managerId !== "string" || typeof fade.targetPickNumber !== "number") return null;
    const command = { type: "fade" as const, managerId: fade.managerId, targetPickNumber: fade.targetPickNumber };
    const result = applyTutorialCommand(league, fade.managerId, command);
    if (!result.ok) return null;
    league = result.value;
  }
  return { league, progress: { welcomed: progress.welcomed, snakeExplained: progress.snakeExplained } };
}

/** What the scoring walkthrough starts from. */
export interface TutorialResult {
  league: League;
  /** Mock records with the mock lines: demo data, to be labeled as such. */
  teams: Team[];
  viewerId: string;
  /** The pick the user chose (pick 1). */
  openingPick: DraftPick;
  /** The fade the user chose. */
  fade: Fade;
}

/** Null until the demo draft is complete. */
export function tutorialResult(league: League): TutorialResult | null {
  const fade = fadeFor(league.fades, TUTORIAL_VIEWER_ID);
  const openingPick = league.draft.picks[0];
  if (league.draft.status !== "complete" || !fade || !openingPick) return null;
  return { league, teams: tutorialTeams(), viewerId: TUTORIAL_VIEWER_ID, openingPick, fade };
}
