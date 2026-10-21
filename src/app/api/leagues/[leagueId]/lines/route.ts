import { TEAM_IDS } from "@/data/teams";
import { setLineOverrides } from "@/db/actions";
import { parseLineValues } from "@/lib/lines";
import { getAccount } from "@/server/account";
import { getDb } from "@/server/db";
import { errorResponse, isSameOrigin, readJsonBody } from "@/server/http";
import { toLeagueView } from "@/server/league";

/** Replace the commissioner's line overrides: `{ overrides: { BOS: 50.5, … } }`. An empty map clears them. */
export async function PUT(request: Request, ctx: RouteContext<"/api/leagues/[leagueId]/lines">) {
  if (!isSameOrigin(request)) return errorResponse("forbidden");
  const account = await getAccount();
  if (!account) return errorResponse("sign_in_required");
  const { leagueId } = await ctx.params;
  const overrides = parseLineValues((await readJsonBody(request)).overrides, TEAM_IDS);
  if (!overrides) return errorResponse("invalid_line");
  const result = await setLineOverrides(await getDb(), leagueId, account.userId, overrides);
  if (!result.ok) return errorResponse(result.error);
  return Response.json(await toLeagueView(result.value.league, result.value.actorId));
}
