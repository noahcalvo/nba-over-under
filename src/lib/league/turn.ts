import { managerOnTheClock } from "@/lib/draft";
import { canPickNow, type DraftAccess } from "@/lib/league/permissions";

export type TurnKind = "not_started" | "your_turn" | "picking_for_open_seat" | "on_the_clock" | "paused" | "archived" | "fades" | "complete";

export interface TurnSummary {
  kind: TurnKind;
  /** The manager whose pick it is (or will be first). Null in the fade stage and once the draft is complete. */
  managerId: string | null;
}

export function describeTurn(league: DraftAccess, viewerId: string | null): TurnSummary {
  const { draft } = league;
  const managerId = managerOnTheClock(draft);
  if (draft.status === "complete") return { kind: "complete", managerId: null };
  if (draft.status === "fades") return { kind: "fades", managerId: null };
  // A deleted league keeps its board but nobody is on the clock any more.
  if (league.archivedAt !== null) return { kind: "archived", managerId };
  if (draft.status === "not_started") return { kind: "not_started", managerId };
  if (draft.status === "paused") return { kind: "paused", managerId };
  if (managerId === viewerId) return { kind: "your_turn", managerId };
  if (canPickNow(league, viewerId)) return { kind: "picking_for_open_seat", managerId };
  return { kind: "on_the_clock", managerId };
}

/**
 * The seat whose held teams block a side for this viewer (one side per team): their own seat, or the open seat the
 * commissioner is picking for right now. Never simply the manager on the clock, so each viewer sees their own blocks.
 */
export function draftsFor(league: DraftAccess, viewerId: string | null): string | null {
  return canPickNow(league, viewerId) ? managerOnTheClock(league.draft) : viewerId;
}
