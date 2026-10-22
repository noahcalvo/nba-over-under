import { runDraftAction } from "@/db/actions";
import { parseDraftAction } from "@/lib/league/parse-action";
import { getAccount, signedOutError } from "@/server/account";
import { getDb } from "@/server/db";
import { errorResponse, isSameOrigin, readJsonBody } from "@/server/http";
import { findLeague, toLeagueView } from "@/server/league";
import { readLines } from "@/server/lines";

export async function GET(_request: Request, ctx: RouteContext<"/api/leagues/[leagueId]/draft">) {
  const { leagueId } = await ctx.params;
  const league = await findLeague(leagueId);
  if (!league) return errorResponse("not_found");
  return Response.json(await toLeagueView(league), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, ctx: RouteContext<"/api/leagues/[leagueId]/draft">) {
  if (!isSameOrigin(request)) return errorResponse("forbidden");
  const account = await getAccount();
  if (!account) return errorResponse(signedOutError());
  const { leagueId } = await ctx.params;
  const action = parseDraftAction(await readJsonBody(request));
  if (!action) return errorResponse("invalid_request");
  // Read the source before taking the league lock: no network calls while holding it.
  const sourceLines = action.type === "start" ? (await readLines()).lines : null;
  const result = await runDraftAction(await getDb(), leagueId, account.userId, action, sourceLines);
  if (!result.ok) return errorResponse(result.error);
  return Response.json(await toLeagueView(result.value.league, result.value.actorId));
}
