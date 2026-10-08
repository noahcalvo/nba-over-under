import "server-only";
import { ERROR_MESSAGES, type ApiError } from "@/lib/league/errors";

const STATUS: Record<ApiError, number> = {
  not_found: 404,
  forbidden: 403,
  demo_league: 403,
  invalid_name: 400,
  invalid_league_name: 400,
  invalid_request: 400,
  unknown_team: 400,
  seat_taken: 409,
  already_joined: 409,
  side_taken: 409,
  not_live: 409,
  invalid_transition: 409,
};

export function errorResponse(error: ApiError): Response {
  return Response.json({ error, message: ERROR_MESSAGES[error] }, { status: STATUS[error] });
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
