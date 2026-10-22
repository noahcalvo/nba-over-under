import { describe, expect, it } from "vitest";
import { draftTotalPicks, managerOnTheClock, seatForPick, type DraftAction } from "@/lib/draft";
import type { FadeAction } from "@/lib/fades";
import {
  createLeague,
  decideArchive,
  decideClaim,
  decideDraftAction,
  decideDraftOrder,
  decideInviteChange,
  decideLeagueConfig,
  decideLineOverrides,
  decideSeatReset,
  matchesLeagueName,
  type ClaimActor,
  type ClaimInput,
} from "@/lib/league/commands";
import type { Result } from "@/lib/league/errors";
import type { League, LineSet, Side } from "@/lib/types";

const TEAM_IDS = new Set(["MIN", "OKC", "BOS"]);
const LINES: LineSet = {
  source: "test",
  season: "2026–27",
  asOf: "2026-10-01T00:00:00.000Z",
  values: { MIN: 49.5, OKC: 62.5, BOS: 41.5 },
  manual: [],
};
const LEAGUE_INVITE = { kind: "league_invite" as const, managerId: null };
/** An account with no seat in the league, on a link whose seat no account holds. */
const NEWCOMER: ClaimActor = { seatId: null, linkSeatHolder: "none" };

function must<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
  return result.value;
}

function newLeague(): League {
  return must(createLeague({ leagueName: "  Hoop   Dreams ", displayName: " Ana " }, "abc123"));
}

function join(league: League, managerId: string, displayName: string): League {
  return must(decideClaim(league, LEAGUE_INVITE, NEWCOMER, { managerId, displayName })).league;
}

function act(league: League, actorId: string | null, action: DraftAction | FadeAction): Result<League> {
  return decideDraftAction(league, actorId, action, TEAM_IDS, LINES);
}

function pick(league: League, teamId: string, side: Side): DraftAction {
  return { type: "confirm", teamId, side, pickNumber: league.draft.picks.length + 1 };
}

describe("createLeague", () => {
  it("creates a fresh 4-seat, 11-round league with the creator as commissioner in seat 1", () => {
    const league = newLeague();
    expect(league).toMatchObject({
      id: "abc123",
      name: "Hoop Dreams",
      isDemo: false,
      commissionerId: "m1",
      version: 1,
      fades: [],
      seasonLabel: "2026–27",
      lineOverrides: {},
      lines: null,
      draft: { status: "not_started", rounds: 11, seatOrder: ["m1", "m2", "m3", "m4"], picks: [] },
    });
    expect(league.managers.map((m) => m.displayName)).toEqual(["Ana", null, null, null]);
  });

  it("defaults the league name and validates names", () => {
    expect(must(createLeague({ displayName: "Ana" }, "x")).name).toBe("My League");
    expect(createLeague({ displayName: "   " }, "x")).toEqual({ ok: false, error: "invalid_name" });
    expect(createLeague({ displayName: "x".repeat(25) }, "x")).toEqual({ ok: false, error: "invalid_name" });
    expect(createLeague({ displayName: "Ana", leagueName: "x".repeat(33) }, "x")).toEqual({
      ok: false,
      error: "invalid_league_name",
    });
  });
});

