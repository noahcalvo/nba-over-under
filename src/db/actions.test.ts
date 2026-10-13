import { and, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { buildDemoLeague } from "@/data/demo-league";
import { STATIC_LINES } from "@/data/static-lines";
import { TEAM_INFO } from "@/data/teams";
import {
  claimLink,
  claimLinkInLeague,
  createLeagueFor,
  refreshLeagueRecords,
  resetOwnLink,
  resetSeat,
  revokeLeagueInvite,
  rotateLeagueInvite,
  runDraftAction,
  setDraftOrder,
  setLeagueConfig,
  setLineOverrides,
} from "@/db/actions";
import type { Db } from "@/db/client";
import { loadLeague } from "@/db/leagues";
import { loadSeasonRecords } from "@/db/records";
import { findLink, listActiveLinks } from "@/db/links";
import { accessLinks, fades, picks } from "@/db/schema";
import { createSession, findSession, seatInLeague } from "@/db/sessions";
import { createTestDb } from "@/db/test-db";
import type { LinkKind } from "@/lib/access/links";
import { FeedError } from "@/lib/feed-error";
import { indexTeams, withLines } from "@/lib/lines";
import { seasonEndYear } from "@/lib/records/season";
import type { RecordSource } from "@/lib/records/types";
import { computeStandings } from "@/lib/standings";
import { blockedDraft, confirmsOf, plainDraft } from "@/lib/draft-scenarios";
import type { DraftState, Side } from "@/lib/types";

const LEAGUE = "lg0001";

let db: Db;
let ana: string; // commissioner, m1
let ben: string;
let cal: string;

async function activeLinkId(kind: LinkKind, managerId: string | null = null): Promise<string> {
  const link = (await listActiveLinks(db, LEAGUE)).find((l) => l.kind === kind && l.managerId === managerId);
  if (!link) throw new Error(`no active ${kind} for ${managerId}`);
  return link.id;
}

async function joinAs(sessionId: string, managerId: string, displayName: string) {
  return claimLink(db, await activeLinkId("league_invite"), sessionId, { managerId, displayName });
}

function confirm(sessionId: string, pickNumber: number, teamId: string, side: Side) {
  return runDraftAction(db, LEAGUE, sessionId, { type: "confirm", teamId, side, pickNumber }, null);
}

function fade(sessionId: string | null, managerId: string, targetPickNumber: number) {
  return runDraftAction(db, LEAGUE, sessionId, { type: "fade", managerId, targetPickNumber }, null);
}

/** Ben holds m2; the commissioner picks for the open seats m3 and m4. Uses the demo league's 44 picks. */
async function draftAllPicks() {
  await joinAs(ben, "m2", "Ben");
  await runDraftAction(db, LEAGUE, ana, { type: "start" }, STATIC_LINES);
  for (const pick of buildDemoLeague().draft.picks) {
    const result = await confirm(pick.managerId === "m2" ? ben : ana, pick.pickNumber, pick.teamId, pick.side);
    if (!result.ok) throw new Error(`pick ${pick.pickNumber}: ${result.error}`);
  }
}

beforeEach(async () => {
  db = await createTestDb();
  [ana, ben, cal] = await Promise.all(["a", "b", "c"].map((name) => createSession(db, `hash-${name}`)));
  await createLeagueFor(db, ana, { leagueName: "Hoops", displayName: "Ana" }, () => LEAGUE);
});

describe("creating a league", () => {
  it("issues a league invite and the commissioner's personal link, and seats the creator", async () => {
    const links = await listActiveLinks(db, LEAGUE);
    expect(links.map((link) => [link.kind, link.managerId])).toEqual([
      ["league_invite", null],
      ["personal", "m1"],
    ]);
    expect(await seatInLeague(db, ana, LEAGUE)).toBe("m1");
  });
});

describe("claiming the league invite", () => {
  it("claims an open seat, issues its personal link and bumps the version", async () => {
    expect(await joinAs(ben, "m2", "Ben")).toEqual({ ok: true, value: { leagueId: LEAGUE, managerId: "m2" } });
    const league = (await loadLeague(db, LEAGUE))!;
    expect(league.managers[1].displayName).toBe("Ben");
    expect(league.version).toBe(2);
    expect(await seatInLeague(db, ben, LEAGUE)).toBe("m2");
    await expect(activeLinkId("personal", "m2")).resolves.toBeTruthy();
    await expect(activeLinkId("league_invite")).resolves.toBeTruthy(); // reusable
  });

  it("lets only one of two simultaneous claims take a seat", async () => {
    const invite = await activeLinkId("league_invite");
    const results = await Promise.all([
      claimLink(db, invite, ben, { managerId: "m2", displayName: "Ben" }),
      claimLink(db, invite, cal, { managerId: "m2", displayName: "Cal" }),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, error: "seat_taken" }]);
  });

  it("refuses a second seat for the same browser", async () => {
    await joinAs(ben, "m2", "Ben");
    expect(await joinAs(ben, "m3", "Ben again")).toEqual({ ok: false, error: "already_joined" });
  });

  it("fails with invalid_link for unknown links", async () => {
    expect(await claimLink(db, "AAAAAAAAAAAAAAAAAAAAAA", ben, { managerId: "m2", displayName: "Ben" })).toEqual({
      ok: false,
      error: "invalid_link",
    });
  });
});

