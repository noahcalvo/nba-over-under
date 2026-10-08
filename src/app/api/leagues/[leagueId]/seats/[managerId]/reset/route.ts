import { resetSeat } from "@/db/actions";
import { getDb } from "@/server/db";
import { errorResponse, isSameOrigin, resultResponse } from "@/server/http";
import { getSession } from "@/server/session";

export async function POST(request: Request, ctx: RouteContext<"/api/leagues/[leagueId]/seats/[managerId]/reset">) {
  if (!isSameOrigin(request)) return errorResponse("forbidden");
  const { leagueId, managerId } = await ctx.params;
  const session = await getSession();
  return resultResponse(await resetSeat(await getDb(), leagueId, session?.id ?? null, managerId));
}