describe("decideClaim", () => {
  it("claims an open seat from the league invite", () => {
    const claim = must(decideClaim(newLeague(), LEAGUE_INVITE, NEWCOMER, { managerId: "m3", displayName: " Cal " }));
    expect(claim.managerId).toBe("m3");
    expect(claim.changed).toBe(true);
    expect(claim.league.managers[2].displayName).toBe("Cal");
  });

  it("rejects taken seats, a second seat, unknown seats, bad names and the demo league", () => {
    const league = newLeague();
    const claim = (input: ClaimInput, seatId: string | null = null) =>
      decideClaim(league, LEAGUE_INVITE, { seatId, linkSeatHolder: "none" }, input);
    expect(claim({ managerId: "m1", displayName: "Cal" })).toEqual({ ok: false, error: "seat_taken" });
    expect(claim({ managerId: "m2", displayName: "Cal" }, "m1")).toEqual({ ok: false, error: "already_joined" });
    expect(claim({ managerId: "m9", displayName: "Cal" })).toEqual({ ok: false, error: "not_found" });
    expect(claim({ displayName: "Cal" })).toEqual({ ok: false, error: "not_found" });
    expect(claim({ managerId: "m2", displayName: "" })).toEqual({ ok: false, error: "invalid_name" });
    expect(decideClaim({ ...league, isDemo: true }, LEAGUE_INVITE, NEWCOMER, { managerId: "m2", displayName: "Cal" })).toEqual({
      ok: false,
      error: "demo_league",
    });
  });

  it("re-claims a reset seat from its seat invite without an open-seat check, keeping its picks", () => {
    let league = join(newLeague(), "m2", "Ben");
    league = must(act(league, "m1", { type: "start" }));
    league = must(act(league, "m1", pick(league, "MIN", "OVER")));
    league = must(act(league, "m2", pick(league, "OKC", "OVER")));
    const seatInvite = { kind: "seat_invite" as const, managerId: "m2" };
    const claim = must(decideClaim(league, seatInvite, NEWCOMER, { managerId: "m4", displayName: "Benny" }));
    expect(claim.managerId).toBe("m2"); // the link's seat wins over a submitted managerId
    expect(claim.league.managers[1].displayName).toBe("Benny");
    expect(claim.league.draft.picks).toEqual(league.draft.picks);
    expect(decideClaim(league, seatInvite, { seatId: "m3", linkSeatHolder: "none" }, { displayName: "Ben" })).toEqual({
      ok: false,
      error: "already_joined",
    });
    expect(decideClaim(league, seatInvite, NEWCOMER, { displayName: " " })).toEqual({ ok: false, error: "invalid_name" });
  });

  describe("personal link", () => {
    const league = join(newLeague(), "m2", "Ben");
    const personal = { kind: "personal" as const, managerId: "m2" };

    it("binds a seat no account holds without changing the league", () => {
      expect(must(decideClaim(league, personal, NEWCOMER, {}))).toEqual({ league, managerId: "m2", changed: false });
    });

    it("succeeds unchanged when the account already holds the seat", () => {
      const claim = must(decideClaim(league, personal, { seatId: "m2", linkSeatHolder: "self" }, {}));
      expect(claim).toEqual({ league, managerId: "m2", changed: false });
    });

    it("never moves a seat another account holds", () => {
      expect(decideClaim(league, personal, { seatId: null, linkSeatHolder: "other" }, {})).toEqual({
        ok: false,
        error: "seat_owned",
      });
    });

    it("refuses an account that holds another seat in the league", () => {
      expect(decideClaim(league, personal, { seatId: "m4", linkSeatHolder: "none" }, {})).toEqual({
        ok: false,
        error: "already_joined",
      });
      expect(decideClaim(league, personal, { seatId: "m4", linkSeatHolder: "other" }, {})).toEqual({
        ok: false,
        error: "already_joined",
      });
    });

    it("refuses an unknown seat and the demo league", () => {
      expect(decideClaim(league, { kind: "personal", managerId: "m9" }, NEWCOMER, {})).toEqual({
        ok: false,
        error: "not_found",
      });
      expect(decideClaim({ ...league, isDemo: true }, personal, NEWCOMER, {})).toEqual({ ok: false, error: "demo_league" });
    });
  });
});

