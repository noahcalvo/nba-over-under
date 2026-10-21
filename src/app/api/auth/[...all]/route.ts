import { getAuth } from "@/server/auth";
import { errorResponse } from "@/server/http";

/** Better Auth's endpoints (Google redirect and callback, session, sign-out). 503 while sign-in is unconfigured. */
async function handle(request: Request): Promise<Response> {
  const auth = await getAuth();
  return auth ? auth.handler(request) : errorResponse("auth_unavailable");
}

export const GET = handle;
export const POST = handle;
