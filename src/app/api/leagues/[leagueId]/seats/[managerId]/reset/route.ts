import { resetSeat } from "@/db/actions";
import { getAccount } from "@/server/account";
import { getDb } from "@/server/db";
import { errorResponse, isSameOrigin, resultResponse } from "@/server/http";

export async function POST(request: Request, ctx: RouteContext<"/api/leagues/[leagueId]/seats/[managerId]/reset">) {
  if (!isSameOrigin(request)) return errorResponse("forbidden");
  const account = await getAccount();
  if (!account) return errorResponse("sign_in_required");
  const { leagueId, managerId } = await ctx.params;
  return resultResponse(await resetSeat(await getDb(), leagueId, account.userId, managerId));
}