describe("decideDraftAction", () => {
  it("lets only the commissioner start, pause and resume", () => {
    let league = join(newLeague(), "m2", "Ben");
    expect(act(league, "m2", { type: "start" })).toEqual({ ok: false, error: "forbidden" });
    expect(act(league, null, { type: "start" })).toEqual({ ok: false, error: "forbidden" });
    league = must(act(league, "m1", { type: "start" }));
    expect(league.draft.status).toBe("live");
    league = must(act(league, "m1", { type: "pause" }));
    expect(league.draft.status).toBe("paused");
    expect(act(league, "m1", pick(league, "MIN", "OVER"))).toEqual({ ok: false, error: "not_live" });
  });

  it("freezes complete lines into the league when the draft starts", () => {
    const league = newLeague();
    expect(must(act(league, "m1", { type: "start" })).lines).toEqual(LINES);
    const missing = { ...LINES, values: { MIN: 49.5, OKC: 62.5 } };
    for (const lines of [null, missing]) {
      expect(decideDraftAction(league, "m1", { type: "start" }, TEAM_IDS, lines)).toEqual({
        ok: false,
        error: "lines_unavailable",
      });
    }
  });

  it("keeps the frozen lines on later actions", () => {
    let league = must(act(newLeague(), "m1", { type: "start" }));
    league = must(decideDraftAction(league, "m1", { type: "pause" }, TEAM_IDS, null));
    expect(league.lines).toEqual(LINES);
  });

  it("fills and replaces source lines with the commissioner's overrides at start", () => {
    const partial = { ...LINES, values: { MIN: 49.5, OKC: 62.5 } };
    let league = must(decideLineOverrides(newLeague(), "m1", { BOS: 40.5, MIN: 50.5 }));
    league = must(decideDraftAction(league, "m1", { type: "start" }, TEAM_IDS, partial));
    expect(league.lines).toEqual({ ...LINES, values: { MIN: 50.5, OKC: 62.5, BOS: 40.5 }, manual: ["BOS", "MIN"] });
  });

  it("fails with lines_changed when the reviewed lines no longer match", () => {
    const league = newLeague();
    const reviewed = { MIN: 49.5, OKC: 62.5, BOS: 41.5 };
    expect(must(act(league, "m1", { type: "start", lines: reviewed })).lines).toEqual(LINES);
    expect(act(league, "m1", { type: "start", lines: { ...reviewed, BOS: 42.5 } })).toEqual({
      ok: false,
      error: "lines_changed",
    });
  });

  it("starts from hand-entered lines alone when the source is down", () => {
    const league = must(decideLineOverrides(newLeague(), "m1", { MIN: 49.5, OKC: 62.5, BOS: 41.5 }));
    const now = new Date("2026-10-08T19:42:00.000Z");
    expect(must(decideDraftAction(league, "m1", { type: "start" }, TEAM_IDS, null, now)).lines).toEqual({
      values: { MIN: 49.5, OKC: 62.5, BOS: 41.5 },
      source: "Commissioner",
      season: "2026–27",
      asOf: now.toISOString(),
      manual: ["BOS", "MIN", "OKC"],
    });
  });

  it("lets only the commissioner set overrides, and only before the draft", () => {
    const league = join(newLeague(), "m2", "Ben");
    expect(decideLineOverrides(league, "m2", {})).toEqual({ ok: false, error: "forbidden" });
    expect(decideLineOverrides(league, null, {})).toEqual({ ok: false, error: "forbidden" });
    const started = must(act(league, "m1", { type: "start" }));
    expect(decideLineOverrides(started, "m1", {})).toEqual({ ok: false, error: "lines_locked" });
  });

  it("enforces turns, open-seat picking, side availability and one side per team", () => {
    let league = must(act(join(newLeague(), "m2", "Ben"), "m1", { type: "start" }));
    expect(act(league, "m2", pick(league, "MIN", "OVER"))).toEqual({ ok: false, error: "forbidden" });
    league = must(act(league, "m1", pick(league, "MIN", "OVER")));
    expect(act(league, "m2", pick(league, "MIN", "OVER"))).toEqual({ ok: false, error: "side_taken" });
    league = must(act(league, "m2", pick(league, "MIN", "UNDER")));

    // Picks 3 and 4 belong to open seats m3 and m4: the commissioner picks for them.
    league = must(act(league, "m1", pick(league, "OKC", "OVER")));
    expect(league.draft.picks[2]).toEqual({ pickNumber: 3, managerId: "m3", teamId: "OKC", side: "OVER" });
    league = must(act(league, "m1", pick(league, "BOS", "OVER")));
    // Pick 5 is m4 again (snake). m4 already holds BOS, so BOS UNDER is off limits for it.
    expect(act(league, "m1", pick(league, "BOS", "UNDER"))).toEqual({ ok: false, error: "team_already_held" });
  });

  it("reports a stale pick before checking whose turn it is", () => {
    let league = must(act(join(newLeague(), "m2", "Ben"), "m1", { type: "start" }));
    const first = pick(league, "MIN", "OVER");
    league = must(act(league, "m1", first));
    // A double click resends pick 1. It's m2's turn now, but the answer is stale_pick, not forbidden.
    expect(act(league, "m1", first)).toEqual({ ok: false, error: "stale_pick" });
  });

  it("hands a seat over when someone joins mid-draft", () => {
    let league = must(act(newLeague(), "m1", { type: "start" }));
    league = must(act(league, "m1", pick(league, "MIN", "OVER")));
    league = join(league, "m2", "Ben");
    expect(act(league, "m1", pick(league, "OKC", "OVER"))).toEqual({ ok: false, error: "forbidden" });
    expect(act(league, "m2", pick(league, "OKC", "OVER")).ok).toBe(true);
  });

  it("rejects the demo league and unknown teams", () => {
    const league = must(act(newLeague(), "m1", { type: "start" }));
    expect(act({ ...league, isDemo: true }, "m1", { type: "pause" })).toEqual({ ok: false, error: "demo_league" });
    expect(act(league, "m1", pick(league, "XXX", "OVER"))).toEqual({ ok: false, error: "unknown_team" });
  });
});

