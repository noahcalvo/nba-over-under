import { describe, expect, it } from "vitest";
import { gameSummaries } from "@/lib/nba-schedule/summaries";
import type { NbaGame } from "@/lib/nba-schedule/types";
import type { League } from "@/lib/types";

function game(id: string, awayId: string, homeId: string): NbaGame {
  return {
    id,
    season: 2027,
    tipoff: "2026-10-22T00:00:00Z",
    gameDay: "2026-10-21",
    status: "scheduled",
    statusDetail: "",
    away: { teamId: awayId, score: null, winner: false },
    home: { teamId: homeId, score: null, winner: false },
    venue: null,
    broadcasts: [],
    odds: null,
  };
}

const LEAGUE = {
  id: "L1",
  name: "League One",
  managers: [{ id: "m1", seat: 0, displayName: "Alex" }],
  draft: { status: "fades", picks: [{ pickNumber: 1, managerId: "m1", teamId: "SAS", side: "OVER" }], voidedPicks: [] },
  fades: [],
  lines: { values: { SAS: 40.5, MIN: 49.5 } },
} as unknown as League;

describe("gameSummaries", () => {
  it("builds a summary for each game", () => {
    const { summaries: result, skipped } = gameSummaries([game("1", "SAS", "MIN"), game("2", "BOS", "NYK")], { leagues: [{ league: LEAGUE, viewerId: "m1" }] });
    expect(skipped).toBe(0);
    expect(result["1"]).toMatchObject({ count: 1, viewerInvolved: true });
    expect(result["2"]).toMatchObject({ count: 0, viewerInvolved: false });
  });

  it("skips a game whose summary throws and keeps the others", () => {
    const broken = { ...game("2", "BOS", "NYK"), away: null } as unknown as NbaGame;
    const { summaries, skipped } = gameSummaries([game("1", "SAS", "MIN"), broken, game("3", "SAS", "BOS")], { leagues: [{ league: LEAGUE, viewerId: "m1" }] });
    expect(Object.keys(summaries)).toEqual(["1", "3"]);
    expect(skipped).toBe(1);
  });

  it("returns nothing for a game when a league's stored draft is malformed", () => {
    const bad = { ...LEAGUE, draft: null } as unknown as League;
    expect(gameSummaries([game("1", "SAS", "MIN")], { leagues: [{ league: bad, viewerId: "m1" }] })).toEqual({ summaries: {}, skipped: 1 });
  });

  it("ignores the viewer's challenge entry: it does not mark a game as theirs or add to the count", () => {
    const stakes = { leagues: [{ league: LEAGUE, viewerId: "m1" }], challenge: { picks: ["BOS", "NYK"] } }; // extra fields are ignored
    const { summaries } = gameSummaries([game("2", "BOS", "NYK")], stakes);
    expect(summaries["2"]).toMatchObject({ count: 0, viewerInvolved: false });
  });
});
