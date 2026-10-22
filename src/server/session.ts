import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { DEMO_LEAGUE_ID } from "@/data/demo-league";
import { loadUserSeats } from "@/db/accounts";
import { findSession, type SessionRecord } from "@/db/sessions";
import { hashSessionToken, isSessionToken } from "@/lib/access/tokens";
import { getAccount } from "@/server/account";
import { getDb } from "@/server/db";

export const SESSION_COOKIE = "courtline_session";

/**
 * This browser's legacy session (from before sign-in), looked up once per request. Null without a valid, unexpired
 * session. It authorizes nothing and never makes the viewer a manager; only the legacy claim reads it.
 */
export const getLegacySession = cache(async (): Promise<SessionRecord | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !isSessionToken(token)) return null;
  return findSession(await getDb(), await hashSessionToken(token));
});

/** The signed-in account's seats (leagueId → managerId), looked up once per request. Empty when signed out. */
const getAccountSeats = cache(async (): Promise<Readonly<Record<string, string>>> => {
  const account = await getAccount();
  return account ? loadUserSeats(await getDb(), account.userId) : {};
});

/**
 * The signed-in account's seat in a league, for rendering. Never use it to authorize a write: mutations re-read the
 * seat under the league lock (src/db/leagues.ts withLockedLeague).
 */
export async function getViewerId(leagueId: string): Promise<string | null> {
  if (leagueId === DEMO_LEAGUE_ID) return null;
  return (await getAccountSeats())[leagueId] ?? null;
}
