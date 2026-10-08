import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { ACCESS } from "@/config/access";
import { DEMO_LEAGUE_ID } from "@/data/demo-league";
import { createSession, findSession, type SessionRecord } from "@/db/sessions";
import { createSessionToken, hashSessionToken, isSessionToken } from "@/lib/access/tokens";
import { getDb } from "@/server/db";

export const SESSION_COOKIE = "courtline_session";
/** The prototype's editable seat cookie. Ignored, and deleted whenever a session cookie is set. */
const LEGACY_SEATS_COOKIE = "courtline_seats";

/** This browser's session, looked up once per request. Null without a valid, unexpired session. */
export const getSession = cache(async (): Promise<SessionRecord | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !isSessionToken(token)) return null;
  return findSession(await getDb(), await hashSessionToken(token));
});

/**
 * The viewer's seat in a league, for rendering. Never use it to authorize a write: mutations re-read the seat
 * under the league lock (src/db/leagues.ts withLockedLeague).
 */
export async function getViewerId(leagueId: string): Promise<string | null> {
  if (leagueId === DEMO_LEAGUE_ID) return null;
  return (await getSession())?.seats[leagueId] ?? null;
}

/** Route handlers only (cookies can't be set while rendering): this browser's session id, creating one if needed. */
export async function ensureSession(): Promise<string> {
  const existing = await getSession();
  if (existing) return existing.id;
  const token = createSessionToken();
  const sessionId = await createSession(await getDb(), await hashSessionToken(token));
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ACCESS.cookieMaxAgeDays * 24 * 60 * 60,
  });
  jar.delete(LEGACY_SEATS_COOKIE);
  return sessionId;
}
