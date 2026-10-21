import { setLeagueConfig } from "@/db/actions";
import { parseLeagueConfig } from "@/lib/league/config";
import { getAccount } from "@/server/account";
import { getDb } from "@/server/db";
import { errorResponse, isSameOrigin, readJsonBody } from "@/server/http";
import { toLeagueView } from "@/server/league";

/** Change the league size before the draft: `{ managerCount: 6, rounds: 10 }`. Commissioner only. */
export async function PUT(request: Request, ctx: RouteContext<"/api/leagues/[leagueId]/config">) {
  if (!isSameOrigin(request)) return errorResponse("forbidden");
  const account = await getAccount();
  if (!account) return errorResponse("sign_in_required");
  const { leagueId } = await ctx.params;
  const config = parseLeagueConfig(await readJsonBody(request));
  if (!config) return errorResponse("invalid_config");
  const result = await setLeagueConfig(await getDb(), leagueId, account.userId, config);
  if (!result.ok) return errorResponse(result.error);
  return Response.json(await toLeagueView(result.value.league, result.value.actorId));
}
