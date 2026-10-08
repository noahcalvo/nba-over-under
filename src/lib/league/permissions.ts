import { managerOnTheClock } from "@/lib/draft";
import type { League } from "@/lib/types";

export type DraftAccess = Pick<League, "isDemo" | "commissionerId" | "managers" | "draft">;

/** Start, pause and resume belong to the commissioner. The demo league is read-only. */
export function canControlDraft(league: Pick<League, "isDemo" | "commissionerId">, actorId: string | null): boolean {
  return !league.isDemo && actorId !== null && actorId === league.commissionerId;
}

/** The manager on the clock picks; the commissioner picks for an unclaimed seat. */
export function canPickNow(league: DraftAccess, actorId: string | null): boolean {
  if (league.isDemo || actorId === null || league.draft.status !== "live") return false;
  const onClockId = managerOnTheClock(league.draft);
  if (onClockId === null) return false;
  if (onClockId === actorId) return true;
  const onClock = league.managers.find((manager) => manager.id === onClockId);
  return actorId === league.commissionerId && onClock !== undefined && onClock.displayName === null;
}
