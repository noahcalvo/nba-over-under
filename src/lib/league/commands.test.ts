import { describe, expect, it } from "vitest";
import type { DraftAction } from "@/lib/draft";
import {
  createLeague,
  decideClaim,
  decideDraftAction,
  decideInviteChange,
  decideOwnLinkReset,
  decideSeatReset,
  type ClaimInput,
} from "@/lib/league/commands";
import type { Result } from "@/lib/league/errors";
import type { League, LineSet, Side } from "@/lib/types";

const TEAM_IDS = new Set(["MIN", "OKC", "BOS"]);
const LINES: LineSet = { source: "test", asOf: "2026-10-01T00:00:00.000Z", values: { MIN: 49.5, OKC: 62.5, BOS: 41.5 } };
const LEAGUE_INVITE = { kind: "league_invite" as const, managerId: null };

function must<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
  return result.value;
}

function newLeague(): League {
  return must(createLeague({ leagueName: "  Hoop   Dreams ", displayName: " Ana " }, "abc123"));
}

function join(league: League, managerId: string, displayName: string): League {
  return must(decideClaim(league, LEAGUE_INVITE, null, { managerId, displayName })).league;
}

function act(league: League, actorId: string | null, action: DraftAction): Result<League> {
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
    const claim = must(decideClaim(newLeague(), LEAGUE_INVITE, null, { managerId: "m3", displayName: " Cal " }));
    expect(claim.managerId).toBe("m3");
    expect(claim.changed).toBe(true);
    expect(claim.league.managers[2].displayName).toBe("Cal");
  });

  it("rejects taken seats, a second seat, unknown seats, bad names and the demo league", () => {
    const league = newLeague();
    const claim = (input: ClaimInput, browserSeatId: string | null = null) =>
      decideClaim(league, LEAGUE_INVITE, browserSeatId, input);
    expect(claim({ managerId: "m1", displayName: "Cal" })).toEqual({ ok: false, error: "seat_taken" });
    expect(claim({ managerId: "m2", displayName: "Cal" }, "m1")).toEqual({ ok: false, error: "already_joined" });
    expect(claim({ managerId: "m9", displayName: "Cal" })).toEqual({ ok: false, error: "not_found" });
    expect(claim({ displayName: "Cal" })).toEqual({ ok: false, error: "not_found" });
    expect(claim({ managerId: "m2", displayName: "" })).toEqual({ ok: false, error: "invalid_name" });
    expect(decideClaim({ ...league, isDemo: true }, LEAGUE_INVITE, null, { managerId: "m2", displayName: "Cal" })).toEqual({
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
    const claim = must(decideClaim(league, seatInvite, null, { managerId: "m4", displayName: "Benny" }));
    expect(claim.managerId).toBe("m2"); // the link's seat wins over a submitted managerId
    expect(claim.league.managers[1].displayName).toBe("Benny");
    expect(claim.league.draft.picks).toEqual(league.draft.picks);
    expect(decideClaim(league, seatInvite, "m3", { displayName: "Ben" })).toEqual({ ok: false, error: "already_joined" });
    expect(decideClaim(league, seatInvite, null, { displayName: " " })).toEqual({ ok: false, error: "invalid_name" });
  });

  it("signs a browser in with a personal link without changing the league", () => {
    const league = join(newLeague(), "m2", "Ben");
    const claim = must(decideClaim(league, { kind: "personal", managerId: "m2" }, "m4", {}));
    expect(claim).toEqual({ league, managerId: "m2", changed: false });
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
    expect(must(act(league, "m1", { type: "start" })).lines).toBe(LINES);
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
    expect(league.lines).toBe(LINES);
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

  it("lets any seated manager reset their own link", () => {
    expect(decideOwnLinkReset(league, "m2")).toEqual({ ok: true, value: "m2" });
    expect(decideOwnLinkReset(league, null)).toEqual({ ok: false, error: "forbidden" });
  });
});