describe("rechecking the link after the lock", () => {
  // claimLinkInLeague is the locked half of claimLink. Each test changes the link after the unlocked read
  // (simulated by reading it here) and before the lock.

  it("rejects a league invite revoked after the pre-transaction read", async () => {
    const invite = await activeLinkId("league_invite");
    expect(await findLink(db, invite)).not.toBeNull(); // the unlocked read passed
    await revokeLeagueInvite(db, LEAGUE, ana);
    expect(await claimLinkInLeague(db, LEAGUE, invite, ben, { managerId: "m2", displayName: "Ben" })).toEqual({
      ok: false,
      error: "invalid_link",
    });
  });

  it("rejects a league invite rotated after the pre-transaction read", async () => {
    const invite = await activeLinkId("league_invite");
    await rotateLeagueInvite(db, LEAGUE, ana);
    expect(await claimLinkInLeague(db, LEAGUE, invite, ben, { managerId: "m2", displayName: "Ben" })).toEqual({
      ok: false,
      error: "invalid_link",
    });
    expect(await joinAs(ben, "m2", "Ben")).toMatchObject({ ok: true }); // the new invite works
  });

  it("rejects a seat invite that expired after the pre-transaction read", async () => {
    await joinAs(ben, "m2", "Ben");
    await resetSeat(db, LEAGUE, ana, "m2");
    const seatInvite = await activeLinkId("seat_invite", "m2");
    await db.update(accessLinks).set({ expiresAt: sql`now() - interval '1 second'` }).where(eq(accessLinks.id, seatInvite));
    expect(await claimLinkInLeague(db, LEAGUE, seatInvite, cal, { displayName: "Ben" })).toEqual({
      ok: false,
      error: "invalid_link",
    });
  });

  it("rejects a seat invite used by someone else after the pre-transaction read", async () => {
    await joinAs(ben, "m2", "Ben");
    await resetSeat(db, LEAGUE, ana, "m2");
    const seatInvite = await activeLinkId("seat_invite", "m2");
    expect(await claimLink(db, seatInvite, cal, { displayName: "Ben" })).toMatchObject({ ok: true });
    const dan = await createSession(db, "hash-d");
    expect(await claimLinkInLeague(db, LEAGUE, seatInvite, dan, { displayName: "Ben" })).toEqual({
      ok: false,
      error: "invalid_link",
    });
  });

  it("rejects a link checked against another league", async () => {
    await createLeagueFor(db, cal, { displayName: "Cal" }, () => "lg0002");
    const invite = await activeLinkId("league_invite");
    expect(await claimLinkInLeague(db, "lg0002", invite, ben, { managerId: "m2", displayName: "Ben" })).toEqual({
      ok: false,
      error: "invalid_link",
    });
  });
});

