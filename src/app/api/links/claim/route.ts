import { claimLink } from "@/db/actions";
import { verifyLink } from "@/server/access";
import { getAccount } from "@/server/account";
import { getDb } from "@/server/db";
import { errorResponse, isSameOrigin, readJsonBody } from "@/server/http";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return errorResponse("forbidden");
  const account = await getAccount();
  if (!account) return errorResponse("sign_in_required");
  const body = await readJsonBody(request);
  const linkId = typeof body.token === "string" ? await verifyLink(body.token) : null;
  if (!linkId) return errorResponse("invalid_link");
  const result = await claimLink(await getDb(), linkId, account.userId, {
    managerId: body.managerId,
    displayName: body.displayName,
  });
  if (!result.ok) return errorResponse(result.error);
  return Response.json(result.value);
}
