import { describe, expect, it } from "vitest";
import type { FeedRead } from "@/lib/lines";
import {
  decidedOutcome,
  fadeDisplay,
  latestMarketLine,
  lineMovement,
  pickPoints,
  pickStatus,
  teamOwnership,
} from "@/lib/team-detail";
import type { DraftState, Fade, League, Manager, Team } from "@/lib/types";

const managers: Manager[] = [
  { id: "m1", seat: 0, displayName: "Ana" },
  { id: "m2", seat: 1, displayName: null },
  { id: "m3", seat: 2, displayName: "Cy" },
  { id: "m4", seat: 3, displayName: "Di" },
];
const draft: DraftState = {
  status: "complete",
  rounds: 11,
  seatOrder: ["m1", "m2", "m3", "m4"],
  picks: [
    { pickNumber: 1, managerId: "m2", teamId: "MIN", side: "OVER" },
    { pickNumber: 9, managerId: "m1", teamId: "ORL", side: "OVER" },
    { pickNumber: 37, managerId: "m3", teamId: "ORL", side: "UNDER" },
  ],
};
const fades: Fade[] = [
  { id: "f4", managerId: "m4", targetPickNumber: 9 },
  { id: "f2", managerId: "m2", targetPickNumber: 9 },
  { id: "f1", managerId: "m1", targetPickNumber: 1 },
];
const league: Pick<League, "managers" | "draft" | "fades"> = { managers, draft, fades };

function orl(overrides: Partial<Team> = {}): Team {
  return {
    id: "ORL",
    nbaId: 1610612753,
    city: "Orlando",
    name: "Magic",
    conference: "East",
    color: "#0077C0",
    line: 51.5,
    prevWins: 41,
    wins: 30,
    losses: 18,
    ...overrides,
  };
}

describe("teamOwnership", () => {
  it("returns the Over then the Under with their managers and scores", () => {
    const [over, under] = teamOwnership(league, "ORL", orl());
    expect(over.side).toBe("OVER");
    expect(over.manager?.id).toBe("m1");
    expect(over.pick?.pickNumber).toBe(9);
    // Projected 51.25 wins against 51.5: the Over misses by 0.25.
    expect(over.projected?.points).toBeCloseTo(-1.025);
    expect(under.side).toBe("UNDER");
    expect(under.manager?.id).toBe("m3");
    expect(under.projected?.points).toBeCloseTo(1.025);
    expect(over.final?.status).toBe("pending");
  });

  it("lists every fade on a pick in seat order", () => {
    const [over, under] = teamOwnership(league, "ORL", orl());
    expect(over.fades.map((f) => f.manager.id)).toEqual(["m2", "m4"]);
    expect(over.fades[0].projected.points).toBe(2);
    expect(under.fades).toEqual([]);
  });

  it("leaves an undrafted side empty", () => {
    const [, under] = teamOwnership(league, "MIN", orl({ id: "MIN" }));
    expect(under).toEqual({ side: "UNDER", line: 51.5, pick: null, manager: null, projected: null, final: null, fades: [] });
  });

  it("has no evaluations before lines are frozen", () => {
    const [over] = teamOwnership({ managers, draft: { ...draft, picks: [] }, fades: [] }, "ORL", null);
    expect(over).toEqual({ side: "OVER", line: null, pick: null, manager: null, projected: null, final: null, fades: [] });
  });
});

describe("decidedOutcome", () => {
  it("clinches the Over once wins pass the line", () => {
    expect(decidedOutcome("OVER", 51.5, { wins: 52, losses: 10 })).toBe("clinched");
    expect(decidedOutcome("UNDER", 51.5, { wins: 52, losses: 10 })).toBe("eliminated");
  });

  it("eliminates the Under at an integer line reached, because a push misses", () => {
    expect(decidedOutcome("UNDER", 50, { wins: 50, losses: 10 })).toBe("eliminated");
    expect(decidedOutcome("OVER", 50, { wins: 50, losses: 10 })).toBeNull();
  });

  it("clinches the Under when the line is out of reach", () => {
    expect(decidedOutcome("UNDER", 51.5, { wins: 20, losses: 60 })).toBe("clinched");
    expect(decidedOutcome("OVER", 51.5, { wins: 20, losses: 60 })).toBe("eliminated");
  });

  it("is undecided otherwise", () => {
    expect(decidedOutcome("OVER", 51.5, { wins: 30, losses: 18 })).toBeNull();
    expect(decidedOutcome("UNDER", 51.5, { wins: 30, losses: 18 })).toBeNull();
  });
});

