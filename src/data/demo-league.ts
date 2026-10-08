import { LEAGUE_DEFAULTS, SEASON } from "@/config/league";
import { seatForPick } from "@/lib/draft";
import type { League, Side, TeamId } from "@/lib/types";

export const DEMO_LEAGUE_ID = "demo";

const DEMO_SEATS = ["m1", "m2", "m3", "m4"];

/** Completed 11-round draft, in pick order. */
const DEMO_DRAFT: ReadonlyArray<readonly [TeamId, Side]> = [
  ["MIN", "OVER"], ["OKC", "OVER"], ["BOS", "UNDER"], ["CLE", "OVER"],
  ["BKN", "UNDER"], ["LAL", "OVER"], ["DEN", "OVER"], ["CHI", "UNDER"],
  ["ORL", "OVER"], ["HOU", "OVER"], ["NYK", "OVER"], ["WAS", "UNDER"],
  ["DET", "OVER"], ["IND", "UNDER"], ["SAS", "OVER"], ["CLE", "UNDER"],
  ["UTA", "UNDER"], ["SAC", "UNDER"], ["PHX", "OVER"], ["MIL", "UNDER"],
  ["GSW", "OVER"], ["NOP", "UNDER"], ["ATL", "OVER"], ["MEM", "UNDER"],
  ["TOR", "OVER"], ["DAL", "UNDER"], ["LAC", "UNDER"], ["PHI", "OVER"],
  ["MIA", "OVER"], ["CHA", "UNDER"], ["POR", "UNDER"], ["BOS", "OVER"],
  ["HOU", "UNDER"], ["MIA", "UNDER"], ["OKC", "UNDER"], ["MIN", "UNDER"],
  ["ORL", "UNDER"], ["DET", "UNDER"], ["IND", "OVER"], ["ATL", "UNDER"],
  ["PHI", "UNDER"], ["CHI", "OVER"], ["SAC", "OVER"], ["LAL", "UNDER"],
];

export function buildDemoLeague(): League {
  const managerCount = DEMO_SEATS.length;
  const picks = DEMO_DRAFT.map(([teamId, side], index) => {
    const pickNumber = index + 1;
    return { pickNumber, managerId: DEMO_SEATS[seatForPick(pickNumber, managerCount)], teamId, side };
  });

  return {
    id: DEMO_LEAGUE_ID,
    name: "National Balla Association",
    seasonLabel: SEASON.label,
    isDemo: true,
    commissionerId: "m1",
    version: 1,
    managers: DEMO_SEATS.map((id, seat) => ({ id, seat, displayName: null })),
    draft: { status: "complete", rounds: LEAGUE_DEFAULTS.rounds, seatOrder: [...DEMO_SEATS], picks },
    fades: [
      { id: "f1", managerId: "m1", targetPickNumber: 2 },
      { id: "f2", managerId: "m2", targetPickNumber: 6 },
      { id: "f3", managerId: "m3", targetPickNumber: 13 },
      { id: "f4", managerId: "m4", targetPickNumber: 9 },
    ],
  };
}
