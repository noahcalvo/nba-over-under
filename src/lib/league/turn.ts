import { managerOnTheClock } from "@/lib/draft";
import { canPickNow, type DraftAccess } from "@/lib/league/permissions";

export type TurnKind = "not_started" | "your_turn" | "picking_for_open_seat" | "on_the_clock" | "paused" | "complete";

export interface TurnSummary {
  kind: TurnKind;
  /** The manager whose pick it is (or will be first). Null once the draft is complete. */
  managerId: string | null;
}

export function describeTurn(league: DraftAccess, viewerId: string | null): TurnSummary {
  const { draft } = league;
  const managerId = managerOnTheClock(draft);
  if (draft.status === "complete") return { kind: "complete", managerId: null };
  if (draft.status === "not_started") return { kind: "not_started", managerId };
  if (draft.status === "paused") return { kind: "paused", managerId };
  if (managerId === viewerId) return { kind: "your_turn", managerId };
  if (canPickNow(league, viewerId)) return { kind: "picking_for_open_seat", managerId };
  return { kind: "on_the_clock", managerId };
}
