import { describe, expect, it } from "vitest";
import type { ChallengeEntry, FrozenLines } from "@/lib/challenge/types";
import {
  challengeInterest,
  interestSummary,
  leagueInterests,
  rootingSplit,
  yourStakes,
  type InterestLeague,
} from "@/lib/nba-schedule/interest";
import type { GameTeams } from "@/lib/nba-schedule/types";
import type { DraftPick, DraftStatus, Fade, League, Side } from "@/lib/types";

const GAME: GameTeams = { awayId: "SAS", homeId: "MIN" };

function pick(pickNumber: number, managerId: string, teamId: string, side: Side): DraftPick {
  return { pickNumber, managerId, teamId, side };
}

function fade(managerId: string, targetPickNumber: number): Fade {
  return { id: `f-${managerId}-${targetPickNumber}`, managerId, targetPickNumber };
}

function league(overrides: Partial<League> & { status?: DraftStatus; picks?: DraftPick[]; voided?: DraftPick[] } = {}): League {
  const { status = "fades", picks = [], voided = [], ...rest } = overrides;
  return {
    id: "L1",
    name: "League One",
    seasonLabel: "2026–27",
    isDemo: false,
    commissionerId: "m1",
    version: 1,
    managers: [
      { id: "m1", seat: 0, displayName: "Alex" },
      { id: "m2", seat: 1, displayName: "Blake" },
      { id: "m3", seat: 2, displayName: "Casey" },
      { id: "m4", seat: 3, displayName: null },
    ],
    draft: {
      status,
      rounds: 11,
      seatOrder: ["m1", "m2", "m3", "m4"],
      picks,
      voidedPicks: voided,
      blockedPick: null,
    },
    fades: [],
    lineOverrides: {},
    lines: {
      values: { SAS: 40.5, MIN: 49.5, BOS: 55.5 },
      source: "FanDuel",
      season: "2026–27",
      asOf: "2026-10-01T00:00:00Z",
      manual: [],
    },
    ...rest,
  };
}

/** m1 Over SAS, m2 Under SAS, m3 Over MIN, m4 Under MIN. */
const FOUR_PICKS = [
  pick(1, "m1", "SAS", "OVER"),
  pick(2, "m2", "SAS", "UNDER"),
  pick(3, "m3", "MIN", "OVER"),
  pick(4, "m4", "MIN", "UNDER"),
];

function input(l: League, viewerId = "m1"): InterestLeague {
  return { league: l, viewerId };
}

function only(l: League, viewerId = "m1") {
  return leagueInterests([input(l, viewerId)], GAME)[0];
}

describe("leagueInterests picks", () => {
  it("roots an Over for its team and an Under for the opponent; open seats get a label", () => {
    const result = only(league({ picks: FOUR_PICKS }));
    expect(result.state).toBe("rows");
    expect(result.leagueId).toBe("L1");
    expect(result.leagueName).toBe("League One");
    expect(
      result.rows.map((r) => [r.kind, r.manager.id, r.teamId, r.side, r.rootingFor, r.line, r.targetManager]),
    ).toEqual([
      ["pick", "m1", "SAS", "OVER", "SAS", 40.5, null],
      ["pick", "m2", "SAS", "UNDER", "MIN", 40.5, null],
      ["pick", "m3", "MIN", "OVER", "MIN", 49.5, null],
      ["pick", "m4", "MIN", "UNDER", "SAS", 49.5, null],
    ]);
    expect(result.rows[3].manager.displayName).toBeNull();
  });

  it("is not_started before the draft starts or without frozen lines", () => {
    const result = only(league({ status: "not_started", lines: null, picks: [] }));
    expect(result.state).toBe("not_started");
    expect(result.rows).toEqual([]);
  });

  it("shows live picks even with no fades yet", () => {
    const result = only(league({ status: "live", picks: [pick(1, "m1", "SAS", "OVER"), pick(2, "m2", "SAS", "UNDER")] }));
    expect(result.state).toBe("rows");
    expect(result.rows).toHaveLength(2);
    expect(result.rows.every((r) => r.line === 40.5)).toBe(true);
  });

  it("is none when nobody holds either team", () => {
    const result = only(league({ picks: [pick(1, "m1", "BOS", "OVER")] }));
    expect(result.state).toBe("none");
    expect(result.rows).toEqual([]);
  });

  it("ignores voided picks and picks of managers that are not in the league", () => {
    const result = only(
      league({ picks: [pick(1, "m9", "SAS", "OVER")], voided: [pick(2, "m2", "SAS", "UNDER")] }),
    );
    expect(result.state).toBe("none");
  });

  it("orders away team first, then seat; leagues keep input order", () => {
    const a = league({ id: "A", name: "A", picks: [pick(1, "m3", "MIN", "OVER"), pick(2, "m2", "SAS", "UNDER"), pick(3, "m1", "SAS", "OVER")] });
    const b = league({ id: "B", name: "B", picks: [pick(1, "m1", "MIN", "OVER")] });
    const result = leagueInterests([input(b), input(a)], GAME);
    expect(result.map((r) => r.leagueId)).toEqual(["B", "A"]);
    expect(result[1].rows.map((r) => r.manager.id)).toEqual(["m1", "m2", "m3"]);
  });

  it("marks only the viewer's own rows", () => {
    const result = only(league({ picks: FOUR_PICKS }), "m2");
    expect(result.rows.map((r) => r.isViewer)).toEqual([false, true, false, false]);
  });
});