describe("decideDraftAction: fades", () => {
  // Every team pick is in: m1 MIN OVER, m2 MIN UNDER, m3 OKC OVER, m4 OKC UNDER. m3 and m4 are open seats.
  function fadeStage(): League {
    const league = join(newLeague(), "m2", "Ben");
    const sides: Array<[string, Side]> = [["MIN", "OVER"], ["MIN", "UNDER"], ["OKC", "OVER"], ["OKC", "UNDER"]];
    const picks = sides.map(([teamId, side], i) => ({ pickNumber: i + 1, managerId: `m${i + 1}`, teamId, side }));
    return { ...league, lines: LINES, draft: { ...league.draft, status: "fades", picks } };
  }

  function fade(managerId: string, targetPickNumber: number): DraftAction | FadeAction {
    return { type: "fade", managerId, targetPickNumber };
  }

  it("lets each manager fade an opponent pick, in any order, and completes with the fourth fade", () => {
    let league = fadeStage();
    league = must(act(league, "m2", fade("m2", 1)));
    league = must(act(league, "m1", fade("m1", 2)));
    league = must(act(league, "m1", fade("m4", 1))); // the commissioner covers open seats
    expect(league.draft.status).toBe("fades");
    league = must(act(league, "m1", fade("m3", 1)));
    expect(league.draft.status).toBe("complete");
    expect(league.fades.map((f) => [f.managerId, f.targetPickNumber])).toEqual([
      ["m2", 1],
      ["m1", 2],
      ["m4", 1],
      ["m3", 1],
    ]);
  });

  it("refuses fading for someone else's claimed seat, spectators and the demo league", () => {
    const league = fadeStage();
    expect(act(league, "m2", fade("m1", 2))).toEqual({ ok: false, error: "forbidden" });
    expect(act(league, "m1", fade("m2", 1))).toEqual({ ok: false, error: "forbidden" });
    expect(act(league, "m2", fade("m3", 1))).toEqual({ ok: false, error: "forbidden" });
    expect(act(league, null, fade("m3", 1))).toEqual({ ok: false, error: "forbidden" });
    expect(act({ ...league, isDemo: true }, "m1", fade("m1", 2))).toEqual({ ok: false, error: "demo_league" });
    expect(act(league, "m1", fade("m9", 2))).toEqual({ ok: false, error: "not_found" });
  });

  it("locks a confirmed fade and refuses own or missing picks", () => {
    const league = must(act(fadeStage(), "m2", fade("m2", 1)));
    expect(act(league, "m2", fade("m2", 1))).toEqual({ ok: false, error: "fade_locked" });
    expect(act(league, "m2", fade("m2", 3))).toEqual({ ok: false, error: "fade_locked" });
    expect(act(league, "m1", fade("m1", 1))).toEqual({ ok: false, error: "own_pick" });
    expect(act(league, "m1", fade("m1", 5))).toEqual({ ok: false, error: "unknown_pick" });
  });

  it("refuses fades before the fade stage and team picks or pauses during it", () => {
    const live = must(act(join(newLeague(), "m2", "Ben"), "m1", { type: "start" }));
    expect(act(live, "m1", fade("m1", 1))).toEqual({ ok: false, error: "not_fading" });
    const league = fadeStage();
    expect(act(league, "m1", { type: "pause" })).toEqual({ ok: false, error: "invalid_transition" });
    expect(act(league, "m1", { type: "confirm", teamId: "BOS", side: "OVER", pickNumber: 5 })).toEqual({
      ok: false,
      error: "not_live",
    });
  });
});

