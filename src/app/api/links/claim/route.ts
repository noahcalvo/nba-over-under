import { claimLink } from "@/db/actions";
import { verifyLink } from "@/server/access";
import { getDb } from "@/server/db";
import { errorResponse, isSameOrigin, readJsonBody } from "@/server/http";
import { ensureSession } from "@/server/session";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return errorResponse("forbidden");
  const body = await readJsonBody(request);
  const linkId = typeof body.token === "string" ? await verifyLink(body.token) : null;
  if (!linkId) return errorResponse("invalid_link");
  const sessionId = await ensureSession();
  const result = await claimLink(await getDb(), linkId, sessionId, {
    managerId: body.managerId,
    displayName: body.displayName,
  });
  if (!result.ok) return errorResponse(result.error);
  return Response.json(result.value);
}
