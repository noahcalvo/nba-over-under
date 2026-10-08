import "server-only";
import { ERROR_MESSAGES, type ApiError, type Result } from "@/lib/league/errors";

const STATUS: Record<ApiError, number> = {
  not_found: 404,
  invalid_link: 404,
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
  stale_pick: 409,
  team_already_held: 409,
  lines_unavailable: 503,
  lines_changed: 409,
  lines_locked: 409,
  invalid_line: 400,
};

export function errorResponse(error: ApiError): Response {
  return Response.json({ error, message: ERROR_MESSAGES[error] }, { status: STATUS[error] });
}

/** `{ ok: true }` or the error, for mutations whose pages re-render instead of reading a response body. */
export function resultResponse(result: Result<unknown>): Response {
  return result.ok ? Response.json({ ok: true }) : errorResponse(result.error);
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Mutations must come from this site's own pages. Backs up SameSite=Lax cookies and JSON-only bodies. */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(request.url).origin;
}
