import { findPickForSide, holdsTeam } from "@/lib/draft";
import type { SideRef } from "@/lib/draft-filters";
import { fadeTargets } from "@/lib/fades";
import { indexTeams } from "@/lib/lines";
import type { DraftPick, DraftState, Side, Team } from "@/lib/types";

// How the guided demo's simulated managers choose. Deterministic: the same board always gives the same choice. They
// only ever choose among sides and picks the real rules allow; the rules themselves still decide every command.

const SIDE_ORDER: readonly Side[] = ["OVER", "UNDER"];

/** How far a side looks ahead of its line on last season's wins, signed for the side. */
export function sideEdge(team: Pick<Team, "prevWins" | "line">, side: Side): number {
  return side === "OVER" ? team.prevWins - team.line : team.line - team.prevWins;
}

/** Sides the manager may draft (nobody holds them, the manager holds neither side of the team), by team id, Over first. */
export function eligibleSides(draft: DraftState, managerId: string, teams: readonly Team[]): SideRef[] {
  return [...teams]
    .sort((a, b) => a.id.localeCompare(b.id))
    .flatMap((team) =>
      holdsTeam(draft, managerId, team.id)
        ? []
        : SIDE_ORDER.filter((side) => !findPickForSide(draft, team.id, side)).map((side) => ({ teamId: team.id, side })),
    );
}

/** The eligible side with the biggest edge; ties go to the earlier team id, then the Over. Null when none is eligible. */
export function chooseSide(draft: DraftState, managerId: string, teams: readonly Team[]): SideRef | null {
  const byId = indexTeams(teams);
  let best: SideRef | null = null;
  let bestEdge = -Infinity;
  for (const choice of eligibleSides(draft, managerId, teams)) {
    const edge = sideEdge(byId[choice.teamId], choice.side);
    if (edge > bestEdge) {
      best = choice;
      bestEdge = edge;
    }
  }
  return best;
}

/** The opponent pick with the smallest edge (the likeliest miss); ties go to the earlier pick. Null without targets. */
export function chooseFadeTarget(draft: DraftState, managerId: string, teams: readonly Team[]): number | null {
  const byId = indexTeams(teams);
  let best: DraftPick | null = null;
  let bestEdge = Infinity;
  for (const pick of fadeTargets(draft, managerId)) {
    const edge = sideEdge(byId[pick.teamId], pick.side);
    if (edge < bestEdge) {
      best = pick;
      bestEdge = edge;
    }
  }
  return best?.pickNumber ?? null;
}
