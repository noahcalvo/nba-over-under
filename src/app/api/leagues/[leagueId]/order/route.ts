import { setDraftOrder } from "@/db/actions";
import { parseDraftOrder } from "@/lib/league/draft-order";
import { getDb } from "@/server/db";
import { errorResponse, isSameOrigin, readJsonBody } from "@/server/http";
import { toLeagueView } from "@/server/league";
import { getSession } from "@/server/session";

/** Set the draft order before the draft: `{ order: ["m3", "m1", "m2", "m4"] }`, every manager id once, round 1 first. Commissioner only. */
export async function PUT(request: Request, ctx: RouteContext<"/api/leagues/[leagueId]/order">) {
  if (!isSameOrigin(request)) return errorResponse("forbidden");
  const { leagueId } = await ctx.params;
  const order = parseDraftOrder(await readJsonBody(request));
  if (!order) return errorResponse("invalid_request");
  const session = await getSession();
  const result = await setDraftOrder(await getDb(), leagueId, session?.id ?? null, order);
  if (!result.ok) return errorResponse(result.error);
  return Response.json(await toLeagueView(result.value.league, result.value.actorId));
}
