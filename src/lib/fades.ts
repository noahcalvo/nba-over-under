import type { DraftAction } from "@/lib/draft";
import { canFadeFor } from "@/lib/league/permissions";
import type { DraftPick, DraftState, Fade, League } from "@/lib/types";

// The fade stage runs after the last team pick: each manager fades exactly one opponent pick, in any order. Several
// managers may fade the same pick. A confirmed fade is locked; the draft completes when every manager has one.

export type FadeStage = Pick<League, "managers" | "draft" | "fades">;

/** A fade submission. managerId is the seat fading: the actor's own, or an unclaimed seat for the commissioner. */
export interface FadeAction {
  type: "fade";
  managerId: string;
  targetPickNumber: number;
}

/** Everything the draft endpoint accepts. */
export type DraftCommand = DraftAction | FadeAction;

export type FadeError = "not_fading" | "fade_locked" | "unknown_pick" | "own_pick" | "not_found";

export type FadeResult = { ok: true; value: Pick<League, "draft" | "fades"> } | { ok: false; error: FadeError };

export function fadeFor(fades: readonly Fade[], managerId: string): Fade | undefined {
  return fades.find((fade) => fade.managerId === managerId);
}

/** The picks a manager may fade: every opponent pick, in pick order. */
export function fadeTargets(draft: DraftState, managerId: string): DraftPick[] {
  return draft.picks.filter((pick) => pick.managerId !== managerId);
}

/**
 * Applies one fade. Who may submit it is decided by the caller (canFadeFor); this enforces the stage, one locked fade
 * per manager and an opponent target, and completes the draft with the last fade.
 */
export function applyFade(league: FadeStage, managerId: string, targetPickNumber: number): FadeResult {
  if (league.draft.status !== "fades") return { ok: false, error: "not_fading" };
  if (!league.managers.some((manager) => manager.id === managerId)) return { ok: false, error: "not_found" };
  if (fadeFor(league.fades, managerId)) return { ok: false, error: "fade_locked" };
  const target = league.draft.picks.find((pick) => pick.pickNumber === targetPickNumber);
  if (!target) return { ok: false, error: "unknown_pick" };
  if (target.managerId === managerId) return { ok: false, error: "own_pick" };
  const fades = [...league.fades, { id: `fade-${managerId}`, managerId, targetPickNumber }];
  const complete = league.managers.every((manager) => fadeFor(fades, manager.id));
  return { ok: true, value: { fades, draft: complete ? { ...league.draft, status: "complete" } : league.draft } };
}

/** The seats this viewer can still submit a fade for, in seat order. */
export function openFadeSeats(league: FadeStage & Pick<League, "isDemo" | "commissionerId">, viewerId: string | null): string[] {
  return league.managers
    .filter((manager) => canFadeFor(league, viewerId, manager.id) && !fadeFor(league.fades, manager.id))
    .map((manager) => manager.id);
}