describe("seat reset and seat invites", () => {
  beforeEach(async () => {
    await joinAs(ben, "m2", "Ben");
    await runDraftAction(db, LEAGUE, ana, { type: "start" }, STATIC_LINES);
    await confirm(ana, 1, "MIN", "OVER");
    await confirm(ben, 2, "OKC", "OVER");
  });

  it("signs the seat out everywhere, revokes its personal link and issues a seat invite", async () => {
    const oldPersonal = await activeLinkId("personal", "m2");
    expect(await resetSeat(db, LEAGUE, ana, "m2")).toEqual({ ok: true, value: null });
    expect(await seatInLeague(db, ben, LEAGUE)).toBeNull();
    expect((await findSession(db, "hash-b"))!.seats).toEqual({});
    expect((await findLink(db, oldPersonal))!.revokedAt).not.toBeNull();
    const seatInvite = (await findLink(db, await activeLinkId("seat_invite", "m2")))!;
    expect(seatInvite.expiresAt).not.toBeNull();
    // The seat stays claimed: the name and picks are kept.
    const league = (await loadLeague(db, LEAGUE))!;
    expect(league.managers[1].displayName).toBe("Ben");
    expect(league.draft.picks.map((pick) => pick.managerId)).toEqual(["m1", "m2"]);
  });

  it("refuses a pick from a browser whose seat was reset after it loaded the page", async () => {
    const viewer = await findSession(db, "hash-b"); // what the page saw while rendering
    expect(viewer!.seats[LEAGUE]).toBe("m2");
    await confirm(ana, 3, "BOS", "OVER"); // m3 is open: the commissioner picks
    await confirm(ana, 4, "CLE", "OVER"); // m4 is open
    await confirm(ana, 5, "DEN", "OVER"); // m4 again (snake)
    await confirm(ana, 6, "LAL", "OVER"); // m3
    await resetSeat(db, LEAGUE, ana, "m2"); // m2 is on the clock for pick 7
    expect(await confirm(ben, 7, "NYK", "OVER")).toEqual({ ok: false, error: "forbidden" });
  });

  it("lets the seat be re-claimed once, keeping its picks and taking the new name", async () => {
    await resetSeat(db, LEAGUE, ana, "m2");
    const seatInvite = await activeLinkId("seat_invite", "m2");
    expect(await claimLink(db, seatInvite, cal, { displayName: "Benny" })).toEqual({
      ok: true,
      value: { leagueId: LEAGUE, managerId: "m2" },
    });
    expect(await seatInLeague(db, cal, LEAGUE)).toBe("m2");
    const league = (await loadLeague(db, LEAGUE))!;
    expect(league.managers[1].displayName).toBe("Benny");
    expect(league.draft.picks[1].managerId).toBe("m2");
    await expect(activeLinkId("personal", "m2")).resolves.toBeTruthy();
    const dan = await createSession(db, "hash-d");
    expect(await claimLink(db, seatInvite, dan, { displayName: "Dan" })).toEqual({ ok: false, error: "invalid_link" });
  });

  it("never offers a reset seat on the league invite", async () => {
    await resetSeat(db, LEAGUE, ana, "m2");
    expect(await joinAs(cal, "m2", "Cal")).toEqual({ ok: false, error: "seat_taken" });
  });

  it("is commissioner-only and never for their own seat", async () => {
    expect(await resetSeat(db, LEAGUE, ben, "m1")).toEqual({ ok: false, error: "forbidden" });
    expect(await resetSeat(db, LEAGUE, ana, "m1")).toEqual({ ok: false, error: "forbidden" });
    expect(await resetSeat(db, LEAGUE, ana, "m3")).toEqual({ ok: false, error: "forbidden" }); // open seat
    expect(await resetSeat(db, "demo", ana, "m2")).toEqual({ ok: false, error: "demo_league" });
  });
});

describe("personal links", () => {
  it("sign another browser in without changing the league, replacing its seat in that league", async () => {
    await joinAs(ben, "m2", "Ben");
    const before = (await loadLeague(db, LEAGUE))!.version;
    const personal = await activeLinkId("personal", "m2");
    expect(await claimLink(db, personal, cal, {})).toEqual({ ok: true, value: { leagueId: LEAGUE, managerId: "m2" } });
    expect(await seatInLeague(db, cal, LEAGUE)).toBe("m2");
    expect(await seatInLeague(db, ben, LEAGUE)).toBe("m2");
    expect((await loadLeague(db, LEAGUE))!.version).toBe(before);
    // A personal link is reusable.
    expect(await claimLink(db, personal, ana, {})).toMatchObject({ ok: true });
    expect(await seatInLeague(db, ana, LEAGUE)).toBe("m2");
  });

  it("can be reset by its manager, optionally signing out their other browsers", async () => {
    await joinAs(ben, "m2", "Ben");
    const oldLink = await activeLinkId("personal", "m2");
    await claimLink(db, oldLink, cal, {}); // cal is Ben's second device
    expect(await resetOwnLink(db, LEAGUE, ben, { signOutOtherDevices: true })).toEqual({ ok: true, value: null });
    expect(await seatInLeague(db, ben, LEAGUE)).toBe("m2");
    expect(await seatInLeague(db, cal, LEAGUE)).toBeNull();
    expect(await claimLink(db, oldLink, cal, {})).toEqual({ ok: false, error: "invalid_link" });
    expect(await activeLinkId("personal", "m2")).not.toBe(oldLink);
    expect(await resetOwnLink(db, LEAGUE, cal, { signOutOtherDevices: false })).toEqual({
      ok: false,
      error: "forbidden",
    });
  });
});