describe("seat administration", () => {
  const league = join(newLeague(), "m2", "Ben");

  it("lets only the commissioner change the league invite", () => {
    expect(decideInviteChange(league, "m1")).toEqual({ ok: true, value: null });
    expect(decideInviteChange(league, "m2")).toEqual({ ok: false, error: "forbidden" });
    expect(decideInviteChange({ ...league, isDemo: true }, "m1")).toEqual({ ok: false, error: "demo_league" });
  });

  it("lets the commissioner reset another claimed seat", () => {
    expect(decideSeatReset(league, "m1", "m2")).toEqual({ ok: true, value: null });
    expect(decideSeatReset(league, "m1", "m1")).toEqual({ ok: false, error: "forbidden" });
    expect(decideSeatReset(league, "m1", "m3")).toEqual({ ok: false, error: "forbidden" }); // open seat
    expect(decideSeatReset(league, "m1", "m9")).toEqual({ ok: false, error: "not_found" });
    expect(decideSeatReset(league, "m2", "m1")).toEqual({ ok: false, error: "forbidden" });
  });
});

describe("decideLeagueConfig", () => {
  it("adds open seats and sets the rounds", () => {
    const league = must(decideLeagueConfig(join(newLeague(), "m2", "Ben"), "m1", { managerCount: 6, rounds: 10 }));
    expect(league.managers.map((m) => [m.id, m.seat, m.displayName])).toEqual([
      ["m1", 0, "Ana"],
      ["m2", 1, "Ben"],
      ["m3", 2, null],
      ["m4", 3, null],
      ["m5", 4, null],
      ["m6", 5, null],
    ]);
    expect(league.draft).toMatchObject({ rounds: 10, seatOrder: ["m1", "m2", "m3", "m4", "m5", "m6"], picks: [] });
    expect(draftTotalPicks(league.draft)).toBe(60);
  });

  it("removes open seats from the end but never a claimed one", () => {
    const league = join(newLeague(), "m3", "Cal");
    expect(decideLeagueConfig(league, "m1", { managerCount: 2, rounds: 11 })).toEqual({ ok: false, error: "seats_claimed" });
    const smaller = must(decideLeagueConfig(league, "m1", { managerCount: 3, rounds: 20 }));
    expect(smaller.managers.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
    expect(smaller.draft).toMatchObject({ rounds: 20, seatOrder: ["m1", "m2", "m3"] });
  });

  it("refuses invalid sizes, other managers, the demo league and a started draft", () => {
    const league = join(newLeague(), "m2", "Ben");
    expect(decideLeagueConfig(league, "m1", { managerCount: 7, rounds: 9 })).toEqual({ ok: false, error: "invalid_config" });
    expect(decideLeagueConfig(league, "m1", { managerCount: 13, rounds: 1 })).toEqual({ ok: false, error: "invalid_config" });
    expect(decideLeagueConfig(league, "m2", { managerCount: 6, rounds: 10 })).toEqual({ ok: false, error: "forbidden" });
    expect(decideLeagueConfig(league, null, { managerCount: 6, rounds: 10 })).toEqual({ ok: false, error: "forbidden" });
    expect(decideLeagueConfig({ ...league, isDemo: true }, "m1", { managerCount: 6, rounds: 10 })).toEqual({
      ok: false,
      error: "demo_league",
    });
    const started = must(act(league, "m1", { type: "start" }));
    expect(decideLeagueConfig(started, "m1", { managerCount: 6, rounds: 10 })).toEqual({ ok: false, error: "config_locked" });
  });

  it("starts the draft with the configured seats", () => {
    const league = must(decideLeagueConfig(newLeague(), "m1", { managerCount: 7, rounds: 8 }));
    const started = must(act(league, "m1", { type: "start" }));
    expect(started.draft.status).toBe("live");
    expect(draftTotalPicks(started.draft)).toBe(56);
    expect(managerOnTheClock(started.draft)).toBe("m1");
  });

  it("refuses to start a league whose stored size is invalid", () => {
    const league = newLeague();
    const broken = { ...league, draft: { ...league.draft, rounds: 16 } };
    expect(act(broken, "m1", { type: "start" })).toEqual({ ok: false, error: "invalid_config" });
  });

  it("keeps new leagues at the default 4 × 11", () => {
    expect(newLeague().draft).toMatchObject({ rounds: 11, seatOrder: ["m1", "m2", "m3", "m4"] });
  });
});

describe("decideDraftOrder", () => {
  const ORDER = ["m3", "m1", "m4", "m2"];

  it("renumbers seats to the order and keeps every id and name", () => {
    const league = must(decideDraftOrder(join(newLeague(), "m2", "Ben"), "m1", ORDER));
    expect(league.managers.map((m) => [m.id, m.seat, m.displayName])).toEqual([
      ["m3", 0, null],
      ["m1", 1, "Ana"],
      ["m4", 2, null],
      ["m2", 3, "Ben"],
    ]);
    expect(league.draft).toMatchObject({ status: "not_started", seatOrder: ORDER, picks: [], rounds: 11 });
    expect(league.commissionerId).toBe("m1");
  });

  it("can be changed again, or put back", () => {
    const once = must(decideDraftOrder(newLeague(), "m1", ORDER));
    const back = must(decideDraftOrder(once, "m1", ["m1", "m2", "m3", "m4"]));
    expect(back.draft.seatOrder).toEqual(["m1", "m2", "m3", "m4"]);
    expect(back.managers.map((m) => m.seat)).toEqual([0, 1, 2, 3]);
  });

  it("starts the draft from the saved order and snakes from there", () => {
    const league = must(decideDraftOrder(newLeague(), "m1", ORDER));
    const started = must(act(league, "m1", { type: "start" }));
    expect(started.draft.seatOrder).toEqual(ORDER);
    expect(managerOnTheClock(started.draft)).toBe("m3");
    const order = started.draft.seatOrder;
    expect(Array.from({ length: 8 }, (_, i) => order[seatForPick(i + 1, order.length)])).toEqual([
      "m3", "m1", "m4", "m2", // round 1
      "m2", "m4", "m1", "m3", // round 2 reverses
    ]);
    const afterOne = must(act(started, "m1", pick(started, "MIN", "OVER")));
    expect(afterOne.draft.picks[0].managerId).toBe("m3");
    expect(managerOnTheClock(afterOne.draft)).toBe("m1");
  });

  it("refuses orders that aren't exactly the league's managers", () => {
    const league = newLeague();
    for (const order of [["m1", "m2", "m3"], ["m1", "m1", "m3", "m4"], ["m1", "m2", "m3", "m9"], []]) {
      expect(decideDraftOrder(league, "m1", order)).toEqual({ ok: false, error: "invalid_order" });
    }
  });

  it("refuses an order made before the league size changed", () => {
    const grown = must(decideLeagueConfig(newLeague(), "m1", { managerCount: 6, rounds: 10 }));
    expect(decideDraftOrder(grown, "m1", ORDER)).toEqual({ ok: false, error: "invalid_order" });
  });

  it("belongs to the commissioner, and never to the demo league", () => {
    const league = join(newLeague(), "m2", "Ben");
    expect(decideDraftOrder(league, "m2", ORDER)).toEqual({ ok: false, error: "forbidden" });
    expect(decideDraftOrder(league, null, ORDER)).toEqual({ ok: false, error: "forbidden" });
    expect(decideDraftOrder({ ...league, isDemo: true }, "m1", ORDER)).toEqual({ ok: false, error: "demo_league" });
  });

  it("is locked once the draft starts: live, paused, fades and complete", () => {
    const started = must(act(newLeague(), "m1", { type: "start" }));
    expect(decideDraftOrder(started, "m1", ORDER)).toEqual({ ok: false, error: "order_locked" });
    const paused = must(act(started, "m1", { type: "pause" }));
    expect(decideDraftOrder(paused, "m1", ORDER)).toEqual({ ok: false, error: "order_locked" });
    for (const status of ["fades", "complete"] as const) {
      const later = { ...started, draft: { ...started.draft, status } };
      expect(decideDraftOrder(later, "m1", ORDER)).toEqual({ ok: false, error: "order_locked" });
    }
  });

  it("never reorders a draft that has picks, whatever its status says", () => {
    const started = must(act(newLeague(), "m1", { type: "start" }));
    const picked = must(act(started, "m1", pick(started, "MIN", "OVER")));
    const inconsistent = { ...picked, draft: { ...picked.draft, status: "not_started" as const } };
    expect(decideDraftOrder(inconsistent, "m1", ORDER)).toEqual({ ok: false, error: "order_locked" });
  });

  it("works at 2 and 12 managers", () => {
    const two = must(decideLeagueConfig(newLeague(), "m1", { managerCount: 2, rounds: 30 }));
    expect(must(decideDraftOrder(two, "m1", ["m2", "m1"])).draft.seatOrder).toEqual(["m2", "m1"]);
    const twelve = must(decideLeagueConfig(newLeague(), "m1", { managerCount: 12, rounds: 5 }));
    const reversed = [...twelve.draft.seatOrder].reverse();
    expect(must(decideDraftOrder(twelve, "m1", reversed)).draft.seatOrder).toEqual(reversed);
  });

  it("lets the league grow after a reorder without reusing an id", () => {
    const reordered = must(decideDraftOrder(newLeague(), "m1", ["m4", "m1", "m2", "m3"]));
    const shrunk = must(decideLeagueConfig(reordered, "m1", { managerCount: 3, rounds: 11 }));
    expect(shrunk.draft.seatOrder).toEqual(["m4", "m1", "m2"]);
    const grown = must(decideLeagueConfig(shrunk, "m1", { managerCount: 5, rounds: 11 }));
    expect(grown.draft.seatOrder).toEqual(["m4", "m1", "m2", "m3", "m5"]);
  });
});

describe("archived leagues", () => {
  const ARCHIVED_AT = "2026-10-22T15:00:00.000Z";
  const refused = { ok: false, error: "archived" };
  const archive = (league: League): League => ({ ...league, archivedAt: ARCHIVED_AT });

  it("refuses every command", () => {
    const joined = join(newLeague(), "m2", "Ben");
    const live = must(act(joined, "m1", { type: "start" }));
    expect(act(archive(live), "m1", { type: "pause" })).toEqual(refused);
    expect(act(archive(live), "m1", pick(live, "MIN", "OVER"))).toEqual(refused);
    const sides: Array<[string, Side]> = [["MIN", "OVER"], ["MIN", "UNDER"], ["OKC", "OVER"], ["OKC", "UNDER"]];
    const picks = sides.map(([teamId, side], i) => ({ pickNumber: i + 1, managerId: `m${i + 1}`, teamId, side }));
    const fades = archive({ ...joined, lines: LINES, draft: { ...joined.draft, status: "fades", picks } });
    expect(act(fades, "m2", { type: "fade", managerId: "m2", targetPickNumber: 1 })).toEqual(refused);
    const league = archive(joined);
    expect(decideLineOverrides(league, "m1", { MIN: 40.5 })).toEqual(refused);
    expect(decideLeagueConfig(league, "m1", { managerCount: 5, rounds: 4 })).toEqual(refused);
    expect(decideDraftOrder(league, "m1", ["m2", "m1", "m3", "m4"])).toEqual(refused);
    expect(decideClaim(league, LEAGUE_INVITE, NEWCOMER, { managerId: "m3", displayName: "Cy" })).toEqual(refused);
    expect(decideInviteChange(league, "m1")).toEqual(refused);
    expect(decideSeatReset(league, "m1", "m2")).toEqual(refused);
  });
});

describe("matchesLeagueName", () => {
  it("compares the trimmed, whitespace-collapsed input case-sensitively", () => {
    expect(matchesLeagueName("Hoop Dreams", "Hoop Dreams")).toBe(true);
    expect(matchesLeagueName("  Hoop   Dreams ", "Hoop Dreams")).toBe(true);
    expect(matchesLeagueName("hoop dreams", "Hoop Dreams")).toBe(false);
    expect(matchesLeagueName("", "Hoop Dreams")).toBe(false);
    expect(matchesLeagueName(42, "Hoop Dreams")).toBe(false);
  });
});

describe("decideArchive", () => {
  const NAME = "Hoop Dreams";

  it("lets the commissioner archive with the exact name", () => {
    const league = newLeague();
    expect(decideArchive(league, "m1", NAME)).toEqual({ ok: true, value: null });
    expect(decideArchive(league, "m1", "  Hoop   Dreams ")).toEqual({ ok: true, value: null });
  });

  it("refuses a name that does not match", () => {
    const league = newLeague();
    for (const input of ["hoop dreams", "", 42]) {
      expect(decideArchive(league, "m1", input)).toEqual({ ok: false, error: "name_mismatch" });
    }
  });

  it("refuses anyone but the commissioner", () => {
    const league = join(newLeague(), "m2", "Ben");
    expect(decideArchive(league, "m2", NAME)).toEqual({ ok: false, error: "forbidden" });
    expect(decideArchive(league, null, NAME)).toEqual({ ok: false, error: "forbidden" });
  });

  it("refuses an archived league and the demo league", () => {
    const league = newLeague();
    expect(decideArchive({ ...league, archivedAt: "2026-10-22T15:00:00.000Z" }, "m1", NAME)).toEqual({
      ok: false,
      error: "archived",
    });
    expect(decideArchive({ ...league, isDemo: true }, "m1", NAME)).toEqual({ ok: false, error: "demo_league" });
  });

  it("is allowed at every draft stage", () => {
    const league = newLeague();
    for (const status of ["not_started", "live", "paused", "fades", "complete"] as const) {
      expect(decideArchive({ ...league, draft: { ...league.draft, status } }, "m1", NAME)).toEqual({
        ok: true,
        value: null,
      });
    }
  });
});