describe("leagueInterests fades", () => {
  const picks = FOUR_PICKS;
  const fades = [fade("m2", 1), fade("m3", 2), fade("m1", 3), fade("m4", 3)];

  it("roots a fade opposite to its target, with the faded manager as target", () => {
    const result = only(league({ picks, fades }));
    const fadeRows = result.rows.filter((r) => r.kind === "fade");
    expect(
      fadeRows.map((r) => [r.manager.id, r.targetManager?.id, r.teamId, r.side, r.line, r.rootingFor]),
    ).toEqual([
      ["m2", "m1", "SAS", "OVER", 40.5, "MIN"],
      ["m3", "m2", "SAS", "UNDER", 40.5, "SAS"],
      ["m1", "m3", "MIN", "OVER", 49.5, "SAS"],
      ["m4", "m3", "MIN", "OVER", 49.5, "SAS"],
    ]);
  });

  it("lists picks before fades", () => {
    const result = only(league({ picks, fades }));
    expect(result.rows.map((r) => r.kind)).toEqual([
      "pick", "pick", "pick", "pick", "fade", "fade", "fade", "fade",
    ]);
  });

  it("marks a fade as the viewer's only when the viewer is the fader", () => {
    const result = only(league({ picks, fades }), "m3");
    const viewerRows = result.rows.filter((r) => r.isViewer);
    expect(viewerRows.map((r) => [r.kind, r.targetManager?.id ?? null])).toEqual([
      ["pick", null],
      ["fade", "m2"],
    ]);
  });

  it("skips fades by non-managers and fades on other teams, voided picks or unknown picks", () => {
    const l = league({
      picks: [...FOUR_PICKS, pick(5, "m1", "BOS", "OVER")],
      voided: [pick(6, "m2", "SAS", "OVER")],
      fades: [fade("m9", 1), fade("m2", 5), fade("m3", 6), fade("m4", 99)],
    });
    expect(only(l).rows.filter((r) => r.kind === "fade")).toEqual([]);
  });
});

describe("leagueInterests pick of another team and a fade on it", () => {
  it("never appear", () => {
    const l = league({
      picks: [pick(1, "m1", "SAS", "OVER"), pick(2, "m2", "BOS", "OVER")],
      fades: [fade("m3", 2)],
    });
    const result = only(l);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].teamId).toBe("SAS");
  });
});

describe("two leagues for one viewer", () => {
  it("keeps both rows in yourStakes, rooting opposite ways", () => {
    const one = league({ id: "A", name: "A", picks: [pick(1, "m1", "SAS", "OVER")] });
    const two = league({ id: "B", name: "B", picks: [pick(1, "m1", "SAS", "UNDER")] });
    const interests = leagueInterests([input(one), input(two)], GAME);
    expect(yourStakes(interests, null)).toEqual([
      {
        source: { kind: "league", leagueId: "A", leagueName: "A" },
        kind: "pick", teamId: "SAS", side: "OVER", line: 40.5, rootingFor: "SAS", targetManager: null,
      },
      {
        source: { kind: "league", leagueId: "B", leagueName: "B" },
        kind: "pick", teamId: "SAS", side: "UNDER", line: 40.5, rootingFor: "MIN", targetManager: null,
      },
    ]);
  });

  it("includes fades the viewer placed and the challenge sides", () => {
    const l = league({ picks: FOUR_PICKS, fades: [fade("m1", 3)] });
    const interests = leagueInterests([input(l, "m1")], GAME);
    const challenge = challengeInterest({ entry: entry(), frozen: null }, 2027, GAME);
    const stakes = yourStakes(interests, challenge);
    expect(stakes.map((s) => [s.source.kind, s.kind, s.teamId])).toEqual([
      ["league", "pick", "SAS"],
      ["league", "fade", "MIN"],
      ["challenge", "challenge", "SAS"],
      ["challenge", "challenge", "MIN"],
    ]);
    expect(stakes[1].targetManager?.id).toBe("m3");
  });
});

