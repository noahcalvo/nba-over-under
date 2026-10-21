import { revokeLeagueInvite, rotateLeagueInvite } from "@/db/actions";
import { getAccount, signedOutError } from "@/server/account";
import { getDb } from "@/server/db";
import { errorResponse, isSameOrigin, resultResponse } from "@/server/http";

/** Rotate: revoke the league invite and issue a new one. */
export async function POST(request: Request, ctx: RouteContext<"/api/leagues/[leagueId]/invite">) {
  if (!isSameOrigin(request)) return errorResponse("forbidden");
  const account = await getAccount();
  if (!account) return errorResponse(signedOutError());
  const { leagueId } = await ctx.params;
  return resultResponse(await rotateLeagueInvite(await getDb(), leagueId, account.userId));
}

/** Revoke the league invite without a replacement. */
export async function DELETE(request: Request, ctx: RouteContext<"/api/leagues/[leagueId]/invite">) {
  if (!isSameOrigin(request)) return errorResponse("forbidden");
  const account = await getAccount();
  if (!account) return errorResponse(signedOutError());
  const { leagueId } = await ctx.params;
  return resultResponse(await revokeLeagueInvite(await getDb(), leagueId, account.userId));
}
