import { revokeLeagueInvite, rotateLeagueInvite } from "@/db/actions";
import { getDb } from "@/server/db";
import { errorResponse, isSameOrigin, resultResponse } from "@/server/http";
import { getSession } from "@/server/session";

/** Rotate: revoke the league invite and issue a new one. */
export async function POST(request: Request, ctx: RouteContext<"/api/leagues/[leagueId]/invite">) {
  if (!isSameOrigin(request)) return errorResponse("forbidden");
  const { leagueId } = await ctx.params;
  const session = await getSession();
  return resultResponse(await rotateLeagueInvite(await getDb(), leagueId, session?.id ?? null));
}

/** Revoke the league invite without a replacement. */
export async function DELETE(request: Request, ctx: RouteContext<"/api/leagues/[leagueId]/invite">) {
  if (!isSameOrigin(request)) return errorResponse("forbidden");
  const { leagueId } = await ctx.params;
  const session = await getSession();
  return resultResponse(await revokeLeagueInvite(await getDb(), leagueId, session?.id ?? null));
}
