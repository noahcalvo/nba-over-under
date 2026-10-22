import "server-only";
import { cache } from "react";
import { CHALLENGE } from "@/config/challenge";
import { listLegacyItems, type LegacyItems } from "@/db/legacy";
import { getAccount } from "@/server/account";
import { getDb } from "@/server/db";
import { getLegacySession } from "@/server/session";

/**
 * What this browser's legacy session could move into the signed-in account (its seats and this season's entry),
 * looked up once per request. Null when signed out, without a legacy session, or when it holds nothing.
 */
export const getLegacyItems = cache(async (): Promise<LegacyItems | null> => {
  if (!(await getAccount())) return null;
  const session = await getLegacySession();
  if (!session) return null;
  const items = await listLegacyItems(await getDb(), session.id, CHALLENGE.seasonYear);
  return items.seats.length > 0 || items.entry ? items : null;
});
