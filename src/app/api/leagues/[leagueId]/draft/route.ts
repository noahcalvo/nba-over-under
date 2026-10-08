import { parseDraftAction } from "@/lib/league/parse-action";

import { errorResponse, readJsonBody } from "@/server/http";
import { leagueStore } from "@/server/store";
import { getViewerId, toLeagueView } from "@/server/viewer";

export async function GET(_request: Request, ctx: RouteContext<"/api/leagues/[leagueId]/draft">) {
  const { leagueId } = await ctx.params;
  const league = leagueStore.get(leagueId);
  if (!league) return errorResponse("not_found");
  return Response.json(await toLeagueView(league), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, ctx: RouteContext<"/api/leagues/[leagueId]/draft">) {
  const { leagueId } = await ctx.params;
  const action = parseDraftAction(await readJsonBody(request));
  if (!action) return errorResponse("invalid_request");
  const league = leagueStore.get(leagueId);
  if (!league) return errorResponse("not_found");
  const viewerId = await getViewerId(league);
  const result = leagueStore.act(leagueId, viewerId, action);
  if (!result.ok) return errorResponse(result.error);
  return Response.json(await toLeagueView(result.value));
}
