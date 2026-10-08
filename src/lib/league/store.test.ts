import { describe, expect, it } from "vitest";
import { createLeagueStore, type LeagueStore } from "@/lib/league/store";
import type { League } from "@/lib/types";

const TEAM_IDS = new Set(["MIN", "OKC", "BOS"]);

const DEMO: League = {
  id: "demo",
  name: "Demo",
  seasonLabel: "2025–26",
  isDemo: true,
  commissionerId: "m1",
  version: 1,
  managers: [{ id: "m1", seat: 0, displayName: null }],
  draft: { status: "complete", rounds: 1, seatOrder: ["m1"], picks: [] },
  fades: [],
};

function newStore(): LeagueStore {
  const ids = ["abc123", "def456", "ghi789"];
  return createLeagueStore({ teamIds: TEAM_IDS, seed: [DEMO], generateId: () => ids.shift() ?? "zzz999" });
}

function createdLeague(store: LeagueStore): League {
  const result = store.create({ leagueName: "  Hoop   Dreams ", displayName: " Ana " });
  if (!result.ok) throw new Error(result.error);
  return result.value.league;
}

describe("create", () => {
  it("creates a fresh 4-seat, 11-round league with the creator as commissioner in seat 1", () => {
    const store = newStore();
    const result = store.create({ leagueName: "  Hoop   Dreams ", displayName: " Ana " });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { league, managerId } = result.value;
    expect(managerId).toBe("m1");
    expect(league).toMatchObject({
      id: "abc123",
      name: "Hoop Dreams",
      isDemo: false,
      commissionerId: "m1",
      version: 1,
      fades: [],
      draft: { status: "not_started", rounds: 11, seatOrder: ["m1", "m2", "m3", "m4"], picks: [] },
    });
    expect(league.managers.map((m) => m.displayName)).toEqual(["Ana", null, null, null]);
    expect(store.get("abc123")).toEqual(league);
  });

  it("defaults the league name and validates names", () => {
    const store = newStore();
    const named = store.create({ displayName: "Ana" });
    expect(named.ok && named.value.league.name).toBe("My League");
    expect(store.create({ displayName: "   " })).toEqual({ ok: false, error: "invalid_name" });
    expect(store.create({ displayName: "x".repeat(25) })).toEqual({ ok: false, error: "invalid_name" });
    expect(store.create({ displayName: "Ana", leagueName: "x".repeat(33) })).toEqual({
      ok: false,
      error: "invalid_league_name",
    });
  });
});

describe("join", () => {
  it("claims an open seat with a display name", () => {
    const store = newStore();
    const league = createdLeague(store);
    const result = store.join(league.id, { managerId: "m3", displayName: "Cal", currentManagerId: null });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.managerId).toBe("m3");
    expect(result.value.league.managers[2].displayName).toBe("Cal");
    expect(result.value.league.version).toBe(2);
  });

  it("rejects taken seats, repeat joins, unknown seats, bad names and the demo league", () => {
    const store = newStore();
    const league = createdLeague(store);
    expect(store.join(league.id, { managerId: "m1", displayName: "Cal", currentManagerId: null })).toEqual({
      ok: false,
      error: "seat_taken",
    });
    expect(store.join(league.id, { managerId: "m2", displayName: "Cal", currentManagerId: "m1" })).toEqual({
      ok: false,
      error: "already_joined",
    });
    expect(store.join(league.id, { managerId: "m9", displayName: "Cal", currentManagerId: null })).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(store.join(league.id, { managerId: "m2", displayName: "", currentManagerId: null })).toEqual({
      ok: false,
      error: "invalid_name",
    });
    expect(store.join("demo", { managerId: "m1", displayName: "Cal", currentManagerId: null })).toEqual({
      ok: false,
      error: "demo_league",
    });
    expect(store.join("nope", { managerId: "m2", displayName: "Cal", currentManagerId: null })).toEqual({
      ok: false,
      error: "not_found",
    });
  });
});

describe("act", () => {
  it("lets only the commissioner start, pause and resume", () => {
    const store = newStore();
    const league = createdLeague(store);
    store.join(league.id, { managerId: "m2", displayName: "Ben", currentManagerId: null });
    expect(store.act(league.id, "m2", { type: "start" })).toEqual({ ok: false, error: "forbidden" });
    const started = store.act(league.id, "m1", { type: "start" });
    expect(started.ok && started.value.draft.status).toBe("live");
    const paused = store.act(league.id, "m1", { type: "pause" });
    expect(paused.ok && paused.value.draft.status).toBe("paused");
    expect(store.act(league.id, "m1", { type: "confirm", teamId: "MIN", side: "OVER" })).toEqual({
      ok: false,
      error: "not_live",
    });
  });

  it("enforces turns, open-seat picking and side availability", () => {
    const store = newStore();
    const league = createdLeague(store);
    store.join(league.id, { managerId: "m2", displayName: "Ben", currentManagerId: null });
    store.act(league.id, "m1", { type: "start" });

    expect(store.act(league.id, "m2", { type: "confirm", teamId: "MIN", side: "OVER" })).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(store.act(league.id, "m1", { type: "confirm", teamId: "MIN", side: "OVER" }).ok).toBe(true);
    expect(store.act(league.id, "m2", { type: "confirm", teamId: "MIN", side: "OVER" })).toEqual({
      ok: false,
      error: "side_taken",
    });
    expect(store.act(league.id, "m2", { type: "confirm", teamId: "MIN", side: "UNDER" }).ok).toBe(true);

    // Pick 3 belongs to open seat m3: the commissioner picks for it.
    const third = store.act(league.id, "m1", { type: "confirm", teamId: "OKC", side: "OVER" });
    expect(third.ok && third.value.draft.picks[2]).toEqual({
      pickNumber: 3,
      managerId: "m3",
      teamId: "OKC",
      side: "OVER",
    });
  });

  it("hands a seat over when someone joins mid-draft", () => {
    const store = newStore();
    const league = createdLeague(store);
    store.act(league.id, "m1", { type: "start" });
    store.act(league.id, "m1", { type: "confirm", teamId: "MIN", side: "OVER" });
    store.join(league.id, { managerId: "m2", displayName: "Ben", currentManagerId: null });
    expect(store.act(league.id, "m1", { type: "confirm", teamId: "OKC", side: "OVER" })).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(store.act(league.id, "m2", { type: "confirm", teamId: "OKC", side: "OVER" }).ok).toBe(true);
  });

  it("bumps the version on every successful change", () => {
    const store = newStore();
    const league = createdLeague(store);
    const started = store.act(league.id, "m1", { type: "start" });
    expect(started.ok && started.value.version).toBe(2);
    store.act(league.id, "m2", { type: "pause" }); // forbidden: no change
    expect(store.get(league.id)!.version).toBe(2);
  });

  it("rejects unknown leagues, the demo league and unknown teams", () => {
    const store = newStore();
    const league = createdLeague(store);
    store.act(league.id, "m1", { type: "start" });
    expect(store.act("nope", "m1", { type: "start" })).toEqual({ ok: false, error: "not_found" });
    expect(store.act("demo", "m1", { type: "pause" })).toEqual({ ok: false, error: "demo_league" });
    expect(store.act(league.id, "m1", { type: "confirm", teamId: "XXX", side: "OVER" })).toEqual({
      ok: false,
      error: "unknown_team",
    });
  });
});
