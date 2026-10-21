import { setDraftOrder } from "@/db/actions";
import { parseDraftOrder } from "@/lib/league/draft-order";
import { getAccount } from "@/server/account";
import { getDb } from "@/server/db";
import { errorResponse, isSameOrigin, readJsonBody } from "@/server/http";
import { toLeagueView } from "@/server/league";

/** Set the draft order before the draft: `{ order: ["m3", "m1", "m2", "m4"] }`, every manager id once, round 1 first. Commissioner only. */
export async function PUT(request: Request, ctx: RouteContext<"/api/leagues/[leagueId]/order">) {
  if (!isSameOrigin(request)) return errorResponse("forbidden");
  const account = await getAccount();
  if (!account) return errorResponse("sign_in_required");
  const { leagueId } = await ctx.params;
  const order = parseDraftOrder(await readJsonBody(request));
  if (!order) return errorResponse("invalid_request");
  const result = await setDraftOrder(await getDb(), leagueId, account.userId, order);
  if (!result.ok) return errorResponse(result.error);
  return Response.json(await toLeagueView(result.value.league, result.value.actorId));
}
