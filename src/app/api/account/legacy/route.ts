import { cookies } from "next/headers";
import { CHALLENGE } from "@/config/challenge";
import { claimLegacy, type LegacyClaimResult } from "@/db/legacy";
import { getAccount, signedOutError } from "@/server/account";
import { getDb } from "@/server/db";
import { errorResponse, isSameOrigin } from "@/server/http";
import { getLegacySession, SESSION_COOKIE } from "@/server/session";

const NOTHING: LegacyClaimResult = { seats: [], entry: null, sessionCleared: false };

/**
 * Move this browser's legacy seats and this season's 30/30 entry into the signed-in account. Returns each item's
 * outcome; the legacy cookie is deleted once its session is gone.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return errorResponse("forbidden");
  const account = await getAccount();
  if (!account) return errorResponse(signedOutError());
  const session = await getLegacySession();
  if (!session) return Response.json(NOTHING);
  const result = await claimLegacy(await getDb(), session.id, account.userId, CHALLENGE.seasonYear);
  if (result.sessionCleared) (await cookies()).delete(SESSION_COOKIE);
  return Response.json(result);
}
