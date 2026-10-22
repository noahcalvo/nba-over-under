import { describe, expect, it } from "vitest";
import { gameStakes, stakesPanelState } from "@/lib/nba-schedule/game-stakes";
import type { InterestLeague } from "@/lib/nba-schedule/interest";
import type { League } from "@/lib/types";

const GAME = { awayId: "SAS", homeId: "MIN" };

function league(): League {
  return {
    id: "L1",
    name: "League One",
    seasonLabel: "2026–27",
    isDemo: false,
    commissionerId: "m1",
    version: 1,
    archivedAt: null,
    managers: [
      { id: "m1", seat: 0, displayName: "Alex" },
      { id: "m2", seat: 1, displayName: "Blake" },
    ],
    draft: {
      status: "fades",
      rounds: 1,
      seatOrder: ["m1", "m2"],
      picks: [
        { pickNumber: 1, managerId: "m1", teamId: "SAS", side: "OVER" },
        { pickNumber: 2, managerId: "m2", teamId: "MIN", side: "OVER" },
      ],
      voidedPicks: [],
      blockedPick: null,
    },
    fades: [{ id: "f1", managerId: "m2", targetPickNumber: 1 }],
    lineOverrides: {},
    lines: { values: { SAS: 40.5, MIN: 49.5 }, source: "FanDuel", season: "2026–27", asOf: "2026-10-01T00:00:00Z", manual: [] },
  };
}

describe("gameStakes", () => {
  it("assembles leagues, the viewer's rows, the rooting split and the seats", () => {
    const leagues: InterestLeague[] = [{ league: league(), viewerId: "m1" }];
    const result = gameStakes({ leagues, challenge: null, seated: [{ id: "L1", name: "League One" }], failed: false }, 2027, GAME);
    expect(result.leagues).toHaveLength(1);
    expect(result.challenge).toBeNull();
    expect(result.yours.map((s) => [s.kind, s.teamId, s.rootingFor])).toEqual([["pick", "SAS", "SAS"]]);
    // m1 Over SAS roots SAS; m2 Over MIN roots MIN; m2's fade of m1's Over SAS roots MIN.
    expect(result.split).toEqual({ SAS: 1, MIN: 2 });
    expect(result.seated).toEqual([{ id: "L1", name: "League One" }]);
  });

  it("is empty for a viewer with nothing", () => {
    const result = gameStakes({ leagues: [], challenge: null, seated: [], failed: false }, 2027, GAME);
    expect(result).toEqual({ leagues: [], challenge: null, yours: [], split: { SAS: 0, MIN: 0 }, seated: [], failed: false });
  });

  it("carries the failed flag", () => {
    expect(gameStakes({ leagues: [], challenge: null, seated: [], failed: true }, 2027, GAME).failed).toBe(true);
  });
});

describe("stakesPanelState", () => {
  const loadedLeague = [{ league: league(), viewerId: "m1" }] as never;
  const entry = { entry: {}, frozen: null } as never;

  it("asks to join only when nothing failed and nothing is there", () => {
    expect(stakesPanelState({ leagues: [], challenge: null, failed: false })).toBe("join");
  });

  it("reports a failure when nothing loaded", () => {
    expect(stakesPanelState({ leagues: [], challenge: null, failed: true })).toBe("failed");
  });

  it("shows what loaded, with a note, when something failed", () => {
    expect(stakesPanelState({ leagues: loadedLeague, challenge: null, failed: true })).toBe("partial");
    expect(stakesPanelState({ leagues: [], challenge: entry, failed: true })).toBe("partial");
  });

  it("shows the content when it loaded cleanly", () => {
    expect(stakesPanelState({ leagues: loadedLeague, challenge: null, failed: false })).toBe("content");
    expect(stakesPanelState({ leagues: [], challenge: entry, failed: false })).toBe("content");
  });
});
