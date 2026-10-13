import { CHALLENGE } from "@/config/challenge";
import type { Division } from "@/data/teams";
import { normalizeName } from "@/lib/league/commands";
import type { Side, TeamId, TeamInfo } from "@/lib/types";
import type { GridTeam } from "./grid";
import { lineMove } from "./movement";
import type { ChallengeEntry, ChallengePhase, ChallengePick, PickMap } from "./types";

/** Unsaved work kept in this browser: every working pick and the typed name. Never an entry. */
export interface ChallengeDraft {
  picks: PickMap;
  name: string;
}

const SIDES: ReadonlySet<unknown> = new Set<Side>(["OVER", "UNDER"]);

/** A draft read back from storage: unknown teams and invalid sides dropped; null when it isn't a draft at all. */
export function parseDraft(value: unknown, teamIds: ReadonlySet<TeamId>): ChallengeDraft | null {
  if (!value || typeof value !== "object" || !("picks" in value)) return null;
  const { picks, name } = value as { picks: unknown; name?: unknown };
  if (!picks || typeof picks !== "object" || Array.isArray(picks)) return null;
  const valid: Record<TeamId, Side> = {};
  for (const [teamId, side] of Object.entries(picks)) {
    if (teamIds.has(teamId) && SIDES.has(side)) valid[teamId] = side as Side;
  }
  return { picks: valid, name: typeof name === "string" ? name : "" };
}

/** A grid card: the working side plus what the saved entry holds for the team. */
export interface BoardCard extends GridTeam {
  /** The saved entry's side; null when never saved. */
  savedSide: Side | null;
  /** The saved pick's line, only while the working side is the saved side (else null: no movement to show). */
  reference: number | null;
}

/** The cards in board order. Movement is measured only for a saved pick whose side is unchanged. */
export function boardCards(
  teams: ReadonlyArray<{ info: TeamInfo; division: Division; line: number | null }>,
  working: PickMap,
  saved: readonly ChallengePick[],
): BoardCard[] {
  const savedByTeam = new Map(saved.map((pick) => [pick.teamId, pick]));
  return teams.map(({ info, division, line }) => {
    const side = working[info.id] ?? null;
    const pick = savedByTeam.get(info.id);
    const reference = pick && side === pick.side ? pick.lineAtPick : null;
    return { info, division, line, side, savedSide: pick?.side ?? null, reference, move: lineMove(reference, line) };
  });
}

export function pickCount(teamIds: readonly TeamId[], working: PickMap): number {
  return teamIds.filter((teamId) => working[teamId] !== undefined).length;
}

/** The save request's picks in board order; null until every team has a side. */
export function entryPicks(teamIds: readonly TeamId[], working: PickMap): Array<{ teamId: TeamId; side: Side }> | null {
  const picks = teamIds.map((teamId) => ({ teamId, side: working[teamId] }));
  return picks.every((pick) => pick.side !== undefined) ? (picks as Array<{ teamId: TeamId; side: Side }>) : null;
}

/** The later save of two copies of this browser's entry (the first on a tie). */
export function newerEntry(a: ChallengeEntry | null, b: ChallengeEntry | null): ChallengeEntry | null {
  if (!a || !b) return a ?? b;
  return Date.parse(b.savedAt) > Date.parse(a.savedAt) ? b : a;
}

export interface SaveStateInput {
  phase: ChallengePhase;
  /** The client's clock passed the deadline before the page caught up. */
  expired: boolean;
  selected: number;
  total: number;
  name: string;
  dirty: boolean;
  hasSaved: boolean;
}

export type SaveBlocker = "locked" | "incomplete" | "no_name" | "schedule";

export interface SaveState {
  canSave: boolean;
  /** What stops the save; null when nothing does (or there is simply nothing new to save). */
  reason: SaveBlocker | null;
  /** The reason in words, for the status line. */
  blocker: string | null;
}

const blocked = (reason: SaveBlocker, blocker: string): SaveState => ({ canSave: false, reason, blocker });

/** Whether Save is enabled, and if not, what stops it. */
export function saveState(input: SaveStateInput): SaveState {
  if (input.expired || (input.phase !== "open" && input.phase !== "schedule_unknown")) {
    return blocked("locked", "Picks are locked");
  }
  const remaining = input.total - input.selected;
  if (remaining > 0) return blocked("incomplete", `Select ${remaining} more ${remaining === 1 ? "team" : "teams"} to save`);
  if (!normalizeName(input.name, CHALLENGE.nameMaxLength)) return blocked("no_name", "Enter a name to save");
  if (input.phase === "schedule_unknown") return blocked("schedule", "Saving opens once the NBA schedule is read");
  return { canSave: input.dirty || !input.hasSaved, reason: null, blocker: null };
}

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

/** Whole days, hours, minutes and seconds left; all zero once the time has passed. */
export function countdownParts(ms: number): CountdownParts {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86_400),
    hours: Math.floor(total / 3_600) % 24,
    minutes: Math.floor(total / 60) % 60,
    seconds: total % 60,
  };
}