describe("pickStatus", () => {
  it("says whether a projected pick is on track to hit or miss", () => {
    const [over, under] = teamOwnership(league, "ORL", orl());
    expect(pickStatus(over, orl(), true)).toEqual({ label: "On track to miss · projected 51.3 vs 51.5", tone: "danger" });
    expect(pickStatus(under, orl(), true)).toEqual({ label: "On track to hit · projected 51.3 vs 51.5", tone: "accent" });
  });

  it("shows only decided outcomes with Show projected off", () => {
    const [over] = teamOwnership(league, "ORL", orl());
    expect(pickStatus(over, orl(), false)).toBeNull();
    const clinched = orl({ wins: 52, losses: 10 });
    const [cOver, cUnder] = teamOwnership(league, "ORL", clinched);
    expect(pickStatus(cOver, clinched, false)).toEqual({ label: "Clinched · already past the line", tone: "accent" });
    expect(pickStatus(cUnder, clinched, false)).toEqual({
      label: "Can no longer hit · already at or past the line",
      tone: "danger",
    });
    const sunk = orl({ wins: 20, losses: 60 });
    const [sOver, sUnder] = teamOwnership(league, "ORL", sunk);
    expect(pickStatus(sOver, sunk, false)).toEqual({ label: "Can no longer hit · can't get past the line", tone: "danger" });
    expect(pickStatus(sUnder, sunk, false)).toEqual({ label: "Clinched · can't get past the line", tone: "accent" });
  });

  it("shows the final result once the season is over, with or without projections", () => {
    const done = orl({ wins: 52, losses: 30 });
    const [over, under] = teamOwnership(league, "ORL", done);
    expect(pickStatus(over, done, false)).toEqual({ label: "Hit · 52 wins vs 51.5", tone: "accent" });
    expect(pickStatus(under, done, true)).toEqual({ label: "Missed · 52 wins vs 51.5", tone: "danger" });
  });

  it("says when no games have been played", () => {
    const fresh = orl({ wins: 0, losses: 0 });
    const [over] = teamOwnership(league, "ORL", fresh);
    expect(pickStatus(over, fresh, true)).toEqual({ label: "No games played yet", tone: "neutral" });
  });

  it("has nothing for an undrafted side", () => {
    const [, under] = teamOwnership(league, "MIN", orl({ id: "MIN" }));
    expect(pickStatus(under, orl(), true)).toBeNull();
  });
});

describe("pickPoints", () => {
  it("shows projected points only with Show projected on", () => {
    const [over] = teamOwnership(league, "ORL", orl());
    expect(pickPoints(over, true)?.label).toBe("Projected points");
    expect(pickPoints(over, true)?.value).toBeCloseTo(-1.025);
    expect(pickPoints(over, false)).toBeNull();
  });

  it("shows final points once settled, whatever the switch", () => {
    const [over] = teamOwnership(league, "ORL", orl({ wins: 52, losses: 30 }));
    expect(pickPoints(over, false)).toEqual({ label: "Final points", value: expect.closeTo(1.05) });
  });

  it("keeps a projection that isn't available as null, never zero", () => {
    const [over] = teamOwnership(league, "ORL", orl({ wins: 0, losses: 0 }));
    expect(pickPoints(over, true)).toEqual({ label: "Projected points", value: null });
  });

  it("has nothing for an undrafted side", () => {
    const [, under] = teamOwnership(league, "MIN", orl({ id: "MIN" }));
    expect(pickPoints(under, true)).toBeNull();
  });
});

describe("fadeDisplay", () => {
  it("shows a projected fade's status and points with Show projected on", () => {
    const [over] = teamOwnership(league, "ORL", orl());
    expect(fadeDisplay(over.fades[0], true)).toEqual({
      status: { label: "On track", tone: "accent" },
      points: 2,
      pointsLabel: "projected pts",
    });
    expect(fadeDisplay(over.fades[0], false)).toBeNull();
  });

  it("shows the final fade result once settled", () => {
    const [over] = teamOwnership(league, "ORL", orl({ wins: 52, losses: 30 }));
    expect(fadeDisplay(over.fades[0], false)).toEqual({
      status: { label: "No bonus", tone: "neutral" },
      points: 0,
      pointsLabel: "pts",
    });
  });

  it("has nothing before the target's team has played", () => {
    const [over] = teamOwnership(league, "ORL", orl({ wins: 0, losses: 0 }));
    expect(fadeDisplay(over.fades[0], true)).toBeNull();
  });
});

describe("latestMarketLine", () => {
  const read: FeedRead = {
    lines: { values: { ORL: 49.5 }, source: "FanDuel", season: "2026–27", asOf: "2026-10-09T12:00:00.000Z", manual: [] },
    error: null,
  };

  it("reads the team's current line for the league's season", () => {
    expect(latestMarketLine(read, "FanDuel", "2026–27", "ORL")).toEqual({
      book: "FanDuel",
      line: 49.5,
      asOf: "2026-10-09T12:00:00.000Z",
      error: null,
    });
  });

  it("has no line when the book has no open market for the team", () => {
    expect(latestMarketLine(read, "FanDuel", "2026–27", "BOS")).toMatchObject({ line: null, asOf: "2026-10-09T12:00:00.000Z" });
  });

  it("never uses another season's lines", () => {
    expect(latestMarketLine(read, "FanDuel", "2025–26", "ORL")).toEqual({ book: "FanDuel", line: null, asOf: null, error: null });
  });

  it("passes on why the read failed", () => {
    expect(latestMarketLine({ lines: null, error: "FanDuel answered 503." }, "FanDuel", "2026–27", "ORL")).toEqual({
      book: "FanDuel",
      line: null,
      asOf: null,
      error: "FanDuel answered 503.",
    });
  });
});

describe("lineMovement", () => {
  it("is the latest line minus the locked line, only when both exist", () => {
    expect(lineMovement(49.5, 51.5)).toBe(-2);
    expect(lineMovement(null, 51.5)).toBeNull();
    expect(lineMovement(49.5, null)).toBeNull();
  });
});
