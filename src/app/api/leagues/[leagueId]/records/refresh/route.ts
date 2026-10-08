import { refreshLeagueRecords } from "@/db/actions";
import { getDb } from "@/server/db";
import { errorResponse, isSameOrigin } from "@/server/http";
import { recordSource } from "@/server/records";
import { getSession } from "@/server/session";

/** Commissioner: refresh team records for this league's season. */
export async function POST(request: Request, ctx: RouteContext<"/api/leagues/[leagueId]/records/refresh">) {
  if (!isSameOrigin(request)) return errorResponse("forbidden");
  const { leagueId } = await ctx.params;
  const session = await getSession();
  const result = await refreshLeagueRecords(await getDb(), leagueId, session?.id ?? null, recordSource);
  if (!result.ok) return errorResponse(result.error);
  const { value } = result;
  if (!value.ok) {
    return Response.json(
      {
        error: "records_unavailable",
        message: value.message,
        records: value.status,
      },
      { status: 502 },
    );
  }
  return Response.json({ ok: true, records: value.status });
}