function entry(season = 2027): ChallengeEntry {
  return {
    id: "e1",
    season,
    displayName: "Pat",
    createdAt: "2026-10-01T00:00:00Z",
    savedAt: "2026-10-01T00:00:00Z",
    picks: [
      { teamId: "MIN", side: "UNDER", lineAtPick: null, pickedAt: "2026-10-01T00:00:00Z" },
      { teamId: "SAS", side: "OVER", lineAtPick: 41.5, pickedAt: "2026-10-01T00:00:00Z" },
      { teamId: "BOS", side: "OVER", lineAtPick: 55.5, pickedAt: "2026-10-01T00:00:00Z" },
    ],
  };
}

function frozen(values: Record<string, number>, missing: string[] = []): FrozenLines {
  return { values, observedAt: {}, missing, source: "FanDuel", lockedAt: "2026-10-20T00:00:00Z" };
}

describe("challengeInterest", () => {
  it("uses the line at pick before the freeze; no line is unavailable", () => {
    const result = challengeInterest({ entry: entry(), frozen: null }, 2027, GAME);
    expect(result?.entryName).toBe("Pat");
    expect(result?.rows).toEqual([
      { teamId: "SAS", side: "OVER", line: 41.5, lineKind: "at_pick", rootingFor: "SAS" },
      { teamId: "MIN", side: "UNDER", line: null, lineKind: "unavailable", rootingFor: "SAS" },
    ]);
  });

  it("uses the frozen lines once stored", () => {
    const result = challengeInterest({ entry: entry(), frozen: frozen({ SAS: 40.5, MIN: 48.5 }) }, 2027, GAME);
    expect(result?.rows.map((r) => [r.teamId, r.line, r.lineKind])).toEqual([
      ["SAS", 40.5, "frozen"],
      ["MIN", 48.5, "frozen"],
    ]);
  });

  it("marks a missing frozen team unavailable", () => {
    const result = challengeInterest({ entry: entry(), frozen: frozen({ SAS: 40.5 }, ["MIN"]) }, 2027, GAME);
    expect(result?.rows.map((r) => [r.teamId, r.line, r.lineKind])).toEqual([
      ["SAS", 40.5, "frozen"],
      ["MIN", null, "unavailable"],
    ]);
  });

  it("returns null for no stake or another season", () => {
    expect(challengeInterest(null, 2027, GAME)).toBeNull();
    expect(challengeInterest({ entry: entry(2026), frozen: null }, 2027, GAME)).toBeNull();
  });
});

describe("rootingSplit and interestSummary", () => {
  const l = league({ picks: FOUR_PICKS, fades: [fade("m2", 1), fade("m1", 3)] });
  const interests = leagueInterests([input(l, "m4")], GAME);
  const challenge = challengeInterest({ entry: entry(), frozen: null }, 2027, GAME);

  it("counts every league row and challenge row per team", () => {
    // picks: SAS, MIN, MIN, SAS; fades: m2/m1 SAS Over -> MIN, m1/m3 MIN Over -> SAS; challenge: SAS, SAS
    expect(rootingSplit(interests, challenge, GAME)).toEqual({ SAS: 5, MIN: 3 });
    expect(rootingSplit(interests, null, GAME)).toEqual({ SAS: 3, MIN: 3 });
  });

  it("counts rows and de-duplicates managers per league", () => {
    const summary = interestSummary(interests, challenge);
    expect(summary.count).toBe(6 + 2);
    expect(summary.managers.map((m) => [m.leagueId, m.manager.id])).toEqual([
      ["L1", "m1"],
      ["L1", "m2"],
      ["L1", "m3"],
      ["L1", "m4"],
    ]);
    expect(summary.viewerInvolved).toBe(true);
  });

  it("is viewerInvolved through a viewer row, through the challenge alone, and not otherwise", () => {
    expect(interestSummary(interests, null).viewerInvolved).toBe(true);
    const bystander = leagueInterests([input(league({ picks: [pick(1, "m2", "SAS", "OVER")] }), "m1")], GAME);
    expect(interestSummary(bystander, null).viewerInvolved).toBe(false);
    expect(interestSummary(bystander, challenge).viewerInvolved).toBe(true);
  });

  it("keeps managers distinct per league", () => {
    const a = league({ id: "A", picks: [pick(1, "m1", "SAS", "OVER")] });
    const b = league({ id: "B", picks: [pick(1, "m1", "MIN", "OVER")] });
    const summary = interestSummary(leagueInterests([input(a), input(b)], GAME), null);
    expect(summary.managers.map((m) => `${m.leagueId}:${m.manager.id}`)).toEqual(["A:m1", "B:m1"]);
  });
});
