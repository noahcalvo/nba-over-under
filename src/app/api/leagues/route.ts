import { createLeagueFor } from "@/db/actions";
import { getDb } from "@/server/db";
import { errorResponse, isSameOrigin, readJsonBody } from "@/server/http";
import { ensureSession } from "@/server/session";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return errorResponse("forbidden");
  const body = await readJsonBody(request);
  const sessionId = await ensureSession();
  const result = await createLeagueFor(await getDb(), sessionId, {
    leagueName: body.leagueName,
    displayName: body.displayName,
  });
  if (!result.ok) return errorResponse(result.error);
  return Response.json({ leagueId: result.value.leagueId }, { status: 201 });
}
