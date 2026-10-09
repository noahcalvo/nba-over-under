import { findManager } from "@/lib/league/managers";
import type { ScoredCall, ScoredFade, StandingRow, Standings } from "@/lib/standings";
import type { Manager, Side } from "@/lib/types";

/** "traditional": Overs then Unders, each by line. "quality": one list by projected pick points. */
export type RosterSort = "traditional" | "quality";

/** A pick's projected points; a pick whose team has not played yet is projected at 0. */
export function projectedPoints(call: ScoredCall): number {
  return call.evaluation.points ?? 0;
}

/** One block of a roster. side is null when the sort mixes Overs and Unders. */
export interface RosterGroup {
  side: Side | null;
  calls: ScoredCall[];
}

export interface RosterColumn {
  manager: Manager;
  standing: StandingRow;
  /** The manager's fade, or null before it is placed. */
  fade: ScoredFade | null;
  /** The manager whose pick is faded. Null without a fade. */
  fadeTarget: Manager | null;
}

/** One column per manager, in seat order, with their standing row and fade. */
export function rosterColumns(managers: readonly Manager[], standings: Standings): RosterColumn[] {
  return [...managers]
    .sort((a, b) => a.seat - b.seat)
    .map((manager) => {
      const standing = standings.rows.find((row) => row.managerId === manager.id)!;
      const fade = standing.fades[0] ?? null;
      const fadeTarget = fade ? (findManager(managers, fade.target.pick.managerId) ?? null) : null;
      return { manager, standing, fade, fadeTarget };
    });
}

const SIDES: readonly Side[] = ["OVER", "UNDER"];

export function rosterGroups(calls: readonly ScoredCall[], sort: RosterSort): RosterGroup[] {
  if (sort === "quality") return [{ side: null, calls: [...calls].sort(byQuality) }];
  return SIDES.map((side) => ({ side, calls: calls.filter((call) => call.pick.side === side).sort(byLine) })).filter(
    (group) => group.calls.length > 0,
  );
}

function byLine(a: ScoredCall, b: ScoredCall): number {
  return b.team.line - a.team.line || a.pick.pickNumber - b.pick.pickNumber;
}

/** Highest projected points first. */
function byQuality(a: ScoredCall, b: ScoredCall): number {
  return projectedPoints(b) - projectedPoints(a) || byLine(a, b);
}