describe("league invite controls", () => {
  it("are commissioner-only", async () => {
    await joinAs(ben, "m2", "Ben");
    expect(await rotateLeagueInvite(db, LEAGUE, ben)).toEqual({ ok: false, error: "forbidden" });
    expect(await revokeLeagueInvite(db, LEAGUE, null)).toEqual({ ok: false, error: "forbidden" });
  });

  it("revoke leaves no working invite until the next rotate", async () => {
    await revokeLeagueInvite(db, LEAGUE, ana);
    const invites = await db
      .select()
      .from(accessLinks)
      .where(and(eq(accessLinks.leagueId, LEAGUE), eq(accessLinks.kind, "league_invite")));
    expect(invites.every((link) => link.revokedAt !== null)).toBe(true);
    await rotateLeagueInvite(db, LEAGUE, ana);
    await expect(activeLinkId("league_invite")).resolves.toBeTruthy();
  });
});

describe("draft actions", () => {
  it("persist the change and bump the version; refusals change nothing", async () => {
    await joinAs(ben, "m2", "Ben");
    expect(await runDraftAction(db, LEAGUE, ben, { type: "start" }, STATIC_LINES)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect((await loadLeague(db, LEAGUE))!.version).toBe(2);
    const started = await runDraftAction(db, LEAGUE, ana, { type: "start" }, STATIC_LINES);
    expect(started.ok && started.value.league.version).toBe(3);
    expect(started.ok && started.value.actorId).toBe("m1");
    expect((await loadLeague(db, LEAGUE))!.draft.status).toBe("live");
  });

  it("fail with lines_unavailable and stay not_started when no lines are given", async () => {
    expect(await runDraftAction(db, LEAGUE, ana, { type: "start" }, null)).toEqual({
      ok: false,
      error: "lines_unavailable",
    });
    expect((await loadLeague(db, LEAGUE))!.draft.status).toBe("not_started");
  });

  it("turn a double-submitted pick into stale_pick", async () => {
    await runDraftAction(db, LEAGUE, ana, { type: "start" }, STATIC_LINES);
    const results = await Promise.all([confirm(ana, 1, "MIN", "OVER"), confirm(ana, 1, "MIN", "OVER")]);
    expect(results.map((result) => (result.ok ? "ok" : result.error)).sort()).toEqual(["ok", "stale_pick"]);
    expect((await loadLeague(db, LEAGUE))!.draft.picks).toHaveLength(1);
  });

  it("refuse the demo league and spectators", async () => {
    expect(await runDraftAction(db, "demo", ana, { type: "pause" }, null)).toEqual({ ok: false, error: "demo_league" });
    expect(await runDraftAction(db, LEAGUE, null, { type: "start" }, STATIC_LINES)).toEqual({
      ok: false,
      error: "forbidden",
    });
  });
});

describe("refreshLeagueRecords", () => {
  const records = { BOS: { wins: 1, losses: 0 } };
  const ok: RecordSource = { name: "ESPN", fetch: async (season) => ({ season, records }) };
  const down: RecordSource = {
    name: "ESPN",
    fetch: async () => {
      throw new FeedError("ESPN returned HTTP 503.");
    },
  };

  it("lets the commissioner refresh the league's season", async () => {
    const result = await refreshLeagueRecords(db, LEAGUE, ana, ok);
    expect(result).toMatchObject({ ok: true, value: { ok: true, status: { source: "ESPN", error: null } } });
    const league = (await loadLeague(db, LEAGUE))!;
    expect(await loadSeasonRecords(db, seasonEndYear(league.seasonLabel)!)).toEqual(records);
  });

  it("reports a feed failure with the reason and keeps the status", async () => {
    const result = await refreshLeagueRecords(db, LEAGUE, ana, down);
    expect(result).toMatchObject({ ok: true, value: { ok: false, message: "ESPN returned HTTP 503." } });
  });

  it("refuses everyone but the commissioner, the demo league and unknown leagues", async () => {
    await joinAs(ben, "m2", "Ben");
    expect(await refreshLeagueRecords(db, LEAGUE, ben, ok)).toEqual({ ok: false, error: "forbidden" });
    expect(await refreshLeagueRecords(db, LEAGUE, null, ok)).toEqual({ ok: false, error: "forbidden" });
    expect(await refreshLeagueRecords(db, "demo", ana, ok)).toEqual({ ok: false, error: "demo_league" });
    expect(await refreshLeagueRecords(db, "nope00", ana, ok)).toEqual({ ok: false, error: "not_found" });
  });
});

describe("line overrides", () => {
  it("stores overrides and freezes them with the season and manual teams", async () => {
    const partial = { ...STATIC_LINES, values: { ...STATIC_LINES.values } };
    delete (partial.values as Record<string, number>).BOS;
    expect((await setLineOverrides(db, LEAGUE, ana, { BOS: 44.5 })).ok).toBe(true);
    expect((await loadLeague(db, LEAGUE))!.lineOverrides).toEqual({ BOS: 44.5 });
    await runDraftAction(db, LEAGUE, ana, { type: "start" }, partial);
    const lines = (await loadLeague(db, LEAGUE))!.lines!;
    expect(lines).toMatchObject({ source: "static", season: "2025–26", manual: ["BOS"] });
    expect(lines.values.BOS).toBe(44.5);
  });

  it("refuses overrides from a non-commissioner and after the draft starts", async () => {
    expect(await setLineOverrides(db, LEAGUE, null, {})).toEqual({ ok: false, error: "forbidden" });
    await joinAs(ben, "m2", "Ben");
    expect(await setLineOverrides(db, LEAGUE, ben, {})).toEqual({ ok: false, error: "forbidden" });
    await runDraftAction(db, LEAGUE, ana, { type: "start" }, STATIC_LINES);
    expect(await setLineOverrides(db, LEAGUE, ana, {})).toEqual({ ok: false, error: "lines_locked" });
  });
});

describe("fade stage", () => {
  // Demo picks: 1 MIN OVER (m1), 2 OKC OVER (m2), 3 BOS UNDER (m3), 4 CLE OVER (m4).
  beforeEach(draftAllPicks);

  it("opens after the 44th pick instead of completing the draft", async () => {
    const league = (await loadLeague(db, LEAGUE))!;
    expect(league.draft.picks).toHaveLength(44);
    expect(league.draft.status).toBe("fades");
    expect(league.fades).toEqual([]);
  });

  it("lets managers fade for their own seat and the commissioner for open seats only", async () => {
    expect(await fade(ben, "m1", 1)).toEqual({ ok: false, error: "forbidden" });
    expect(await fade(ben, "m3", 1)).toEqual({ ok: false, error: "forbidden" });
    expect(await fade(ana, "m2", 1)).toEqual({ ok: false, error: "forbidden" }); // Ben's seat is claimed
    expect(await fade(cal, "m3", 1)).toEqual({ ok: false, error: "forbidden" }); // spectator
    expect(await fade(null, "m3", 1)).toEqual({ ok: false, error: "forbidden" });
    expect(await fade(ana, "m1", 1)).toEqual({ ok: false, error: "own_pick" });
    expect(await fade(ana, "m1", 45)).toEqual({ ok: false, error: "unknown_pick" });
    expect((await loadLeague(db, LEAGUE))!.fades).toEqual([]);

    expect((await fade(ben, "m2", 1)).ok).toBe(true);
    expect((await fade(ana, "m3", 1)).ok).toBe(true);
    expect((await loadLeague(db, LEAGUE))!.fades.map((f) => f.managerId)).toEqual(["m2", "m3"]);
  });

  it("stores the fade and bumps the version", async () => {
    const before = (await loadLeague(db, LEAGUE))!.version;
    const result = await fade(ben, "m2", 1);
    expect(result.ok && result.value.league.fades).toEqual([{ id: "fade-m2", managerId: "m2", targetPickNumber: 1 }]);
    const league = (await loadLeague(db, LEAGUE))!;
    expect(league.version).toBe(before + 1);
    expect(league.fades).toEqual([{ id: "fade-m2", managerId: "m2", targetPickNumber: 1 }]);
  });

  it("locks a confirmed fade, even against a simultaneous second submission", async () => {
    const results = await Promise.all([fade(ben, "m2", 1), fade(ben, "m2", 3)]);
    expect(results.map((result) => (result.ok ? "ok" : result.error)).sort()).toEqual(["fade_locked", "ok"]);
    expect(await fade(ben, "m2", 4)).toEqual({ ok: false, error: "fade_locked" });
    expect(await db.select().from(fades)).toHaveLength(1);
  });

  it("refuses a duplicate row at the database too", async () => {
    await fade(ben, "m2", 1);
    await expect(db.insert(fades).values({ leagueId: LEAGUE, managerId: "m2", targetPickNumber: 3 })).rejects.toThrow();
  });

  it("lets several managers fade the same pick", async () => {
    expect((await fade(ben, "m2", 1)).ok).toBe(true);
    expect((await fade(ana, "m3", 1)).ok).toBe(true);
    expect((await fade(ana, "m4", 1)).ok).toBe(true);
    expect((await loadLeague(db, LEAGUE))!.fades.map((f) => f.targetPickNumber)).toEqual([1, 1, 1]);
  });

  it("completes the draft with the fourth fade, then refuses more", async () => {
    await fade(ben, "m2", 1);
    await fade(ana, "m3", 1);
    await fade(ana, "m4", 2);
    expect((await loadLeague(db, LEAGUE))!.draft.status).toBe("fades");
    await fade(ana, "m1", 2);
    const league = (await loadLeague(db, LEAGUE))!;
    expect(league.draft.status).toBe("complete");
    expect(league.fades).toHaveLength(4);
    expect(await fade(ana, "m1", 3)).toEqual({ ok: false, error: "not_fading" });
  });

  it("scores stored fades: +2 when the target misses, 0 when it hits", async () => {
    await fade(ben, "m2", 1); // MIN OVER
    await fade(ana, "m1", 2); // OKC OVER
    const league = (await loadLeague(db, LEAGUE))!;
    // MIN wins at a pace well above its line (OVER hits); OKC wins none (OVER misses).
    const records: Record<string, { wins: number; losses: number }> = { MIN: { wins: 10, losses: 0 }, OKC: { wins: 0, losses: 10 } };
    const teams = indexTeams(withLines(TEAM_INFO, league.lines!).map((team) => ({ ...team, ...records[team.id] })));
    const rows = computeStandings(league, teams, "projected").rows;
    const row = (managerId: string) => rows.find((candidate) => candidate.managerId === managerId)!;
    expect(row("m1").fades.map((f) => f.evaluation.points)).toEqual([2]);
    expect(row("m1").fadePoints).toBe(2);
    expect(row("m2").fades.map((f) => f.evaluation.points)).toEqual([0]);
    expect(row("m2").fadePoints).toBe(0);
  });

  it("keeps team picks closed during the fade stage", async () => {
    expect(await confirm(ana, 45, "MIN", "UNDER")).toEqual({ ok: false, error: "not_live" });
    expect(await runDraftAction(db, LEAGUE, ana, { type: "pause" }, null)).toEqual({
      ok: false,
      error: "invalid_transition",
    });
  });
});

describe("fades before the fade stage", () => {
  it("are refused while team picks are still being made", async () => {
    await runDraftAction(db, LEAGUE, ana, { type: "start" }, STATIC_LINES);
    await confirm(ana, 1, "MIN", "OVER");
    await confirm(ana, 2, "OKC", "OVER");
    expect(await fade(ana, "m1", 2)).toEqual({ ok: false, error: "not_fading" });
  });
});

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe("league size", () => {
  it("grows the league before the draft, and the new seats can be claimed", async () => {
    expect((await setLeagueConfig(db, LEAGUE, ana, { managerCount: 6, rounds: 10 })).ok).toBe(true);
    const league = (await loadLeague(db, LEAGUE))!;
    expect(league.managers.map((m) => m.id)).toEqual(["m1", "m2", "m3", "m4", "m5", "m6"]);
    expect(league.draft).toMatchObject({ rounds: 10, seatOrder: ["m1", "m2", "m3", "m4", "m5", "m6"] });
    expect(league.version).toBe(2);
    expect((await joinAs(ben, "m6", "Ben")).ok).toBe(true);
    expect(await seatInLeague(db, ben, LEAGUE)).toBe("m6");
  });

  it("shrinks by removing open seats only; claimed seats and their sessions stay", async () => {
    await joinAs(ben, "m3", "Ben");
    expect(await setLeagueConfig(db, LEAGUE, ana, { managerCount: 2, rounds: 11 })).toEqual({ ok: false, error: "seats_claimed" });
    expect((await setLeagueConfig(db, LEAGUE, ana, { managerCount: 3, rounds: 20 })).ok).toBe(true);
    const league = (await loadLeague(db, LEAGUE))!;
    expect(league.managers.map((m) => [m.id, m.displayName])).toEqual([["m1", "Ana"], ["m2", null], ["m3", "Ben"]]);
    expect(league.draft.rounds).toBe(20);
    expect(await seatInLeague(db, ben, LEAGUE)).toBe("m3");
    expect(await seatInLeague(db, ana, LEAGUE)).toBe("m1");
  });

  it("refuses other managers, invalid sizes and changes after the start, writing nothing", async () => {
    await joinAs(ben, "m2", "Ben");
    expect(await setLeagueConfig(db, LEAGUE, ben, { managerCount: 6, rounds: 10 })).toEqual({ ok: false, error: "forbidden" });
    expect(await setLeagueConfig(db, LEAGUE, ana, { managerCount: 7, rounds: 9 })).toEqual({ ok: false, error: "invalid_config" });
    await runDraftAction(db, LEAGUE, ana, { type: "start" }, STATIC_LINES);
    expect(await setLeagueConfig(db, LEAGUE, ana, { managerCount: 6, rounds: 10 })).toEqual({ ok: false, error: "config_locked" });
    const league = (await loadLeague(db, LEAGUE))!;
    expect(league.managers).toHaveLength(4);
    expect(league.draft.rounds).toBe(11);
  });
});

describe("early end", () => {
  /** Sizes the league, starts it and replays a scripted draft's confirms; the commissioner picks for every open seat. */
  async function replay(state: DraftState, count = confirmsOf(state).length) {
    await setLeagueConfig(db, LEAGUE, ana, { managerCount: state.seatOrder.length, rounds: state.rounds });
    await runDraftAction(db, LEAGUE, ana, { type: "start" }, STATIC_LINES);
    for (const { pickNumber, teamId, side } of confirmsOf(state).slice(0, count)) {
      const result = await confirm(ana, pickNumber, teamId, side);
      if (!result.ok) throw new Error(`pick ${pickNumber}: ${result.error}`);
    }
  }

  it("6 × 10: voids the cut-short round in the same write as the pick that ended it", async () => {
    const script = confirmsOf(blockedDraft(6, 10, 58));
    await replay(blockedDraft(6, 10, 58), script.length - 1);
    const before = (await loadLeague(db, LEAGUE))!;
    expect(before.draft).toMatchObject({ status: "live", blockedPick: null, voidedPicks: [] });

    const last = script.at(-1)!;
    expect((await confirm(ana, last.pickNumber, last.teamId, last.side)).ok).toBe(true);
    const league = (await loadLeague(db, LEAGUE))!;
    expect(league.version).toBe(before.version + 1);
    expect(league.draft).toMatchObject({ status: "fades", blockedPick: 58, rounds: 10 });
    expect(league.draft.picks.map((p) => p.pickNumber)).toEqual(range(1, 54));
    expect(league.draft.voidedPicks.map((p) => p.pickNumber)).toEqual([55, 56, 57]);

    const rows = await db.select().from(picks).where(eq(picks.leagueId, LEAGUE));
    expect(rows).toHaveLength(57);
    expect(rows.filter((row) => row.voided).map((row) => row.pickNumber).sort((a, b) => a - b)).toEqual([55, 56, 57]);
    expect(await confirm(ana, 58, "MIN", "OVER")).toEqual({ ok: false, error: "not_live" });
  });

  it("excludes voided picks from fades and standings, and completes after every manager's fade", async () => {
    await replay(blockedDraft(6, 10, 58));
    expect(await fade(ana, "m1", 56)).toEqual({ ok: false, error: "voided_pick" });
    for (const managerId of ["m1", "m2", "m3", "m4", "m5", "m6"]) {
      const result = await fade(ana, managerId, managerId === "m1" ? 2 : 1);
      expect(result.ok).toBe(true);
    }
    const league = (await loadLeague(db, LEAGUE))!;
    expect(league.draft.status).toBe("complete");
    expect(league.fades).toHaveLength(6);
    const standings = computeStandings(league, indexTeams(withLines(TEAM_INFO, league.lines!)), "projected");
    const counted = standings.rows.flatMap((row) => row.calls.map((call) => call.pick.pickNumber));
    expect(Math.max(...counted)).toBe(54);
    expect(counted).toHaveLength(54);
  });

  it("7 × 8: keeps 7 rounds", async () => {
    await replay(blockedDraft(7, 8, 54));
    const league = (await loadLeague(db, LEAGUE))!;
    expect(league.draft).toMatchObject({ status: "fades", blockedPick: 54 });
    expect(league.draft.picks).toHaveLength(49);
    expect(league.draft.voidedPicks.map((p) => p.pickNumber)).toEqual([50, 51, 52, 53]);
  });

  it("7 × 8 with nobody blocked keeps every pick", async () => {
    await replay(plainDraft(7, 8));
    const league = (await loadLeague(db, LEAGUE))!;
    expect(league.draft).toMatchObject({ status: "fades", blockedPick: null, voidedPicks: [] });
    expect(league.draft.picks).toHaveLength(56);
  });
});

describe("draft order", () => {
  const ORDER = ["m3", "m1", "m4", "m2"];

  it("persists after a reload and bumps the version", async () => {
    expect((await setDraftOrder(db, LEAGUE, ana, ORDER)).ok).toBe(true);
    const league = (await loadLeague(db, LEAGUE))!;
    expect(league.managers.map((m) => [m.id, m.seat])).toEqual([["m3", 0], ["m1", 1], ["m4", 2], ["m2", 3]]);
    expect(league.draft.seatOrder).toEqual(ORDER);
    expect(league.version).toBe(2);
  });

  it("keeps names, sessions and links with their manager, and open seats stay claimable", async () => {
    await joinAs(ben, "m2", "Ben");
    const linksBefore = (await listActiveLinks(db, LEAGUE)).map((l) => [l.id, l.kind, l.managerId]);
    expect((await setDraftOrder(db, LEAGUE, ana, ORDER)).ok).toBe(true);
    const league = (await loadLeague(db, LEAGUE))!;
    expect(league.managers.find((m) => m.id === "m2")?.displayName).toBe("Ben");
    expect(league.commissionerId).toBe("m1");
    expect(await seatInLeague(db, ana, LEAGUE)).toBe("m1");
    expect(await seatInLeague(db, ben, LEAGUE)).toBe("m2");
    expect((await listActiveLinks(db, LEAGUE)).map((l) => [l.id, l.kind, l.managerId])).toEqual(linksBefore);
    expect((await joinAs(cal, "m3", "Cal")).ok).toBe(true);
    expect((await loadLeague(db, LEAGUE))!.managers[0]).toEqual({ id: "m3", seat: 0, displayName: "Cal" });
  });

  it("starts the draft from the saved order", async () => {
    await joinAs(ben, "m2", "Ben");
    await setDraftOrder(db, LEAGUE, ana, ["m2", "m1", "m3", "m4"]);
    await runDraftAction(db, LEAGUE, ana, { type: "start" }, STATIC_LINES);
    expect(await confirm(ana, 1, "MIN", "OVER")).toEqual({ ok: false, error: "forbidden" });
    expect((await confirm(ben, 1, "MIN", "OVER")).ok).toBe(true);
    expect((await confirm(ana, 2, "OKC", "OVER")).ok).toBe(true);
    const league = (await loadLeague(db, LEAGUE))!;
    expect(league.draft.seatOrder).toEqual(["m2", "m1", "m3", "m4"]);
    expect(league.draft.picks.map((pick) => pick.managerId)).toEqual(["m2", "m1"]);
  });

  it("refuses other managers, spectators, bad orders and a started draft, writing nothing", async () => {
    await joinAs(ben, "m2", "Ben");
    expect(await setDraftOrder(db, LEAGUE, ben, ORDER)).toEqual({ ok: false, error: "forbidden" });
    expect(await setDraftOrder(db, LEAGUE, cal, ORDER)).toEqual({ ok: false, error: "forbidden" });
    expect(await setDraftOrder(db, LEAGUE, null, ORDER)).toEqual({ ok: false, error: "forbidden" });
    expect(await setDraftOrder(db, LEAGUE, ana, ["m1", "m1", "m2", "m3"])).toEqual({ ok: false, error: "invalid_order" });
    await runDraftAction(db, LEAGUE, ana, { type: "start" }, STATIC_LINES);
    expect(await setDraftOrder(db, LEAGUE, ana, ORDER)).toEqual({ ok: false, error: "order_locked" });
    const league = (await loadLeague(db, LEAGUE))!;
    expect(league.draft.seatOrder).toEqual(["m1", "m2", "m3", "m4"]);
    expect(league.version).toBe(3); // the claim and the start only
  });

  it("refuses an order saved from a screen that missed a size change", async () => {
    await setLeagueConfig(db, LEAGUE, ana, { managerCount: 5, rounds: 11 });
    expect(await setDraftOrder(db, LEAGUE, ana, ORDER)).toEqual({ ok: false, error: "invalid_order" });
    expect((await loadLeague(db, LEAGUE))!.draft.seatOrder).toEqual(["m1", "m2", "m3", "m4", "m5"]);
  });

  it("shrinks from the end of the order and grows with fresh ids after a reorder", async () => {
    await setDraftOrder(db, LEAGUE, ana, ["m4", "m1", "m2", "m3"]);
    expect((await setLeagueConfig(db, LEAGUE, ana, { managerCount: 3, rounds: 11 })).ok).toBe(true);
    expect((await loadLeague(db, LEAGUE))!.draft.seatOrder).toEqual(["m4", "m1", "m2"]);
    expect((await setLeagueConfig(db, LEAGUE, ana, { managerCount: 5, rounds: 11 })).ok).toBe(true);
    expect((await loadLeague(db, LEAGUE))!.draft.seatOrder).toEqual(["m4", "m1", "m2", "m3", "m5"]);
  });

  it("leaves a league that was never reordered in creation order", async () => {
    const league = (await loadLeague(db, LEAGUE))!;
    expect(league.draft.seatOrder).toEqual(["m1", "m2", "m3", "m4"]);
    expect(league.managers.map((m) => m.seat)).toEqual([0, 1, 2, 3]);
  });
});
