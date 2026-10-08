import { and, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { STATIC_LINES } from "@/data/static-lines";
import {
  claimLink,
  claimLinkInLeague,
  createLeagueFor,
  resetOwnLink,
  resetSeat,
  revokeLeagueInvite,
  rotateLeagueInvite,
  runDraftAction,
  setLineOverrides,
} from "@/db/actions";
import type { Db } from "@/db/client";
import { loadLeague } from "@/db/leagues";
import { findLink, listActiveLinks } from "@/db/links";
import { accessLinks } from "@/db/schema";
import { createSession, findSession, seatInLeague } from "@/db/sessions";
import { createTestDb } from "@/db/test-db";
import type { LinkKind } from "@/lib/access/links";
import type { Side } from "@/lib/types";

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
